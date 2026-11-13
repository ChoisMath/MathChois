import { eq, sql } from 'drizzle-orm';
import { db } from '../config/database.js';
import { chapters, pages, coachingAttempts, studentNotes, units, classroomVideos, videos, videoProgress } from '../db/schema.js';
import { getClassroomMembers } from './classroom.service.js';
import type { ClassroomDashboard, DashboardStudent } from '@mathchois/shared';

export async function getClassroomDashboard(classroomId: string): Promise<ClassroomDashboard> {
  const chapterRows = await db
    .select({
      id: chapters.id,
      title: chapters.title,
      totalPages: sql<number>`cast(count(${pages.id}) as int)`,
      unitId: chapters.unitId,
      position: chapters.position,
    })
    .from(chapters)
    .leftJoin(pages, eq(pages.chapterId, chapters.id))
    .where(eq(chapters.classroomId, classroomId))
    .groupBy(chapters.id, chapters.title, chapters.position, chapters.unitId)
    .orderBy(chapters.position);

  const unitRows = await db
    .select({ id: units.id, title: units.title, position: units.position })
    .from(units)
    .where(eq(units.classroomId, classroomId))
    .orderBy(units.position, units.createdAt);

  const videoRows = await db
    .select({
      id: classroomVideos.id,
      title: videos.title,
      unitId: classroomVideos.unitId,
      durationSec: videos.durationSec,
      position: classroomVideos.position,
    })
    .from(classroomVideos)
    .innerJoin(videos, eq(classroomVideos.videoId, videos.id))
    .where(eq(classroomVideos.classroomId, classroomId))
    .orderBy(classroomVideos.position);

  const progressRows = await db
    .select({
      studentId: videoProgress.studentId,
      classroomVideoId: videoProgress.classroomVideoId,
      maxPositionSec: videoProgress.maxPositionSec,
      completed: videoProgress.completed,
    })
    .from(videoProgress)
    .innerJoin(classroomVideos, eq(videoProgress.classroomVideoId, classroomVideos.id))
    .where(eq(classroomVideos.classroomId, classroomId));

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
      email: m.student?.email ?? null,
      avatarUrl: m.student?.avatarUrl ?? null,
      overall: { attempts: 0, correct: 0 },
      cells: {},
      videoCells: {},
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

  for (const r of progressRows) {
    const s = studentMap.get(r.studentId);
    if (!s) continue; // 탈퇴 학생 기록은 제외
    s.videoCells[r.classroomVideoId] = { maxPositionSec: r.maxPositionSec, completed: r.completed };
  }

  const students = Array.from(studentMap.values());
  const totalAttempts = students.reduce((a, s) => a + s.overall.attempts, 0);
  const totalCorrect = students.reduce((a, s) => a + s.overall.correct, 0);
  const activeStudents = students.filter((s) => s.overall.attempts > 0).length;

  return {
    units: unitRows,
    chapters: chapterRows,
    videos: videoRows,
    students,
    summary: {
      avgAccuracy: totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0,
      totalAttempts,
      activeStudents,
      chapterCount: chapterRows.length,
    },
  };
}
