/**
 * 단원 불러오기·내보내기 E2E 준비: 테스트 교사 + 학급 S(원본)·T1(빈 학급)·T2(일부 겹침)를 만들고 id 를 JSON 으로 출력한다.
 *   S : 단원 `UT E2E 1단원`(챕터 수열·급수, 영상 V1→필기 수열, V2→필기 미분), 단원 `UT E2E 2단원`(숨김, 챕터 극한, 영상 V3),
 *       미분류 챕터 미분
 *   T1: 비어 있음
 *   T2: 단원 `UT E2E 1단원`(보임), 미분류 챕터 ` 수열 `, V2 배정(메모 `기존`, 필기 없음)
 * 이 스크립트가 만든 학급·영상은 이름이 `UT E2E ` 로 시작해 다음 실행·--cleanup 에서 알아보고 지운다.
 *
 *   npx tsx --env-file=.env scripts/unit-transfer-e2e-setup.ts > "$SCRATCH/ut.json"   # (packages/server 에서)
 *   npx tsx --env-file=.env scripts/unit-transfer-e2e-setup.ts --cleanup
 */
import { eq, like, inArray } from 'drizzle-orm';
import { db, pgClient } from '../src/config/database.js';
import { profiles, classrooms, units, chapters, pages, videos, classroomVideos } from '../src/db/schema.js';
import { hashPassword } from '../src/services/auth.service.js';

const PASSWORD = 'Test1234!';
const PREFIX = 'UT E2E ';
const EMAIL = 'ut.teacher@chois.test';

async function ensureTeacher() {
  const existing = await db.select().from(profiles).where(eq(profiles.email, EMAIL)).limit(1);
  if (existing[0]) return existing[0];
  const [row] = await db.insert(profiles)
    .values({ email: EMAIL, name: 'UT 교사', role: 'teacher', authMethod: 'email', passwordHash: await hashPassword(PASSWORD), isAdmin: false })
    .returning();
  return row;
}

/** 이전 실행이 만든 학급(단원·챕터·배정은 CASCADE)과 영상을 지운다 */
async function wipe() {
  await db.delete(classrooms).where(like(classrooms.name, `${PREFIX}%`));
  const stale = db.select({ id: videos.id }).from(videos).where(like(videos.title, `${PREFIX}%`));
  await db.delete(classroomVideos).where(inArray(classroomVideos.videoId, stale)); // videoId FK 는 RESTRICT
  await db.delete(videos).where(like(videos.title, `${PREFIX}%`));
}

async function main() {
  const teacher = await ensureTeacher();
  await wipe();
  if (process.argv[2] === '--cleanup') {
    await pgClient.end();
    return;
  }

  const mkClass = async (name: string, code: string) =>
    (await db.insert(classrooms).values({ name: `${PREFIX}${name}`, teacherId: teacher.id, classCode: code }).returning())[0];
  const S = await mkClass('원본반', 'UTE2E0S0');
  const T1 = await mkClass('빈반', 'UTE2E0T1');
  const T2 = await mkClass('겹친반', 'UTE2E0T2');

  const mkUnit = async (classroomId: string, title: string, position: number, isHidden = false) =>
    (await db.insert(units).values({ classroomId, title, position, isHidden }).returning())[0];
  let pos = 0;
  const mkChapter = async (classroomId: string, title: string, unitId: string | null) => {
    const [ch] = await db.insert(chapters).values({ classroomId, title, unitId, position: pos++ }).returning();
    await db.insert(pages).values({ chapterId: ch.id, position: 0 });
    return ch;
  };
  const mkVideo = async (title: string) =>
    (await db.insert(videos).values({ createdBy: teacher.id, title: `${PREFIX}${title}`, videoUrl: `ut-e2e/${title}.mp4` }).returning())[0];
  const assign = async (classroomId: string, videoId: string, values: { unitId?: string | null; chapterId?: string | null; note?: string | null; position: number }) =>
    (await db.insert(classroomVideos).values({ classroomId, videoId, addedBy: teacher.id, ...values }).returning())[0];

  const s1 = await mkUnit(S.id, `${PREFIX}1단원`, 0);
  const s2 = await mkUnit(S.id, `${PREFIX}2단원`, 1, true);
  const sSeq = await mkChapter(S.id, '수열', s1.id);
  await mkChapter(S.id, '급수', s1.id);
  await mkChapter(S.id, '극한', s2.id);
  const sDiff = await mkChapter(S.id, '미분', null);
  const v1 = await mkVideo('V1');
  const v2 = await mkVideo('V2');
  const v3 = await mkVideo('V3');
  await assign(S.id, v1.id, { unitId: s1.id, chapterId: sSeq.id, note: 'V1 메모', position: 0 });
  await assign(S.id, v2.id, { unitId: s1.id, chapterId: sDiff.id, note: 'V2 원본 메모', position: 1 });
  await assign(S.id, v3.id, { unitId: s2.id, position: 2 });

  const t2u = await mkUnit(T2.id, `${PREFIX}1단원`, 0);
  const t2Seq = await mkChapter(T2.id, ' 수열 ', null);
  const t2v2 = await assign(T2.id, v2.id, { note: '기존', position: 0 });

  console.log(JSON.stringify({
    S: S.id, T1: T1.id, T2: T2.id,
    sUnits: [s1.id, s2.id], s1: s1.id, s2: s2.id,
    t2Unit: t2u.id, t2Seq: t2Seq.id, t2v2: t2v2.id,
    videos: { v1: v1.id, v2: v2.id, v3: v3.id },
    email: EMAIL, password: PASSWORD,
  }));
  await pgClient.end();
}

main().catch(async (err) => { console.error(err); await pgClient.end(); process.exit(1); });
