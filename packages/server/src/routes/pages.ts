import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleGuard.js';
import {
  getPagesByChapter,
  getPageById,
  createPage,
  createPages,
  deletePage,
  reorderPages,
} from '../services/page.service.js';

export async function pageRoutes(app: FastifyInstance) {

  // ─── GET /api/chapters/:chapterId/pages — 페이지 목록 ──

  app.get<{ Params: { chapterId: string } }>('/api/chapters/:chapterId/pages', {
    preHandler: [authenticate],
  }, async (request) => {
    return getPagesByChapter(request.params.chapterId);
  });

  // ─── POST /api/chapters/:chapterId/pages — 페이지 생성 ──

  app.post<{
    Params: { chapterId: string };
    Body: { imageUrl?: string; videoUrl?: string; position?: number } | { pages: { imageUrl?: string; videoUrl?: string; position: number }[] };
  }>('/api/chapters/:chapterId/pages', {
    preHandler: [authenticate, requireRole('teacher')],
  }, async (request, reply) => {
    const { chapterId } = request.params;
    const body = request.body as Record<string, unknown>;

    // 배치 삽입
    if (Array.isArray(body.pages)) {
      const items = (body.pages as { imageUrl?: string; videoUrl?: string; position: number }[]).map((pg) => ({
        chapterId,
        imageUrl: pg.imageUrl ?? null,
        videoUrl: pg.videoUrl ?? null,
        position: pg.position,
      }));
      const created = await createPages(items);
      return reply.status(201).send(created);
    }

    // 단일 삽입
    const { imageUrl, videoUrl, position } = body as { imageUrl?: string; videoUrl?: string; position?: number };
    if (!imageUrl && !videoUrl) {
      return reply.status(400).send({ error: 'imageUrl or videoUrl is required' });
    }
    const page = await createPage({ chapterId, imageUrl, videoUrl, position });
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
