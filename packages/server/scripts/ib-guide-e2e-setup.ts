/**
 * IB교육과정 안내 API·브라우저 E2E 준비. 자기 교사·학생 2명·학급(IB 스위치 꺼짐)과 Volume 픽스처를 만들고 JSON 으로 출력한다.
 *   - 계정 ib-guide.teacher@chois.test(교사 허용 목록) / ib-guide.student@chois.test(「아이비 학생」, 학급 IBGUIDE01 멤버)
 *     / ib-guide.outsider@chois.test(학급 없음), 비밀번호 Test1234! (기존 계정·학급에 의존하지 않는다)
 *   - <VOLUME_PATH>/ib-guide/ia/ex01/{student 3, annotated 3, comments 1}, ia/ex02/student 2 쪽 — sharp 로 만든
 *     1600×2263 흰 WebP 에 쪽마다 다른 검은 숫자 블록 + manifest/ia.json
 * 다시 실행해도 같은 상태로 돌아간다(스위치 끔, 픽스처 덮어쓰기).
 * 소유 표식: <VOLUME_PATH>/ib-guide/.e2e-fixture(MARK + 만든 파일 sha256). 표식 없이 ib-guide/ 에 파일이 있으면
 * setup 은 exit 1 로 멈춘다(실제 IA 자료가 든 Volume 을 덮어쓰지 않도록). --cleanup 은 sha 가 표식과 같은 파일만 지우고,
 * 다른 파일은 건너뛰며 이유를 stderr 에 남긴다. IBGUIDE01 학급은 소유자가 픽스처 교사일 때만 다시 쓰거나 지운다.
 * 교사 허용 목록 행은 표식(note=ALLOWED_NOTE)을 달아 넣고, --cleanup 은 그 표식이 있는 행만 지운다.
 *
 *   npx tsx --env-file=.env scripts/ib-guide-e2e-setup.ts > "$SCRATCH/ib.json"   # (packages/server 에서)
 *   npx tsx --env-file=.env scripts/ib-guide-e2e-setup.ts --cleanup              # 만든 것 모두 삭제
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, rmdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { and, eq, inArray } from 'drizzle-orm';
import { IB_MANIFEST_REL, iaPageRel, validateIbManifest, type IaDoc, type IbManifest } from '@mathchois/shared';
import { db, pgClient } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import { allowedTeachers, classrooms, classroomMembers, profiles } from '../src/db/schema.js';
import { hashPassword } from '../src/services/auth.service.js';

const PASSWORD = 'Test1234!';
const TEACHER_EMAIL = 'ib-guide.teacher@chois.test';
const STUDENT_EMAIL = 'ib-guide.student@chois.test';
const OUTSIDER_EMAIL = 'ib-guide.outsider@chois.test';
const STUDENT_NAME = '아이비 학생';
const CLASS_CODE = 'IBGUIDE01';
const MARK = 'IB-GUIDE-E2E';
const ALLOWED_NOTE = `${MARK} fixture teacher`;

const ROOT = path.resolve(env.VOLUME_PATH, 'ib-guide');
const SENTINEL = path.join(ROOT, '.e2e-fixture');

const PAGE_W = 1600;
const PAGE_H = 2263;

/** 예시별 문서 쪽수 — ex02 는 학생 보고서만 */
const FIXTURE: { id: string; no: number; title: string; docs: Partial<Record<IaDoc, number>> }[] = [
  { id: 'ex01', no: 1, title: `${MARK} 예시 1`, docs: { student: 3, annotated: 3, comments: 1 } },
  { id: 'ex02', no: 2, title: `${MARK} 예시 2`, docs: { student: 2 } },
];

const sha256 = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');

async function ensureUser(email: string, name: string, role: 'teacher' | 'student') {
  const existing = await db.select().from(profiles).where(eq(profiles.email, email)).limit(1);
  const passwordHash = await hashPassword(PASSWORD);
  if (existing[0]) {
    const [u] = await db.update(profiles)
      .set({ name, passwordHash, authMethod: 'email', role, isAdmin: false, mustResetPassword: false })
      .where(eq(profiles.id, existing[0].id)).returning();
    return u;
  }
  const [row] = await db.insert(profiles)
    .values({ email, name, role, authMethod: 'email', passwordHash, isAdmin: false })
    .returning();
  return row;
}

// 7-세그먼트 숫자(글꼴 없이 사각형만) — 쪽마다 그림이 달라 바이트도 달라진다.
const SEGMENTS: Record<string, string> = {
  0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
};

function digitRects(d: number, x: number, y: number, w: number, h: number, t: number): string {
  const half = (h - t) / 2;
  const r = (rx: number, ry: number, rw: number, rh: number) => `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="#000"/>`;
  const seg: Record<string, string> = {
    a: r(x, y, w, t),
    b: r(x + w - t, y, t, half + t),
    c: r(x + w - t, y + half, t, half + t),
    d: r(x, y + h - t, w, t),
    e: r(x, y + half, t, half + t),
    f: r(x, y, t, half + t),
    g: r(x, y + half, w, t),
  };
  return [...SEGMENTS[d % 10]].map((s) => seg[s]).join('');
}

/** 흰 바탕에 큰 숫자(쪽 번호) + 예시·문서별로 자리가 다른 작은 막대 */
async function pageImage(exIndex: number, docIndex: number, n: number): Promise<Buffer> {
  const bar = `<rect x="${120 + exIndex * 400}" y="${2000 + docIndex * 60}" width="300" height="40" fill="#000"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}" height="${PAGE_H}">`
    + `<rect width="100%" height="100%" fill="#fff"/>${digitRects(n, 500, 500, 600, 1100, 120)}${bar}</svg>`;
  return sharp(Buffer.from(svg)).webp({ quality: 80 }).toBuffer();
}

/** ROOT 밑 파일 목록(상대 경로, 표식 제외) */
async function listFiles(dir = ROOT): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await listFiles(abs));
    else if (abs !== SENTINEL) out.push(path.relative(ROOT, abs));
  }
  return out;
}

const sentinelText = (hashes: Record<string, string>) =>
  `${MARK} fixture — ib-guide-e2e-setup.ts 가 만든 파일만 --cleanup 이 지웁니다\n${JSON.stringify(hashes)}\n`;

async function sentinelHashes(): Promise<Record<string, string>> {
  try {
    return JSON.parse((await readFile(SENTINEL, 'utf8')).split('\n')[1] || '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

/** IBGUIDE01 학급 — 없으면 null, 소유 교사가 픽스처 교사가 아니면 던진다 */
async function fixtureClassroom() {
  const [cls] = await db.select().from(classrooms).where(eq(classrooms.classCode, CLASS_CODE)).limit(1);
  if (!cls) return null;
  const [teacher] = await db.select().from(profiles).where(eq(profiles.email, TEACHER_EMAIL)).limit(1);
  if (!teacher || cls.teacherId !== teacher.id) {
    throw new Error(`학급 코드 ${CLASS_CODE} 의 소유자가 픽스처 교사(${TEACHER_EMAIL})가 아니라 건드리지 않습니다`);
  }
  return cls;
}

/** 덮어쓰기 전에 ib-guide/ 의 자료가 이 스크립트 것인지 본다 — 아니면 멈춘다 */
async function assertOurs() {
  const present = await listFiles();
  if (present.length && !existsSync(SENTINEL)) {
    throw new Error(`${path.join(ROOT, present[0])} 등 IB 자료가 이미 있고 픽스처 표식(${SENTINEL})이 없어 덮어쓰지 않습니다 — `
      + '실제 자료가 든 Volume 에는 이 스크립트를 쓰지 마세요');
  }
  const manifest = path.join(ROOT, IB_MANIFEST_REL);
  if (existsSync(manifest)) {
    const hashes = await sentinelHashes();
    if (hashes[IB_MANIFEST_REL] !== sha256(await readFile(manifest))) {
      throw new Error(`${manifest} 가 픽스처가 만든 파일과 달라 덮어쓰지 않습니다`);
    }
  }
  await fixtureClassroom();
}

async function writeFixtureFiles(): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {};
  const manifest: IbManifest = { version: 1, examples: [], files: {} };
  for (const [exIndex, ex] of FIXTURE.entries()) {
    const docs: IbManifest['examples'][number]['docs'] = {};
    for (const [doc, pages] of Object.entries(ex.docs) as [IaDoc, number][]) {
      docs[doc] = { pages };
      for (let n = 1; n <= pages; n++) {
        const rel = iaPageRel(ex.id, doc, n);
        const buf = await pageImage(exIndex, ['student', 'annotated', 'comments'].indexOf(doc), n);
        await mkdir(path.dirname(path.join(ROOT, rel)), { recursive: true });
        await writeFile(path.join(ROOT, rel), buf);
        hashes[rel] = sha256(buf);
        manifest.files[rel] = { sha256: hashes[rel], size: buf.length };
      }
    }
    manifest.examples.push({ id: ex.id, no: ex.no, title: ex.title, note: '', docs });
  }
  const errors = validateIbManifest(manifest);
  if (errors.length) throw new Error(`픽스처 manifest 가 잘못되었습니다: ${errors.join(', ')}`);
  const json = Buffer.from(JSON.stringify(manifest, null, 2));
  await mkdir(path.dirname(path.join(ROOT, IB_MANIFEST_REL)), { recursive: true });
  await writeFile(path.join(ROOT, IB_MANIFEST_REL), json);
  hashes[IB_MANIFEST_REL] = sha256(json);
  return hashes;
}

async function removeEmptyDirs(dir: string) {
  // ROOT 밑에서 비어 있는 폴더를 아래부터 지운다(ROOT 도 비면 지운다)
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) if (e.isDirectory()) await removeEmptyDirs(path.join(dir, e.name));
  try {
    if (!(await readdir(dir)).length) await rmdir(dir);
  } catch {
    // 비어 있지 않거나 이미 없음
  }
}

async function cleanup() {
  await fixtureClassroom(); // 소유자가 다르면 아무것도 지우기 전에 던진다

  if (!existsSync(SENTINEL)) {
    if ((await listFiles()).length) console.error(`픽스처 표식(${SENTINEL})이 없어 Volume 파일은 그대로 둡니다`);
  } else {
    const hashes = await sentinelHashes();
    for (const rel of await listFiles()) {
      const abs = path.join(ROOT, rel);
      if (hashes[rel] && sha256(await readFile(abs)) === hashes[rel]) await rm(abs, { force: true });
      else console.error(`${abs} 는 픽스처가 만든 파일이 아니라 그대로 둡니다`);
    }
    await rm(SENTINEL, { force: true }); // 표식은 마지막에
    await removeEmptyDirs(ROOT);
  }
  // 학급 → 학급 멤버는 CASCADE. 계정까지 지운다.
  await db.delete(classrooms).where(eq(classrooms.classCode, CLASS_CODE));
  await db.delete(profiles).where(inArray(profiles.email, [TEACHER_EMAIL, STUDENT_EMAIL, OUTSIDER_EMAIL]));
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

  const teacher = await ensureUser(TEACHER_EMAIL, 'IB안내 교사', 'teacher');
  // 허용 목록에 없으면 로그인 때 applyAccessRules 가 학생으로 내린다
  await db.insert(allowedTeachers)
    .values({ email: TEACHER_EMAIL, note: ALLOWED_NOTE })
    .onConflictDoNothing({ target: allowedTeachers.email });
  const student = await ensureUser(STUDENT_EMAIL, STUDENT_NAME, 'student');
  const outsider = await ensureUser(OUTSIDER_EMAIL, 'IB안내 외부 학생', 'student');
  let [cls] = await db.select().from(classrooms).where(eq(classrooms.classCode, CLASS_CODE)).limit(1);
  if (!cls) {
    [cls] = await db.insert(classrooms)
      .values({ name: 'IB안내 E2E 학급', teacherId: teacher.id, classCode: CLASS_CODE, ibGuideEnabled: false }).returning();
  } else {
    [cls] = await db.update(classrooms).set({ teacherId: teacher.id, ibGuideEnabled: false })
      .where(eq(classrooms.id, cls.id)).returning();
  }
  await db.insert(classroomMembers).values({ classroomId: cls.id, studentId: student.id }).onConflictDoNothing();
  // 외부 학생은 어느 학급에도 속하지 않는다(다시 실행할 때 혹시 남은 멤버십도 지운다)
  await db.delete(classroomMembers).where(eq(classroomMembers.studentId, outsider.id));

  await mkdir(ROOT, { recursive: true });
  await writeFile(SENTINEL, sentinelText({})); // 파일을 만들기 전에 먼저
  await writeFile(SENTINEL, sentinelText(await writeFixtureFiles()));

  console.log(JSON.stringify({
    teacher: { id: teacher.id, email: teacher.email },
    student: { id: student.id, email: student.email, name: STUDENT_NAME },
    outsider: { id: outsider.id, email: outsider.email },
    password: PASSWORD,
    classroomId: cls.id,
    classCode: CLASS_CODE,
  }));
  await pgClient.end();
}

main().catch(async (err) => { console.error(err); await pgClient.end(); process.exit(1); });
