import { eq, and, or, ilike, desc, sql, type SQL } from 'drizzle-orm';
import { db } from '../config/database.js';
import { visualizations } from '../db/schema.js';
import { removeFile, urlToStoragePath } from './storage.service.js';

export type VisualizationInsert = typeof visualizations.$inferInsert;

export interface ListFilters {
  q?: string;
  subject?: string;
  majorUnit?: string;
  minorUnit?: string;
  createdBy?: string;
  page?: number;
  pageSize?: number;
}

export async function createVisualization(values: VisualizationInsert) {
  const [row] = await db.insert(visualizations).values(values).returning();
  return row;
}

export async function getVisualizationById(id: string) {
  const rows = await db.select().from(visualizations).where(eq(visualizations.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function updateVisualization(id: string, patch: Partial<VisualizationInsert>) {
  const [row] = await db.update(visualizations)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(visualizations.id, id)).returning();
  return row ?? null;
}

export async function removeVisualization(id: string) {
  const row = await getVisualizationById(id);
  if (!row) return null;
  await db.delete(visualizations).where(eq(visualizations.id, id));
  const parsed = urlToStoragePath(row.htmlUrl);
  if (parsed) await removeFile(parsed.bucket, parsed.path);
  return row;
}

function buildWhere(f: ListFilters): SQL | undefined {
  const conds: SQL[] = [];
  if (f.createdBy) conds.push(eq(visualizations.createdBy, f.createdBy));
  if (f.subject)   conds.push(eq(visualizations.subject, f.subject));
  if (f.majorUnit) conds.push(eq(visualizations.majorUnit, f.majorUnit));
  if (f.minorUnit) conds.push(eq(visualizations.minorUnit, f.minorUnit));
  if (f.q) {
    const kw = `%${f.q}%`;
    const search = or(
      ilike(visualizations.title, kw),
      ilike(visualizations.description, kw),
    );
    if (search) conds.push(search);
  }
  return conds.length ? and(...conds) : undefined;
}

export async function listVisualizations(f: ListFilters) {
  const page = Math.max(1, Number.isFinite(f.page) ? Number(f.page) : 1);
  const pageSize = Math.min(100, Math.max(1, Number.isFinite(f.pageSize) ? Number(f.pageSize) : 20));
  const where = buildWhere(f);

  const items = await db.select().from(visualizations)
    .where(where)
    .orderBy(desc(visualizations.createdAt))
    .limit(pageSize).offset((page - 1) * pageSize);

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
    .from(visualizations).where(where);

  return { items, total: count, page, pageSize };
}

export async function getFacets() {
  const toSortedStrings = (rows: { v: string | null }[]) =>
    rows.map((r) => r.v).filter((v): v is string => !!v).sort();

  const [subjects, majorUnits, minorUnits] = await Promise.all([
    db.selectDistinct({ v: visualizations.subject }).from(visualizations).then(toSortedStrings),
    db.selectDistinct({ v: visualizations.majorUnit }).from(visualizations).then(toSortedStrings),
    db.selectDistinct({ v: visualizations.minorUnit }).from(visualizations).then(toSortedStrings),
  ]);

  return { subject: subjects, majorUnit: majorUnits, minorUnit: minorUnits };
}
