import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleGuard.js';
import {
  getAssignmentsByClassroom,
  getAssignmentById,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  isAssignmentOwner,
  getAssignmentPages,
  getAssignmentPageById,
  createAssignmentPage,
  createAssignmentPages,
  deleteAssignmentPage,
  getSubmissionsByAssignment,
  getSubmissionCounts,
  getStudentSubmissions,
  upsertSubmission,
  reorderAssignmentPages,
  getAssignmentPageImageUrls,
  findSharedAssignmentImageUrls,
} from '../services/assignment.service.js';
import { isClassroomOwner } from '../services/classroom.service.js';
import { removeFile, urlToStoragePath, removeDirectoryIfEmpty, urlToParentDir } from '../services/storage.service.js';
import { getIO } from '../socket/index.js';
import { emitSubmissionUpdated } from '../socket/handlers/assignments.js';

export async function assignmentRoutes(app: FastifyInstance) {

  // ─── GET /api/classrooms/:cid/assignments — 과제 목록

  app.get<{ Params: { cid: string } }>('/api/classrooms/:cid/assignments', {
    preHandler: [authenticate],
  }, async (request) => {
    return getAssignmentsByClassroom(request.params.cid);
  });

  // ─── GET /api/assignments/:id — 과제 상세 ────

  app.get<{ Params: { id: string } }>('/api/assignments/:id', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const assignment = await getAssignmentById(request.params.id);
    if (!assignment) {
      return reply.status(404).send({ error: 'Assignment not found' });
    }
    return assignment;
  });

  // ─── POST /api/classrooms/:cid/assignments — 과제 생성

  app.post<{
    Params: { cid: string };
    Body: { title: string; description?: string; deadline?: string; maxScore?: number; position?: number };
  }>('/api/classrooms/:cid/assignments', {
    preHandler: [authenticate, requireRole('teacher')],
  }, async (request, reply) => {
    const { cid } = request.params;
    const isOwner = await isClassroomOwner(cid, request.user.sub);
    if (!isOwner) {
      return reply.status(403).send({ error: 'Not the classroom owner' });
    }

    const { title, description, deadline, maxScore, position } = request.body;
    if (!title?.trim()) {
      return reply.status(400).send({ error: 'Title is required' });
    }

    const assignment = await createAssignment({
      classroomId: cid,
      teacherId: request.user.sub,
      title: title.trim(),
      description,
      deadline: deadline ? new Date(deadline) : null,
      maxScore,
      position,
    });
    return reply.status(201).send(assignment);
  });

  // ─── PATCH /api/assignments/:id — 과제 수정 ──

  app.patch<{
    Params: { id: string };
    Body: { title?: string; description?: string; deadline?: string | null; maxScore?: number };
  }>('/api/assignments/:id', {
    preHandler: [authenticate, requireRole('teacher')],
  }, async (request, reply) => {
    const isOwner = await isAssignmentOwner(request.params.id, request.user.sub);
    if (!isOwner) {
      return reply.status(403).send({ error: 'Not the assignment owner' });
    }

    const { deadline, ...rest } = request.body;
    const data = {
      ...rest,
      ...(deadline !== undefined ? { deadline: deadline ? new Date(deadline) : null } : {}),
    };

    const updated = await updateAssignment(request.params.id, data);
    if (!updated) {
      return reply.status(404).send({ error: 'Assignment not found' });
    }
    return updated;
  });

  // ─── DELETE /api/assignments/:id — 과제 삭제 ──

  app.delete<{ Params: { id: string } }>('/api/assignments/:id', {
    preHandler: [authenticate, requireRole('teacher')],
  }, async (request, reply) => {
    const isOwner = await isAssignmentOwner(request.params.id, request.user.sub);
    if (!isOwner) {
      return reply.status(403).send({ error: 'Not the assignment owner' });
    }

    // Storage 파일 정리: orphan 이미지만 삭제 (다른 과제에서 공유되지 않는 것)
    const imageUrls = await getAssignmentPageImageUrls(request.params.id);
    const sharedUrls = await findSharedAssignmentImageUrls(imageUrls, request.params.id);
    const sharedSet = new Set(sharedUrls);
    const orphanUrls = imageUrls.filter((url) => !sharedSet.has(url));

    app.log.info({ assignmentId: request.params.id, total: imageUrls.length, shared: sharedUrls.length, orphans: orphanUrls.length }, 'Assignment storage cleanup');

    await deleteAssignment(request.params.id);

    // DB 삭제 후 orphan 파일 정리
    const deleteResults = await Promise.all(
      orphanUrls.map(async (url) => {
        const parsed = urlToStoragePath(url);
        if (!parsed) {
          app.log.warn({ url }, 'Failed to parse storage URL');
          return false;
        }
        const ok = await removeFile(parsed.bucket, parsed.path);
        if (!ok) app.log.warn({ bucket: parsed.bucket, path: parsed.path }, 'Failed to delete orphan file');
        return ok;
      }),
    );

    app.log.info({ deleted: deleteResults.filter(Boolean).length, failed: deleteResults.filter((r) => !r).length }, 'Assignment file cleanup result');

    // orphan 파일 삭제 후, 빈 디렉토리 정리
    if (orphanUrls.length > 0) {
      const parentDir = urlToParentDir(orphanUrls[0]);
      if (parentDir) {
        await removeDirectoryIfEmpty(parentDir.bucket, parentDir.dir);
      }
    }

    return reply.status(204).send();
  });

  // ─── GET /api/assignments/:id/pages — 과제 페이지 목록

  app.get<{ Params: { id: string } }>('/api/assignments/:id/pages', {
    preHandler: [authenticate],
  }, async (request) => {
    return getAssignmentPages(request.params.id);
  });

  // ─── POST /api/assignments/:id/pages — 과제 페이지 생성

  app.post<{
    Params: { id: string };
    Body: { imageUrl: string; position?: number };
  }>('/api/assignments/:id/pages', {
    preHandler: [authenticate, requireRole('teacher')],
  }, async (request, reply) => {
    const isOwner = await isAssignmentOwner(request.params.id, request.user.sub);
    if (!isOwner) {
      return reply.status(403).send({ error: 'Not the assignment owner' });
    }

    const page = await createAssignmentPage({
      assignmentId: request.params.id,
      imageUrl: request.body.imageUrl,
      position: request.body.position,
    });
    return reply.status(201).send(page);
  });

  // ─── DELETE /api/assignment-pages/:id — 과제 페이지 삭제

  app.delete<{ Params: { id: string } }>('/api/assignment-pages/:id', {
    preHandler: [authenticate, requireRole('teacher')],
  }, async (request, reply) => {
    const page = await getAssignmentPageById(request.params.id);
    if (!page) {
      return reply.status(404).send({ error: 'Assignment page not found' });
    }
    const isOwner = await isAssignmentOwner(page.assignmentId, request.user.sub);
    if (!isOwner) {
      return reply.status(403).send({ error: 'Not the assignment owner' });
    }
    await deleteAssignmentPage(request.params.id);
    return page;
  });

  // ─── PUT /api/assignment-pages/reorder — 과제 페이지 순서 변경

  app.put<{
    Body: { items: { id: string; position: number }[] };
  }>('/api/assignment-pages/reorder', {
    preHandler: [authenticate, requireRole('teacher')],
  }, async (request) => {
    await reorderAssignmentPages(request.body.items);
    return { ok: true };
  });

  // ─── POST /api/assignments/:id/import — 과제 복제 (import/export) ──

  app.post<{
    Params: { id: string };
    Body: { targetClassroomId: string };
  }>('/api/assignments/:id/import', {
    preHandler: [authenticate, requireRole('teacher')],
  }, async (request, reply) => {
    const sourceAssignment = await getAssignmentById(request.params.id);
    if (!sourceAssignment) {
      return reply.status(404).send({ error: 'Source assignment not found' });
    }

    // 소스 과제 소유권 확인
    if (sourceAssignment.teacherId !== request.user.sub) {
      return reply.status(403).send({ error: 'Not the source assignment owner' });
    }

    // 타겟 클래스룸 소유권 확인
    const isOwner = await isClassroomOwner(request.body.targetClassroomId, request.user.sub);
    if (!isOwner) {
      return reply.status(403).send({ error: 'Not the target classroom owner' });
    }

    // 소스 과제의 페이지 가져오기
    const sourcePages = await getAssignmentPages(sourceAssignment.id);

    // 새 과제 생성 (deadline은 null로 초기화)
    const newAssignment = await createAssignment({
      classroomId: request.body.targetClassroomId,
      teacherId: request.user.sub,
      title: sourceAssignment.title,
      description: sourceAssignment.description ?? undefined,
      deadline: null,
      maxScore: sourceAssignment.maxScore ?? undefined,
    });

    // 페이지 복제 (같은 imageUrl 공유)
    if (sourcePages.length > 0) {
      await createAssignmentPages(
        sourcePages.map((pg, idx) => ({
          assignmentId: newAssignment.id,
          imageUrl: pg.imageUrl,
          position: pg.position ?? idx,
        })),
      );
    }

    return reply.status(201).send(newAssignment);
  });

  // ─── GET /api/assignments/:id/submissions — 제출 목록 (교사만)

  app.get<{ Params: { id: string } }>('/api/assignments/:id/submissions', {
    preHandler: [authenticate, requireRole('teacher')],
  }, async (request) => {
    return getSubmissionsByAssignment(request.params.id);
  });

  // ─── GET /api/submissions/counts — 과제별 제출 수 (교사)

  app.get<{
    Querystring: { assignmentIds: string };
  }>('/api/submissions/counts', {
    preHandler: [authenticate, requireRole('teacher')],
  }, async (request, reply) => {
    const ids = request.query.assignmentIds?.split(',').filter(Boolean) ?? [];
    if (ids.length > 100) return reply.status(400).send({ error: 'Too many IDs (max 100)' });
    return getSubmissionCounts(ids);
  });

  // ─── GET /api/submissions/student — 학생 제출 상태 조회

  app.get<{
    Querystring: { assignmentIds: string };
  }>('/api/submissions/student', {
    preHandler: [authenticate, requireRole('student')],
  }, async (request, reply) => {
    const ids = request.query.assignmentIds?.split(',').filter(Boolean) ?? [];
    if (ids.length > 100) return reply.status(400).send({ error: 'Too many IDs (max 100)' });
    return getStudentSubmissions(request.user.sub, ids);
  });

  // ─── PUT /api/submissions/:assignmentId — 제출 upsert

  app.put<{
    Params: { assignmentId: string };
    Body: {
      studentId?: string;
      status?: string;
      isLate?: boolean;
      score?: number | null;
      maxScore?: number | null;
      rejectionComment?: string | null;
    };
  }>('/api/submissions/:assignmentId', {
    preHandler: [authenticate],
  }, async (request) => {
    // 교사가 채점/반려 시 body.studentId 사용, 학생 본인 제출 시 request.user.sub 사용
    const targetStudentId = request.body.studentId ?? request.user.sub;
    const { studentId: _ignore, ...bodyRest } = request.body;

    const result = await upsertSubmission({
      assignmentId: request.params.assignmentId,
      studentId: targetStudentId,
      ...bodyRest,
    });

    // Socket.IO 브로드캐스트
    try {
      const io = getIO();
      emitSubmissionUpdated(
        io,
        request.params.assignmentId,
        targetStudentId,
        result.status ?? 'draft',
        result.score,
      );
    } catch { /* Socket.IO 미초기화 시 무시 */ }

    return result;
  });
}
