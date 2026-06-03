import { eq, and, inArray, ne, sql } from 'drizzle-orm';
import { db } from '../config/database.js';
import { pages } from '../db/schema.js';
import { resolveSourceChapterId, isLinkedChapter } from './chapter.service.js';
import { getVisualizationById } from './visualization.service.js';
import { copyHtmlToChapterTools } from './storage.service.js';

/** 챕터의 페이지 목록 (원본 함수 — chapterId 그대로 사용) */
export async function getPagesByChapter(chapterId: string) {
  return db
    .select()
    .from(pages)
    .where(eq(pages.chapterId, chapterId))
    .orderBy(pages.position);
}

/** 챕터의 페이지 목록 (resolve 포함 — linked 챕터는 source의 페이지 반환) */
export async function getResolvedPagesByChapter(chapterId: string) {
  const resolved = await resolveSourceChapterId(chapterId);
  return getPagesByChapter(resolved);
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
  htmlUrl?: string | null;
  aiProblemId?: string | null;
  fromVisualizationId?: string | null;
  position?: number;
}) {
  let htmlUrl = data.htmlUrl ?? null;

  // 시각화자료에서 삽입: 원본 HTML을 페이지 전용 복사본으로 복제(독립)
  if (data.fromVisualizationId) {
    const vis = await getVisualizationById(data.fromVisualizationId);
    if (!vis) {
      throw Object.assign(new Error('시각화자료를 찾을 수 없습니다'), { statusCode: 404 });
    }
    htmlUrl = await copyHtmlToChapterTools(vis.htmlUrl, data.chapterId);
  }

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
      htmlUrl: htmlUrl ?? null,
      aiProblemId: data.aiProblemId ?? null,
      position,
    })
    .returning();
  return created;
}

/** 페이지 부분 수정 (현재는 aiProblemId 변경용) */
export async function updatePage(id: string, patch: { aiProblemId?: string | null }) {
  const [row] = await db.update(pages).set(patch).where(eq(pages.id, id)).returning();
  return row ?? null;
}

/** 페이지 일괄 생성 */
export async function createPages(items: {
  chapterId: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  htmlUrl?: string | null;
  position: number;
}[]) {
  if (items.length === 0) return [];
  return db
    .insert(pages)
    .values(items.map((it) => ({
      chapterId: it.chapterId,
      imageUrl: it.imageUrl ?? null,
      videoUrl: it.videoUrl ?? null,
      htmlUrl: it.htmlUrl ?? null,
      position: it.position,
    })))
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

/** 챕터의 페이지 이미지 URL 목록 (null 제외, linked 챕터는 빈 배열) */
export async function getPageImageUrls(chapterId: string): Promise<string[]> {
  // linked 챕터는 자체 페이지가 없으므로 이미지 정리 불필요
  if (await isLinkedChapter(chapterId)) return [];
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
