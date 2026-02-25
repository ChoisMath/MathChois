import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleGuard.js';
import {
  getTeacherClassrooms,
  getStudentClassrooms,
  getClassroomById,
  createClassroom,
  updateClassroom,
  deleteClassroom,
  getOtherClassrooms,
  getClassroomMembers,
  joinClassroomByCode,
  removeClassroomMember,
  isClassroomOwner,
} from '../services/classroom.service.js';

export async function classroomRoutes(app: FastifyInstance) {

  // ─── GET /api/classrooms — 교실 목록 ─────────

  app.get('/api/classrooms', {
    preHandler: [authenticate],
  }, async (request) => {
    const { sub, role } = request.user;
    if (role === 'teacher') {
      return getTeacherClassrooms(sub);
    }
    return getStudentClassrooms(sub);
  });

  // ─── POST /api/classrooms — 교실 생성 ────────

  app.post<{
    Body: { name: string };
  }>('/api/classrooms', {
    preHandler: [authenticate, requireRole('teacher')],
  }, async (request, reply) => {
    const { name } = request.body;
    if (!name?.trim()) {
      return reply.status(400).send({ error: 'Name is required' });
    }
    const classroom = await createClassroom(request.user.sub, name.trim());
    return reply.status(201).send(classroom);
  });

  // ─── POST /api/classrooms/join — 코드로 참가 ──
  // ⚠️ /join은 /:id 보다 먼저 등록해야 Fastify가 'join'을 :id로 캡처하지 않음

  app.post<{
    Body: { code: string };
  }>('/api/classrooms/join', {
    preHandler: [authenticate, requireRole('student')],
  }, async (request, reply) => {
    const { code } = request.body;
    if (!code?.trim()) {
      return reply.status(400).send({ error: 'Code is required' });
    }
    const result = await joinClassroomByCode(request.user.sub, code);
    if (result.error) {
      return reply.status(400).send({ error: result.error });
    }
    return result;
  });

  // ─── GET /api/classrooms/other/:excludeId — 다른 교실 목록 (import/export)
  // ⚠️ /other/:excludeId도 /:id 보다 먼저 등록

  app.get<{ Params: { excludeId: string } }>('/api/classrooms/other/:excludeId', {
    preHandler: [authenticate, requireRole('teacher')],
  }, async (request) => {
    return getOtherClassrooms(request.user.sub, request.params.excludeId);
  });

  // ─── GET /api/classrooms/:id — 교실 상세 ─────

  app.get<{ Params: { id: string } }>('/api/classrooms/:id', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const classroom = await getClassroomById(request.params.id);
    if (!classroom) {
      return reply.status(404).send({ error: 'Classroom not found' });
    }
    return classroom;
  });

  // ─── PATCH /api/classrooms/:id — 교실 수정 ───

  app.patch<{
    Params: { id: string };
    Body: { name?: string };
  }>('/api/classrooms/:id', {
    preHandler: [authenticate, requireRole('teacher')],
  }, async (request, reply) => {
    const isOwner = await isClassroomOwner(request.params.id, request.user.sub);
    if (!isOwner) {
      return reply.status(403).send({ error: 'Not the classroom owner' });
    }
    const updated = await updateClassroom(request.params.id, request.body);
    if (!updated) {
      return reply.status(404).send({ error: 'Classroom not found' });
    }
    return updated;
  });

  // ─── DELETE /api/classrooms/:id — 교실 삭제 ──

  app.delete<{ Params: { id: string } }>('/api/classrooms/:id', {
    preHandler: [authenticate, requireRole('teacher')],
  }, async (request, reply) => {
    const isOwner = await isClassroomOwner(request.params.id, request.user.sub);
    if (!isOwner) {
      return reply.status(403).send({ error: 'Not the classroom owner' });
    }
    await deleteClassroom(request.params.id);
    return reply.status(204).send();
  });

  // ─── GET /api/classrooms/:id/members — 멤버 ──

  app.get<{ Params: { id: string } }>('/api/classrooms/:id/members', {
    preHandler: [authenticate],
  }, async (request) => {
    return getClassroomMembers(request.params.id);
  });

  // ─── DELETE /api/classrooms/:id/members/:studentId

  app.delete<{
    Params: { id: string; studentId: string };
  }>('/api/classrooms/:id/members/:studentId', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { id, studentId } = request.params;
    const { sub, role } = request.user;

    // 교사(소유자)이거나 본인이 탈퇴하는 경우만 허용
    if (role === 'teacher') {
      const isOwner = await isClassroomOwner(id, sub);
      if (!isOwner) return reply.status(403).send({ error: 'Not the classroom owner' });
    } else if (sub !== studentId) {
      return reply.status(403).send({ error: 'Cannot remove other students' });
    }

    await removeClassroomMember(id, studentId);
    return reply.status(204).send();
  });
}
