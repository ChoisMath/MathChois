import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { abilitiesFor } from '../services/aiHubAccess.service.js';

export async function aiHubRoutes(app: FastifyInstance) {
  // ─── GET /api/ai/access — 내 AI활용 허브 권한 ───
  app.get('/api/ai/access', { preHandler: [authenticate] }, async (request) => abilitiesFor(request.user));
}
