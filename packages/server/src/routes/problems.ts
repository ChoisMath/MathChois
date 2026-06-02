import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleGuard.js';
import { readFile, urlToStoragePath } from '../services/storage.service.js';
import { ocrProblem, ocrMarkscheme, generateSolution, AI_MODEL_NAME } from '../services/ai.service.js';
import * as svc from '../services/problem.service.js';

function imageMime(filePath: string): string {
  const ext = filePath.toLowerCase().split('.').pop() ?? '';
  return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' } as Record<string, string>)[ext] ?? 'image/png';
}

async function loadImage(imageUrl: string) {
  const parsed = urlToStoragePath(imageUrl);
  if (!parsed) throw Object.assign(new Error('잘못된 이미지 URL'), { statusCode: 400 });
  const file = await readFile(parsed.bucket, parsed.path);
  if (!file) throw Object.assign(new Error('이미지를 찾을 수 없습니다'), { statusCode: 404 });
  return { base64: file.data.toString('base64'), mimeType: imageMime(parsed.path) };
}

const problemBody = z.object({
  title: z.string().nullable().optional(),
  problemLatex: z.string().min(1),
  figureNotes: z.array(z.string()).default([]),
  originalImageUrl: z.string().nullable().optional(),
  figures: z.array(z.object({ idx: z.number(), alt: z.string(), imageUrl: z.string() })).default([]),
  subject: z.string().nullable().optional(),
  majorUnit: z.string().nullable().optional(),
  minorUnit: z.string().nullable().optional(),
  difficulty: z.string().nullable().optional(),
  problemType: z.string().nullable().optional(),
  detailType: z.string().nullable().optional(),
  keywords: z.array(z.string()).default([]),
  answer: z.string().nullable().optional(),
  solution: z.string().nullable().optional(),
  solutionSource: z.enum(['teacher-markscheme', 'ai', 'ai-regenerated', 'teacher-verified']).nullable().optional(),
  markschemeImageUrl: z.string().nullable().optional(),
});

export async function problemRoutes(app: FastifyInstance) {
  const teacher = { preHandler: [authenticate, requireRole('teacher')] };

  app.post<{ Body: { imageUrl: string } }>('/api/problems/ocr', teacher, async (req) => {
    const { imageUrl } = z.object({ imageUrl: z.string() }).parse(req.body);
    const { base64, mimeType } = await loadImage(imageUrl);
    return ocrProblem(mimeType, base64);
  });

  app.post<{ Body: { imageUrl: string } }>('/api/problems/markscheme-ocr', teacher, async (req) => {
    const { imageUrl } = z.object({ imageUrl: z.string() }).parse(req.body);
    const { base64, mimeType } = await loadImage(imageUrl);
    return ocrMarkscheme(mimeType, base64);
  });

  app.post<{ Body: { problemLatex: string } }>('/api/problems/generate-solution', teacher, async (req) => {
    const { problemLatex } = z.object({ problemLatex: z.string().min(1) }).parse(req.body);
    return generateSolution(problemLatex);
  });

  app.get('/api/problems', teacher, async (req) => {
    const q = req.query as Record<string, string>;
    return svc.listProblems({
      subject: q.subject, majorUnit: q.majorUnit, minorUnit: q.minorUnit,
      difficulty: q.difficulty, problemType: q.problemType, q: q.q,
      page: q.page ? parseInt(q.page, 10) : undefined,
      pageSize: q.pageSize ? parseInt(q.pageSize, 10) : undefined,
    });
  });

  app.get('/api/problems/facets', teacher, async () => svc.getFacets());

  app.get<{ Params: { id: string } }>('/api/problems/:id', teacher, async (req, reply) => {
    const row = await svc.getProblem(req.params.id);
    if (!row) return reply.status(404).send({ error: '문항을 찾을 수 없습니다' });
    return row;
  });

  app.post('/api/problems', teacher, async (req) => {
    const body = problemBody.parse(req.body);
    return svc.createProblem({ ...body, aiModel: AI_MODEL_NAME, createdBy: req.user.sub });
  });

  app.patch<{ Params: { id: string } }>('/api/problems/:id', teacher, async (req, reply) => {
    const existing = await svc.getProblem(req.params.id);
    if (!existing) return reply.status(404).send({ error: '문항을 찾을 수 없습니다' });
    if (existing.createdBy !== req.user.sub && !req.user.isAdmin) {
      return reply.status(403).send({ error: '수정 권한이 없습니다' });
    }
    const body = problemBody.partial().parse(req.body);
    return svc.updateProblem(req.params.id, body);
  });

  app.delete<{ Params: { id: string } }>('/api/problems/:id', teacher, async (req, reply) => {
    const existing = await svc.getProblem(req.params.id);
    if (!existing) return reply.status(404).send({ error: '문항을 찾을 수 없습니다' });
    if (existing.createdBy !== req.user.sub && !req.user.isAdmin) {
      return reply.status(403).send({ error: '삭제 권한이 없습니다' });
    }
    await svc.deleteProblem(req.params.id);
    return reply.status(204).send();
  });
}
