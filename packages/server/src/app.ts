import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { env } from './config/env.js';

export function buildApp() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
    bodyLimit: 5 * 1024 * 1024, // 5MB for Excalidraw JSON payloads
  });

  // ─── Plugins ────────────────────────────────────────

  app.register(fastifyCookie);

  app.register(fastifyMultipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB per file
    },
  });

  // ─── Health check ───────────────────────────────────

  app.get('/api/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
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
      return reply.sendFile('index.html');
    });
  }

  return app;
}
