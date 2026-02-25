import type { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { TokenPayload } from '@mathchois/shared';

declare module 'fastify' {
  interface FastifyRequest {
    user: TokenPayload;
  }
}

/**
 * JWT 검증 미들웨어 — Authorization: Bearer <token> 에서 추출
 */
export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Missing or invalid token' });
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
    request.user = payload;
  } catch {
    return reply.status(401).send({ error: 'Token expired or invalid' });
  }
}
