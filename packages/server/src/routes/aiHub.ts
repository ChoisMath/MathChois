import { Readable } from 'node:stream';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { MOTION_CATALOG, validateTemplate, isV2, tokenMatches } from '@mathchois/shared';
import { env } from '../config/env.js';
import { authenticate } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/roleGuard.js';
import { requireAiHub } from '../middleware/aiHub.js';
import { abilitiesFor } from '../services/aiHubAccess.service.js';
import {
  listMotion, listSlide, readManifest, upsertMotionPrompt, upsertMotionPrompts, upsertSlidePrompts,
} from '../services/aiHub.service.js';
import { MAX_UPLOAD_BYTES, resolveAiHubPath, saveUpload } from '../services/aiHubUpload.service.js';
import { serveBrandFile } from '../services/brandSite.service.js';
import { buildFrameAncestors } from './storage.js';

const row = z.tuple([z.string(), z.string(), z.string()]);
const promptBody = z.object({
  en: z.string().min(1).max(20000),
  ko: z.string().min(1).max(20000),
  shots: z.array(row).max(60),
  cues: z.array(row).max(60),
});

// ─── 이전 스크립트용 토큰 업로드 ───

const uniqueIds = (list: { id: string }[], ctx: z.RefinementCtx) => {
  if (new Set(list.map((p) => p.id)).size !== list.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'duplicate id' });
};
// me.chois.pro MotionAdmin 모양(prompt = 영문 템플릿) — 저장할 때 en/ko 로 바꾼다.
const motionImport = z.array(z.object({
  id: z.string().regex(/^\d{2,3}-[a-z0-9-]+$/),
  prompt: z.string().min(1),
  ko: z.string().min(1),
  shots: z.array(row),
  cues: z.array(row),
})).superRefine(uniqueIds);
const slideImport = z.array(z.object({
  id: z.string().regex(/^\d{2,3}$/),
  prompt: z.string().min(1),
})).superRefine(uniqueIds);

const MANIFEST_SETS = ['motion', 'slide', 'brand'] as const;

/** 토큰 업로드 라우트 공통 — onRequest 에서 검사하므로 본문을 읽기 전에 거른다. */
async function requireUploadToken(request: FastifyRequest, reply: FastifyReply) {
  // 거절할 때는 연결을 닫아 클라이언트가 보내던 본문(최대 100MB)을 끝까지 받지 않는다.
  if (!env.AI_MEDIA_UPLOAD_TOKEN) {
    return reply.header('connection', 'close').status(503).send({ error: 'upload disabled' });
  }
  if (!tokenMatches(request.headers.authorization, env.AI_MEDIA_UPLOAD_TOKEN)) {
    return reply.header('connection', 'close').status(401).send({ error: 'unauthorized' });
  }
}

export async function aiHubRoutes(app: FastifyInstance) {
  // PUT /api/ai/media 의 본문을 버퍼링하지 않고 스트림 그대로 넘긴다. 이 플러그인 안에서만 등록되므로
  // 다른 라우트에는 영향이 없다. 스트림 파서는 Fastify bodyLimit 검사(rawBody)를 거치지 않으므로
  // 크기 한도는 saveUpload 가 직접 센다(MAX_UPLOAD_BYTES).
  app.addContentTypeParser('application/octet-stream', (_request, payload, done) => done(null, payload));

  // ─── GET /api/ai/access — 내 AI활용 허브 권한 ───
  app.get('/api/ai/access', { preHandler: [authenticate] }, async (request) => abilitiesFor(request.user));

  // ─── GET /api/ai/brand/site/* — 브랜드 룩북 사본 (공개, iframe 용) ───
  // 허브 페이지가 로그인 뒤에 있고 사본은 공개 정적 자원이라 인증하지 않는다. 앱 origin 에서만 frame 되도록 한다.
  app.get<{ Params: { '*': string } }>('/api/ai/brand/site/*', async (request, reply) => {
    const result = await serveBrandFile(request.params['*'] || 'index.html');
    if (result.status === 404) return reply.status(404).send({ error: 'Not found' });
    reply.header('Content-Type', result.contentType);
    reply.header('Cache-Control', result.cacheControl);
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Robots-Tag', 'noindex');
    reply.header('Content-Security-Policy', buildFrameAncestors());
    reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
    // helmet 이 raw 응답에 직접 setHeader 하므로 reply.removeHeader 로는 안 지워진다(routes/storage.ts 와 동일).
    reply.raw.removeHeader('X-Frame-Options');
    reply.raw.removeHeader('Origin-Agent-Cluster');
    return reply.send(result.body);
  });

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

  // ─── PUT /api/ai/media?path=<rel> — 미디어·manifest 업로드 (토큰) ───
  app.put<{ Querystring: { path?: unknown } }>('/api/ai/media', {
    onRequest: [requireUploadToken],
  }, async (request, reply) => {
    const fail = (status: number, error: string) => reply.header('connection', 'close').status(status).send({ error });
    const rel = typeof request.query.path === 'string' ? request.query.path : '';
    if (!resolveAiHubPath(rel)) return fail(400, 'path not allowed');
    if (Number(request.headers['content-length'] ?? 0) > MAX_UPLOAD_BYTES) return fail(413, 'too large');
    const sha = request.headers['x-content-sha256'];
    const body = request.body;
    if (typeof sha !== 'string' || !/^[0-9a-f]{64}$/.test(sha) || !(body instanceof Readable)) {
      return fail(400, 'missing sha or body');
    }
    const result = await saveUpload(rel, body, sha);
    if (!result.ok) return fail(result.status, result.error);
    return { ok: true, path: result.path, size: result.size };
  });

  // ─── GET /api/ai/media/manifest?set= — 서버에 올라간 manifest (토큰, 없으면 {}) ───
  app.get<{ Querystring: { set?: unknown } }>('/api/ai/media/manifest', {
    onRequest: [requireUploadToken],
  }, async (request, reply) => {
    const set = MANIFEST_SETS.find((s) => s === request.query.set);
    if (!set) return reply.status(400).send({ error: 'unknown set' });
    reply.header('Cache-Control', 'no-store');
    return (await readManifest(set)) ?? {};
  });

  // ─── PUT /api/ai/prompts/:set — 프롬프트 일괄 가져오기 (토큰) ───
  app.put<{ Params: { set: string } }>('/api/ai/prompts/:set', {
    onRequest: [requireUploadToken],
    bodyLimit: 20 * 1024 * 1024,
  }, async (request, reply) => {
    const { set } = request.params;
    if (set === 'motion') {
      const parsed = motionImport.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: 'invalid body', issues: parsed.error.issues.slice(0, 20) });
      await upsertMotionPrompts(parsed.data.map((m) => ({ id: m.id, en: m.prompt, ko: m.ko, shots: m.shots, cues: m.cues })));
      return { ok: true, count: parsed.data.length };
    }
    if (set === 'slide') {
      const parsed = slideImport.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: 'invalid body', issues: parsed.error.issues.slice(0, 20) });
      await upsertSlidePrompts(parsed.data);
      return { ok: true, count: parsed.data.length };
    }
    return reply.status(400).send({ error: 'unknown set' });
  });
}
