import { Readable } from 'node:stream';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { isIaDoc, isIaExampleId, isIbGuideFile, tokenMatches } from '@mathchois/shared';
import { env } from '../config/env.js';
import { authenticate } from '../middleware/auth.js';
import { requireIbGuide } from '../middleware/ibGuide.js';
import { getProfileById } from '../services/auth.service.js';
import { ibGuideAccessFor } from '../services/ibGuideAccess.service.js';
import {
  IB_MAX_UPLOAD_BYTES, readIaPage, readIbManifest, saveIbUpload, watermarkedIaPage,
} from '../services/ibGuide.service.js';

const PAGE_NO = /^[1-9]\d{0,2}$/;

/** 토큰 업로드 라우트 공통 — onRequest 에서 검사하므로 본문을 읽기 전에 거른다. */
async function requireIbUploadToken(request: FastifyRequest, reply: FastifyReply) {
  // 거절할 때는 연결을 닫아 클라이언트가 보내던 본문을 끝까지 받지 않는다(routes/aiHub.ts 와 같음).
  if (!env.IB_MEDIA_UPLOAD_TOKEN) {
    return reply.header('connection', 'close').status(503).send({ error: 'upload disabled' });
  }
  if (!tokenMatches(request.headers.authorization, env.IB_MEDIA_UPLOAD_TOKEN)) {
    return reply.header('connection', 'close').status(401).send({ error: 'unauthorized' });
  }
}

export async function ibGuideRoutes(app: FastifyInstance) {
  // PUT /api/ib/media 본문을 스트림 그대로 넘긴다. Fastify 는 플러그인별로 파서를 가두므로
  // aiHubRoutes 의 파서는 여기서 보이지 않는다 — 이 플러그인에서 따로 등록한다.
  // 스트림 파서는 bodyLimit 검사를 거치지 않으므로 크기 한도는 saveTokenUpload 가 직접 센다.
  app.addContentTypeParser('application/octet-stream', (_request, payload, done) => done(null, payload));

  // ─── GET /api/ib/access — 내 IB교육과정 안내 권한 ───
  app.get('/api/ib/access', { preHandler: [authenticate] }, async (request) => ibGuideAccessFor(request.user));

  // ─── GET /api/ib/ia — IA작성예시 목록 (files 는 내보내지 않는다) ───
  app.get('/api/ib/ia', { preHandler: [authenticate, requireIbGuide] }, async () => {
    const manifest = await readIbManifest();
    if (!manifest) return { examples: [] };
    const examples = manifest.examples
      .map(({ id, no, title, note, docs }) => ({ id, no, title, note, docs }))
      .sort((a, b) => a.no - b.no);
    return { examples };
  });

  // ─── GET /api/ib/ia/:exId/:doc/pages/:n — 워터마크를 입힌 페이지 이미지 ───
  // 원본 페이지가 Volume 을 떠나는 유일한 길. 보내는 것은 합성 결과뿐이고, 읽기~합성 중 어떤 실패도 500 이다.
  app.get<{ Params: { exId: string; doc: string; n: string } }>('/api/ib/ia/:exId/:doc/pages/:n', {
    preHandler: [authenticate, requireIbGuide],
  }, async (request, reply) => {
    const { exId, doc, n } = request.params;
    if (!isIaExampleId(exId) || !isIaDoc(doc) || !PAGE_NO.test(n)) {
      return reply.status(404).send({ error: 'Not found' });
    }
    const page = Number(n);
    const userId = request.user.sub;
    const profile = await getProfileById(userId);
    if (!profile) {
      request.log.error({ userId }, 'ib-guide page: profile missing');
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
    let image: Buffer | null;
    try {
      const original = await readIaPage(exId, doc, page);
      if (!original) return reply.status(404).send({ error: 'Not found' });
      // request.raw.destroyed 는 본문을 다 읽은 정상 GET 에서도 true 가 되므로 연결(소켓) 상태로 판단한다.
      const clientGone = () => request.socket.destroyed;
      image = await watermarkedIaPage(
        original, { id: profile.id, name: profile.name ?? '', email: profile.email ?? '' }, undefined, clientGone,
      );
    } catch (err) {
      request.log.error({ err, userId, exId, doc, page }, 'ib-guide page: watermark failed');
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
    if (!image) {
      // 이미 떠난 클라이언트 — 합성하지 않았고 아무것도 보내지 않는다(원본은 절대 보내지 않는다).
      request.log.info({ userId, exId, doc, page }, 'ib-guide page: client gone, skipped');
      reply.hijack();
      reply.raw.destroy();
      return reply;
    }
    request.log.info({ userId, exId, doc, page }, 'ib-guide page view');
    reply.header('Content-Type', 'image/webp');
    reply.header('Content-Disposition', 'inline');
    reply.header('Cache-Control', 'private, no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Robots-Tag', 'noindex');
    reply.header('Cross-Origin-Resource-Policy', 'same-origin');
    return reply.send(image);
  });

  // ─── PUT /api/ib/media?path=<rel> — 페이지·manifest 업로드 (토큰) ───
  app.put<{ Querystring: { path?: unknown } }>('/api/ib/media', {
    onRequest: [requireIbUploadToken],
  }, async (request, reply) => {
    const fail = (status: number, error: string) => reply.header('connection', 'close').status(status).send({ error });
    const rel = typeof request.query.path === 'string' ? request.query.path : '';
    if (!isIbGuideFile(rel)) return fail(400, 'path not allowed');
    if (Number(request.headers['content-length'] ?? 0) > IB_MAX_UPLOAD_BYTES) return fail(413, 'too large');
    const sha = request.headers['x-content-sha256'];
    const body = request.body;
    if (typeof sha !== 'string' || !/^[0-9a-f]{64}$/.test(sha) || !(body instanceof Readable)) {
      return fail(400, 'missing sha or body');
    }
    const result = await saveIbUpload(rel, body, sha);
    if (!result.ok) return fail(result.status, result.error);
    return { ok: true, path: result.path, size: result.size };
  });

  // ─── GET /api/ib/media/manifest — 서버에 올라간 manifest (토큰, 없으면 {}) ───
  app.get('/api/ib/media/manifest', { onRequest: [requireIbUploadToken] }, async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return (await readIbManifest()) ?? {};
  });
}
