import type { FastifyInstance } from 'fastify';
import { isClassroomColor, pickLeastUsedColor } from '@mathchois/shared';
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
  getClassroomImageUrls,
  findSharedClassroomImageUrls,
} from '../services/classroom.service.js';
import { getChaptersByClassroom, getLinkedChapterIds } from '../services/chapter.service.js';
import { removeFile, urlToStoragePath, removeDirectoryIfEmpty, urlToParentDir } from '../services/storage.service.js';

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
    Body: { name: string; color?: string };
  }>('/api/classrooms', {
    preHandler: [authenticate, requireRole('teacher')],
  }, async (request, reply) => {
    const { name, color } = request.body;
    if (!name?.trim()) {
      return reply.status(400).send({ error: 'Name is required' });
    }
    // color 가 null/undefined 면 "안 보냄"으로 보고 검증하지 않는다
    if (color != null && !isClassroomColor(color)) {
      return reply.status(400).send({ error: 'Invalid color' });
    }
    // 색을 안 보내면 이 교사의 학급에서 가장 덜 쓰인 색
    const finalColor = color ?? pickLeastUsedColor(await getTeacherClassrooms(request.user.sub));
    const classroom = await createClassroom(request.user.sub, name.trim(), finalColor);
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
    Body: { name?: string; color?: string };
  }>('/api/classrooms/:id', {
    preHandler: [authenticate, requireRole('teacher')],
  }, async (request, reply) => {
    const isOwner = await isClassroomOwner(request.params.id, request.user.sub);
    if (!isOwner) {
      return reply.status(403).send({ error: 'Not the classroom owner' });
    }
    // 본문 통째 전달 금지 — teacherId·classCode 등은 무시하고 name/color 만 반영
    const { name, color } = request.body ?? {};
    if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
      return reply.status(400).send({ error: 'Name is required' });
    }
    if (color !== undefined && !isClassroomColor(color)) {
      return reply.status(400).send({ error: 'Invalid color' });
    }
    const patch = {
      ...(name !== undefined && { name: name.trim() }),
      ...(color !== undefined && { color }),
    };
    if (Object.keys(patch).length === 0) {
      return reply.status(400).send({ error: 'Nothing to update' });
    }
    const updated = await updateClassroom(request.params.id, patch);
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

    // source 챕터가 다른 교실의 linked 챕터에 연결되어 있으면 삭제 차단
    const chaptersInClassroom = await getChaptersByClassroom(request.params.id);
    const sourceChaptersWithLinks = chaptersInClassroom.filter(
      (ch) => !ch.sourceChapterId, // source 챕터만 (linked가 아닌 것)
    );
    // 각 source 챕터가 외부 linked를 가지고 있는지 확인 (getChaptersByClassroom은 이미 페이지를 포함)
    // → linked 챕터는 sourceChapterId가 이 교실의 챕터 중 하나를 가리킴
    if (sourceChaptersWithLinks.length > 0) {
      for (const ch of sourceChaptersWithLinks) {
        const linkedIds = await getLinkedChapterIds(ch.id);
        if (linkedIds.length > 0) {
          return reply.status(403).send({
            error: '이 교실의 챕터를 공유하는 다른 학급이 있어 삭제할 수 없습니다. 공유된 챕터를 먼저 삭제하세요.',
            linkedChapterIds: linkedIds,
          });
        }
      }
    }

    // Storage 파일 정리: orphan 이미지만 삭제 (다른 교실에서 공유되지 않는 것)
    const imageUrls = await getClassroomImageUrls(request.params.id);
    const sharedUrls = await findSharedClassroomImageUrls(imageUrls, request.params.id);
    const sharedSet = new Set(sharedUrls);
    const orphanUrls = imageUrls.filter((url) => !sharedSet.has(url));

    app.log.info({ classroomId: request.params.id, total: imageUrls.length, shared: sharedUrls.length, orphans: orphanUrls.length }, 'Classroom storage cleanup');

    await deleteClassroom(request.params.id);

    // DB 삭제 후 orphan 파일 정리
    if (orphanUrls.length > 0) {
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

      app.log.info({ deleted: deleteResults.filter(Boolean).length, failed: deleteResults.filter((r) => !r).length }, 'Classroom file cleanup result');

      // 빈 디렉토리 정리 (챕터/과제 디렉토리별)
      const parentDirs = new Set<string>();
      for (const url of orphanUrls) {
        const parentDir = urlToParentDir(url);
        if (parentDir) {
          parentDirs.add(`${parentDir.bucket}|${parentDir.dir}`);
        }
      }
      for (const key of parentDirs) {
        const [bucket, dir] = key.split('|');
        await removeDirectoryIfEmpty(bucket, dir);
      }
    }

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
