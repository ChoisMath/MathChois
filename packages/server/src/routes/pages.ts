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
    Body: { imageUrl?: string; videoUrl?: string; htmlUrl?: string; position?: number } | { pages: { imageUrl?: string; videoUrl?: string; htmlUrl?: string; position: number }[] };
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
      const items = (body.pages as { imageUrl?: string; videoUrl?: string; htmlUrl?: string; position: number }[]).map((pg) => ({
        chapterId,
        imageUrl: pg.imageUrl ?? null,
        videoUrl: pg.videoUrl ?? null,
        htmlUrl: pg.htmlUrl ?? null,
        position: pg.position,
      }));
      const created = await createPages(items);
      return reply.status(201).send(created);
    }

    // 단일 삽입
    const { imageUrl, videoUrl, htmlUrl, aiProblemId, position } = body as {
      imageUrl?: string; videoUrl?: string; htmlUrl?: string; aiProblemId?: string; position?: number;
    };
    if (!imageUrl && !videoUrl && !htmlUrl && !aiProblemId) {
      return reply.status(400).send({ error: 'imageUrl, videoUrl, htmlUrl, or aiProblemId is required' });
    }
    const page = await createPage({ chapterId, imageUrl, videoUrl, htmlUrl, aiProblemId, position });
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

  // ─── PATCH /api/pages/:id — 페이지 수정 (AI 문항 연결 변경) ──
  app.patch<{ Params: { id: string }; Body: { aiProblemId?: string | null } }>('/api/pages/:id', {
    preHandler: [authenticate, requireRole('teacher')],
  }, async (request, reply) => {
    const { aiProblemId } = z.object({ aiProblemId: z.string().uuid().nullable().optional() }).parse(request.body);
    const updated = await updatePage(request.params.id, { aiProblemId: aiProblemId ?? null });
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
