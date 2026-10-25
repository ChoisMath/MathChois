/**
 * 단원 브라우저 E2E 준비: 테스트 교사/학생 + 학급 TEST0001 의 기존 단원을 모두 지우고(항목은 미분류로 남는다)
 * 단원 u1(보임)·u2(보임)·uh(숨김) 과 챕터·영상을 만든 뒤 id 를 JSON 으로 출력한다.
 *   u1: 챕터 2개 + 영상 1개 / u2: 챕터 1개 / uh: 챕터 1개 / 미분류: 챕터 1개
 * 이 스크립트가 만든 챕터·영상은 이름이 `UNITS E2E ` 로 시작해 다음 실행·--cleanup 에서 알아보고 지운다.
 *
 *   npx tsx --env-file=.env scripts/units-e2e-setup.ts > "$SCRATCH/units.json"   # (packages/server 에서)
 *   npx tsx --env-file=.env scripts/units-e2e-setup.ts --cleanup
 */
import { eq, like, inArray } from 'drizzle-orm';
import { db, pgClient } from '../src/config/database.js';
import {
  profiles, classrooms, classroomMembers, units, chapters, pages, videos, classroomVideos,
} from '../src/db/schema.js';
import { hashPassword } from '../src/services/auth.service.js';

const PASSWORD = 'Test1234!';
const PREFIX = 'UNITS E2E ';

async function ensureUser(email: string, name: string, role: 'teacher' | 'student') {
  const existing = await db.select().from(profiles).where(eq(profiles.email, email)).limit(1);
  if (existing[0]) {
    const [u] = await db.update(profiles)
      .set({ passwordHash: await hashPassword(PASSWORD), authMethod: 'email', role, mustResetPassword: false })
      .where(eq(profiles.id, existing[0].id)).returning();
    return u;
  }
  const [row] = await db.insert(profiles)
    .values({ email, name, role, authMethod: 'email', passwordHash: await hashPassword(PASSWORD), isAdmin: false })
    .returning();
  return row;
}

/** 이전 실행이 만든 챕터·영상과 학급의 모든 단원을 지운다 */
async function wipe(classroomId: string) {
  await db.delete(units).where(eq(units.classroomId, classroomId)); // 항목의 unit_id 는 SET NULL
  await db.delete(chapters).where(like(chapters.title, `${PREFIX}%`)); // pages 는 CASCADE
  const stale = db.select({ id: videos.id }).from(videos).where(like(videos.title, `${PREFIX}%`));
  await db.delete(classroomVideos).where(inArray(classroomVideos.videoId, stale)); // videoId FK 는 RESTRICT
  await db.delete(videos).where(like(videos.title, `${PREFIX}%`));
}

async function main() {
  const teacher = await ensureUser('test.teacher@chois.test', '테스트 교사', 'teacher');
  const student = await ensureUser('test.student@chois.test', '테스트 학생', 'student');
  let [cls] = await db.select().from(classrooms).where(eq(classrooms.classCode, 'TEST0001')).limit(1);
  if (!cls) [cls] = await db.insert(classrooms).values({ name: '테스트 클래스', teacherId: teacher.id, classCode: 'TEST0001' }).returning();
  await db.insert(classroomMembers).values({ classroomId: cls.id, studentId: student.id }).onConflictDoNothing();

  await wipe(cls.id);
  if (process.argv[2] === '--cleanup') {
    await pgClient.end();
    return;
  }

  const mkUnit = async (title: string, position: number, isHidden = false) =>
    (await db.insert(units).values({ classroomId: cls.id, title, position, isHidden }).returning())[0];
  const u1 = await mkUnit(`${PREFIX}단원1`, 0);
  const u2 = await mkUnit(`${PREFIX}단원2`, 1);
  const uh = await mkUnit(`${PREFIX}숨김단원`, 2, true);

  let pos = 900;
  const mkChapter = async (title: string, unitId: string | null) => {
    const [ch] = await db.insert(chapters)
      .values({ classroomId: cls.id, title: `${PREFIX}${title}`, unitId, position: pos++ }).returning();
    await db.insert(pages).values({ chapterId: ch.id, position: 0 });
    return ch;
  };
  const c1a = await mkChapter('챕터 1-A', u1.id);
  const c1b = await mkChapter('챕터 1-B', u1.id);
  const c2 = await mkChapter('챕터 2-A', u2.id);
  const ch = await mkChapter('챕터 숨김-A', uh.id);
  const cn = await mkChapter('챕터 미분류', null);

  const [vid] = await db.insert(videos)
    .values({ createdBy: teacher.id, title: `${PREFIX}영상`, videoUrl: `units-e2e/${Date.now()}.mp4` }).returning();
  const [cv] = await db.insert(classroomVideos)
    .values({ classroomId: cls.id, videoId: vid.id, addedBy: teacher.id, unitId: u1.id }).returning();

  console.log(JSON.stringify({
    classroomId: cls.id,
    units: { u1: u1.id, u2: u2.id, uh: uh.id },
    unitTitles: { u1: u1.title, u2: u2.title, uh: uh.title },
    chapters: { c1a: c1a.id, c1b: c1b.id, c2: c2.id, ch: ch.id, cn: cn.id },
    chapterTitles: { c1a: c1a.title, c1b: c1b.title, c2: c2.title, ch: ch.title, cn: cn.title },
    videoId: vid.id, classroomVideoId: cv.id, videoTitle: vid.title,
    teacher: { id: teacher.id, email: teacher.email }, student: { id: student.id, email: student.email },
    password: PASSWORD,
  }));
  await pgClient.end();
}

main().catch(async (err) => { console.error(err); await pgClient.end(); process.exit(1); });
