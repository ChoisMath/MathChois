import type { FastifyBaseLogger } from 'fastify';
import { pgClient } from '../config/database.js';

/**
 * 배포 환경(Railway)은 내부 전용 DATABASE_URL 이라 로컬에서 drizzle-kit push 가 불가능하다.
 * 컨테이너 부팅 시점에 멱등 DDL 로 누락 컬럼을 보강해, 새 코드의 SELECT(html_url 포함)가
 * 깨지지 않도록 한다. 모든 문장은 IF NOT EXISTS 로 재실행 안전.
 */
export async function runStartupMigrations(log: FastifyBaseLogger): Promise<void> {
  await pgClient`ALTER TABLE pages ADD COLUMN IF NOT EXISTS html_url text`;
  log.info('startup migration: pages.html_url ensured');

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
}
