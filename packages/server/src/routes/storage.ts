import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleGuard.js';
import { uploadFile, readFile, removeFile } from '../services/storage.service.js';

// 학생 업로드 허용 버킷
const STUDENT_ALLOWED_BUCKETS = new Set(['submission-files', 'ai-coaching']);

// HTML 전용 버킷 (text/html 만 허용)
const HTML_ONLY_BUCKETS = new Set(['chapter-tools', 'visualizations']);

// 학생 업로드 허용 MIME 타입 (submission-files 는 임의 형식 허용 — 아래 분기 참조)
const STUDENT_ALLOWED_MIMES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic',
  'application/pdf',
]);

// 과제 제출 첨부는 모든 파일 형식을 허용한다. 임의 형식 인라인 서빙 시 XSS 위험이 있어
// 서빙 단계(GET /api/files/*)에서 비이미지 파일을 강제 다운로드시킨다.
function studentMimeAllowed(bucket: string, mimetype: string): boolean {
  if (bucket === 'submission-files') return true;
  return STUDENT_ALLOWED_MIMES.has(mimetype);
}

// 앱 origin 에서 인라인 렌더해도 스크립트 실행 위험이 없는 래스터 이미지 형식.
const INLINE_SAFE_IMAGE_RE = /^image\/(png|jpe?g|gif|webp)$/;

export async function storageRoutes(app: FastifyInstance) {

  // ─── POST /api/files/upload — 파일 업로드 ─────

  app.post<{
    Querystring: { bucket: string; directory: string };
  }>('/api/files/upload', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { bucket, directory } = request.query;

    if (!bucket || !directory) {
      return reply.status(400).send({ error: 'bucket and directory are required' });
    }

    // 학생은 허용 버킷만 접근 가능
    if (request.user.role === 'student' && !STUDENT_ALLOWED_BUCKETS.has(bucket)) {
      return reply.status(403).send({ error: 'Permission denied for this bucket' });
    }

    try {
      const file = await request.file();
      if (!file) {
        return reply.status(400).send({ error: 'No file uploaded' });
      }

      const chunks: Buffer[] = [];
      for await (const chunk of file.file) {
        chunks.push(chunk);
      }
      const data = Buffer.concat(chunks);

      // 학생 업로드 MIME 타입 제한
      if (request.user.role === 'student' && !studentMimeAllowed(bucket, file.mimetype)) {
        return reply.status(400).send({ error: '허용되지 않은 파일 형식입니다.' });
      }

      // chapter-tools 버킷은 HTML 파일만 허용
      if (HTML_ONLY_BUCKETS.has(bucket) && file.mimetype !== 'text/html') {
        return reply.status(400).send({ error: 'HTML 도구 버킷에는 .html 파일만 업로드할 수 있습니다.' });
      }

      const timestamp = Date.now();
      const safeName = file.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      const fileName = `${timestamp}_${safeName}`;

      const url = await uploadFile(bucket, directory, fileName, data);

      return {
        url,
        fileName: file.filename,
        fileSize: data.length,
        mimeType: file.mimetype,
      };
    } catch (err) {
      request.log.error({ err }, 'File upload failed');
      return reply.status(500).send({ error: '파일 업로드에 실패했습니다.' });
    }
  });

  // ─── POST /api/files/upload-multiple — 복수 파일 업로드

  app.post<{
    Querystring: { bucket: string; directory: string };
  }>('/api/files/upload-multiple', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { bucket, directory } = request.query;

    if (!bucket || !directory) {
      return reply.status(400).send({ error: 'bucket and directory are required' });
    }

    // 학생은 허용 버킷만 접근 가능
    if (request.user.role === 'student' && !STUDENT_ALLOWED_BUCKETS.has(bucket)) {
      return reply.status(403).send({ error: 'Permission denied for this bucket' });
    }

    try {
      const MAX_FILES = 100;
      const parts = request.files();
      const results: { url: string; fileName: string; fileSize: number; mimeType: string }[] = [];

      for await (const part of parts) {
        if (results.length >= MAX_FILES) {
          return reply.status(400).send({ error: `최대 ${MAX_FILES}개 파일만 업로드할 수 있습니다.` });
        }

        // 학생 업로드 MIME 타입 제한
        if (request.user.role === 'student' && !studentMimeAllowed(bucket, part.mimetype)) {
          return reply.status(400).send({ error: '허용되지 않은 파일 형식입니다.' });
        }

        const chunks: Buffer[] = [];
        for await (const chunk of part.file) {
          chunks.push(chunk);
        }
        const data = Buffer.concat(chunks);

        const timestamp = Date.now();
        const safeName = part.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
        const fileName = `${timestamp}_${safeName}`;

        const url = await uploadFile(bucket, directory, fileName, data);
        results.push({
          url,
          fileName: part.filename,
          fileSize: data.length,
          mimeType: part.mimetype,
        });
      }

      return results;
    } catch (err) {
      request.log.error({ err }, 'Multiple file upload failed');
      return reply.status(500).send({ error: '파일 업로드에 실패했습니다.' });
    }
  });

  // ─── GET /api/files/:bucket/* — 파일 서빙 ────

  app.get('/api/files/*', async (request, reply) => {
    const url = request.url;
    const prefix = '/api/files/';
    const rest = url.slice(prefix.length);

    // 쿼리 스트링 분리
    const qIdx = rest.indexOf('?');
    const pathPart = qIdx === -1 ? rest : rest.slice(0, qIdx);
    const download = (request.query as Record<string, string>).download === 'true';

    const slashIdx = pathPart.indexOf('/');
    if (slashIdx === -1) {
      return reply.status(400).send({ error: 'Invalid file path' });
    }

    const bucket = pathPart.slice(0, slashIdx);
    const filePath = pathPart.slice(slashIdx + 1);

    const result = await readFile(bucket, filePath);
    if (!result) {
      return reply.status(404).send({ error: 'File not found' });
    }

    // 파일명에 타임스탬프 포함 → immutable 캐시
    reply.header('Content-Type', result.mimeType);
    reply.header('Cache-Control', 'public, max-age=31536000, immutable');
    reply.header('X-Content-Type-Options', 'nosniff');

    // HTML 도구는 앱과 다른 origin(railway.app)에서 서빙되어 앱 origin과 cross-origin 격리된다.
    // sandbox 로 opaque origin('null')을 강제하면 도구 내부 postMessage/blob worker 가 깨지므로
    // 사용하지 않고, 대신 우리 앱에서만 frame 가능하도록 frame-ancestors 로 제한한다.
    // 또 cross-origin frame 을 막는 helmet 의 X-Frame-Options 를 이 응답에서만 해제한다.
    // (HTML 도구 버킷에 한정 — 학생이 제출한 .html 등은 아래 강제 다운로드 분기를 탄다.)
    if (result.mimeType === 'text/html' && HTML_ONLY_BUCKETS.has(bucket)) {
      reply.header(
        'Content-Security-Policy',
        "frame-ancestors https://class.chois.ai.kr http://localhost:3000",
      );
      reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
      // helmet 이 onRequest 에서 raw 응답에 직접 setHeader 하므로 reply.removeHeader 로는 안 지워진다.
      reply.raw.removeHeader('X-Frame-Options');
      reply.raw.removeHeader('Origin-Agent-Cluster');
    }

    // 제출 첨부(submission-files)는 임의 형식을 허용하므로, 앱 origin 에서 인라인 렌더 시
    // 스크립트가 실행될 수 있는 형식(HTML/SVG 등)은 강제 다운로드시킨다.
    // 안전한 래스터 이미지만 인라인 유지(첨부 썸네일 미리보기용).
    const forceDownload =
      download ||
      (bucket === 'submission-files' && !INLINE_SAFE_IMAGE_RE.test(result.mimeType));

    if (forceDownload) {
      // 타임스탬프 접두사 제거 (예: 1709712000000_report.pdf → report.pdf)
      const baseName = filePath.split('/').pop() || 'download';
      const originalName = baseName.replace(/^\d+_/, '');
      reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(originalName)}"`);
    }

    return reply.send(result.data);
  });

  // ─── DELETE /api/files/:bucket/* — 파일 삭제 ──

  app.delete('/api/files/*', {
    preHandler: [authenticate, requireRole('teacher')],
  }, async (request, reply) => {
    const url = request.url;
    const prefix = '/api/files/';
    const rest = url.slice(prefix.length);

    const slashIdx = rest.indexOf('/');
    if (slashIdx === -1) {
      return reply.status(400).send({ error: 'Invalid file path' });
    }

    const bucket = rest.slice(0, slashIdx);
    const filePath = rest.slice(slashIdx + 1);

    const deleted = await removeFile(bucket, filePath);
    if (!deleted) {
      return reply.status(404).send({ error: 'File not found' });
    }

    return reply.status(204).send();
  });
}
