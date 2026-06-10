import { eq, and, desc, gte, gt, lt, sql, type SQL } from 'drizzle-orm';
import { db } from '../config/database.js';
import { coachingAttempts, coachingQuota, problems, pages, chapters, profiles } from '../db/schema.js';

export const COACHING_ATTEMPT_LIMIT = 3;

export type CoachingAttemptInsert = typeof coachingAttempts.$inferInsert;

export async function createAttempt(values: CoachingAttemptInsert) {
  const [row] = await db.insert(coachingAttempts).values(values).returning();
  return row;
}

/** (학생, 페이지)의 현재 사용 횟수. reset_at 이후 attempt만 카운트(행 없으면 전체). */
export async function getAttemptUsage(studentId: string, pageId: string) {
  const [q] = await db
    .select({ resetAt: coachingQuota.resetAt })
    .from(coachingQuota)
    .where(and(eq(coachingQuota.studentId, studentId), eq(coachingQuota.pageId, pageId)))
    .limit(1);
  const resetAt = q?.resetAt ?? null;
  const conds: SQL[] = [eq(coachingAttempts.pageId, pageId), eq(coachingAttempts.studentId, studentId)];
  if (resetAt) conds.push(gt(coachingAttempts.createdAt, resetAt));
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(coachingAttempts)
    .where(and(...conds));
  return { used: count, limit: COACHING_ATTEMPT_LIMIT, resetAt: resetAt ? resetAt.toISOString() : null };
}

/** 교사 리셋: reset_at 을 now() 로 upsert. attempt 는 보존(카운트 기준만 이동). */
export async function resetQuota(studentId: string, pageId: string) {
  await db
    .insert(coachingQuota)
    .values({ studentId, pageId })
    .onConflictDoUpdate({
      target: [coachingQuota.studentId, coachingQuota.pageId],
      set: { resetAt: sql`now()`, updatedAt: sql`now()` },
    });
}

/** 해당 페이지에 시도한 학생별 요약(used = reset_at 이후 카운트). 시도 0 학생은 제외. */
export async function listPageStudents(pageId: string) {
  const usedExpr = sql<number>`count(*) filter (where ${coachingQuota.resetAt} is null or ${coachingAttempts.createdAt} > ${coachingQuota.resetAt})::int`;
  const rows = await db
    .select({
      studentId: coachingAttempts.studentId,
      name: profiles.name,
      used: usedExpr,
      resetAt: coachingQuota.resetAt,
      lastAttemptAt: sql<string>`max(${coachingAttempts.createdAt})`,
    })
    .from(coachingAttempts)
    .innerJoin(profiles, eq(coachingAttempts.studentId, profiles.id))
    .leftJoin(
      coachingQuota,
      and(eq(coachingQuota.studentId, coachingAttempts.studentId), eq(coachingQuota.pageId, coachingAttempts.pageId)),
    )
    .where(eq(coachingAttempts.pageId, pageId))
    .groupBy(coachingAttempts.studentId, profiles.name, coachingQuota.resetAt)
    .orderBy(profiles.name);

  return rows.map((r) => ({
    studentId: r.studentId,
    name: r.name,
    used: r.used,
    limit: COACHING_ATTEMPT_LIMIT,
    resetAt: r.resetAt ? new Date(r.resetAt).toISOString() : null,
    lastAttemptAt: r.lastAttemptAt,
  }));
}

export async function listAttempts(pageId: string, studentId: string) {
  return db
    .select()
    .from(coachingAttempts)
    .where(and(eq(coachingAttempts.pageId, pageId), eq(coachingAttempts.studentId, studentId)))
    .orderBy(desc(coachingAttempts.createdAt));
}

export interface HistoryQuery { from?: string; to?: string; page?: number; pageSize?: number; }

// problem 표시필드만 select (answer/solution 제외) — 보안 불변식
const VIEW_COLUMNS = {
  id: coachingAttempts.id,
  pageId: coachingAttempts.pageId,
  problemId: coachingAttempts.problemId,
  studentId: coachingAttempts.studentId,
  workImageUrl: coachingAttempts.workImageUrl,
  solutionLatex: coachingAttempts.solutionLatex,
  isCorrect: coachingAttempts.isCorrect,
  errorTags: coachingAttempts.errorTags,
  conceptTags: coachingAttempts.conceptTags,
  strengthNotes: coachingAttempts.strengthNotes,
  weaknessNotes: coachingAttempts.weaknessNotes,
  commentMarkdown: coachingAttempts.commentMarkdown,
  coachingSvg: coachingAttempts.coachingSvg,
  aiModel: coachingAttempts.aiModel,
  createdAt: coachingAttempts.createdAt,
  problemTitle: problems.title,
  subject: problems.subject,
  majorUnit: problems.majorUnit,
  difficulty: problems.difficulty,
  problemLatex: problems.problemLatex,
  figures: problems.figures,
  figureNotes: problems.figureNotes,
  chapterTitle: chapters.title,
};

function dateConds(from?: string, to?: string): SQL[] {
  const conds: SQL[] = [];
  if (from && !Number.isNaN(Date.parse(from))) {
    conds.push(gte(coachingAttempts.createdAt, new Date(from)));
  }
  if (to && !Number.isNaN(Date.parse(to))) {
    const end = new Date(to);
    end.setDate(end.getDate() + 1); // 종료일 포함
    conds.push(lt(coachingAttempts.createdAt, end));
  }
  return conds;
}

async function runHistory(where: SQL, q: HistoryQuery) {
  const page = Math.max(1, Number.isFinite(q.page) ? Number(q.page) : 1);
  const pageSize = Math.min(100, Math.max(1, Number.isFinite(q.pageSize) ? Number(q.pageSize) : 20));

  const items = await db
    .select(VIEW_COLUMNS)
    .from(coachingAttempts)
    .leftJoin(problems, eq(coachingAttempts.problemId, problems.id))
    .leftJoin(pages, eq(coachingAttempts.pageId, pages.id))
    .leftJoin(chapters, eq(pages.chapterId, chapters.id))
    .where(where)
    .orderBy(desc(coachingAttempts.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(coachingAttempts)
    .leftJoin(pages, eq(coachingAttempts.pageId, pages.id))
    .leftJoin(chapters, eq(pages.chapterId, chapters.id))
    .where(where);

  return { items, total: count, page, pageSize };
}

/** 학생 본인 전체 기록 */
export async function listStudentHistory(studentId: string, q: HistoryQuery) {
  const dateCond = dateConds(q.from, q.to);
  const where = (dateCond.length > 0
    ? and(eq(coachingAttempts.studentId, studentId), ...dateCond)
    : eq(coachingAttempts.studentId, studentId)) as SQL;
  return runHistory(where, q);
}

/** 교사용: 특정 클래스의 챕터 범위로 한정 */
export async function listClassroomStudentHistory(classroomId: string, studentId: string, q: HistoryQuery) {
  const dateCond = dateConds(q.from, q.to);
  const where = (dateCond.length > 0
    ? and(
        eq(coachingAttempts.studentId, studentId),
        eq(chapters.classroomId, classroomId),
        ...dateCond,
      )
    : and(
        eq(coachingAttempts.studentId, studentId),
        eq(chapters.classroomId, classroomId),
      )) as SQL;
  return runHistory(where, q);
}
