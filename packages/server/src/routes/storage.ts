import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleGuard.js';
import { uploadFile, readFile, removeFile } from '../services/storage.service.js';

export async function storageRoutes(app: FastifyInstance) {

  // ─── POST /api/files/upload — 파일 업로드 ─────

  app.post<{
    Querystring: { bucket: string; directory: string };
  }>('/api/files/upload', {
    preHandler: [authenticate, requireRole('teacher')],
  }, async (request, reply) => {
    const { bucket, directory } = request.query;

    if (!bucket || !directory) {
      return reply.status(400).send({ error: 'bucket and directory are required' });
    }

    const file = await request.file();
    if (!file) {
      return reply.status(400).send({ error: 'No file uploaded' });
    }

    const chunks: Buffer[] = [];
    for await (const chunk of file.file) {
      chunks.push(chunk);
    }
    const data = Buffer.concat(chunks);

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
  });

  // ─── POST /api/files/upload-multiple — 복수 파일 업로드

  app.post<{
    Querystring: { bucket: string; directory: string };
  }>('/api/files/upload-multiple', {
    preHandler: [authenticate, requireRole('teacher')],
  }, async (request, reply) => {
    const { bucket, directory } = request.query;

    if (!bucket || !directory) {
      return reply.status(400).send({ error: 'bucket and directory are required' });
    }

    const parts = request.files();
    const results: { url: string; fileName: string; fileSize: number; mimeType: string }[] = [];

    for await (const part of parts) {
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

    if (download) {
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
