/**
 * AI활용 허브 브라우저 E2E 준비. 자기 교사·학생·학급(AI활용 스위치 꺼짐)과 Volume 픽스처를 만들고 JSON 으로 출력한다.
 *   - 계정 ai-hub.teacher@chois.test / ai-hub.student@chois.test / ai-hub.admin@chois.test(관리자, 교사), 학급 코드 AIHUB001
 *     (기존 계정·학급에 의존하지 않는다)
 *   - ai_motion_prompts 2행: `01-pixel`(chois) 의 옛 틀(v1) — {{Channel name}} · {{-Numbers}} · 세부 설정 칸 1개, 장면표·소리 큐 1줄,
 *     `51-pop-poster`(카탈로그상 oppadu) 의 v2 틀 — 예시 줄·주제 줄 한 쌍, edited_at = 지금(웹에서 고친 원본 표시)
 *   - <VOLUME_PATH>/ai-hub/motion/{01-pixel,51-pop-poster}/{video.mp4,preview.mp4,poster.webp} + manifest/motion.json, brand/index.html
 *     (슬라이드 manifest 는 만들지 않는다 → /ai/slide 는 빈 상태)
 * 다시 실행해도 같은 상태로 돌아간다(스위치 끔, 프롬프트 행·픽스처 덮어쓰기). 이 스크립트가 만든 것이 아닌 기존 자료
 * (두 픽스처 모션 외 항목이 든 manifest, 표식 없는 프롬프트·브랜드 index.html)가 있으면 덮어쓰지 않고 멈춘다.
 * 소유 표식: <VOLUME_PATH>/ai-hub/.e2e-fixture(MARK + 파일 sha256). 표식 없이 허브 자료가 있으면 setup 은 exit 1 로 멈추고,
 * --cleanup 은 표식이 있고 항목이 우리 것(sha·MARK·두 모션 id 만 든 manifest)일 때만 지운다 — 아니면 건너뛰고 이유를 stderr 에 남긴다.
 * AIHUB001 학급은 소유자가 픽스처 교사일 때만 다시 쓰거나 지운다(아니면 exit 1).
 * 교사는 교사 허용 목록(allowed_teachers)에 있어야 로그인 때 교사로 남는다(applyAccessRules) — 표식(note=ALLOWED_NOTE)을 단 행을
 * 넣고, --cleanup 은 그 표식이 있는 행만 지운다(미리 있던 행은 그대로).
 *
 *   npx tsx --env-file=.env scripts/ai-hub-e2e-setup.ts > "$SCRATCH/aihub.json"   # (packages/server 에서)
 *   npx tsx --env-file=.env scripts/ai-hub-e2e-setup.ts --cleanup                  # 만든 것 모두 삭제
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, rmdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { and, eq, inArray } from 'drizzle-orm';
import { db, pgClient } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import { aiMotionPrompts, allowedTeachers, classrooms, classroomMembers, profiles } from '../src/db/schema.js';
import { hashPassword } from '../src/services/auth.service.js';

const PASSWORD = 'Test1234!';
const TEACHER_EMAIL = 'ai-hub.teacher@chois.test';
const STUDENT_EMAIL = 'ai-hub.student@chois.test';
const CLASS_CODE = 'AIHUB001';
const MOTION_ID = '01-pixel'; // source: 'chois' — 옛 틀(v1), 웹 편집 표시 없음
const ORIGINAL_ID = '51-pop-poster'; // source: 'oppadu' — v2 틀, 웹 편집 표시 있음
const MOTION_IDS = [MOTION_ID, ORIGINAL_ID] as const;
const ADMIN_EMAIL = 'ai-hub.admin@chois.test';
const MARK = 'AI-HUB-E2E'; // 이 스크립트가 만든 프롬프트·브랜드 파일 표식
const ALLOWED_NOTE = `${MARK} fixture teacher`; // 이 스크립트가 넣은 교사 허용 목록 행 표식

const ROOT = path.resolve(env.VOLUME_PATH, 'ai-hub');
const motionDir = (id: string) => path.join(ROOT, 'motion', id);
const MANIFEST = path.join(ROOT, 'manifest', 'motion.json');
const BRAND_INDEX = path.join(ROOT, 'brand', 'index.html');
const SENTINEL = path.join(ROOT, '.e2e-fixture');
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

// v2 틀(오빠두 원본): 「예시 그대로」 로 복사하면 #a 줄만, 주제 줄(#b)은 빠진다. 영·국 같은 꼴.
const ORIGINAL_TEMPLATE = '## 1. Intro\n{{#a}}EXAMPLE LINE\n{{#b}}TOPIC {{Topic=}}';
const ORIGINAL_SHOTS = [['0–10s', `${MARK} pop poster`, 'Opening beat']] as [string, string, string][];

/** 이 스크립트가 만든 프롬프트 행인가 — v1 행은 틀에, v2 행은 장면표에 MARK 가 들어 있다 */
const rowIsOurs = (row: { promptEn: string; shots: unknown }) =>
  row.promptEn.includes(MARK) || JSON.stringify(row.shots ?? null).includes(MARK);

// ffmpeg 가 없을 때 쓰는 아주 작은 대체 파일(내려받아 올라가는지만 확인하는 용도)
const TINY_WEBP = Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64');
const TINY_MP4 = Buffer.from('00000018667479706d703432000000006d70343269736f6d', 'hex');

async function ensureUser(email: string, name: string, role: 'teacher' | 'student', isAdmin = false) {
  const existing = await db.select().from(profiles).where(eq(profiles.email, email)).limit(1);
  const passwordHash = await hashPassword(PASSWORD);
  if (existing[0]) {
    const [u] = await db.update(profiles)
      .set({ passwordHash, authMethod: 'email', role, isAdmin, mustResetPassword: false })
      .where(eq(profiles.id, existing[0].id)).returning();
    return u;
  }
  const [row] = await db.insert(profiles)
    .values({ email, name, role, authMethod: 'email', passwordHash, isAdmin })
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
  const src = ['-f', 'lavfi', '-i', 'color=c=0x2b6cb0:s=320x180:r=15:d=1'];
  const mp4 = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];
  const now = new Date().toISOString();
  const manifest: Record<string, { size: number; sha256: string; updatedAt: string }> = {};
  for (const id of MOTION_IDS) {
    const dir = motionDir(id);
    await mkdir(dir, { recursive: true });
    const video = path.join(dir, 'video.mp4');
    const preview = path.join(dir, 'preview.mp4');
    const poster = path.join(dir, 'poster.webp');
    if (!ffmpeg([...src, ...mp4, video])) await writeFile(video, TINY_MP4);
    if (!ffmpeg([...src, ...mp4, preview])) await writeFile(preview, TINY_MP4);
    if (!ffmpeg([...src, '-frames:v', '1', poster])) await writeFile(poster, TINY_WEBP);
    for (const f of MOTION_FILES) {
      const buf = await readFile(path.join(dir, f));
      manifest[`motion/${id}/${f}`] = { size: buf.length, sha256: sha256(buf), updatedAt: now };
    }
  }
  await mkdir(path.dirname(MANIFEST), { recursive: true });
  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2));
}

const sentinelText = (hashes: Record<string, string>) =>
  `${MARK} fixture — ai-hub-e2e-setup.ts 가 만든 파일만 --cleanup 이 지웁니다\n${JSON.stringify(hashes)}\n`;

/** 표식 파일에 적어 둔 영상·포스터 sha256 — 그동안 ai:push 가 같은 이름을 덮어썼다면 값이 달라 지우지 않는다 */
async function sentinelHashes(): Promise<Record<string, string>> {
  try {
    return JSON.parse((await readFile(SENTINEL, 'utf8')).split('\n')[1] || '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

/** 픽스처 소유 표식 — 이 파일이 있을 때만 아래 대상 파일을 덮어쓰거나 지운다(내용에 MARK 포함) */
const hasSentinel = () => existsSync(SENTINEL);

/** 픽스처가 만들거나 지우는 파일 — 실제 허브 자료와 같은 자리에 있으므로 표식 없이는 건드리지 않는다 */
function targetsPresent(): string[] {
  const found = MOTION_IDS.flatMap((id) => MOTION_FILES.map((f) => path.join(motionDir(id), f))).filter((f) => existsSync(f));
  for (const f of [MANIFEST, BRAND_INDEX]) if (existsSync(f)) found.push(f);
  return found;
}

/** 이 manifest 가 픽스처 모션(01-pixel · 51-pop-poster) 항목만 담았나(읽을 수 없으면 우리 것이 아니다) */
async function manifestIsOurs(): Promise<boolean> {
  try {
    const keys = Object.keys(JSON.parse(await readFile(MANIFEST, 'utf8')) as object);
    return keys.every((k) => MOTION_IDS.some((id) => k.startsWith(`motion/${id}/`)));
  } catch {
    return false;
  }
}

/** AIHUB001 학급 — 없으면 null, 소유 교사가 픽스처 교사가 아니면 던진다 */
async function fixtureClassroom() {
  const [cls] = await db.select().from(classrooms).where(eq(classrooms.classCode, CLASS_CODE)).limit(1);
  if (!cls) return null;
  const [teacher] = await db.select().from(profiles).where(eq(profiles.email, TEACHER_EMAIL)).limit(1);
  if (!teacher || cls.teacherId !== teacher.id) {
    throw new Error(`학급 코드 ${CLASS_CODE} 의 소유자가 픽스처 교사(${TEACHER_EMAIL})가 아니라 건드리지 않습니다`);
  }
  return cls;
}

/** 덮어쓰기 전에 이 스크립트가 만든 자료인지 본다 — 아니면 멈춘다 */
async function assertOurs() {
  const present = targetsPresent();
  if (present.length && !hasSentinel()) {
    throw new Error(`${present[0]} 등 허브 자료가 이미 있고 픽스처 표식(${SENTINEL})이 없어 덮어쓰지 않습니다 — `
      + '실제 자료가 든 Volume 에는 이 스크립트를 쓰지 마세요');
  }
  if (existsSync(MANIFEST) && !(await manifestIsOurs())) {
    throw new Error(`${MANIFEST} 에 다른 자료가 있어 덮어쓰지 않습니다`);
  }
  if (existsSync(BRAND_INDEX) && !(await readFile(BRAND_INDEX, 'utf8')).includes(MARK)) {
    throw new Error(`${BRAND_INDEX} 는 이 스크립트가 만든 파일이 아니라 덮어쓰지 않습니다`);
  }
  for (const id of MOTION_IDS) {
    const [row] = await db.select().from(aiMotionPrompts).where(eq(aiMotionPrompts.id, id)).limit(1);
    if (row && !rowIsOurs(row)) {
      throw new Error(`ai_motion_prompts.${id} 는 이 스크립트가 만든 행이 아니라 덮어쓰지 않습니다`);
    }
  }
  await fixtureClassroom();
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
  await fixtureClassroom(); // 소유자가 다르면 아무것도 지우기 전에 던진다

  // 파일 — 표식이 있고 각 항목이 우리 것일 때만. 아니면 건너뛰고 이유를 남긴다(stderr — stdout 은 JSON 용).
  if (!hasSentinel()) {
    if (targetsPresent().length) console.error(`픽스처 표식(${SENTINEL})이 없어 Volume 파일은 그대로 둡니다`);
  } else {
    const hashes = await sentinelHashes();
    for (const id of MOTION_IDS) {
      for (const f of MOTION_FILES) {
        const file = path.join(motionDir(id), f);
        if (!existsSync(file)) continue;
        if (hashes[`${id}/${f}`] && sha256(await readFile(file)) === hashes[`${id}/${f}`]) await rm(file, { force: true });
        else console.error(`${file} 가 픽스처가 만든 파일과 달라 그대로 둡니다`);
      }
    }
    if (existsSync(MANIFEST)) {
      if (await manifestIsOurs()) await rm(MANIFEST, { force: true });
      else console.error(`${MANIFEST} 에 픽스처 모션 외 항목이 있어 그대로 둡니다`);
    }
    if (existsSync(BRAND_INDEX)) {
      if ((await readFile(BRAND_INDEX, 'utf8')).includes(MARK)) await rm(BRAND_INDEX, { force: true });
      else console.error(`${BRAND_INDEX} 에 표식이 없어 그대로 둡니다`);
    }
    await rm(SENTINEL, { force: true }); // 표식은 마지막에
    for (const d of [...MOTION_IDS.map(motionDir), path.dirname(MANIFEST), path.dirname(BRAND_INDEX), path.join(ROOT, 'motion'), ROOT]) {
      await removeEmptyDirs(d);
    }
  }
  // 이 스크립트가 만든 프롬프트 행만 (표식이 있는 것)
  for (const id of MOTION_IDS) {
    const [row] = await db.select().from(aiMotionPrompts).where(eq(aiMotionPrompts.id, id)).limit(1);
    if (row && rowIsOurs(row)) await db.delete(aiMotionPrompts).where(eq(aiMotionPrompts.id, id));
  }
  // 학급 → 학급 멤버는 CASCADE. 계정까지 지운다.
  await db.delete(classrooms).where(eq(classrooms.classCode, CLASS_CODE));
  await db.delete(profiles).where(inArray(profiles.email, [TEACHER_EMAIL, STUDENT_EMAIL, ADMIN_EMAIL]));
  // 교사 허용 목록 — 이 스크립트가 넣은 행(표식 note)만
  await db.delete(allowedTeachers)
    .where(and(eq(allowedTeachers.email, TEACHER_EMAIL), eq(allowedTeachers.note, ALLOWED_NOTE)));
}

async function main() {
  if (process.argv[2] === '--cleanup') {
    await cleanup();
    await pgClient.end();
    return;
  }

  await assertOurs();

  const teacher = await ensureUser(TEACHER_EMAIL, 'AI허브 교사', 'teacher');
  // 허용 목록에 없으면 첫 로그인 때 applyAccessRules 가 학생으로 내린다(seed-test-accounts.ts 와 같은 방식)
  await db.insert(allowedTeachers)
    .values({ email: TEACHER_EMAIL, note: ALLOWED_NOTE })
    .onConflictDoNothing({ target: allowedTeachers.email });
  const student = await ensureUser(STUDENT_EMAIL, 'AI허브 학생', 'student');
  const admin = await ensureUser(ADMIN_EMAIL, 'AI허브 관리자', 'teacher', true); // 관리자는 늘 교사 — 허용 목록 없이도 교사로 남는다
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
      set: { promptEn: PROMPT.en, promptKo: PROMPT.ko, shots: PROMPT.shots, cues: PROMPT.cues, updatedAt: new Date(), editedAt: null },
    });
  // 오빠두 원본 행 — 웹에서 고친 것으로 표시(edited_at = 지금). 다시 실행하면 표시도 다시 붙는다.
  const editedAt = new Date();
  await db.insert(aiMotionPrompts)
    .values({ id: ORIGINAL_ID, promptEn: ORIGINAL_TEMPLATE, promptKo: ORIGINAL_TEMPLATE, shots: ORIGINAL_SHOTS, cues: [], editedAt })
    .onConflictDoUpdate({
      target: aiMotionPrompts.id,
      set: { promptEn: ORIGINAL_TEMPLATE, promptKo: ORIGINAL_TEMPLATE, shots: ORIGINAL_SHOTS, cues: [], updatedAt: editedAt, editedAt },
    });

  await mkdir(ROOT, { recursive: true });
  await writeFile(SENTINEL, sentinelText({})); // 파일을 만들기 전에 먼저
  await writeMotionFiles();
  const hashes: Record<string, string> = {};
  for (const id of MOTION_IDS) {
    for (const f of MOTION_FILES) hashes[`${id}/${f}`] = sha256(await readFile(path.join(motionDir(id), f)));
  }
  await writeFile(SENTINEL, sentinelText(hashes));
  await mkdir(path.dirname(BRAND_INDEX), { recursive: true });
  await writeFile(BRAND_INDEX, `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${MARK}</title></head>`
    + `<body><h1 id="brand-e2e">${MARK} 브랜드 룩북</h1></body></html>`);
  // 확인용(없으면 stat 이 던진다)
  await stat(BRAND_INDEX);

  console.log(JSON.stringify({
    classroomId: cls.id,
    motionId: MOTION_ID,
    originalId: ORIGINAL_ID,
    brandHeading: `${MARK} 브랜드 룩북`,
    teacher: { id: teacher.id, email: teacher.email },
    student: { id: student.id, email: student.email },
    admin: { id: admin.id, email: admin.email },
    password: PASSWORD,
  }));
  await pgClient.end();
}

main().catch(async (err) => { console.error(err); await pgClient.end(); process.exit(1); });
