import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * 역할 체크 미들웨어 — authenticate 이후 사용
 */
export function requireRole(role: 'teacher' | 'student') {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user.role !== role) {
      return reply.status(403).send({ error: `Requires ${role} role` });
    }
  };
}

/**
 * 관리자 체크 미들웨어 — authenticate 이후 사용
 */
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user.isAdmin) {
    return reply.status(403).send({ error: 'Admin access required' });
  }
}
