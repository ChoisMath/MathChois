import { eq, and, count, desc, ne, inArray } from 'drizzle-orm';
import { db } from '../config/database.js';
import { classrooms, classroomMembers, profiles, chapters, pages, assignments, assignmentPages } from '../db/schema.js';

/** 6자리 랜덤 클래스 코드 생성 */
function generateClassCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 혼동 문자 제외
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ─── Classroom CRUD ──────────────────────────────

/** 교사 교실 목록 (멤버 수 포함) */
export async function getTeacherClassrooms(teacherId: string) {
  const rows = await db
    .select({
      id: classrooms.id,
      name: classrooms.name,
      teacherId: classrooms.teacherId,
      classCode: classrooms.classCode,
      createdAt: classrooms.createdAt,
      memberCount: count(classroomMembers.id),
    })
    .from(classrooms)
    .leftJoin(classroomMembers, eq(classrooms.id, classroomMembers.classroomId))
    .where(eq(classrooms.teacherId, teacherId))
    .groupBy(classrooms.id)
    .orderBy(desc(classrooms.createdAt));

  return rows;
}

/** 학생 교실 목록 (멤버 수 포함) */
export async function getStudentClassrooms(studentId: string) {
  // 학생이 속한 교실 ID 먼저 가져오기
  const memberRows = await db
    .select({ classroomId: classroomMembers.classroomId })
    .from(classroomMembers)
    .where(eq(classroomMembers.studentId, studentId));

  if (memberRows.length === 0) return [];

  const classroomIds = memberRows.map((r) => r.classroomId);

  // 해당 교실의 멤버 수 포함하여 가져오기
  const rows = await db
    .select({
      id: classrooms.id,
      name: classrooms.name,
      teacherId: classrooms.teacherId,
      classCode: classrooms.classCode,
      createdAt: classrooms.createdAt,
      memberCount: count(classroomMembers.id),
    })
    .from(classrooms)
    .leftJoin(classroomMembers, eq(classrooms.id, classroomMembers.classroomId))
    .where(inArray(classrooms.id, classroomIds))
    .groupBy(classrooms.id)
    .orderBy(desc(classrooms.createdAt));

  return rows;
}

/** 교실 상세 */
export async function getClassroomById(id: string) {
  const rows = await db
    .select()
    .from(classrooms)
    .where(eq(classrooms.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/** 교실 생성 */
export async function createClassroom(teacherId: string, name: string) {
  // 코드 충돌 방지: 최대 5회 시도
  for (let i = 0; i < 5; i++) {
    try {
      const [created] = await db
        .insert(classrooms)
        .values({
          name,
          teacherId,
          classCode: generateClassCode(),
        })
        .returning();
      return created;
    } catch (err: unknown) {
      const isUniqueViolation = err instanceof Error && err.message.includes('unique');
      if (!isUniqueViolation || i === 4) throw err;
    }
  }
  throw new Error('Failed to generate unique class code');
}

/** 교실 수정 */
export async function updateClassroom(id: string, data: { name?: string }) {
  const [updated] = await db
    .update(classrooms)
    .set(data)
    .where(eq(classrooms.id, id))
    .returning();
  return updated ?? null;
}

/** 교실 삭제 */
export async function deleteClassroom(id: string) {
  await db.delete(classrooms).where(eq(classrooms.id, id));
}

/** 교사의 다른 교실 목록 (import/export 용) */
export async function getOtherClassrooms(teacherId: string, excludeId: string) {
  return db
    .select({ id: classrooms.id, name: classrooms.name })
    .from(classrooms)
    .where(and(eq(classrooms.teacherId, teacherId), ne(classrooms.id, excludeId)))
    .orderBy(desc(classrooms.createdAt));
}

// ─── Members ────────────────────────────────────

/** 교실 멤버 목록 (프로필 포함) */
export async function getClassroomMembers(classroomId: string) {
  return db
    .select({
      id: classroomMembers.id,
      classroomId: classroomMembers.classroomId,
      studentId: classroomMembers.studentId,
      joinedAt: classroomMembers.joinedAt,
      student: {
        id: profiles.id,
        name: profiles.name,
        email: profiles.email,
        avatarUrl: profiles.avatarUrl,
      },
    })
    .from(classroomMembers)
    .innerJoin(profiles, eq(classroomMembers.studentId, profiles.id))
    .where(eq(classroomMembers.classroomId, classroomId))
    .orderBy(classroomMembers.joinedAt);
}

/** 코드로 교실 참가 (join_classroom_by_code RPC 대체) */
export async function joinClassroomByCode(studentId: string, code: string) {
  // 코드로 교실 찾기
  const rows = await db
    .select()
    .from(classrooms)
    .where(eq(classrooms.classCode, code.trim().toUpperCase()))
    .limit(1);

  if (rows.length === 0) {
    return { error: '해당 코드의 클래스를 찾을 수 없습니다.' };
  }

  const classroom = rows[0];

  // 이미 참가했는지 확인
  const existing = await db
    .select()
    .from(classroomMembers)
    .where(
      and(
        eq(classroomMembers.classroomId, classroom.id),
        eq(classroomMembers.studentId, studentId),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    return { error: '이미 참가한 클래스입니다.' };
  }

  await db
    .insert(classroomMembers)
    .values({ classroomId: classroom.id, studentId });

  return { classroom };
}

/** 멤버 제거 */
export async function removeClassroomMember(classroomId: string, studentId: string) {
  await db
    .delete(classroomMembers)
    .where(
      and(
        eq(classroomMembers.classroomId, classroomId),
        eq(classroomMembers.studentId, studentId),
      ),
    );
}

/** 교실 소유자 확인 */
export async function isClassroomOwner(classroomId: string, teacherId: string): Promise<boolean> {
  const rows = await db
    .select({ id: classrooms.id })
    .from(classrooms)
    .where(and(eq(classrooms.id, classroomId), eq(classrooms.teacherId, teacherId)))
    .limit(1);
  return rows.length > 0;
}

/** 교실의 모든 이미지 URL 수집 (챕터 페이지 + 과제 페이지) */
export async function getClassroomImageUrls(classroomId: string): Promise<string[]> {
  // 챕터 페이지 이미지
  const chapterRows = await db
    .select({ imageUrl: pages.imageUrl })
    .from(pages)
    .innerJoin(chapters, eq(pages.chapterId, chapters.id))
    .where(eq(chapters.classroomId, classroomId));

  // 과제 페이지 이미지
  const assignmentRows = await db
    .select({ imageUrl: assignmentPages.imageUrl })
    .from(assignmentPages)
    .innerJoin(assignments, eq(assignmentPages.assignmentId, assignments.id))
    .where(eq(assignments.classroomId, classroomId));

  return [
    ...chapterRows.map((r) => r.imageUrl),
    ...assignmentRows.map((r) => r.imageUrl),
  ];
}

/** 다른 교실에서도 사용 중인 이미지 URL 찾기 (orphan 체크) */
export async function findSharedClassroomImageUrls(
  urls: string[],
  excludeClassroomId: string,
): Promise<string[]> {
  if (urls.length === 0) return [];

  // 다른 교실의 챕터 페이지에서 사용 중인 URL
  const sharedChapterRows = await db
    .select({ imageUrl: pages.imageUrl })
    .from(pages)
    .innerJoin(chapters, eq(pages.chapterId, chapters.id))
    .where(and(
      inArray(pages.imageUrl, urls),
      ne(chapters.classroomId, excludeClassroomId),
    ));

  // 다른 교실의 과제 페이지에서 사용 중인 URL
  const sharedAssignmentRows = await db
    .select({ imageUrl: assignmentPages.imageUrl })
    .from(assignmentPages)
    .innerJoin(assignments, eq(assignmentPages.assignmentId, assignments.id))
    .where(and(
      inArray(assignmentPages.imageUrl, urls),
      ne(assignments.classroomId, excludeClassroomId),
    ));

  return [
    ...sharedChapterRows.map((r) => r.imageUrl),
    ...sharedAssignmentRows.map((r) => r.imageUrl),
  ];
}

/** 교실 멤버 확인 */
export async function isClassroomMember(classroomId: string, studentId: string): Promise<boolean> {
  const rows = await db
    .select({ id: classroomMembers.id })
    .from(classroomMembers)
    .where(
      and(
        eq(classroomMembers.classroomId, classroomId),
        eq(classroomMembers.studentId, studentId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
