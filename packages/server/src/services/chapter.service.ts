import { eq, desc, and, sql, inArray } from 'drizzle-orm';
import { db } from '../config/database.js';
import { chapters, pages } from '../db/schema.js';

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

/** 교실의 챕터 목록 (페이지 수 포함) — linked 챕터는 source 챕터의 페이지 사용 */
export async function getChaptersByClassroom(classroomId: string) {
  const chapRows = await db
    .select()
    .from(chapters)
    .where(eq(chapters.classroomId, classroomId))
    .orderBy(chapters.position);

  // effectiveId = sourceChapterId ?? id (linked 챕터는 source의 페이지를 사용)
  const effectiveIds = [...new Set(chapRows.map((c) => c.sourceChapterId ?? c.id))];
  const allPages = effectiveIds.length > 0
    ? await db
        .select({ id: pages.id, chapterId: pages.chapterId, position: pages.position })
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

/** 챕터 생성 */
export async function createChapter(data: {
  classroomId: string;
  title: string;
  description?: string | null;
  position?: number;
  sourceChapterId?: string | null;
}) {
  // position 자동 계산: 기존 최대값 + 1
  let position = data.position;
  if (position === undefined) {
    const maxRows = await db
      .select({ maxPos: sql<number>`COALESCE(MAX(${chapters.position}), -1)` })
      .from(chapters)
      .where(eq(chapters.classroomId, data.classroomId));
    position = (maxRows[0]?.maxPos ?? -1) + 1;
  }

  const [created] = await db
    .insert(chapters)
    .values({
      classroomId: data.classroomId,
      title: data.title,
      description: data.description ?? null,
      position,
      sourceChapterId: data.sourceChapterId ?? null,
    })
    .returning();
  return created;
}

/** 챕터 수정 */
export async function updateChapter(id: string, data: {
  title?: string;
  description?: string | null;
}) {
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
