import { eq, and, inArray } from 'drizzle-orm';
import { db } from '../config/database.js';
import {
  studentNotes, teacherNotes, teacherStudentComments,
  assignmentNotes, assignmentTeacherComments,
  classroomMembers, profiles,
} from '../db/schema.js';
import type { ExcalidrawData } from '@mathchois/shared';

// ─── Student Notes ──────────────────────────────

/** 학생 필기 조회 (단일 페이지) */
export async function getStudentNote(studentId: string, pageId: string) {
  const rows = await db
    .select()
    .from(studentNotes)
    .where(and(eq(studentNotes.studentId, studentId), eq(studentNotes.pageId, pageId)))
    .limit(1);
  return rows[0] ?? null;
}

/** 학생 필기 upsert */
export async function upsertStudentNote(studentId: string, pageId: string, excalidrawData: ExcalidrawData) {
  const now = new Date();
  const [result] = await db
    .insert(studentNotes)
    .values({ studentId, pageId, excalidrawData, updatedAt: now })
    .onConflictDoUpdate({
      target: [studentNotes.studentId, studentNotes.pageId],
      set: { excalidrawData, updatedAt: now },
    })
    .returning();
  return result;
}

/** 학생 필기 일괄 조회 (복수 페이지) */
export async function getStudentNotesBulk(studentId: string, pageIds: string[]) {
  if (pageIds.length === 0) return [];
  return db
    .select()
    .from(studentNotes)
    .where(and(eq(studentNotes.studentId, studentId), inArray(studentNotes.pageId, pageIds)));
}

/** 챕터 학생 진도 요약 (ChapterMonitor용) */
export async function getChapterStudentSummary(classroomId: string, pageIds: string[]) {
  if (pageIds.length === 0) return { members: [], notes: [] };

  // 교실 멤버 (프로필 포함)
  const members = await db
    .select({
      studentId: classroomMembers.studentId,
      name: profiles.name,
      avatarUrl: profiles.avatarUrl,
    })
    .from(classroomMembers)
    .innerJoin(profiles, eq(classroomMembers.studentId, profiles.id))
    .where(eq(classroomMembers.classroomId, classroomId));

  // 해당 페이지들의 학생 필기 존재 여부
  const notes = await db
    .select({
      studentId: studentNotes.studentId,
      pageId: studentNotes.pageId,
      updatedAt: studentNotes.updatedAt,
    })
    .from(studentNotes)
    .where(inArray(studentNotes.pageId, pageIds));

  return { members, notes };
}

// ─── Teacher Notes ──────────────────────────────

/** 교사 필기 조회 */
export async function getTeacherNote(teacherId: string, pageId: string) {
  const rows = await db
    .select()
    .from(teacherNotes)
    .where(and(eq(teacherNotes.teacherId, teacherId), eq(teacherNotes.pageId, pageId)))
    .limit(1);
  return rows[0] ?? null;
}

/** 교사 필기 upsert */
export async function upsertTeacherNote(teacherId: string, pageId: string, excalidrawData: ExcalidrawData) {
  const now = new Date();
  const [result] = await db
    .insert(teacherNotes)
    .values({ teacherId, pageId, excalidrawData, updatedAt: now })
    .onConflictDoUpdate({
      target: [teacherNotes.teacherId, teacherNotes.pageId],
      set: { excalidrawData, updatedAt: now },
    })
    .returning();
  return result;
}

/** 페이지의 모든 교사 필기 조회 (학생용 — teacherId 필터 없이) */
export async function getTeacherNotesForPage(pageId: string) {
  return db
    .select()
    .from(teacherNotes)
    .where(eq(teacherNotes.pageId, pageId));
}

/** 교사 필기 일괄 조회 (복수 페이지) */
export async function getTeacherNotesBulk(teacherId: string, pageIds: string[]) {
  if (pageIds.length === 0) return [];
  return db
    .select()
    .from(teacherNotes)
    .where(and(eq(teacherNotes.teacherId, teacherId), inArray(teacherNotes.pageId, pageIds)));
}

/** 특정 학생 필기 일괄 조회 (교사용 — studentId를 파라미터로 받음) */
export async function getStudentNotesBulkByTeacher(studentId: string, pageIds: string[]) {
  if (pageIds.length === 0) return [];
  return db
    .select()
    .from(studentNotes)
    .where(and(eq(studentNotes.studentId, studentId), inArray(studentNotes.pageId, pageIds)));
}

/** 교사→학생 코멘트 일괄 조회 (특정 학생, 복수 페이지) */
export async function getTeacherCommentsBulk(studentId: string, pageIds: string[]) {
  if (pageIds.length === 0) return [];
  return db
    .select()
    .from(teacherStudentComments)
    .where(and(
      eq(teacherStudentComments.studentId, studentId),
      inArray(teacherStudentComments.pageId, pageIds),
    ));
}

// ─── Teacher-Student Comments ───────────────────

/** 교사→학생 코멘트 조회 */
export async function getTeacherStudentComment(teacherId: string, studentId: string, pageId: string) {
  // teacherId를 모를 수 있으므로 pageId + studentId로만 조회
  const rows = await db
    .select()
    .from(teacherStudentComments)
    .where(and(
      eq(teacherStudentComments.pageId, pageId),
      eq(teacherStudentComments.studentId, studentId),
    ))
    .limit(1);
  return rows[0] ?? null;
}

/** 학생이 자기 코멘트 조회 (teacherId 없이, pageId + studentId로 조회) */
export async function getCommentsForStudent(studentId: string, pageId: string) {
  const rows = await db
    .select()
    .from(teacherStudentComments)
    .where(and(
      eq(teacherStudentComments.pageId, pageId),
      eq(teacherStudentComments.studentId, studentId),
    ));
  return rows;
}

/** 교사→학생 코멘트 upsert */
export async function upsertTeacherStudentComment(
  teacherId: string, studentId: string, pageId: string, excalidrawData: ExcalidrawData,
) {
  const now = new Date();
  const [result] = await db
    .insert(teacherStudentComments)
    .values({ teacherId, studentId, pageId, excalidrawData, updatedAt: now })
    .onConflictDoUpdate({
      target: [teacherStudentComments.teacherId, teacherStudentComments.studentId, teacherStudentComments.pageId],
      set: { excalidrawData, updatedAt: now },
    })
    .returning();
  return result;
}

// ─── Assignment Notes ───────────────────────────

/** 과제 학생 필기 조회 */
export async function getAssignmentNote(assignmentId: string, pageId: string, studentId: string) {
  const rows = await db
    .select()
    .from(assignmentNotes)
    .where(and(
      eq(assignmentNotes.assignmentId, assignmentId),
      eq(assignmentNotes.pageId, pageId),
      eq(assignmentNotes.studentId, studentId),
    ))
    .limit(1);
  return rows[0] ?? null;
}

/** 과제 학생 필기 일괄 조회 (복수 페이지) */
export async function getAssignmentNotesBulk(assignmentId: string, studentId: string, pageIds: string[]) {
  if (pageIds.length === 0) return [];
  return db
    .select()
    .from(assignmentNotes)
    .where(and(
      eq(assignmentNotes.assignmentId, assignmentId),
      eq(assignmentNotes.studentId, studentId),
      inArray(assignmentNotes.pageId, pageIds),
    ));
}

/** 과제 학생 필기 upsert */
export async function upsertAssignmentNote(
  assignmentId: string, pageId: string, studentId: string, excalidrawData: ExcalidrawData,
) {
  const now = new Date();
  const [result] = await db
    .insert(assignmentNotes)
    .values({ assignmentId, pageId, studentId, excalidrawData, updatedAt: now })
    .onConflictDoUpdate({
      target: [assignmentNotes.assignmentId, assignmentNotes.pageId, assignmentNotes.studentId],
      set: { excalidrawData, updatedAt: now },
    })
    .returning();
  return result;
}

// ─── Assignment Teacher Comments ────────────────

/** 과제 교사 코멘트 조회 */
export async function getAssignmentTeacherComment(pageId: string, studentId: string) {
  const rows = await db
    .select()
    .from(assignmentTeacherComments)
    .where(and(
      eq(assignmentTeacherComments.pageId, pageId),
      eq(assignmentTeacherComments.studentId, studentId),
    ))
    .limit(1);
  return rows[0] ?? null;
}

/** 과제 교사 코멘트 upsert */
export async function upsertAssignmentTeacherComment(
  teacherId: string, studentId: string, pageId: string, excalidrawData: ExcalidrawData,
) {
  const now = new Date();
  const [result] = await db
    .insert(assignmentTeacherComments)
    .values({ teacherId, studentId, pageId, excalidrawData, updatedAt: now })
    .onConflictDoUpdate({
      target: [assignmentTeacherComments.teacherId, assignmentTeacherComments.studentId, assignmentTeacherComments.pageId],
      set: { excalidrawData, updatedAt: now },
    })
    .returning();
  return result;
}
