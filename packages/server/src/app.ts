import Fastify from 'fastify';
import fastifyCompress from '@fastify/compress';
import fastifyCookie from '@fastify/cookie';
import fastifyHelmet from '@fastify/helmet';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import rateLimit from '@fastify/rate-limit';
import jwt from 'jsonwebtoken';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { env } from './config/env.js';
import { db } from './config/database.js';
import { authRoutes } from './routes/auth.js';
import { classroomRoutes } from './routes/classrooms.js';
import { chapterRoutes } from './routes/chapters.js';
import { pageRoutes } from './routes/pages.js';
import { storageRoutes } from './routes/storage.js';
import { postRoutes } from './routes/posts.js';
import { assignmentRoutes } from './routes/assignments.js';
import { noteRoutes } from './routes/notes.js';
import { commentRoutes } from './routes/comments.js';
import { adminRoutes } from './routes/admin.js';

export function buildApp() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
    bodyLimit: 5 * 1024 * 1024, // 5MB for Excalidraw JSON payloads
    trustProxy: true, // Railway 리버스 프록시 뒤에서 X-Forwarded-* 헤더 신뢰
  });

  // ─── Plugins ────────────────────────────────────────

  app.register(fastifyCompress, { threshold: 1024 }); // 1KB 이상 응답 gzip 압축
  app.register(fastifyHelmet, {
    contentSecurityPolicy: false, // SPA에서 인라인 스크립트/스타일 필요
  });
  app.register(fastifyCookie);

  app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',

    // JWT에서 userId 추출 → 사용자별 버킷. 미인증 요청은 IP 기반
    keyGenerator: (request) => {
      try {
        const auth = request.headers.authorization;
        if (auth?.startsWith('Bearer ')) {
          const payload = jwt.decode(auth.slice(7)) as { sub?: string } | null;
          if (payload?.sub) return `user:${payload.sub}`;
        }
      } catch { /* IP fallback */ }
      return request.ip;
    },

    // 정적 파일, Socket.IO, Health check는 rate limit에서 제외
    allowList: (request, _key) => {
      const url = request.url;
      return url.startsWith('/assets/')
        || url.startsWith('/socket.io/')
        || url === '/favicon.svg'
        || url === '/favicon.ico'
        || url === '/api/health';
    },

    // 429 발생 시 로깅 (디버깅용)
    onExceeded: (request, key) => {
      request.log.warn({ key, url: request.url }, 'Rate limit exceeded');
    },

    errorResponseBuilder: () => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
    }),
  });

  app.register(fastifyMultipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB per file
    },
  });

  // ─── Routes ───────────────────────────────────────

  app.register(authRoutes);
  app.register(classroomRoutes);
  app.register(chapterRoutes);
  app.register(pageRoutes);
  app.register(storageRoutes);
  app.register(postRoutes);
  app.register(assignmentRoutes);
  app.register(noteRoutes);
  app.register(commentRoutes);
  app.register(adminRoutes);

  // ─── Global Error Handler ──────────────────────────

  app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    const statusCode = error.statusCode ?? 500;
    request.log.error({ err: error, url: request.url, method: request.method }, 'Request error');
    reply.status(statusCode).send({
      error: statusCode >= 500 ? 'Internal Server Error' : error.message,
      statusCode,
    });
  });

  // ─── Health check ───────────────────────────────────

  app.get('/api/health', async (_request, reply) => {
    try {
      await db.execute(sql`SELECT 1`);
      return { status: 'ok', timestamp: new Date().toISOString() };
    } catch {
      return reply.status(503).send({ status: 'error', message: 'Database unavailable' });
    }
  });

  // ─── Static file serving (production) ───────────────

  if (env.NODE_ENV === 'production') {
    const clientDist = path.resolve(import.meta.dirname, '../../client/dist');

    app.register(fastifyStatic, {
      root: clientDist,
      prefix: '/',
      wildcard: false,
      setHeaders: (res, filePath) => {
        if (filePath.includes('/assets/')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    });

    // SPA fallback: non-API routes → index.html
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.status(404).send({ error: 'Not found' });
      }
      // 민감 경로 보호 (봇/스캐너 차단)
      const blocked = /^\/(\.env|\.git|\.DS_Store|\.vscode|actuator|swagger|debug|graphql|telescope)/i;
      if (blocked.test(request.url)) {
        return reply.status(404).send({ error: 'Not found' });
      }
      return reply.sendFile('index.html');
    });
  }

  return app;
}
