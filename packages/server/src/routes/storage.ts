import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Readable } from 'node:stream';
import { isAiHubPublicFile } from '@mathchois/shared';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleGuard.js';
import { uploadFile, removeFile, statFile, openFileStream, aiHubRelPath } from '../services/storage.service.js';
import { env } from '../config/env.js';
import { checkUploadPolicy, HTML_ONLY_BUCKETS, INLINE_SAFE_IMAGE_RE } from '../utils/uploadPolicy.js';

// 프로덕션 앱 도메인. (구 도메인 class.chois.ai.kr → class.chois.pro 로 이전됨)
export const APP_ORIGIN = 'https://class.chois.pro';

/**
 * HTML 도구 iframe 의 frame-ancestors 허용 목록.
 * 도메인이 코드에 하드코딩되어 있으면 도메인 이전 시 모든 시각화자료 iframe 이 조용히 차단된다
 * (브라우저가 CSP 위반으로 빈 화면만 표시). env 로 확장 가능하게 하고 기본값에 현재 도메인을 둔다.
 */
export function buildFrameAncestors(): string {
  const origins = new Set<string>([APP_ORIGIN, 'http://localhost:3000']);
  if (env.APP_URL) {
    try { origins.add(new URL(env.APP_URL).origin); } catch { /* 잘못된 APP_URL 은 무시 */ }
  }
  for (const o of (env.FRAME_ANCESTORS ?? '').split(/\s+/).filter(Boolean)) origins.add(o);
  return `frame-ancestors ${[...origins].join(' ')}`;
}

// AI활용 허브 버킷은 토큰 보호 업로드 API(PUT /api/ai/media)로만 쓴다.
// 일반 쓰기·삭제 라우트에서는 막고, 읽기는 모션·슬라이드 미디어와 manifest 만 허용한다(isAiHubPublicFile).
// 버킷 이름 문자열만 비교하면 `x/../ai-hub` 나 directory 의 `..` 로 우회되므로 실제로 해석된 경로로 본다(aiHubRelPath).
const AI_HUB_WRITE_DENIED = { error: 'This bucket is managed by the AI hub upload API' };
function touchesAiHub(...segments: string[]): boolean {
  return aiHubRelPath(...segments) !== null;
}

// 학생 업로드 허용 버킷
const STUDENT_ALLOWED_BUCKETS = new Set(['submission-files', 'ai-coaching', 'whiteboard-files']);

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

// 업로드 파일명에서 경로/파일시스템 위험 문자만 제거하고 유니코드(한글 등)는 보존한다.
// busboy 가 이미 basename 처리하지만 방어적으로 경로 분리자·예약 문자·선후행 점을 정리한다.
export function sanitizeFileName(name: string): string {
  const cleaned = name
    .replace(/[/\\]/g, '_') // 경로 분리자
    .replace(/[\x00-\x1f<>:"|?*]/g, '_') // 제어문자 + 파일시스템 예약문자(Windows)
    .replace(/^\.+/, '') // 선행 점 (숨김/traversal)
    .replace(/[ .]+$/, ''); // 후행 공백/점 (Windows 는 저장 시 잘림)
  return cleaned || 'file';
}

// RFC 5987/6266: 비ASCII(한글) 파일명을 브라우저가 복원하도록 ASCII fallback(filename=)과
// UTF-8 인코딩(filename*=)을 함께 제공한다. encodeURIComponent 가 남기는 '()* 도 마저 인코딩한다.
function contentDispositionAttachment(filename: string): string {
  const asciiFallback = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  );
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

// HTTP 요청 경로의 percent-encoding 을 해제한다. 저장된 파일명에 한글이 포함되면
// 브라우저가 요청 시 인코딩하므로 디스크 경로와 매칭하려면 디코딩이 필요하다.
function decodePath(p: string): string {
  try {
    return decodeURIComponent(p);
  } catch {
    return p; // 잘못된 인코딩은 원본 유지 (readFile 에서 404 처리)
  }
}

/**
 * HTTP Range 헤더 파서 (`bytes=start-end` 단일 범위만 지원 — 브라우저 <video> 가 쓰는 형태).
 * 반환: 유효 범위 / null(헤더 없음·형식 불일치 → 전체 응답) / 'unsatisfiable'(416)
 */
export function parseRange(header: string | undefined, size: number):
  { start: number; end: number } | null | 'unsatisfiable' {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const [, startStr, endStr] = m;
  if (startStr === '' && endStr === '') return null;
  let start: number;
  let end: number;
  if (startStr === '') {
    // suffix range: 마지막 N 바이트
    const suffix = Number(endStr);
    if (suffix === 0) return 'unsatisfiable';
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(startStr);
    end = endStr === '' ? size - 1 : Math.min(Number(endStr), size - 1);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
    return 'unsatisfiable';
  }
  return { start, end };
}

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

    if (touchesAiHub(bucket, directory)) return reply.status(403).send(AI_HUB_WRITE_DENIED);

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

      // 버킷별 MIME/용량 정책 (HTML 전용·PDF 전용·화이트보드)
      const policy = checkUploadPolicy(bucket, file.mimetype, data.length);
      if (!policy.ok) return reply.status(policy.status).send({ error: policy.error });

      const timestamp = Date.now();
      const safeName = sanitizeFileName(file.filename);
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

    if (touchesAiHub(bucket, directory)) return reply.status(403).send(AI_HUB_WRITE_DENIED);

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

        // 버킷별 MIME/용량 정책 (HTML 전용·PDF 전용·화이트보드)
        const policy = checkUploadPolicy(bucket, part.mimetype, data.length);
        if (!policy.ok) return reply.status(policy.status).send({ error: policy.error });

        const timestamp = Date.now();
        const safeName = sanitizeFileName(part.filename);
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

  // ─── GET/HEAD /api/files/:bucket/* — 파일 서빙 (스트리밍 + Range) ────
  // 파일 전체를 Buffer 로 읽지 않고 스트리밍한다. 영상(<video>)은 탐색·배속을 위해
  // HTTP Range(206) 가 필요하며, 큰 파일도 메모리를 점유하지 않는다.

  const serveFile = async (request: FastifyRequest, reply: FastifyReply) => {
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
    const filePath = decodePath(pathPart.slice(slashIdx + 1));

    // ai-hub 는 모션·슬라이드 미디어와 manifest 만 여기서 서빙한다. 브랜드 사본(제3자 HTML·JS)이 앱 origin 에서
    // 열리면 그 스크립트가 로그인 쿠키로 /api 를 부를 수 있으므로 404 — 브랜드는 /api/ai/brand/site/* 로만 나간다.
    const aiHubRel = aiHubRelPath(bucket, filePath);
    if (aiHubRel !== null && !isAiHubPublicFile(aiHubRel)) {
      return reply.status(404).send({ error: 'File not found' });
    }

    const stat = await statFile(bucket, filePath);
    if (!stat) {
      return reply.status(404).send({ error: 'File not found' });
    }

    // 파일명에 타임스탬프 포함 → immutable 캐시
    reply.header('Content-Type', stat.mimeType);
    reply.header('Cache-Control', 'public, max-age=31536000, immutable');
    if (aiHubRel !== null) {
      // ai-hub 파일은 같은 이름으로 덮어써지므로 ?v=<sha 앞 8자> 가 붙은 주소만 오래 캐시한다.
      if (!(request.query as Record<string, string>).v) reply.header('Cache-Control', 'private, no-cache');
      reply.header('X-Robots-Tag', 'noindex');
    }
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Accept-Ranges', 'bytes');

    // HTML 도구는 앱과 다른 origin(railway.app)에서 서빙되어 앱 origin과 cross-origin 격리된다.
    // sandbox 로 opaque origin('null')을 강제하면 도구 내부 postMessage/blob worker 가 깨지므로
    // 사용하지 않고, 대신 우리 앱에서만 frame 가능하도록 frame-ancestors 로 제한한다.
    // 또 cross-origin frame 을 막는 helmet 의 X-Frame-Options 를 이 응답에서만 해제한다.
    // (HTML 도구 버킷에 한정 — 학생이 제출한 .html 등은 아래 강제 다운로드 분기를 탄다.)
    if (stat.mimeType === 'text/html' && HTML_ONLY_BUCKETS.has(bucket)) {
      reply.header('Content-Security-Policy', buildFrameAncestors());
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
      (bucket === 'submission-files' && !INLINE_SAFE_IMAGE_RE.test(stat.mimeType));

    if (forceDownload) {
      // 타임스탬프 접두사 제거 (예: 1709712000000_report.pdf → report.pdf)
      const baseName = filePath.split('/').pop() || 'download';
      const originalName = baseName.replace(/^\d+_/, '');
      reply.header('Content-Disposition', contentDispositionAttachment(originalName));
    }

    const range = parseRange(request.headers.range, stat.size);
    if (range === 'unsatisfiable') {
      reply.header('Content-Range', `bytes */${stat.size}`);
      return reply.status(416).send();
    }

    if (range) {
      reply.status(206);
      reply.header('Content-Range', `bytes ${range.start}-${range.end}/${stat.size}`);
      reply.header('Content-Length', range.end - range.start + 1);
    } else {
      reply.header('Content-Length', stat.size);
    }

    if (request.method === 'HEAD') {
      // Fastify 자동 HEAD 는 payload 가 undefined 면 Content-Length 를 0 으로 덮어쓴다.
      // 빈 스트림을 보내면 위에서 설정한 길이·Range 헤더가 유지되고 파일은 읽지 않는다.
      return reply.send(Readable.from([]));
    }
    return reply.send(openFileStream(bucket, filePath, range ?? undefined));
  };

  // HEAD 는 Fastify 가 GET 에서 자동 노출(exposeHeadRoutes)한다 — 핸들러 안의 method 분기로 본문만 생략.
  app.get('/api/files/*', serveFile);

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
    const filePath = decodePath(rest.slice(slashIdx + 1));

    if (touchesAiHub(bucket, filePath)) return reply.status(403).send(AI_HUB_WRITE_DENIED);

    const deleted = await removeFile(bucket, filePath);
    if (!deleted) {
      return reply.status(404).send({ error: 'File not found' });
    }

    return reply.status(204).send();
  });
}
