import type { FastifyRequest, FastifyReply } from 'fastify';
import { ibGuideAccessFor } from '../services/ibGuideAccess.service.js';

/**
 * IB교육과정 안내 접근 가드 — authenticate 이후 사용.
 * 교사·관리자는 항상, 학생은 IB 안내가 켜진 학급에 속할 때만 통과한다.
 * 스위치를 끄면 다음 요청부터 바로 막히도록 캐시하지 않는다.
 */
export async function requireIbGuide(request: FastifyRequest, reply: FastifyReply) {
  if (!(await ibGuideAccessFor(request.user)).allowed) {
    return reply.status(403).send({ error: 'IB guide not enabled for you' });
  }
}
