import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import {
  getTeacherStudentComment,
  upsertTeacherStudentComment,
  getAssignmentTeacherComment,
  upsertAssignmentTeacherComment,
} from '../services/note.service.js';
import { getIO } from '../socket/index.js';
import { emitTeacherCommentUpdated } from '../socket/handlers/comments.js';
import { emitAssignmentCommentUpdated } from '../socket/handlers/assignments.js';
import type { ExcalidrawData } from '@mathchois/shared';

export async function commentRoutes(app: FastifyInstance) {

  // ─── Teacher-Student Comments ─────────────────

  /** GET /api/comments/:pageId/:studentId — 교사 코멘트 조회 */
  app.get<{
    Params: { pageId: string; studentId: string };
  }>('/api/comments/:pageId/:studentId', {
    preHandler: [authenticate],
  }, async (request) => {
    return getTeacherStudentComment(
      request.user.sub,
      request.params.studentId,
      request.params.pageId,
    );
  });

  /** PUT /api/comments/:pageId/:studentId — 교사 코멘트 upsert */
  app.put<{
    Params: { pageId: string; studentId: string };
    Body: { excalidrawData: ExcalidrawData };
  }>('/api/comments/:pageId/:studentId', {
    preHandler: [authenticate],
  }, async (request) => {
    const result = await upsertTeacherStudentComment(
      request.user.sub,
      request.params.studentId,
      request.params.pageId,
      request.body.excalidrawData,
    );

    // Socket.IO 브로드캐스트
    try {
      const io = getIO();
      emitTeacherCommentUpdated(
        io,
        request.params.pageId,
        request.params.studentId,
        result.updatedAt!,
      );
    } catch { /* Socket.IO 미초기화 시 무시 */ }

    return result;
  });

  // ─── Assignment Teacher Comments ──────────────

  /** GET /api/assignment-comments/:pageId/:studentId — 과제 교사 코멘트 조회 */
  app.get<{
    Params: { pageId: string; studentId: string };
  }>('/api/assignment-comments/:pageId/:studentId', {
    preHandler: [authenticate],
  }, async (request) => {
    return getAssignmentTeacherComment(
      request.params.pageId,
      request.params.studentId,
    );
  });

  /** PUT /api/assignment-comments/:pageId/:studentId — 과제 교사 코멘트 upsert */
  app.put<{
    Params: { pageId: string; studentId: string };
    Body: { excalidrawData: ExcalidrawData };
  }>('/api/assignment-comments/:pageId/:studentId', {
    preHandler: [authenticate],
  }, async (request) => {
    const result = await upsertAssignmentTeacherComment(
      request.user.sub,
      request.params.studentId,
      request.params.pageId,
      request.body.excalidrawData,
    );

    // Socket.IO 브로드캐스트
    try {
      const io = getIO();
      emitAssignmentCommentUpdated(
        io,
        request.params.pageId,
        request.params.studentId,
        result.updatedAt!,
      );
    } catch { /* Socket.IO 미초기화 시 무시 */ }

    return result;
  });
}
