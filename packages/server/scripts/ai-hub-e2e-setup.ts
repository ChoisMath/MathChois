/**
 * AI활용 허브 브라우저 E2E 준비. 자기 교사·학생·학급(AI활용 스위치 꺼짐)과 Volume 픽스처를 만들고 JSON 으로 출력한다.
 *   - 계정 ai-hub.teacher@chois.test / ai-hub.student@chois.test, 학급 코드 AIHUB001 (기존 계정·학급에 의존하지 않는다)
 *   - ai_motion_prompts 1행: `01-pixel` 의 옛 틀(v1) — {{Channel name}} · {{-Numbers}} · 세부 설정 칸 1개, 장면표·소리 큐 1줄
 *   - <VOLUME_PATH>/ai-hub/motion/01-pixel/{video.mp4,preview.mp4,poster.webp} + manifest/motion.json, brand/index.html
 *     (슬라이드 manifest 는 만들지 않는다 → /ai/slide 는 빈 상태)
 * 다시 실행해도 같은 상태로 돌아간다(스위치 끔, 프롬프트 행·픽스처 덮어쓰기). 이 스크립트가 만든 것이 아닌 기존 자료
 * (다른 모션 항목이 든 manifest, 표식 없는 프롬프트·브랜드 index.html)가 있으면 덮어쓰지 않고 멈춘다.
 *
 *   npx tsx --env-file=.env scripts/ai-hub-e2e-setup.ts > "$SCRATCH/aihub.json"   # (packages/server 에서)
 *   npx tsx --env-file=.env scripts/ai-hub-e2e-setup.ts --cleanup                  # 만든 것 모두 삭제
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, rmdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { eq, inArray } from 'drizzle-orm';
import { db, pgClient } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import { aiMotionPrompts, classrooms, classroomMembers, profiles } from '../src/db/schema.js';
import { hashPassword } from '../src/services/auth.service.js';

const PASSWORD = 'Test1234!';
const TEACHER_EMAIL = 'ai-hub.teacher@chois.test';
const STUDENT_EMAIL = 'ai-hub.student@chois.test';
const CLASS_CODE = 'AIHUB001';
const MOTION_ID = '01-pixel';
const MARK = 'AI-HUB-E2E'; // 이 스크립트가 만든 프롬프트·브랜드 파일 표식

const ROOT = path.resolve(env.VOLUME_PATH, 'ai-hub');
const MOTION_DIR = path.join(ROOT, 'motion', MOTION_ID);
const MANIFEST = path.join(ROOT, 'manifest', 'motion.json');
const BRAND_INDEX = path.join(ROOT, 'brand', 'index.html');
const MOTION_FILES = ['video.mp4', 'preview.mp4', 'poster.webp'] as const;

// v1(옛 틀): @ · # 가 없다. 국문 짝 이름으로 채널 이름·숫자는 위 주 칸, 「주 색상」은 세부 설정 안에 들어간다.
const PROMPT = {
  en: [
    `# ${MARK} pixel intro`,
    'Channel: {{Channel name=Chois Math}}',
    'Main color: {{Main color=sky blue}}',
    '{{-Numbers=12 lessons}}',
    'Make a 10 second intro.',
  ].join('\n'),
  ko: [
    `# ${MARK} 픽셀 인트로`,
    '채널: {{채널 이름=최쌤 수학}}',
    '주 색상: {{주 색상=하늘색}}',
    '{{-숫자=수업 12편}}',
    '10초 인트로를 만든다.',
  ].join('\n'),
  shots: [['0–10s', 'Pixel hero jumps', 'Opening beat']] as [string, string, string][],
  cues: [['0s', 'Coin sound', 'Hero lands']] as [string, string, string][],
};

// ffmpeg 가 없을 때 쓰는 아주 작은 대체 파일(내려받아 올라가는지만 확인하는 용도)
const TINY_WEBP = Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64');
const TINY_MP4 = Buffer.from('00000018667479706d703432000000006d70343269736f6d', 'hex');

async function ensureUser(email: string, name: string, role: 'teacher' | 'student') {
  const existing = await db.select().from(profiles).where(eq(profiles.email, email)).limit(1);
  const passwordHash = await hashPassword(PASSWORD);
  if (existing[0]) {
    const [u] = await db.update(profiles)
      .set({ passwordHash, authMethod: 'email', role, isAdmin: false, mustResetPassword: false })
      .where(eq(profiles.id, existing[0].id)).returning();
    return u;
  }
  const [row] = await db.insert(profiles)
    .values({ email, name, role, authMethod: 'email', passwordHash, isAdmin: false })
    .returning();
  return row;
}

const sha256 = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');

function ffmpeg(args: string[]): boolean {
  try {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function writeMotionFiles() {
  await mkdir(MOTION_DIR, { recursive: true });
  const src = ['-f', 'lavfi', '-i', 'color=c=0x2b6cb0:s=320x180:r=15:d=1'];
  const mp4 = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];
  const video = path.join(MOTION_DIR, 'video.mp4');
  const preview = path.join(MOTION_DIR, 'preview.mp4');
  const poster = path.join(MOTION_DIR, 'poster.webp');
  if (!ffmpeg([...src, ...mp4, video])) await writeFile(video, TINY_MP4);
  if (!ffmpeg([...src, ...mp4, preview])) await writeFile(preview, TINY_MP4);
  if (!ffmpeg([...src, '-frames:v', '1', poster])) await writeFile(poster, TINY_WEBP);

  const now = new Date().toISOString();
  const manifest: Record<string, { size: number; sha256: string; updatedAt: string }> = {};
  for (const f of MOTION_FILES) {
    const buf = await readFile(path.join(MOTION_DIR, f));
    manifest[`motion/${MOTION_ID}/${f}`] = { size: buf.length, sha256: sha256(buf), updatedAt: now };
  }
  await mkdir(path.dirname(MANIFEST), { recursive: true });
  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2));
}

/** 덮어쓰기 전에 이 스크립트가 만든 자료인지 본다 — 아니면 멈춘다 */
async function assertOurs() {
  if (existsSync(MANIFEST)) {
    const keys = Object.keys(JSON.parse(await readFile(MANIFEST, 'utf8')) as object);
    const foreign = keys.filter((k) => !k.startsWith(`motion/${MOTION_ID}/`));
    if (foreign.length) throw new Error(`${MANIFEST} 에 다른 자료(${foreign[0]} …)가 있어 덮어쓰지 않습니다`);
  }
  if (existsSync(BRAND_INDEX) && !(await readFile(BRAND_INDEX, 'utf8')).includes(MARK)) {
    throw new Error(`${BRAND_INDEX} 는 이 스크립트가 만든 파일이 아니라 덮어쓰지 않습니다`);
  }
  const [row] = await db.select().from(aiMotionPrompts).where(eq(aiMotionPrompts.id, MOTION_ID)).limit(1);
  if (row && !row.promptEn.includes(MARK)) {
    throw new Error(`ai_motion_prompts.${MOTION_ID} 는 이 스크립트가 만든 행이 아니라 덮어쓰지 않습니다`);
  }
}

async function removeEmptyDirs(dir: string) {
  // ROOT 밑에서만, 비어 있는 폴더만 지운다(ROOT 자체와 그 위는 비면 마지막에 같이 정리)
  for (let d = dir; d.startsWith(ROOT); d = path.dirname(d)) {
    try {
      if ((await readdir(d)).length) return;
      await rmdir(d);
    } catch {
      return;
    }
  }
}

async function cleanup() {
  await rm(MOTION_DIR, { recursive: true, force: true });
  await rm(MANIFEST, { force: true });
  await rm(BRAND_INDEX, { force: true });
  for (const d of [MOTION_DIR, path.dirname(MANIFEST), path.dirname(BRAND_INDEX), path.join(ROOT, 'motion')]) {
    await removeEmptyDirs(d);
  }
  // 이 스크립트가 만든 프롬프트 행만 (표식이 있는 것)
  const [row] = await db.select().from(aiMotionPrompts).where(eq(aiMotionPrompts.id, MOTION_ID)).limit(1);
  if (row?.promptEn.includes(MARK)) await db.delete(aiMotionPrompts).where(eq(aiMotionPrompts.id, MOTION_ID));
  // 학급 → 학급 멤버는 CASCADE. 계정까지 지운다.
  await db.delete(classrooms).where(eq(classrooms.classCode, CLASS_CODE));
  await db.delete(profiles).where(inArray(profiles.email, [TEACHER_EMAIL, STUDENT_EMAIL]));
}

async function main() {
  if (process.argv[2] === '--cleanup') {
    await cleanup();
    await pgClient.end();
    return;
  }

  await assertOurs();

  const teacher = await ensureUser(TEACHER_EMAIL, 'AI허브 교사', 'teacher');
  const student = await ensureUser(STUDENT_EMAIL, 'AI허브 학생', 'student');
  let [cls] = await db.select().from(classrooms).where(eq(classrooms.classCode, CLASS_CODE)).limit(1);
  if (!cls) {
    [cls] = await db.insert(classrooms)
      .values({ name: 'AI허브 E2E 학급', teacherId: teacher.id, classCode: CLASS_CODE, aiHubEnabled: false }).returning();
  } else {
    [cls] = await db.update(classrooms).set({ teacherId: teacher.id, aiHubEnabled: false })
      .where(eq(classrooms.id, cls.id)).returning();
  }
  await db.insert(classroomMembers).values({ classroomId: cls.id, studentId: student.id }).onConflictDoNothing();

  await db.insert(aiMotionPrompts)
    .values({ id: MOTION_ID, promptEn: PROMPT.en, promptKo: PROMPT.ko, shots: PROMPT.shots, cues: PROMPT.cues })
    .onConflictDoUpdate({
      target: aiMotionPrompts.id,
      set: { promptEn: PROMPT.en, promptKo: PROMPT.ko, shots: PROMPT.shots, cues: PROMPT.cues, updatedAt: new Date() },
    });

  await writeMotionFiles();
  await mkdir(path.dirname(BRAND_INDEX), { recursive: true });
  await writeFile(BRAND_INDEX, `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${MARK}</title></head>`
    + `<body><h1 id="brand-e2e">${MARK} 브랜드 룩북</h1></body></html>`);
  // 확인용(없으면 stat 이 던진다)
  await stat(BRAND_INDEX);

  console.log(JSON.stringify({
    classroomId: cls.id,
    motionId: MOTION_ID,
    brandHeading: `${MARK} 브랜드 룩북`,
    teacher: { id: teacher.id, email: teacher.email },
    student: { id: student.id, email: student.email },
    password: PASSWORD,
  }));
  await pgClient.end();
}

main().catch(async (err) => { console.error(err); await pgClient.end(); process.exit(1); });
