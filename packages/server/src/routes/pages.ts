import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleGuard.js';
import {
  getResolvedPagesByChapter,
  getPageById,
  createPage,
  createPages,
  deletePage,
  reorderPages,
  updatePage,
} from '../services/page.service.js';
import { isLinkedChapter } from '../services/chapter.service.js';
import { isValidPageVideoUrl, INVALID_VIDEO_URL_MESSAGE } from '../utils/videoUrl.js';
import { pdfFieldsError } from '../utils/pageBody.js';

type BulkPageItem = { imageUrl?: string; videoUrl?: string; htmlUrl?: string; pdfUrl?: string; pdfPage?: number; position: number };

/** 화이트보드 템플릿 key (클라이언트 lib/whiteboardTemplates.js 의 key 형식) */
const templateKeySchema = z.string().regex(/^[a-z0-9-]+$/).max(40).nullable();

export async function pageRoutes(app: FastifyInstance) {

  // ─── GET /api/chapters/:chapterId/pages — 페이지 목록 (linked 챕터는 source 페이지 반환) ──

  app.get<{ Params: { chapterId: string } }>('/api/chapters/:chapterId/pages', {
    preHandler: [authenticate],
  }, async (request) => {
    return getResolvedPagesByChapter(request.params.chapterId);
  });

  // ─── POST /api/chapters/:chapterId/pages — 페이지 생성 ──

  app.post<{
    Params: { chapterId: string };
    Body: { imageUrl?: string; videoUrl?: string; htmlUrl?: string; pdfUrl?: string; pdfPage?: number; position?: number } | { pages: BulkPageItem[] };
  }>('/api/chapters/:chapterId/pages', {
    preHandler: [authenticate, requireRole('teacher')],
  }, async (request, reply) => {
    const { chapterId } = request.params;

    // linked 챕터에는 페이지 추가 불가 (source 챕터에서만 편집)
    if (await isLinkedChapter(chapterId)) {
      return reply.status(403).send({ error: '공유된 챕터에는 페이지를 추가할 수 없습니다. 원본 챕터에서 편집하세요.' });
    }
    const body = request.body as Record<string, unknown>;

    // 배치 삽입
    if (Array.isArray(body.pages)) {
      const bulk = body.pages as BulkPageItem[];
      if (bulk.some((pg) => pg.videoUrl != null && !isValidPageVideoUrl(pg.videoUrl))) {
        return reply.status(400).send({ error: INVALID_VIDEO_URL_MESSAGE });
      }
      for (const pg of bulk) {
        const pdfError = pdfFieldsError(pg);
        if (pdfError) return reply.status(400).send({ error: pdfError });
      }
      const items = bulk.map((pg) => ({
        chapterId,
        imageUrl: pg.imageUrl ?? null,
        videoUrl: pg.videoUrl ?? null,
        htmlUrl: pg.htmlUrl ?? null,
        pdfUrl: pg.pdfUrl ?? null,
        pdfPage: pg.pdfPage ?? null,
        position: pg.position,
      }));
      const created = await createPages(items);
      return reply.status(201).send(created);
    }

    // 단일 삽입
    const { imageUrl, videoUrl, htmlUrl, pdfUrl, pdfPage, aiProblemId, fromVisualizationId, pageType, whiteboardTemplate, position } = body as {
      imageUrl?: string; videoUrl?: string; htmlUrl?: string; pdfUrl?: string; pdfPage?: number; aiProblemId?: string;
      fromVisualizationId?: string; pageType?: string; whiteboardTemplate?: string | null; position?: number;
    };
    const isWhiteboard = pageType === 'whiteboard';
    const pdfError = pdfFieldsError({ pdfUrl, pdfPage });
    if (pdfError) return reply.status(400).send({ error: pdfError });
    if (!imageUrl && !videoUrl && !htmlUrl && !pdfUrl && !aiProblemId && !fromVisualizationId && !isWhiteboard) {
      return reply.status(400).send({ error: 'imageUrl, videoUrl, htmlUrl, pdfUrl, aiProblemId, fromVisualizationId, or pageType=whiteboard is required' });
    }
    if (pageType != null && !isWhiteboard) {
      return reply.status(400).send({ error: 'Unknown pageType' });
    }
    if (isWhiteboard && !templateKeySchema.safeParse(whiteboardTemplate ?? null).success) {
      return reply.status(400).send({ error: 'Invalid whiteboardTemplate' });
    }
    if (videoUrl != null && !isValidPageVideoUrl(videoUrl)) {
      return reply.status(400).send({ error: INVALID_VIDEO_URL_MESSAGE });
    }
    const page = await createPage({
      chapterId, imageUrl, videoUrl, htmlUrl, pdfUrl, pdfPage, aiProblemId, fromVisualizationId, position,
      pageType: isWhiteboard ? 'whiteboard' : null,
      whiteboardTemplate: isWhiteboard ? (whiteboardTemplate ?? null) : null,
    });
    return reply.status(201).send(page);
  });

  // ─── DELETE /api/pages/:id — 페이지 삭제 ──────

  app.delete<{ Params: { id: string } }>('/api/pages/:id', {
    preHandler: [authenticate, requireRole('teacher')],
  }, async (request, reply) => {
    const deleted = await deletePage(request.params.id);
    if (!deleted) {
      return reply.status(404).send({ error: 'Page not found' });
    }
    // 삭제된 페이지 정보 반환 (클라이언트가 Storage 정리에 사용)
    return deleted;
  });

  // ─── PATCH /api/pages/:id — 페이지 수정 (AI 문항 연결 / 화이트보드 기본 템플릿) ──
  app.patch<{ Params: { id: string }; Body: { aiProblemId?: string | null; whiteboardTemplate?: string | null } }>('/api/pages/:id', {
    preHandler: [authenticate, requireRole('teacher')],
  }, async (request, reply) => {
    const parsed = z.object({
      aiProblemId: z.string().uuid().nullable().optional(),
      whiteboardTemplate: templateKeySchema.optional(),
    }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid body' });
    const { aiProblemId, whiteboardTemplate } = parsed.data;
    const patch: { aiProblemId?: string | null; whiteboardTemplate?: string | null } = {};
    if (aiProblemId !== undefined) patch.aiProblemId = aiProblemId ?? null;
    if (whiteboardTemplate !== undefined) patch.whiteboardTemplate = whiteboardTemplate;
    if (Object.keys(patch).length === 0) return reply.status(400).send({ error: 'Nothing to update' });
    const updated = await updatePage(request.params.id, patch);
    if (!updated) return reply.status(404).send({ error: 'Page not found' });
    return updated;
  });

  // ─── PUT /api/pages/reorder — 순서 일괄 변경 ──

  app.put<{
    Body: { items: { id: string; position: number }[] };
  }>('/api/pages/reorder', {
    preHandler: [authenticate, requireRole('teacher')],
  }, async (request) => {
    await reorderPages(request.body.items);
    return { ok: true };
  });
}
