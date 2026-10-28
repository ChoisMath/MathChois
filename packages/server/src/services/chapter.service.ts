import { eq, and, sql, inArray, or, isNull, getTableColumns } from 'drizzle-orm';
import { hasSameChapterTitle } from '@mathchois/shared';
import { db } from '../config/database.js';
import { chapters, pages, units } from '../db/schema.js';

// ─── Source Reference 헬퍼 ──────────────────────────

/** 원본 chapterId 추적 (linked 챕터면 source 반환, 아니면 자기 자신) */
export async function resolveSourceChapterId(chapterId: string): Promise<string> {
  const ch = await getChapterById(chapterId);
  if (!ch) return chapterId;
  return ch.sourceChapterId ?? chapterId;
}

/** 이 챕터를 source로 참조하는 linked 챕터 ID 목록 */
export async function getLinkedChapterIds(sourceChapterId: string): Promise<string[]> {
  const rows = await db
    .select({ id: chapters.id })
    .from(chapters)
    .where(eq(chapters.sourceChapterId, sourceChapterId));
  return rows.map((r) => r.id);
}

/** linked 챕터 여부 (sourceChapterId가 null이 아닌지) */
export async function isLinkedChapter(chapterId: string): Promise<boolean> {
  const ch = await getChapterById(chapterId);
  return ch?.sourceChapterId != null;
}

// ─── 기존 함수 ──────────────────────────────────────

/**
 * 교실의 챕터 목록 (페이지 포함) — linked 챕터는 source 챕터의 페이지 사용.
 * studentView 면 숨김 단원에 속한 챕터는 뺀다(미분류는 항상 포함).
 */
export async function getChaptersByClassroom(classroomId: string, opts: { studentView?: boolean } = {}) {
  const base = db.select(getTableColumns(chapters)).from(chapters);
  const chapRows = await (opts.studentView
    ? base
        .leftJoin(units, eq(chapters.unitId, units.id))
        .where(and(eq(chapters.classroomId, classroomId), or(isNull(chapters.unitId), eq(units.isHidden, false))))
    : base.where(eq(chapters.classroomId, classroomId))
  ).orderBy(chapters.position);

  // effectiveId = sourceChapterId ?? id (linked 챕터는 source의 페이지를 사용)
  const effectiveIds = [...new Set(chapRows.map((c) => c.sourceChapterId ?? c.id))];
  const allPages = effectiveIds.length > 0
    ? await db
        .select({ id: pages.id, chapterId: pages.chapterId, position: pages.position, imageUrl: pages.imageUrl })
        .from(pages)
        .where(inArray(pages.chapterId, effectiveIds))
        .orderBy(pages.position)
    : [];

  const pagesByChapter = new Map<string, typeof allPages>();
  for (const p of allPages) {
    if (!pagesByChapter.has(p.chapterId)) pagesByChapter.set(p.chapterId, []);
    pagesByChapter.get(p.chapterId)!.push(p);
  }

  return chapRows.map((ch) => ({
    ...ch,
    pages: pagesByChapter.get(ch.sourceChapterId ?? ch.id) ?? [],
  }));
}

/** 단일 챕터 조회 */
export async function getChapterById(id: string) {
  const rows = await db
    .select()
    .from(chapters)
    .where(eq(chapters.id, id))
    .limit(1);
  return rows[0] ?? null;
}

type NewChapter = {
  classroomId: string;
  title: string;
  description?: string | null;
  position?: number;
  sourceChapterId?: string | null;
  unitId?: string | null;
};
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function insertChapter(tx: Tx, data: NewChapter) {
  // position 미지정 시 새 챕터를 맨 앞(0)에 넣고 기존 챕터는 한 칸씩 뒤로 민다.
  // → "교사 지정순"에서도 새로 등록한 항목이 가장 위에 보인다.
  let position = data.position;
  if (position === undefined) {
    await tx
      .update(chapters)
      .set({ position: sql`${chapters.position} + 1` })
      .where(eq(chapters.classroomId, data.classroomId));
    position = 0;
  }

  const [created] = await tx
    .insert(chapters)
    .values({
      classroomId: data.classroomId,
      title: data.title,
      description: data.description ?? null,
      position,
      sourceChapterId: data.sourceChapterId ?? null,
      unitId: data.unitId ?? null,
    })
    .returning();
  return created;
}

/** 챕터 생성 */
export async function createChapter(data: NewChapter) {
  return db.transaction((tx) => insertChapter(tx, data));
}

/**
 * 같은 이름(chapterTitleKey 기준)의 챕터가 학급에 없을 때만 만든다 — 다른 학급에서 복사해 올 때.
 * 같은 학급으로의 동시 요청은 advisory lock 으로 줄 세워 둘 다 들어가지 않게 한다.
 * 이미 있으면 null.
 */
export async function createChapterUnlessTitleTaken(data: NewChapter) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`chapter-title:${data.classroomId}`}))`);
    const existing = await tx
      .select({ title: chapters.title })
      .from(chapters)
      .where(eq(chapters.classroomId, data.classroomId));
    if (hasSameChapterTitle(existing, data.title)) return null;
    return insertChapter(tx, data);
  });
}

/** 챕터 수정 */
export async function updateChapter(id: string, data: {
  title?: string;
  description?: string | null;
  unitId?: string | null;
}) {
  // 반영할 키가 하나도 없으면 UPDATE 없이 현재 값을 돌려준다(drizzle 은 빈 set 을 거부).
  if (Object.keys(data).length === 0) return getChapterById(id);
  const [updated] = await db
    .update(chapters)
    .set(data)
    .where(eq(chapters.id, id))
    .returning();
  return updated ?? null;
}

/** 챕터 삭제 (CASCADE로 pages도 삭제됨) */
export async function deleteChapter(id: string) {
  await db.delete(chapters).where(eq(chapters.id, id));
}

/** 챕터 순서 일괄 업데이트 */
export async function reorderChapters(items: { id: string; position: number }[]) {
  await Promise.all(
    items.map(({ id, position }) =>
      db.update(chapters).set({ position }).where(eq(chapters.id, id)),
    ),
  );
}

/** 교실의 최대 챕터 position */
export async function getMaxChapterPosition(classroomId: string): Promise<number> {
  const rows = await db
    .select({ maxPos: sql<number>`COALESCE(MAX(${chapters.position}), -1)` })
    .from(chapters)
    .where(eq(chapters.classroomId, classroomId));
  return rows[0]?.maxPos ?? -1;
}

/** 챕터 소속 교실 확인 */
export async function getChapterClassroomId(chapterId: string): Promise<string | null> {
  const rows = await db
    .select({ classroomId: chapters.classroomId })
    .from(chapters)
    .where(eq(chapters.id, chapterId))
    .limit(1);
  return rows[0]?.classroomId ?? null;
}
