import { eq, sql } from 'drizzle-orm';
import { db } from '../config/database.js';
import { chapters, pages, coachingAttempts, studentNotes } from '../db/schema.js';
import { getClassroomMembers } from './classroom.service.js';
import type { ClassroomDashboard, DashboardStudent } from '@mathchois/shared';

export async function getClassroomDashboard(classroomId: string): Promise<ClassroomDashboard> {
  const chapterRows = await db
    .select({
      id: chapters.id,
      title: chapters.title,
      totalPages: sql<number>`cast(count(${pages.id}) as int)`,
    })
    .from(chapters)
    .leftJoin(pages, eq(pages.chapterId, chapters.id))
    .where(eq(chapters.classroomId, classroomId))
    .groupBy(chapters.id, chapters.title, chapters.position)
    .orderBy(chapters.position);

  const coachRows = await db
    .select({
      studentId: coachingAttempts.studentId,
      chapterId: chapters.id,
      attempts: sql<number>`cast(count(*) as int)`,
      correct: sql<number>`cast(count(*) filter (where ${coachingAttempts.isCorrect} is true) as int)`,
    })
    .from(coachingAttempts)
    .innerJoin(pages, eq(coachingAttempts.pageId, pages.id))
    .innerJoin(chapters, eq(pages.chapterId, chapters.id))
    .where(eq(chapters.classroomId, classroomId))
    .groupBy(coachingAttempts.studentId, chapters.id);

  const noteRows = await db
    .select({
      studentId: studentNotes.studentId,
      chapterId: chapters.id,
      notedPages: sql<number>`cast(count(distinct ${studentNotes.pageId}) as int)`,
    })
    .from(studentNotes)
    .innerJoin(pages, eq(studentNotes.pageId, pages.id))
    .innerJoin(chapters, eq(pages.chapterId, chapters.id))
    .where(eq(chapters.classroomId, classroomId))
    .groupBy(studentNotes.studentId, chapters.id);

  const members = await getClassroomMembers(classroomId);

  const studentMap = new Map<string, DashboardStudent>();
  for (const m of members) {
    studentMap.set(m.studentId, {
      studentId: m.studentId,
      name: m.student?.name ?? null,
      overall: { attempts: 0, correct: 0 },
      cells: {},
    });
  }
  const cell = (s: DashboardStudent, chapterId: string) => {
    if (!s.cells[chapterId]) s.cells[chapterId] = { attempts: 0, correct: 0, notedPages: 0 };
    return s.cells[chapterId];
  };

  for (const r of coachRows) {
    const s = studentMap.get(r.studentId);
    if (!s) continue;
    const c = cell(s, r.chapterId);
    c.attempts += r.attempts;
    c.correct += r.correct;
    s.overall.attempts += r.attempts;
    s.overall.correct += r.correct;
  }
  for (const r of noteRows) {
    const s = studentMap.get(r.studentId);
    if (!s) continue;
    cell(s, r.chapterId).notedPages += r.notedPages;
  }

  const students = Array.from(studentMap.values());
  const totalAttempts = students.reduce((a, s) => a + s.overall.attempts, 0);
  const totalCorrect = students.reduce((a, s) => a + s.overall.correct, 0);
  const activeStudents = students.filter((s) => s.overall.attempts > 0).length;

  return {
    chapters: chapterRows,
    students,
    summary: {
      avgAccuracy: totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0,
      totalAttempts,
      activeStudents,
      chapterCount: chapterRows.length,
    },
  };
}
