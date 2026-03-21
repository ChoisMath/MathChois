import { eq, and, inArray, ne, sql } from 'drizzle-orm';
import { db } from '../config/database.js';
import { pages } from '../db/schema.js';

/** 챕터의 페이지 목록 */
export async function getPagesByChapter(chapterId: string) {
  return db
    .select()
    .from(pages)
    .where(eq(pages.chapterId, chapterId))
    .orderBy(pages.position);
}

/** 단일 페이지 조회 */
export async function getPageById(id: string) {
  const rows = await db
    .select()
    .from(pages)
    .where(eq(pages.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/** 페이지 생성 */
export async function createPage(data: {
  chapterId: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  position?: number;
}) {
  let position = data.position;
  if (position === undefined) {
    const maxRows = await db
      .select({ maxPos: sql<number>`COALESCE(MAX(${pages.position}), -1)` })
      .from(pages)
      .where(eq(pages.chapterId, data.chapterId));
    position = (maxRows[0]?.maxPos ?? -1) + 1;
  }

  const [created] = await db
    .insert(pages)
    .values({
      chapterId: data.chapterId,
      imageUrl: data.imageUrl ?? null,
      videoUrl: data.videoUrl ?? null,
      position,
    })
    .returning();
  return created;
}

/** 페이지 일괄 생성 */
export async function createPages(items: {
  chapterId: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  position: number;
}[]) {
  if (items.length === 0) return [];
  return db
    .insert(pages)
    .values(items)
    .returning();
}

/** 페이지 삭제 */
export async function deletePage(id: string) {
  const rows = await db
    .select()
    .from(pages)
    .where(eq(pages.id, id))
    .limit(1);
  const page = rows[0] ?? null;

  if (page) {
    await db.delete(pages).where(eq(pages.id, id));
  }
  return page;
}

/** 페이지 순서 일괄 업데이트 */
export async function reorderPages(items: { id: string; position: number }[]) {
  await Promise.all(
    items.map(({ id, position }) =>
      db.update(pages).set({ position }).where(eq(pages.id, id)),
    ),
  );
}

/** 챕터의 페이지 이미지 URL 목록 (null 제외) */
export async function getPageImageUrls(chapterId: string): Promise<string[]> {
  const rows = await db
    .select({ imageUrl: pages.imageUrl })
    .from(pages)
    .where(eq(pages.chapterId, chapterId));
  return rows.map((r) => r.imageUrl).filter((url): url is string => url !== null);
}

/** 특정 URL이 다른 챕터에서도 사용되는지 확인 (orphan 체크) */
export async function findSharedImageUrls(
  urls: string[],
  excludeChapterId: string,
): Promise<string[]> {
  if (urls.length === 0) return [];
  const rows = await db
    .select({ imageUrl: pages.imageUrl })
    .from(pages)
    .where(
      and(
        inArray(pages.imageUrl, urls),
        ne(pages.chapterId, excludeChapterId),
      ),
    );
  return rows.map((r) => r.imageUrl).filter((url): url is string => url !== null);
}
