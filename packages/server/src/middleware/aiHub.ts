import type { FastifyRequest, FastifyReply } from 'fastify';
import { abilitiesFor } from '../services/aiHubAccess.service.js';

/**
 * AI활용 허브 접근 가드 — authenticate 이후 사용.
 * 교사·관리자는 항상, 학생은 AI 허브가 켜진 학급에 속할 때만 통과한다.
 */
export async function requireAiHub(request: FastifyRequest, reply: FastifyReply) {
  if (!(await abilitiesFor(request.user)).allowed) {
    return reply.status(403).send({ error: 'AI hub not enabled for you' });
  }
}
