import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import {
  getTeacherStudentComment,
  upsertTeacherStudentComment,
  getAssignmentTeacherComment,
  upsertAssignmentTeacherComment,
} from '../services/note.service.js';
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
    return upsertTeacherStudentComment(
      request.user.sub,
      request.params.studentId,
      request.params.pageId,
      request.body.excalidrawData,
    );
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
    return upsertAssignmentTeacherComment(
      request.user.sub,
      request.params.studentId,
      request.params.pageId,
      request.body.excalidrawData,
    );
  });
}
