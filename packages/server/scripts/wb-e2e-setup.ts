/**
 * 브라우저 E2E 준비: 테스트 교사/학생 3명 + 학급 + 기본 모둠(1모둠: A,B / 2모둠: C) +
 * 화이트보드 페이지(기본 템플릿 swot) 를 만들고 id 를 JSON 으로 출력한다.
 *
 *   npx tsx --env-file=.env scripts/wb-e2e-setup.ts            # (packages/server 에서)
 *   npx tsx --env-file=.env scripts/wb-e2e-setup.ts --cleanup <chapterId>
 */
import { eq } from 'drizzle-orm';
import { db, pgClient } from '../src/config/database.js';
import { profiles, classrooms, classroomMembers, chapters, pages } from '../src/db/schema.js';
import { hashPassword } from '../src/services/auth.service.js';
import { replaceClassroomGroups } from '../src/services/classroomGroup.service.js';

const PASSWORD = 'Test1234!';

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

async function main() {
  if (process.argv[2] === '--cleanup' && process.argv[3]) {
    await db.delete(chapters).where(eq(chapters.id, process.argv[3]));
    await pgClient.end();
    return;
  }
  const teacher = await ensureUser('test.teacher@chois.test', '테스트 교사', 'teacher');
  const sA = await ensureUser('test.student@chois.test', '테스트 학생', 'student');
  const sB = await ensureUser('wb.student.b@chois.test', '화이트보드 학생B', 'student');
  const sC = await ensureUser('wb.student.c@chois.test', '화이트보드 학생C', 'student');
  let [cls] = await db.select().from(classrooms).where(eq(classrooms.classCode, 'TEST0001')).limit(1);
  if (!cls) [cls] = await db.insert(classrooms).values({ name: '테스트 클래스', teacherId: teacher.id, classCode: 'TEST0001' }).returning();
  for (const s of [sA, sB, sC]) {
    await db.insert(classroomMembers).values({ classroomId: cls.id, studentId: s.id }).onConflictDoNothing();
  }
  await replaceClassroomGroups(cls.id, [
    { name: '1모둠', position: 0, studentIds: [sA.id, sB.id] },
    { name: '2모둠', position: 1, studentIds: [sC.id] },
  ]);
  const [chapter] = await db.insert(chapters).values({ classroomId: cls.id, title: `WB E2E ${Date.now()}`, position: 998 }).returning();
  const [page] = await db.insert(pages).values({ chapterId: chapter.id, pageType: 'whiteboard', whiteboardTemplate: 'swot', position: 0 }).returning();
  const [page2] = await db.insert(pages).values({ chapterId: chapter.id, pageType: 'whiteboard', whiteboardTemplate: null, position: 1 }).returning();

  console.log(JSON.stringify({
    classroomId: cls.id, chapterId: chapter.id, pageId: page.id, page2Id: page2.id,
    teacher: { id: teacher.id, email: teacher.email }, studentA: { id: sA.id, email: sA.email },
    studentB: { id: sB.id, email: sB.email }, studentC: { id: sC.id, email: sC.email }, password: PASSWORD,
  }));
  await pgClient.end();
}

main().catch(async (err) => { console.error(err); await pgClient.end(); process.exit(1); });
