import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import rateLimit from '@fastify/rate-limit';
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

  app.register(fastifyCookie);

  app.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
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
