import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleGuard.js';
import {
  getChaptersByClassroom,
  getChapterById,
  createChapter,
  updateChapter,
  deleteChapter,
  reorderChapters,
  getChapterClassroomId,
} from '../services/chapter.service.js';
import { getPagesByChapter, createPages, getPageImageUrls, findSharedImageUrls } from '../services/page.service.js';
import { isClassroomOwner } from '../services/classroom.service.js';
import { removeFile, urlToStoragePath } from '../services/storage.service.js';

export async function chapterRoutes(app: FastifyInstance) {

  // ─── GET /api/classrooms/:cid/chapters — 챕터 목록 ───

  app.get<{ Params: { cid: string } }>('/api/classrooms/:cid/chapters', {
    preHandler: [authenticate],
  }, async (request) => {
    return getChaptersByClassroom(request.params.cid);
  });

  // ─── GET /api/chapters/:id — 챕터 상세 ────────

  app.get<{ Params: { id: string } }>('/api/chapters/:id', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const chapter = await getChapterById(request.params.id);
    if (!chapter) {
      return reply.status(404).send({ error: 'Chapter not found' });
    }
    return chapter;
  });

  // ─── POST /api/classrooms/:cid/chapters — 챕터 생성 ──

  app.post<{
    Params: { cid: string };
    Body: { title: string; description?: string; position?: number };
  }>('/api/classrooms/:cid/chapters', {
    preHandler: [authenticate, requireRole('teacher')],
  }, async (request, reply) => {
    const { cid } = request.params;
    const isOwner = await isClassroomOwner(cid, request.user.sub);
    if (!isOwner) {
      return reply.status(403).send({ error: 'Not the classroom owner' });
    }

    const { title, description, position } = request.body;
    if (!title?.trim()) {
      return reply.status(400).send({ error: 'Title is required' });
    }

    const chapter = await createChapter({
      classroomId: cid,
      title: title.trim(),
      description: description?.trim() || null,
      position,
    });
    return reply.status(201).send(chapter);
  });

  // ─── PATCH /api/chapters/:id — 챕터 수정 ─────

  app.patch<{
    Params: { id: string };
    Body: { title?: string; description?: string };
  }>('/api/chapters/:id', {
    preHandler: [authenticate, requireRole('teacher')],
  }, async (request, reply) => {
    const classroomId = await getChapterClassroomId(request.params.id);
    if (!classroomId) {
      return reply.status(404).send({ error: 'Chapter not found' });
    }
    const isOwner = await isClassroomOwner(classroomId, request.user.sub);
    if (!isOwner) {
      return reply.status(403).send({ error: 'Not the classroom owner' });
    }

    const updated = await updateChapter(request.params.id, request.body);
    return updated;
  });

  // ─── DELETE /api/chapters/:id — 챕터 삭제 ─────

  app.delete<{ Params: { id: string } }>('/api/chapters/:id', {
    preHandler: [authenticate, requireRole('teacher')],
  }, async (request, reply) => {
    const classroomId = await getChapterClassroomId(request.params.id);
    if (!classroomId) {
      return reply.status(404).send({ error: 'Chapter not found' });
    }
    const isOwner = await isClassroomOwner(classroomId, request.user.sub);
    if (!isOwner) {
      return reply.status(403).send({ error: 'Not the classroom owner' });
    }

    // Storage 파일 정리: orphan 이미지만 삭제 (다른 챕터에서 공유되지 않는 것)
    const imageUrls = await getPageImageUrls(request.params.id);
    const sharedUrls = await findSharedImageUrls(imageUrls, request.params.id);
    const sharedSet = new Set(sharedUrls);
    const orphanUrls = imageUrls.filter((url) => !sharedSet.has(url));

    await deleteChapter(request.params.id);

    // DB 삭제 후 파일 정리 (실패해도 무시 — 고아 파일은 치명적이지 않음)
    await Promise.all(
      orphanUrls.map((url) => {
        const parsed = urlToStoragePath(url);
        if (parsed) return removeFile(parsed.bucket, parsed.path);
      }),
    );

    return reply.status(204).send();
  });

  // ─── PUT /api/chapters/reorder — 순서 일괄 변경 ───

  app.put<{
    Body: { items: { id: string; position: number }[] };
  }>('/api/chapters/reorder', {
    preHandler: [authenticate, requireRole('teacher')],
  }, async (request) => {
    await reorderChapters(request.body.items);
    return { ok: true };
  });

  // ─── POST /api/chapters/:id/import — 챕터 복제 (import/export) ──

  app.post<{
    Params: { id: string };
    Body: { targetClassroomId: string };
  }>('/api/chapters/:id/import', {
    preHandler: [authenticate, requireRole('teacher')],
  }, async (request, reply) => {
    const sourceChapter = await getChapterById(request.params.id);
    if (!sourceChapter) {
      return reply.status(404).send({ error: 'Source chapter not found' });
    }

    const isOwner = await isClassroomOwner(request.body.targetClassroomId, request.user.sub);
    if (!isOwner) {
      return reply.status(403).send({ error: 'Not the target classroom owner' });
    }

    // 소스 챕터의 페이지 가져오기
    const sourcePages = await getPagesByChapter(sourceChapter.id);

    // 새 챕터 생성
    const newChapter = await createChapter({
      classroomId: request.body.targetClassroomId,
      title: sourceChapter.title,
      description: sourceChapter.description,
    });

    // 페이지 복제 (같은 image_url 공유)
    if (sourcePages.length > 0) {
      await createPages(
        sourcePages.map((pg) => ({
          chapterId: newChapter.id,
          imageUrl: pg.imageUrl,
          position: pg.position,
        })),
      );
    }

    return reply.status(201).send(newChapter);
  });
}
