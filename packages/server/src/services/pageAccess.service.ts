import { eq, or, inArray } from 'drizzle-orm';
import { db } from '../config/database.js';
import { chapters, pages, classrooms } from '../db/schema.js';
import { isClassroomMember } from './classroom.service.js';

/**
 * 페이지 ↔ 학급 접근 관계 (socket room 검증과 REST 가 공유).
 * 페이지는 원본 챕터에만 존재하고, 원본 챕터는 여러 학급에 "연결(linked)" 될 수 있다.
 */

/** page → source 챕터 + linked 챕터들 → 관련된 모든 classroomId */
export async function getPageRelatedClassroomIds(pageId: string): Promise<string[]> {
  const page = await db.select({ chapterId: pages.chapterId })
    .from(pages).where(eq(pages.id, pageId)).limit(1);
  if (!page[0]) return [];
  const sourceChapterId = page[0].chapterId;
  const allChapters = await db.select({ classroomId: chapters.classroomId })
    .from(chapters)
    .where(or(eq(chapters.id, sourceChapterId), eq(chapters.sourceChapterId, sourceChapterId)));
  return allChapters.map((c) => c.classroomId);
}

/** page → 관련된 모든 교실의 teacherId 배열 */
export async function getPageRelatedTeacherIds(pageId: string): Promise<string[]> {
  const classroomIds = await getPageRelatedClassroomIds(pageId);
  if (classroomIds.length === 0) return [];
  const rows = await db.select({ teacherId: classrooms.teacherId })
    .from(classrooms)
    .where(inArray(classrooms.id, classroomIds));
  return [...new Set(rows.map((r) => r.teacherId))];
}

/** 교사가 (페이지, 학급) 조합에 접근 가능한가: 학급 소유자 && 그 학급이 페이지와 관련 */
export async function canTeacherAccessPageClassroom(teacherId: string, pageId: string, classroomId: string): Promise<boolean> {
  const related = await getPageRelatedClassroomIds(pageId);
  if (!related.includes(classroomId)) return false;
  const cls = await db.select({ teacherId: classrooms.teacherId })
    .from(classrooms).where(eq(classrooms.id, classroomId)).limit(1);
  return cls[0]?.teacherId === teacherId;
}

/** 학생이 (페이지, 학급) 조합에 접근 가능한가: 학급 구성원 && 그 학급이 페이지와 관련 */
export async function canStudentAccessPageClassroom(studentId: string, pageId: string, classroomId: string): Promise<boolean> {
  const related = await getPageRelatedClassroomIds(pageId);
  if (!related.includes(classroomId)) return false;
  return isClassroomMember(classroomId, studentId);
}

/** 페이지가 속한 원본 챕터의 교실 소유자인가 (기본 템플릿 변경 권한) */
export async function isPageSourceOwnedBy(teacherId: string, pageId: string): Promise<boolean> {
  const rows = await db.select({ teacherId: classrooms.teacherId })
    .from(pages)
    .innerJoin(chapters, eq(pages.chapterId, chapters.id))
    .innerJoin(classrooms, eq(chapters.classroomId, classrooms.id))
    .where(eq(pages.id, pageId)).limit(1);
  return rows[0]?.teacherId === teacherId;
}
