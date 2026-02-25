import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { getIO } from '../socket/index.js';
import { emitStudentNoteUpdated } from '../socket/handlers/notes.js';
import {
  getStudentNote,
  upsertStudentNote,
  getStudentNotesBulk,
  getChapterStudentSummary,
  getTeacherNote,
  upsertTeacherNote,
  getAssignmentNote,
  upsertAssignmentNote,
} from '../services/note.service.js';
import { getPagesByChapter } from '../services/page.service.js';
import { getChapterById } from '../services/chapter.service.js';
import type { ExcalidrawData } from '@mathchois/shared';

export async function noteRoutes(app: FastifyInstance) {

  // ─── Student Notes ────────────────────────────

  /** GET /api/notes/student/:pageId — 학생 본인 필기 */
  app.get<{ Params: { pageId: string } }>('/api/notes/student/:pageId', {
    preHandler: [authenticate],
  }, async (request) => {
    return getStudentNote(request.user.sub, request.params.pageId);
  });

  /** PUT /api/notes/student/:pageId — 학생 필기 upsert */
  app.put<{
    Params: { pageId: string };
    Body: { excalidrawData: ExcalidrawData; chapterId?: string };
  }>('/api/notes/student/:pageId', {
    preHandler: [authenticate],
  }, async (request) => {
    const result = await upsertStudentNote(
      request.user.sub,
      request.params.pageId,
      request.body.excalidrawData,
    );

    // Socket.IO 브로드캐스트 (chapterId가 있으면 chapter room에도 emit)
    try {
      const io = getIO();
      if (request.body.chapterId) {
        emitStudentNoteUpdated(
          io,
          request.body.chapterId,
          request.params.pageId,
          request.user.sub,
          result.updatedAt!,
        );
      }
    } catch { /* Socket.IO 미초기화 시 무시 */ }

    return result;
  });

  /** GET /api/notes/student-bulk — 복수 페이지 필기 일괄 조회 */
  app.get<{
    Querystring: { pageIds: string };
  }>('/api/notes/student-bulk', {
    preHandler: [authenticate],
  }, async (request) => {
    const ids = request.query.pageIds?.split(',').filter(Boolean) ?? [];
    return getStudentNotesBulk(request.user.sub, ids);
  });

  /** GET /api/notes/student-summary/:chapterId — 챕터 학생 진도 요약 */
  app.get<{ Params: { chapterId: string } }>('/api/notes/student-summary/:chapterId', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const chapter = await getChapterById(request.params.chapterId);
    if (!chapter) {
      return reply.status(404).send({ error: 'Chapter not found' });
    }
    const pages = await getPagesByChapter(chapter.id);
    const pageIds = pages.map((p) => p.id);
    return getChapterStudentSummary(chapter.classroomId, pageIds);
  });

  // ─── Teacher Notes ────────────────────────────

  /** GET /api/notes/teacher/:pageId — 교사 필기 */
  app.get<{ Params: { pageId: string } }>('/api/notes/teacher/:pageId', {
    preHandler: [authenticate],
  }, async (request) => {
    return getTeacherNote(request.user.sub, request.params.pageId);
  });

  /** PUT /api/notes/teacher/:pageId — 교사 필기 upsert */
  app.put<{
    Params: { pageId: string };
    Body: { excalidrawData: ExcalidrawData };
  }>('/api/notes/teacher/:pageId', {
    preHandler: [authenticate],
  }, async (request) => {
    return upsertTeacherNote(
      request.user.sub,
      request.params.pageId,
      request.body.excalidrawData,
    );
  });

  // ─── Assignment Notes ─────────────────────────

  /** GET /api/assignment-notes/:assignmentId/:pageId — 과제 학생 필기 */
  app.get<{
    Params: { assignmentId: string; pageId: string };
  }>('/api/assignment-notes/:assignmentId/:pageId', {
    preHandler: [authenticate],
  }, async (request) => {
    return getAssignmentNote(
      request.params.assignmentId,
      request.params.pageId,
      request.user.sub,
    );
  });

  /** PUT /api/assignment-notes/:assignmentId/:pageId — 과제 학생 필기 upsert */
  app.put<{
    Params: { assignmentId: string; pageId: string };
    Body: { excalidrawData: ExcalidrawData };
  }>('/api/assignment-notes/:assignmentId/:pageId', {
    preHandler: [authenticate],
  }, async (request) => {
    return upsertAssignmentNote(
      request.params.assignmentId,
      request.params.pageId,
      request.user.sub,
      request.body.excalidrawData,
    );
  });
}
