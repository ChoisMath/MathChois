import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { MOTION_CATALOG, validateTemplate, isV2 } from '@mathchois/shared';
import { authenticate } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/roleGuard.js';
import { requireAiHub } from '../middleware/aiHub.js';
import { abilitiesFor } from '../services/aiHubAccess.service.js';
import { listMotion, listSlide, upsertMotionPrompt } from '../services/aiHub.service.js';

const row = z.tuple([z.string(), z.string(), z.string()]);
const promptBody = z.object({
  en: z.string().min(1).max(20000),
  ko: z.string().min(1).max(20000),
  shots: z.array(row).max(60),
  cues: z.array(row).max(60),
});

export async function aiHubRoutes(app: FastifyInstance) {
  // ─── GET /api/ai/access — 내 AI활용 허브 권한 ───
  app.get('/api/ai/access', { preHandler: [authenticate] }, async (request) => abilitiesFor(request.user));

  // ─── GET /api/ai/motion · /api/ai/slide — 올라간 파일이 모두 있는 항목만 ───
  app.get('/api/ai/motion', { preHandler: [authenticate, requireAiHub] }, async () => listMotion());
  app.get('/api/ai/slide', { preHandler: [authenticate, requireAiHub] }, async () => listSlide());

  // ─── PUT /api/ai/motion/:id/prompt — 모션 프롬프트 저장 (관리자) ───
  app.put<{ Params: { id: string } }>('/api/ai/motion/:id/prompt', {
    preHandler: [authenticate, requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params;
    if (!MOTION_CATALOG.some((m) => m.id === id)) return reply.status(404).send({ error: 'Unknown motion id' });
    const parsed = promptBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'invalid body', issues: parsed.error.issues });
    const { en, ko, shots, cues } = parsed.data;
    const errors = validateTemplate(en).concat(validateTemplate(ko));
    if (errors.length) return reply.status(400).send({ error: 'invalid template', errors });
    const saved = await upsertMotionPrompt(id, { en, ko, shots, cues });
    return { id, en, ko, shots, cues, v2: isV2(en) || isV2(ko), updatedAt: saved.updatedAt };
  });
}
