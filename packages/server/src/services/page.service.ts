import { eq, and, or, inArray, ne, sql } from 'drizzle-orm';
import { db } from '../config/database.js';
import { collectFileUrls } from '../utils/fileUrls.js';
import { pages } from '../db/schema.js';
import { resolveSourceChapterId, isLinkedChapter } from './chapter.service.js';
import { getVisualizationById } from './visualization.service.js';
import { copyHtmlToChapterTools, removeFile, urlToStoragePath } from './storage.service.js';

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
  pageType?: 'whiteboard' | null;
  whiteboardTemplate?: string | null;
  pdfUrl?: string | null;
  pdfPage?: number | null;
  position?: number;
}) {
  let htmlUrl = data.htmlUrl ?? null;
  let copiedHtmlUrl: string | null = null;

  // 시각화자료에서 삽입: 원본 HTML을 페이지 전용 복사본으로 복제(독립)
  if (data.fromVisualizationId) {
    const vis = await getVisualizationById(data.fromVisualizationId);
    if (!vis) {
      throw Object.assign(new Error('시각화자료를 찾을 수 없습니다'), { statusCode: 404 });
    }
    copiedHtmlUrl = await copyHtmlToChapterTools(vis.htmlUrl, data.chapterId);
    htmlUrl = copiedHtmlUrl;
  }

  try {
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
        pageType: data.pageType ?? null,
        whiteboardTemplate: data.pageType === 'whiteboard' ? (data.whiteboardTemplate ?? null) : null,
        pdfUrl: data.pdfUrl ?? null,
        pdfPage: data.pdfPage ?? null,
        position,
      })
      .returning();
    return created;
  } catch (err) {
    // 복제 파일이 DB 반영에 실패하면 고아 파일을 정리
    if (copiedHtmlUrl) {
      const parsed = urlToStoragePath(copiedHtmlUrl);
      if (parsed) await removeFile(parsed.bucket, parsed.path).catch(() => {});
    }
    throw err;
  }
}

/** 페이지 부분 수정 (aiProblemId / 화이트보드 기본 템플릿) */
export async function updatePage(id: string, patch: { aiProblemId?: string | null; whiteboardTemplate?: string | null }) {
  const [row] = await db.update(pages).set(patch).where(eq(pages.id, id)).returning();
  return row ?? null;
}

/** 페이지 일괄 생성 */
export async function createPages(items: {
  chapterId: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  htmlUrl?: string | null;
  pdfUrl?: string | null;
  pdfPage?: number | null;
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
      pdfUrl: it.pdfUrl ?? null,
      pdfPage: it.pdfPage ?? null,
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

/** 챕터의 페이지 파일 URL 목록 (imageUrl + pdfUrl, 중복 제거, linked 챕터는 빈 배열) */
export async function getPageFileUrls(chapterId: string): Promise<string[]> {
  // linked 챕터는 자체 페이지가 없으므로 파일 정리 불필요
  if (await isLinkedChapter(chapterId)) return [];
  const rows = await db
    .select({ imageUrl: pages.imageUrl, pdfUrl: pages.pdfUrl })
    .from(pages)
    .where(eq(pages.chapterId, chapterId));
  return collectFileUrls(rows);
}

/** 주어진 URL 중 다른 챕터의 imageUrl·pdfUrl 에서도 쓰이는 것 (orphan 체크) */
export async function findSharedFileUrls(
  urls: string[],
  excludeChapterId: string,
): Promise<string[]> {
  if (urls.length === 0) return [];
  const rows = await db
    .select({ imageUrl: pages.imageUrl, pdfUrl: pages.pdfUrl })
    .from(pages)
    .where(
      and(
        or(inArray(pages.imageUrl, urls), inArray(pages.pdfUrl, urls)),
        ne(pages.chapterId, excludeChapterId),
      ),
    );
  const wanted = new Set(urls);
  return collectFileUrls(rows).filter((url) => wanted.has(url));
}
