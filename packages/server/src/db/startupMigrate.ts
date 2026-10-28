import type { FastifyBaseLogger } from 'fastify';
import { assignClassroomColors } from '@mathchois/shared';
import { pgClient } from '../config/database.js';

/**
 * 배포 환경(Railway)은 내부 전용 DATABASE_URL 이라 로컬에서 drizzle-kit push 가 불가능하다.
 * 컨테이너 부팅 시점에 멱등 DDL 로 누락 컬럼을 보강해, 새 코드의 SELECT(html_url 포함)가
 * 깨지지 않도록 한다. 모든 문장은 IF NOT EXISTS 로 재실행 안전.
 */
export async function runStartupMigrations(log: FastifyBaseLogger): Promise<void> {
  await pgClient`ALTER TABLE pages ADD COLUMN IF NOT EXISTS html_url text`;
  log.info('startup migration: pages.html_url ensured');

  // 챕터 최신순/등록순 정렬용. 기존 행은 now() 로 채워지며 동률은 position 으로 보조 정렬된다.
  await pgClient`ALTER TABLE chapters ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now()`;
  log.info('startup migration: chapters.created_at ensured');

  await pgClient`
    CREATE TABLE IF NOT EXISTS problems (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title text,
      problem_latex text NOT NULL,
      figure_notes jsonb NOT NULL DEFAULT '[]'::jsonb,
      original_image_url text,
      figures jsonb NOT NULL DEFAULT '[]'::jsonb,
      subject text, major_unit text, minor_unit text,
      difficulty text, problem_type text, detail_type text,
      keywords jsonb NOT NULL DEFAULT '[]'::jsonb,
      answer text, solution text, solution_source text, markscheme_image_url text,
      ai_model text,
      status text NOT NULL DEFAULT 'ready',
      created_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;
  await pgClient`CREATE INDEX IF NOT EXISTS idx_problems_created_at ON problems (created_at)`;
  await pgClient`CREATE INDEX IF NOT EXISTS idx_problems_subject ON problems (subject)`;
  await pgClient`CREATE INDEX IF NOT EXISTS idx_problems_major_unit ON problems (major_unit)`;
  await pgClient`CREATE INDEX IF NOT EXISTS idx_problems_difficulty ON problems (difficulty)`;
  await pgClient`CREATE INDEX IF NOT EXISTS idx_problems_created_by ON problems (created_by)`;
  log.info('startup migration: problems table ensured');

  await pgClient`ALTER TABLE pages ADD COLUMN IF NOT EXISTS ai_problem_id uuid REFERENCES problems(id) ON DELETE SET NULL`;
  await pgClient`
    CREATE TABLE IF NOT EXISTS coaching_attempts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      page_id uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
      problem_id uuid REFERENCES problems(id) ON DELETE SET NULL,
      student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      work_image_url text,
      solution_latex text,
      is_correct boolean,
      error_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
      concept_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
      strength_notes text,
      weakness_notes text,
      comment_markdown text,
      ai_model text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
  await pgClient`ALTER TABLE coaching_attempts ADD COLUMN IF NOT EXISTS coaching_svg text`;
  await pgClient`ALTER TABLE problems ADD COLUMN IF NOT EXISTS coaching_svg text`;
  await pgClient`CREATE INDEX IF NOT EXISTS idx_coaching_attempts_student ON coaching_attempts (student_id, created_at)`;
  await pgClient`CREATE INDEX IF NOT EXISTS idx_coaching_attempts_page_student ON coaching_attempts (page_id, student_id)`;
  await pgClient`CREATE INDEX IF NOT EXISTS idx_coaching_attempts_problem ON coaching_attempts (problem_id)`;
  log.info('startup migration: pages.ai_problem_id + coaching_attempts ensured');

  await pgClient`
    CREATE TABLE IF NOT EXISTS coaching_quota (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      page_id uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
      reset_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;
  await pgClient`CREATE UNIQUE INDEX IF NOT EXISTS uq_coaching_quota_student_page ON coaching_quota (student_id, page_id)`;
  log.info('startup migration: coaching_quota ensured');

  await pgClient`
    CREATE TABLE IF NOT EXISTS visualizations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      created_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      title text NOT NULL,
      subject text, major_unit text, minor_unit text,
      description text,
      html_url text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;
  await pgClient`CREATE INDEX IF NOT EXISTS idx_visualizations_created_by ON visualizations (created_by)`;
  await pgClient`CREATE INDEX IF NOT EXISTS idx_visualizations_subject ON visualizations (subject, major_unit, minor_unit)`;
  log.info('startup migration: visualizations table ensured');

  await pgClient`
    CREATE TABLE IF NOT EXISTS videos (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      created_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      title text NOT NULL,
      subject text, major_unit text, minor_unit text,
      description text,
      video_url text NOT NULL,
      thumbnail_url text,
      mime_type text,
      file_size bigint,
      duration_sec integer,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;
  await pgClient`CREATE INDEX IF NOT EXISTS idx_videos_created_by ON videos (created_by)`;
  await pgClient`CREATE INDEX IF NOT EXISTS idx_videos_subject ON videos (subject, major_unit, minor_unit)`;
  await pgClient`
    CREATE TABLE IF NOT EXISTS classroom_videos (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      classroom_id uuid NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
      video_id uuid NOT NULL REFERENCES videos(id) ON DELETE RESTRICT,
      added_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
      note text,
      position integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
  await pgClient`CREATE UNIQUE INDEX IF NOT EXISTS uq_classroom_videos_classroom_video ON classroom_videos (classroom_id, video_id)`;
  await pgClient`CREATE INDEX IF NOT EXISTS idx_classroom_videos_classroom ON classroom_videos (classroom_id, position)`;
  await pgClient`CREATE INDEX IF NOT EXISTS idx_classroom_videos_video ON classroom_videos (video_id)`;
  // 필기 챕터 연결(영상 2분할 필기) — 기존 배포 DB 에 컬럼 보강
  await pgClient`ALTER TABLE classroom_videos ADD COLUMN IF NOT EXISTS chapter_id uuid REFERENCES chapters(id) ON DELETE SET NULL`;
  await pgClient`CREATE INDEX IF NOT EXISTS idx_classroom_videos_chapter ON classroom_videos (chapter_id)`;
  await pgClient`
    CREATE TABLE IF NOT EXISTS video_comments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      classroom_video_id uuid NOT NULL REFERENCES classroom_videos(id) ON DELETE CASCADE,
      author_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      parent_id uuid REFERENCES video_comments(id) ON DELETE CASCADE,
      content text NOT NULL,
      is_private boolean NOT NULL DEFAULT false,
      timestamp_sec integer,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;
  await pgClient`CREATE INDEX IF NOT EXISTS idx_video_comments_cv ON video_comments (classroom_video_id, created_at)`;
  await pgClient`CREATE INDEX IF NOT EXISTS idx_video_comments_parent ON video_comments (parent_id)`;
  await pgClient`
    CREATE TABLE IF NOT EXISTS video_subtitles (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      video_id uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      lang text NOT NULL,
      label text NOT NULL,
      url text NOT NULL,
      cue_count integer NOT NULL DEFAULT 0,
      created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;
  await pgClient`CREATE UNIQUE INDEX IF NOT EXISTS uq_video_subtitles_video_lang ON video_subtitles (video_id, lang)`;
  await pgClient`ALTER TABLE video_subtitles ADD COLUMN IF NOT EXISTS last_end_sec integer`;
  // 자막 목록은 영상 URL 로 조회한다(페이지 임베드는 URL 만 안다)
  await pgClient`CREATE INDEX IF NOT EXISTS idx_videos_video_url ON videos (video_url)`;
  log.info('startup migration: videos / classroom_videos / video_comments / video_subtitles ensured');

  await pgClient`
    CREATE TABLE IF NOT EXISTS video_progress (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      classroom_video_id uuid NOT NULL REFERENCES classroom_videos(id) ON DELETE CASCADE,
      student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      position_sec integer NOT NULL DEFAULT 0,
      max_position_sec integer NOT NULL DEFAULT 0,
      completed boolean NOT NULL DEFAULT false,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;
  await pgClient`CREATE UNIQUE INDEX IF NOT EXISTS uq_video_progress_cv_student ON video_progress (classroom_video_id, student_id)`;
  await pgClient`CREATE INDEX IF NOT EXISTS idx_video_progress_cv ON video_progress (classroom_video_id)`;
  await pgClient`
    CREATE TABLE IF NOT EXISTS video_comment_reads (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      classroom_video_id uuid NOT NULL REFERENCES classroom_videos(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      last_seen_at timestamptz NOT NULL DEFAULT now()
    )`;
  await pgClient`CREATE UNIQUE INDEX IF NOT EXISTS uq_video_comment_reads_cv_user ON video_comment_reads (classroom_video_id, user_id)`;
  log.info('startup migration: video_progress / video_comment_reads ensured');

  // ─── 화이트보드 (모둠 공유 보드) ───
  await pgClient`ALTER TABLE pages ADD COLUMN IF NOT EXISTS page_type text`;
  await pgClient`ALTER TABLE pages ADD COLUMN IF NOT EXISTS whiteboard_template text`;
  await pgClient`
    CREATE TABLE IF NOT EXISTS classroom_groups (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      classroom_id uuid NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
      name text NOT NULL,
      position integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
  await pgClient`CREATE INDEX IF NOT EXISTS idx_classroom_groups_classroom ON classroom_groups (classroom_id)`;
  await pgClient`
    CREATE TABLE IF NOT EXISTS classroom_group_members (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      classroom_id uuid NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
      group_id uuid NOT NULL REFERENCES classroom_groups(id) ON DELETE CASCADE,
      student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE
    )`;
  await pgClient`CREATE UNIQUE INDEX IF NOT EXISTS uq_classroom_group_members_classroom_student ON classroom_group_members (classroom_id, student_id)`;
  await pgClient`CREATE INDEX IF NOT EXISTS idx_classroom_group_members_group ON classroom_group_members (group_id)`;
  await pgClient`
    CREATE TABLE IF NOT EXISTS whiteboard_page_settings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      page_id uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
      classroom_id uuid NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
      allow_cross_group_view boolean NOT NULL DEFAULT false,
      locked_all boolean NOT NULL DEFAULT false
    )`;
  await pgClient`CREATE UNIQUE INDEX IF NOT EXISTS uq_wb_settings_page_classroom ON whiteboard_page_settings (page_id, classroom_id)`;
  await pgClient`
    CREATE TABLE IF NOT EXISTS whiteboard_groups (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      page_id uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
      classroom_id uuid NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
      name text NOT NULL,
      position integer NOT NULL DEFAULT 0,
      locked boolean NOT NULL DEFAULT false,
      background_color text NOT NULL DEFAULT '#ffffff',
      excalidraw_data jsonb,
      prev_excalidraw_data jsonb,
      scene_version integer NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;
  await pgClient`CREATE INDEX IF NOT EXISTS idx_wb_groups_page_classroom ON whiteboard_groups (page_id, classroom_id)`;
  await pgClient`
    CREATE TABLE IF NOT EXISTS whiteboard_group_members (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      group_id uuid NOT NULL REFERENCES whiteboard_groups(id) ON DELETE CASCADE,
      student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE
    )`;
  await pgClient`CREATE UNIQUE INDEX IF NOT EXISTS uq_wb_group_members_group_student ON whiteboard_group_members (group_id, student_id)`;
  await pgClient`CREATE INDEX IF NOT EXISTS idx_wb_group_members_student ON whiteboard_group_members (student_id)`;
  log.info('startup migration: whiteboard tables ensured');

  await pgClient`ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS color text`;

  // 학급 단원. units 를 먼저 만들어야 chapters/classroom_videos 의 FK 가 걸린다.
  await pgClient`
    CREATE TABLE IF NOT EXISTS units (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      classroom_id uuid NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
      title text NOT NULL,
      description text,
      position integer NOT NULL DEFAULT 0,
      is_hidden boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
  await pgClient`CREATE INDEX IF NOT EXISTS idx_units_classroom ON units (classroom_id, position)`;
  await pgClient`ALTER TABLE chapters ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES units(id) ON DELETE SET NULL`;
  await pgClient`ALTER TABLE classroom_videos ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES units(id) ON DELETE SET NULL`;
  await pgClient`CREATE INDEX IF NOT EXISTS idx_chapters_unit ON chapters (unit_id)`;
  await pgClient`CREATE INDEX IF NOT EXISTS idx_classroom_videos_unit ON classroom_videos (unit_id)`;
  log.info('startup migration: units ensured');

  // AI활용 허브: 학급별 허용 플래그 + 프롬프트 원본 테이블
  await pgClient`ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS ai_hub_enabled boolean NOT NULL DEFAULT false`;
  await pgClient`
    CREATE TABLE IF NOT EXISTS ai_motion_prompts (
      id text PRIMARY KEY,
      prompt_en text NOT NULL,
      prompt_ko text NOT NULL,
      shots jsonb NOT NULL,
      cues jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;
  await pgClient`
    CREATE TABLE IF NOT EXISTS ai_slide_prompts (
      id text PRIMARY KEY,
      prompt text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;
  log.info('startup migration: ai hub ensured');

  await backfillClassroomColors(log);
}

/**
 * 색이 없는(color IS NULL) 학급만 교사별로 채운다. 이미 저장된 색은 바꾸지 않고 사용 수에 반영한다.
 * 재실행 안전: UPDATE ... AND color IS NULL. 실패해도 부팅은 계속한다.
 */
async function backfillClassroomColors(log: FastifyBaseLogger): Promise<void> {
  let filled = 0;
  try {
    const teachers = await pgClient<{ teacher_id: string }[]>`
      SELECT DISTINCT teacher_id FROM classrooms WHERE color IS NULL`;
    for (const { teacher_id: teacherId } of teachers) {
      const rooms = await pgClient<{ id: string; created_at: Date | null; color: string | null }[]>`
        SELECT id, created_at, color FROM classrooms WHERE teacher_id = ${teacherId}`;
      const assigned = assignClassroomColors(rooms.map((r) => ({ id: r.id, createdAt: r.created_at, color: r.color })));
      for (const room of rooms) {
        if (room.color) continue;
        const color = assigned.get(room.id);
        if (!color) continue;
        const res = await pgClient`UPDATE classrooms SET color = ${color} WHERE id = ${room.id} AND color IS NULL`;
        filled += res.count;
      }
    }
  } catch (err) {
    log.warn({ err }, 'startup migration: classrooms.color backfill failed (continuing)');
    return;
  }
  log.info(`startup migration: classrooms.color ensured (filled ${filled})`);
}
