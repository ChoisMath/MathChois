import { eq, and, or, ilike, desc, sql, type SQL } from 'drizzle-orm';
import { db } from '../config/database.js';
import { problems } from '../db/schema.js';

export type ProblemInsert = typeof problems.$inferInsert;

export interface ProblemFilters {
  subject?: string; majorUnit?: string; minorUnit?: string;
  difficulty?: string; problemType?: string; q?: string;
  page?: number; pageSize?: number;
}

export async function createProblem(values: ProblemInsert) {
  const [row] = await db.insert(problems).values(values).returning();
  return row;
}

export async function getProblem(id: string) {
  const rows = await db.select().from(problems).where(eq(problems.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function updateProblem(id: string, patch: Partial<ProblemInsert>) {
  const [row] = await db.update(problems)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(problems.id, id)).returning();
  return row ?? null;
}

export async function deleteProblem(id: string) {
  const [row] = await db.delete(problems).where(eq(problems.id, id)).returning();
  return row ?? null;
}

function buildWhere(f: ProblemFilters): SQL | undefined {
  const conds: SQL[] = [];
  if (f.subject)     conds.push(eq(problems.subject, f.subject));
  if (f.majorUnit)   conds.push(eq(problems.majorUnit, f.majorUnit));
  if (f.minorUnit)   conds.push(eq(problems.minorUnit, f.minorUnit));
  if (f.difficulty)  conds.push(eq(problems.difficulty, f.difficulty));
  if (f.problemType) conds.push(eq(problems.problemType, f.problemType));
  if (f.q) {
    const kw = `%${f.q}%`;
    const search = or(
      ilike(problems.title, kw),
      ilike(problems.problemLatex, kw),
      ilike(problems.majorUnit, kw),
      ilike(problems.minorUnit, kw),
      sql`${problems.keywords}::text ilike ${kw}`,
    );
    if (search) conds.push(search);
  }
  return conds.length ? and(...conds) : undefined;
}

export async function listProblems(f: ProblemFilters) {
  const page = Math.max(1, Number.isFinite(f.page) ? Number(f.page) : 1);
  const pageSize = Math.min(100, Math.max(1, Number.isFinite(f.pageSize) ? Number(f.pageSize) : 20));
  const where = buildWhere(f);

  const items = await db.select().from(problems)
    .where(where)
    .orderBy(desc(problems.createdAt))
    .limit(pageSize).offset((page - 1) * pageSize);

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
    .from(problems).where(where);

  return { items, total: count, page, pageSize };
}

export async function getFacets() {
  const toSortedStrings = (rows: { v: string | null }[]) =>
    rows.map((r) => r.v).filter((v): v is string => !!v).sort();

  const [subjects, majorUnits, minorUnits, difficulties, problemTypes] = await Promise.all([
    db.selectDistinct({ v: problems.subject }).from(problems).then(toSortedStrings),
    db.selectDistinct({ v: problems.majorUnit }).from(problems).then(toSortedStrings),
    db.selectDistinct({ v: problems.minorUnit }).from(problems).then(toSortedStrings),
    db.selectDistinct({ v: problems.difficulty }).from(problems).then(toSortedStrings),
    db.selectDistinct({ v: problems.problemType }).from(problems).then(toSortedStrings),
  ]);

  return {
    subject: subjects,
    majorUnit: majorUnits,
    minorUnit: minorUnits,
    difficulty: difficulties,
    problemType: problemTypes,
  };
}
