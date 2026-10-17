import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleGuard.js';
import * as svc from '../services/video.service.js';
import { uploadStream, urlToStoragePath } from '../services/storage.service.js';
import { sanitizeFileName } from './storage.js';

/** 영상자료 버킷. 교사 전용 업로드(전용 스트리밍 라우트) */
export const VIDEO_BUCKET = 'videos';

// 브라우저가 직접 재생 가능한 형식만 허용 (설계 결정 Q2: mp4/webm/mov, 2GB)
const VIDEO_MIMES = new Set(['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v']);
const VIDEO_EXT_RE = /\.(mp4|m4v|webm|mov)$/i;
const THUMB_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;   // 2GB
const MAX_THUMB_BYTES = 5 * 1024 * 1024;                  // 5MB

const videoBody = z.object({
  title: z.string().min(1),
  subject: z.string().nullable().optional(),
  majorUnit: z.string().nullable().optional(),
  minorUnit: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  videoUrl: z.string().min(1),
  thumbnailUrl: z.string().nullable().optional(),
  mimeType: z.string().nullable().optional(),
  fileSize: z.number().int().nonnegative().nullable().optional(),
  durationSec: z.number().int().nonnegative().nullable().optional(),
});

function isVideoBucketUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const parsed = urlToStoragePath(url);
  return !!parsed && parsed.bucket === VIDEO_BUCKET;
}

export async function videoRoutes(app: FastifyInstance) {
  const teacher = { preHandler: [authenticate, requireRole('teacher')] };

  // ─── POST /api/videos/upload?kind=video|thumbnail — 스트리밍 업로드 ─────
  // 기존 /api/files/upload 는 파일 전체를 메모리에 모으므로 수 GB 영상에 쓰지 않는다.

  app.post<{ Querystring: { kind?: string } }>('/api/videos/upload', teacher, async (req, reply) => {
    const kind = req.query.kind === 'thumbnail' ? 'thumbnail' : 'video';
    const maxBytes = kind === 'video' ? MAX_VIDEO_BYTES : MAX_THUMB_BYTES;

    const part = await req.file({ limits: { fileSize: maxBytes } });
    if (!part) return reply.status(400).send({ error: '파일이 없습니다.' });

    const okMime = kind === 'video'
      ? (VIDEO_MIMES.has(part.mimetype) || VIDEO_EXT_RE.test(part.filename))
      : THUMB_MIMES.has(part.mimetype);
    if (!okMime) {
      part.file.resume(); // 남은 본문 소비 후 응답
      return reply.status(400).send({
        error: kind === 'video'
          ? 'mp4 / webm / mov 형식의 영상 파일만 업로드할 수 있습니다.'
          : '썸네일은 JPEG/PNG/WebP 이미지만 가능합니다.',
      });
    }

    const fileName = `${Date.now()}_${sanitizeFileName(part.filename)}`;
    const directory = kind === 'video' ? 'library' : 'thumbnails';
    try {
      const { url, size } = await uploadStream(
        VIDEO_BUCKET, directory, fileName, part.file, () => part.file.truncated,
      );
      return { url, fileName: part.filename, fileSize: size, mimeType: part.mimetype };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 413) {
        return reply.status(413).send({
          error: `파일이 너무 큽니다. 최대 ${Math.round(maxBytes / 1024 / 1024)}MB 까지 업로드할 수 있습니다.`,
        });
      }
      req.log.error({ err }, 'Video upload failed');
      return reply.status(500).send({ error: '영상 업로드에 실패했습니다.' });
    }
  });

  // ─── 라이브러리 CRUD (모든 교사 공유, 수정·삭제는 소유자) ─────

  app.get('/api/videos', teacher, async (req) => {
    const q = req.query as Record<string, string>;
    const mine = q.mine === '1' || q.mine === 'true';
    return svc.listVideos({
      subject: q.subject, majorUnit: q.majorUnit, minorUnit: q.minorUnit, q: q.q,
      createdBy: mine ? req.user.sub : undefined,
      page: q.page ? parseInt(q.page, 10) : undefined,
      pageSize: q.pageSize ? parseInt(q.pageSize, 10) : undefined,
    });
  });

  app.get('/api/videos/facets', teacher, async () => svc.getVideoFacets());

  app.get<{ Params: { id: string } }>('/api/videos/:id', teacher, async (req, reply) => {
    const row = await svc.getVideoById(req.params.id);
    if (!row) return reply.status(404).send({ error: '영상자료를 찾을 수 없습니다' });
    return row;
  });

  app.get<{ Params: { id: string } }>('/api/videos/:id/usage', teacher, async (req, reply) => {
    const row = await svc.getVideoById(req.params.id);
    if (!row) return reply.status(404).send({ error: '영상자료를 찾을 수 없습니다' });
    return svc.getVideoUsage(req.params.id);
  });

  app.post('/api/videos', teacher, async (req, reply) => {
    const body = videoBody.parse(req.body);
    if (!isVideoBucketUrl(body.videoUrl)) {
      return reply.status(400).send({ error: '잘못된 videoUrl입니다' });
    }
    if (body.thumbnailUrl && !isVideoBucketUrl(body.thumbnailUrl)) {
      return reply.status(400).send({ error: '잘못된 thumbnailUrl입니다' });
    }
    const created = await svc.createVideo({ ...body, createdBy: req.user.sub });
    return reply.status(201).send(await svc.getVideoById(created.id));
  });

  app.patch<{ Params: { id: string } }>('/api/videos/:id', teacher, async (req, reply) => {
    const existing = await svc.getVideoById(req.params.id);
    if (!existing) return reply.status(404).send({ error: '영상자료를 찾을 수 없습니다' });
    if (existing.createdBy !== req.user.sub && !req.user.isAdmin) {
      return reply.status(403).send({ error: '수정 권한이 없습니다' });
    }
    const body = videoBody.partial().parse(req.body);
    if (body.videoUrl && !isVideoBucketUrl(body.videoUrl)) {
      return reply.status(400).send({ error: '잘못된 videoUrl입니다' });
    }
    if (body.thumbnailUrl && !isVideoBucketUrl(body.thumbnailUrl)) {
      return reply.status(400).send({ error: '잘못된 thumbnailUrl입니다' });
    }
    await svc.updateVideo(req.params.id, body);
    // 파일/썸네일 교체 시 이전 파일 정리(스토리지 누수 방지)
    await svc.removeVideoFiles(
      body.videoUrl && body.videoUrl !== existing.videoUrl ? existing.videoUrl : null,
      body.thumbnailUrl !== undefined && body.thumbnailUrl !== existing.thumbnailUrl ? existing.thumbnailUrl : null,
    );
    return svc.getVideoById(req.params.id);
  });

  // ?force=1 — 배정된 학급이 있어도 배정을 모두 해제한 뒤 삭제(소유자/관리자)
  app.delete<{ Params: { id: string }; Querystring: { force?: string } }>('/api/videos/:id', teacher, async (req, reply) => {
    const existing = await svc.getVideoById(req.params.id);
    if (!existing) return reply.status(404).send({ error: '영상자료를 찾을 수 없습니다' });
    if (existing.createdBy !== req.user.sub && !req.user.isAdmin) {
      return reply.status(403).send({ error: '삭제 권한이 없습니다' });
    }
    const force = req.query.force === '1' || req.query.force === 'true';
    try {
      await svc.removeVideo(req.params.id, { force });
    } catch (err) {
      const e = err as { statusCode?: number; message: string; usage?: unknown };
      if (e.statusCode === 409) return reply.status(409).send({ error: e.message, usage: e.usage });
      throw err;
    }
    return reply.status(204).send();
  });
}
