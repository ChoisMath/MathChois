import { eq, and, inArray, desc, sql, ne } from 'drizzle-orm';
import { db } from '../config/database.js';
import {
  assignments, assignmentPages, assignmentSubmissions,
  assignmentNotes, assignmentTeacherComments,
} from '../db/schema.js';

// ─── Assignments ────────────────────────────────

/** 교실의 과제 목록 */
export async function getAssignmentsByClassroom(classroomId: string) {
  return db
    .select()
    .from(assignments)
    .where(eq(assignments.classroomId, classroomId))
    .orderBy(assignments.position);
}

/** 과제 상세 */
export async function getAssignmentById(id: string) {
  const rows = await db
    .select()
    .from(assignments)
    .where(eq(assignments.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/** 과제 생성 */
export async function createAssignment(data: {
  classroomId: string;
  teacherId: string;
  title: string;
  description?: string;
  deadline?: Date | null;
  maxScore?: number;
  position?: number;
}) {
  let position = data.position;
  if (position === undefined) {
    const maxRows = await db
      .select({ maxPos: sql<number>`COALESCE(MAX(${assignments.position}), -1)` })
      .from(assignments)
      .where(eq(assignments.classroomId, data.classroomId));
    position = (maxRows[0]?.maxPos ?? -1) + 1;
  }

  const [created] = await db
    .insert(assignments)
    .values({
      classroomId: data.classroomId,
      teacherId: data.teacherId,
      title: data.title,
      description: data.description ?? '',
      deadline: data.deadline ?? null,
      maxScore: data.maxScore ?? 100,
      position,
    })
    .returning();
  return created;
}

/** 과제 수정 */
export async function updateAssignment(id: string, data: {
  title?: string;
  description?: string;
  deadline?: Date | null;
  maxScore?: number;
}) {
  const updates = { ...data, updatedAt: new Date() };
  const [updated] = await db
    .update(assignments)
    .set(updates)
    .where(eq(assignments.id, id))
    .returning();
  return updated ?? null;
}

/** 과제 삭제 */
export async function deleteAssignment(id: string) {
  await db.delete(assignments).where(eq(assignments.id, id));
}

/** 과제 페이지의 이미지 URL 목록 */
export async function getAssignmentPageImageUrls(assignmentId: string): Promise<string[]> {
  const rows = await db
    .select({ imageUrl: assignmentPages.imageUrl })
    .from(assignmentPages)
    .where(eq(assignmentPages.assignmentId, assignmentId));
  return rows.map((r) => r.imageUrl);
}

/** 과제 소유자 확인 */
export async function isAssignmentOwner(assignmentId: string, teacherId: string): Promise<boolean> {
  const rows = await db
    .select({ id: assignments.id })
    .from(assignments)
    .where(and(eq(assignments.id, assignmentId), eq(assignments.teacherId, teacherId)))
    .limit(1);
  return rows.length > 0;
}

// ─── Assignment Pages ───────────────────────────

/** 과제 페이지 목록 */
export async function getAssignmentPages(assignmentId: string) {
  return db
    .select()
    .from(assignmentPages)
    .where(eq(assignmentPages.assignmentId, assignmentId))
    .orderBy(assignmentPages.position);
}

/** 과제 페이지 단일 조회 */
export async function getAssignmentPageById(id: string) {
  const rows = await db
    .select()
    .from(assignmentPages)
    .where(eq(assignmentPages.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/** 과제 페이지 생성 */
export async function createAssignmentPage(data: {
  assignmentId: string;
  imageUrl: string;
  position?: number;
}) {
  let position = data.position;
  if (position === undefined) {
    const maxRows = await db
      .select({ maxPos: sql<number>`COALESCE(MAX(${assignmentPages.position}), -1)` })
      .from(assignmentPages)
      .where(eq(assignmentPages.assignmentId, data.assignmentId));
    position = (maxRows[0]?.maxPos ?? -1) + 1;
  }

  const [created] = await db
    .insert(assignmentPages)
    .values({
      assignmentId: data.assignmentId,
      imageUrl: data.imageUrl,
      position: position ?? 0,
    })
    .returning();
  return created;
}

/** 과제 페이지 순서 변경 */
export async function reorderAssignmentPages(items: { id: string; position: number }[]) {
  await Promise.all(
    items.map((item) =>
      db.update(assignmentPages)
        .set({ position: item.position })
        .where(eq(assignmentPages.id, item.id)),
    ),
  );
}

/** 과제 페이지 삭제 */
export async function deleteAssignmentPage(id: string) {
  const rows = await db
    .select()
    .from(assignmentPages)
    .where(eq(assignmentPages.id, id))
    .limit(1);
  const page = rows[0] ?? null;
  if (page) {
    await db.delete(assignmentPages).where(eq(assignmentPages.id, id));
  }
  return page;
}

/** 과제 페이지 일괄 생성 (import용) */
export async function createAssignmentPages(items: {
  assignmentId: string;
  imageUrl: string;
  position: number;
}[]) {
  if (items.length === 0) return [];
  return db
    .insert(assignmentPages)
    .values(items)
    .returning();
}

/** 특정 URL이 다른 과제에서도 사용되는지 확인 (orphan 체크) */
export async function findSharedAssignmentImageUrls(
  urls: string[],
  excludeAssignmentId: string,
): Promise<string[]> {
  if (urls.length === 0) return [];
  const rows = await db
    .select({ imageUrl: assignmentPages.imageUrl })
    .from(assignmentPages)
    .where(
      and(
        inArray(assignmentPages.imageUrl, urls),
        ne(assignmentPages.assignmentId, excludeAssignmentId),
      ),
    );
  return rows.map((r) => r.imageUrl);
}

// ─── Submissions ────────────────────────────────

/** 과제 제출 목록 (교사 모니터링) */
export async function getSubmissionsByAssignment(assignmentId: string) {
  return db
    .select()
    .from(assignmentSubmissions)
    .where(eq(assignmentSubmissions.assignmentId, assignmentId));
}

/** 과제별 제출 수 카운트 (교사 모니터링) */
export async function getSubmissionCounts(assignmentIds: string[]) {
  if (assignmentIds.length === 0) return [];
  return db
    .select({
      assignmentId: assignmentSubmissions.assignmentId,
    })
    .from(assignmentSubmissions)
    .where(inArray(assignmentSubmissions.assignmentId, assignmentIds));
}

/** 학생의 제출 상태 조회 */
export async function getStudentSubmissions(studentId: string, assignmentIds: string[]) {
  if (assignmentIds.length === 0) return [];
  return db
    .select()
    .from(assignmentSubmissions)
    .where(
      and(
        eq(assignmentSubmissions.studentId, studentId),
        inArray(assignmentSubmissions.assignmentId, assignmentIds),
      ),
    );
}

/** 제출 상태 upsert */
export async function upsertSubmission(data: {
  assignmentId: string;
  studentId: string;
  status?: string;
  isLate?: boolean;
  score?: number | null;
  maxScore?: number | null;
  rejectionComment?: string | null;
}) {
  const now = new Date();
  const values = {
    assignmentId: data.assignmentId,
    studentId: data.studentId,
    status: data.status ?? 'draft',
    isLate: data.isLate ?? false,
    score: data.score ?? null,
    maxScore: data.maxScore ?? null,
    rejectionComment: data.rejectionComment ?? null,
    submittedAt: data.status === 'submitted' || data.status === 'late_submitted' ? now : null,
    updatedAt: now,
  };

  const [result] = await db
    .insert(assignmentSubmissions)
    .values(values)
    .onConflictDoUpdate({
      target: [assignmentSubmissions.assignmentId, assignmentSubmissions.studentId],
      set: {
        status: values.status,
        isLate: values.isLate,
        score: values.score,
        maxScore: values.maxScore,
        rejectionComment: values.rejectionComment,
        submittedAt: values.submittedAt,
        updatedAt: values.updatedAt,
      },
    })
    .returning();

  return result;
}
