import { eq, and, asc, sql, inArray } from 'drizzle-orm';
import type { Unit, UnitWithCounts } from '@mathchois/shared';
import { db } from '../config/database.js';
import { units, chapters, classroomVideos } from '../db/schema.js';

const unitColumns = {
  id: units.id,
  classroomId: units.classroomId,
  title: units.title,
  description: units.description,
  position: units.position,
  isHidden: units.isHidden,
  createdAt: units.createdAt,
};

/** DB 행(Date) → 공유 타입(ISO 문자열) */
function toUnit<T extends { createdAt: Date }>(row: T): Omit<T, 'createdAt'> & { createdAt: string } {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

/** 학급의 단원 목록(position 순) + 챕터/영상 개수. 학생은 includeHidden=false. */
export async function listUnits(classroomId: string, opts: { includeHidden: boolean }): Promise<UnitWithCounts[]> {
  const conds = [eq(units.classroomId, classroomId)];
  if (!opts.includeHidden) conds.push(eq(units.isHidden, false));
  const rows = await db.select({
    ...unitColumns,
    chapterCount: sql<number>`(SELECT count(*)::int FROM chapters c WHERE c.unit_id = ${units.id})`,
    videoCount: sql<number>`(SELECT count(*)::int FROM classroom_videos cv WHERE cv.unit_id = ${units.id})`,
  })
    .from(units)
    .where(and(...conds))
    .orderBy(asc(units.position), asc(units.createdAt));
  return rows.map(toUnit);
}

export async function getUnitById(id: string): Promise<Unit | null> {
  const [row] = await db.select(unitColumns).from(units).where(eq(units.id, id)).limit(1);
  return row ? toUnit(row) : null;
}

/** 새 단원은 맨 뒤(max(position)+1)에 들어간다. */
export async function createUnit(
  classroomId: string,
  data: { title: string; description: string | null; isHidden: boolean },
): Promise<Unit> {
  const [row] = await db.insert(units).values({
    classroomId,
    title: data.title,
    description: data.description,
    isHidden: data.isHidden,
    position: sql`(SELECT COALESCE(MAX(u.position), -1) + 1 FROM units u WHERE u.classroom_id = ${classroomId})`,
  }).returning(unitColumns);
  return toUnit(row);
}

export async function updateUnit(
  id: string,
  patch: { title?: string; description?: string | null; isHidden?: boolean },
): Promise<Unit | null> {
  const set: { title?: string; description?: string | null; isHidden?: boolean } = {};
  if (patch.title !== undefined) set.title = patch.title;
  if (patch.description !== undefined) set.description = patch.description;
  if (patch.isHidden !== undefined) set.isHidden = patch.isHidden;
  if (Object.keys(set).length === 0) return getUnitById(id);
  const [row] = await db.update(units).set(set).where(eq(units.id, id)).returning(unitColumns);
  return row ? toUnit(row) : null;
}

/** 항목(챕터·영상)은 FK ON DELETE SET NULL 로 미분류가 된다. */
export async function deleteUnit(id: string): Promise<void> {
  await db.delete(units).where(eq(units.id, id));
}

/** ids 가 학급 단원 전체 집합과 정확히 같을 때만 position = index 로 저장한다. */
export async function reorderUnits(classroomId: string, ids: string[]): Promise<boolean> {
  return db.transaction(async (tx) => {
    const existing = await tx.select({ id: units.id }).from(units).where(eq(units.classroomId, classroomId));
    const existingIds = new Set(existing.map((u) => u.id));
    if (ids.length !== existingIds.size || new Set(ids).size !== ids.length || !ids.every((id) => existingIds.has(id))) {
      return false;
    }
    for (let i = 0; i < ids.length; i++) {
      await tx.update(units).set({ position: i }).where(and(eq(units.id, ids[i]), eq(units.classroomId, classroomId)));
    }
    return true;
  });
}

export async function isUnitInClassroom(unitId: string, classroomId: string): Promise<boolean> {
  const [row] = await db.select({ id: units.id }).from(units)
    .where(and(eq(units.id, unitId), eq(units.classroomId, classroomId))).limit(1);
  return !!row;
}

class ForeignItemError extends Error {}

/**
 * 챕터·학급영상을 단원에 한 트랜잭션으로 넣는다. 하나라도 이 학급의 항목이 아니면(또는 없으면)
 * 아무것도 바꾸지 않고 false.
 */
export async function assignItemsToUnit(
  unitId: string,
  classroomId: string,
  items: { chapterIds: string[]; classroomVideoIds: string[] },
): Promise<boolean> {
  const chapterIds = [...new Set(items.chapterIds)];
  const videoIds = [...new Set(items.classroomVideoIds)];
  try {
    await db.transaction(async (tx) => {
      if (chapterIds.length > 0) {
        const moved = await tx.update(chapters).set({ unitId })
          .where(and(eq(chapters.classroomId, classroomId), inArray(chapters.id, chapterIds)))
          .returning({ id: chapters.id });
        if (moved.length !== chapterIds.length) throw new ForeignItemError();
      }
      if (videoIds.length > 0) {
        const moved = await tx.update(classroomVideos).set({ unitId })
          .where(and(eq(classroomVideos.classroomId, classroomId), inArray(classroomVideos.id, videoIds)))
          .returning({ id: classroomVideos.id });
        if (moved.length !== videoIds.length) throw new ForeignItemError();
      }
    });
    return true;
  } catch (err) {
    if (err instanceof ForeignItemError) return false;
    throw err;
  }
}
