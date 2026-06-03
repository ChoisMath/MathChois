/**
 * 테스트용 고정 계정 시드 (멱등).
 *
 * Railway DB에 email/password 로그인 가능한 교사·학생 계정과,
 * 둘을 연결한 공유 테스트 클래스를 만들어 둔다. 여러 번 실행해도 안전.
 *
 * 실행:  npm run seed:test -w @mathchois/server
 *
 * 고정 자격증명(테스트 전용 — 운영 데이터 아님):
 *   교사  test.teacher@chois.test  / Test1234!
 *   학생  test.student@chois.test  / Test1234!
 *   클래스 코드  TEST0001
 */
import { eq } from 'drizzle-orm';
import { db, pgClient } from '../src/config/database.js';
import { profiles, classrooms, classroomMembers } from '../src/db/schema.js';
import { hashPassword } from '../src/services/auth.service.js';

const TEACHER = { email: 'test.teacher@chois.test', name: '테스트 교사', role: 'teacher' as const };
const STUDENT = { email: 'test.student@chois.test', name: '테스트 학생', role: 'student' as const };
const PASSWORD = 'Test1234!';
const CLASS_NAME = '테스트 클래스';
const CLASS_CODE = 'TEST0001';

async function upsertEmailUser(u: { email: string; name: string; role: 'teacher' | 'student' }) {
  const passwordHash = await hashPassword(PASSWORD);
  const existing = await db.select().from(profiles).where(eq(profiles.email, u.email)).limit(1);

  if (existing[0]) {
    const [updated] = await db.update(profiles)
      .set({ name: u.name, role: u.role, authMethod: 'email', passwordHash, mustResetPassword: false })
      .where(eq(profiles.id, existing[0].id))
      .returning();
    return { row: updated, created: false };
  }

  const [created] = await db.insert(profiles)
    .values({ email: u.email, name: u.name, role: u.role, authMethod: 'email', passwordHash, isAdmin: false })
    .returning();
  return { row: created, created: true };
}

async function upsertClassroom(teacherId: string) {
  const existing = await db.select().from(classrooms).where(eq(classrooms.classCode, CLASS_CODE)).limit(1);
  if (existing[0]) {
    // 교사 소유자 보정(혹시 다른 교사로 잡혀 있으면)
    if (existing[0].teacherId !== teacherId) {
      const [updated] = await db.update(classrooms)
        .set({ teacherId, name: CLASS_NAME })
        .where(eq(classrooms.id, existing[0].id)).returning();
      return { row: updated, created: false };
    }
    return { row: existing[0], created: false };
  }
  const [created] = await db.insert(classrooms)
    .values({ name: CLASS_NAME, teacherId, classCode: CLASS_CODE })
    .returning();
  return { row: created, created: true };
}

async function ensureMembership(classroomId: string, studentId: string) {
  const existing = await db.select().from(classroomMembers)
    .where(eq(classroomMembers.classroomId, classroomId)).limit(50);
  if (existing.some((m) => m.studentId === studentId)) return false;
  await db.insert(classroomMembers).values({ classroomId, studentId });
  return true;
}

async function main() {
  const teacher = await upsertEmailUser(TEACHER);
  const student = await upsertEmailUser(STUDENT);
  const classroom = await upsertClassroom(teacher.row.id);
  const joined = await ensureMembership(classroom.row.id, student.row.id);

  console.info('=== 테스트 계정 시드 완료 ===');
  console.info(`교사  ${TEACHER.email} (${teacher.created ? '생성' : '갱신'})  id=${teacher.row.id}`);
  console.info(`학생  ${STUDENT.email} (${student.created ? '생성' : '갱신'})  id=${student.row.id}`);
  console.info(`클래스 ${CLASS_NAME} [${CLASS_CODE}] (${classroom.created ? '생성' : '확인'})  id=${classroom.row.id}`);
  console.info(`멤버십 학생→클래스 ${joined ? '추가' : '이미 존재'}`);
  console.info(`비밀번호(공통): ${PASSWORD}`);

  await pgClient.end();
}

main().catch(async (err) => {
  console.error('시드 실패:', err);
  await pgClient.end().catch(() => {});
  process.exit(1);
});
