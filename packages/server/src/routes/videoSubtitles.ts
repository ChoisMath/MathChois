import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  parseSubtitles, toWebVtt, isSubtitleLang, isLikelyMisdecoded, MAX_SUBTITLE_BYTES, SUBTITLE_EXT_RE,
} from '@mathchois/shared';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleGuard.js';
import { getVideoById } from '../services/video.service.js';
import * as svc from '../services/videoSubtitle.service.js';

type SubtitleParams = { Params: { id: string; lang: string } };

/**
 * 자막 쓰기 권한 확인: 언어 → 영상 존재 → 소유자/관리자.
 * 통과하면 true, 아니면 응답을 보내고 false.
 */
async function guardWrite(req: FastifyRequest<SubtitleParams>, reply: FastifyReply): Promise<boolean> {
  if (!isSubtitleLang(req.params.lang)) {
    reply.status(400).send({ error: '지원하지 않는 자막 언어입니다' });
    return false;
  }
  const video = await getVideoById(req.params.id);
  if (!video) {
    reply.status(404).send({ error: '영상자료를 찾을 수 없습니다' });
    return false;
  }
  if (video.createdBy !== req.user.sub && !req.user.isAdmin) {
    reply.status(403).send({ error: '수정 권한이 없습니다' });
    return false;
  }
  return true;
}

export async function videoSubtitleRoutes(app: FastifyInstance) {
  const teacher = { preHandler: [authenticate, requireRole('teacher')] };

  // ─── GET /api/video-subtitles?videoUrl= — 재생 화면용 자막 목록(로그인 사용자) ─────
  // 페이지 임베드는 영상 URL 만 알기 때문에 URL 로 조회한다.
  app.get<{ Querystring: { videoUrl?: string } }>('/api/video-subtitles', { preHandler: [authenticate] }, async (req) => {
    const videoUrl = req.query.videoUrl;
    if (!videoUrl) return [];
    return svc.listSubtitlesByVideoUrl(videoUrl);
  });

  // ─── POST /api/videos/:id/subtitles/:lang — .srt/.vtt 업로드(추가·교체) ─────
  app.post<SubtitleParams>('/api/videos/:id/subtitles/:lang', teacher, async (req, reply) => {
    if (!(await guardWrite(req, reply))) return reply;

    const part = await req.file({ limits: { fileSize: MAX_SUBTITLE_BYTES } });
    if (!part) return reply.status(400).send({ error: '파일이 없습니다.' });
    // MIME 은 브라우저마다 application/x-subrip, text/plain, 빈 값 등 제각각이라 확장자로 판단한다
    if (!SUBTITLE_EXT_RE.test(part.filename)) {
      part.file.resume();
      return reply.status(400).send({ error: 'SRT 또는 VTT 자막 파일만 올릴 수 있습니다.' });
    }

    let buf: Buffer;
    try {
      buf = await part.toBuffer();
    } catch (err) {
      if ((err as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') {
        return reply.status(413).send({ error: '자막 파일이 너무 큽니다. 최대 2MB 까지 올릴 수 있습니다.' });
      }
      throw err;
    }

    const text = new TextDecoder('utf-8').decode(buf); // 잘못된 바이트는 U+FFFD 로 바뀐다
    if (isLikelyMisdecoded(text)) {
      return reply.status(400).send({ error: 'UTF-8로 저장된 자막 파일만 올릴 수 있습니다' });
    }
    const cues = parseSubtitles(text);
    if (!cues.length) return reply.status(400).send({ error: '자막 문장을 찾을 수 없습니다' });

    const saved = await svc.saveSubtitle({
      videoId: req.params.id,
      lang: req.params.lang,
      vtt: toWebVtt(cues),
      cueCount: cues.length,
      createdBy: req.user.sub,
    });
    return reply.status(201).send(saved);
  });

  // ─── DELETE /api/videos/:id/subtitles/:lang ─────
  app.delete<SubtitleParams>('/api/videos/:id/subtitles/:lang', teacher, async (req, reply) => {
    if (!(await guardWrite(req, reply))) return reply;
    const removed = await svc.removeSubtitle(req.params.id, req.params.lang);
    if (!removed) return reply.status(404).send({ error: '자막을 찾을 수 없습니다' });
    return reply.status(204).send();
  });
}
