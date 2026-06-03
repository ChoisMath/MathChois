import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleGuard.js';
import * as svc from '../services/visualization.service.js';
import { removeFile, urlToStoragePath } from '../services/storage.service.js';

const visBody = z.object({
  title: z.string().min(1),
  subject: z.string().nullable().optional(),
  majorUnit: z.string().nullable().optional(),
  minorUnit: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  htmlUrl: z.string().min(1),
});

export async function visualizationRoutes(app: FastifyInstance) {
  const teacher = { preHandler: [authenticate, requireRole('teacher')] };

  app.get('/api/visualizations', teacher, async (req) => {
    const q = req.query as Record<string, string>;
    const mine = q.mine === '1' || q.mine === 'true';
    return svc.listVisualizations({
      subject: q.subject, majorUnit: q.majorUnit, minorUnit: q.minorUnit, q: q.q,
      createdBy: mine ? req.user.sub : undefined,
      page: q.page ? parseInt(q.page, 10) : undefined,
      pageSize: q.pageSize ? parseInt(q.pageSize, 10) : undefined,
    });
  });

  app.get('/api/visualizations/facets', teacher, async () => svc.getFacets());

  app.get<{ Params: { id: string } }>('/api/visualizations/:id', teacher, async (req, reply) => {
    const row = await svc.getVisualizationById(req.params.id);
    if (!row) return reply.status(404).send({ error: '시각화자료를 찾을 수 없습니다' });
    return row;
  });

  app.post('/api/visualizations', teacher, async (req, reply) => {
    const body = visBody.parse(req.body);
    const parsed = urlToStoragePath(body.htmlUrl);
    if (!parsed || parsed.bucket !== 'visualizations') {
      return reply.status(400).send({ error: '잘못된 htmlUrl입니다' });
    }
    return svc.createVisualization({ ...body, createdBy: req.user.sub });
  });

  app.patch<{ Params: { id: string } }>('/api/visualizations/:id', teacher, async (req, reply) => {
    const existing = await svc.getVisualizationById(req.params.id);
    if (!existing) return reply.status(404).send({ error: '시각화자료를 찾을 수 없습니다' });
    if (existing.createdBy !== req.user.sub && !req.user.isAdmin) {
      return reply.status(403).send({ error: '수정 권한이 없습니다' });
    }
    const body = visBody.partial().parse(req.body);
    if (body.htmlUrl) {
      const parsed = urlToStoragePath(body.htmlUrl);
      if (!parsed || parsed.bucket !== 'visualizations') {
        return reply.status(400).send({ error: '잘못된 htmlUrl입니다' });
      }
    }
    const updated = await svc.updateVisualization(req.params.id, body);
    // htmlUrl 교체 시 이전 원본 파일 정리(스토리지 누수 방지)
    if (body.htmlUrl && body.htmlUrl !== existing.htmlUrl) {
      const old = urlToStoragePath(existing.htmlUrl);
      if (old) await removeFile(old.bucket, old.path).catch(() => {});
    }
    return updated;
  });

  app.delete<{ Params: { id: string } }>('/api/visualizations/:id', teacher, async (req, reply) => {
    const existing = await svc.getVisualizationById(req.params.id);
    if (!existing) return reply.status(404).send({ error: '시각화자료를 찾을 수 없습니다' });
    if (existing.createdBy !== req.user.sub && !req.user.isAdmin) {
      return reply.status(403).send({ error: '삭제 권한이 없습니다' });
    }
    await svc.removeVisualization(req.params.id);
    return reply.status(204).send();
  });
}
