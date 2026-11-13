/**
 * 영상 플레이어 터치 조작 창 E2E 준비: 30초짜리 테스트 영상(WebM, ffmpeg testsrc)을 VOLUME_PATH 의 videos 버킷에 만들고
 * 테스트 교사(허용 목록) + 학급 + 학급 영상 배정을 만든 뒤 id 를 JSON 으로 출력한다.
 * 학급·영상 이름은 `VT E2E ` 로 시작하고, 다음 실행·--cleanup 은 테스트 교사의 것만 지운다.
 * 교사 허용 목록 행은 표식(note=ALLOWED_NOTE)을 달아 넣고, --cleanup 은 그 표식이 있는 행만 지운다.
 *
 *   npx tsx --env-file=.env scripts/video-tap-e2e-setup.ts > "$SCRATCH/vt.json"   # (packages/server 에서, ffmpeg 필요)
 *   npx tsx --env-file=.env scripts/video-tap-e2e-setup.ts --cleanup
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { eq, and, like, inArray } from 'drizzle-orm';
import { db, pgClient } from '../src/config/database.js';
import { profiles, allowedTeachers, classrooms, videos, classroomVideos } from '../src/db/schema.js';
import { hashPassword } from '../src/services/auth.service.js';

const PASSWORD = 'Test1234!';
const PREFIX = 'VT E2E ';
const EMAIL = 'vt.teacher@chois.test';
const ALLOWED_NOTE = `${PREFIX}fixture teacher`;
const CLIP_REL = 'vt-e2e/clip.webm';

async function ensureTeacher() {
  const existing = await db.select().from(profiles).where(eq(profiles.email, EMAIL)).limit(1);
  if (existing[0]) return existing[0];
  const [row] = await db.insert(profiles)
    .values({ email: EMAIL, name: 'VT 교사', role: 'teacher', authMethod: 'email', passwordHash: await hashPassword(PASSWORD), isAdmin: false })
    .returning();
  return row;
}

async function wipe(teacherId: string) {
  await db.delete(classrooms).where(and(eq(classrooms.teacherId, teacherId), like(classrooms.name, `${PREFIX}%`)));
  const stale = db.select({ id: videos.id }).from(videos)
    .where(and(eq(videos.createdBy, teacherId), like(videos.title, `${PREFIX}%`)));
  await db.delete(classroomVideos).where(inArray(classroomVideos.videoId, stale));
  await db.delete(videos).where(and(eq(videos.createdBy, teacherId), like(videos.title, `${PREFIX}%`)));
}

/** 30초 640×360 VP8 WebM(소리 없음) — 이미 있으면 그대로 */
function ensureClip() {
  const file = path.resolve(process.env.VOLUME_PATH || './local-storage', 'videos', CLIP_REL);
  if (fs.existsSync(file)) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=duration=30:size=640x360:rate=25',
    '-c:v', 'libvpx', '-b:v', '300k', '-an', file]);
}

async function main() {
  const teacher = await ensureTeacher();
  await wipe(teacher.id);
  if (process.argv[2] === '--cleanup') {
    await db.delete(allowedTeachers).where(and(eq(allowedTeachers.email, EMAIL), eq(allowedTeachers.note, ALLOWED_NOTE)));
    await pgClient.end();
    return;
  }
  // 교사 역할은 로그인 때 허용 목록으로 다시 정해진다
  await db.insert(allowedTeachers).values({ email: EMAIL, note: ALLOWED_NOTE }).onConflictDoNothing({ target: allowedTeachers.email });

  ensureClip();
  const [cls] = await db.insert(classrooms).values({ name: `${PREFIX}학급`, teacherId: teacher.id, classCode: 'VTE2E001' }).returning();
  const [video] = await db.insert(videos)
    .values({ createdBy: teacher.id, title: `${PREFIX}영상`, videoUrl: `/api/files/videos/${CLIP_REL}`, durationSec: 30 })
    .returning();
  const [cv] = await db.insert(classroomVideos)
    .values({ classroomId: cls.id, videoId: video.id, addedBy: teacher.id, position: 0 })
    .returning();

  console.log(JSON.stringify({ classroomId: cls.id, cvId: cv.id, email: EMAIL, password: PASSWORD }));
  await pgClient.end();
}

main().catch(async (err) => { console.error(err); await pgClient.end(); process.exit(1); });
