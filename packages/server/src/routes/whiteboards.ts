import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleGuard.js';
import { canTeacherAccessPageClassroom, canStudentAccessPageClassroom } from '../services/pageAccess.service.js';
import {
  ensurePageBoards, getPageView, replacePageGroups, updatePageSettings, updateGroup,
  getBoardRow, getBoardAccess, resetBoard, restorePrevious, getBoardIdsForPage,
} from '../services/whiteboard.service.js';
import {
  emitBoardScene, emitBoardLock, emitPageSettings, dropBoards, applyTemplateAtomic,
  getBoardUsers, getBoardSceneFromMemory,
} from '../socket/handlers/whiteboard.js';
import { getProfileName } from '../services/whiteboard.service.js';
import type { WbElement } from '@mathchois/shared';

const classroomQuerySchema = z.object({ classroomId: z.string().uuid() });

/** 쿼리의 classroomId 와 (페이지, 학급) 접근 권한 확인 */
async function resolvePageClassroom(request: FastifyRequest<{ Params: { pageId: string } }>, reply: FastifyReply): Promise<string | null> {
  const parsed = classroomQuerySchema.safeParse(request.query);
  if (!parsed.success) { reply.status(400).send({ error: 'classroomId query is required' }); return null; }
  const { classroomId } = parsed.data;
  const { pageId } = request.params;
  const { sub, role } = request.user;
  const ok = role === 'teacher'
    ? await canTeacherAccessPageClassroom(sub, pageId, classroomId)
    : role === 'student' ? await canStudentAccessPageClassroom(sub, pageId, classroomId) : false;
  if (!ok) { reply.status(403).send({ error: 'Access denied' }); return null; }
  return classroomId;
}

const groupsBodySchema = z.object({
  groups: z.array(z.object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(30),
    position: z.number().int().min(0),
    studentIds: z.array(z.string().uuid()).max(200),
  })).min(1).max(30),
});

export async function whiteboardRoutes(app: FastifyInstance) {

  // ─── GET /api/whiteboards/page/:pageId?classroomId= — 페이지 뷰 (지연 생성) ──
  app.get<{ Params: { pageId: string } }>('/api/whiteboards/page/:pageId', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const classroomId = await resolvePageClassroom(request, reply);
    if (!classroomId) return;
    const { pageId } = request.params;
    await ensurePageBoards(pageId, classroomId);
    return getPageView(pageId, classroomId, request.user);
  });

  // ─── PUT /api/whiteboards/page/:pageId/groups — 페이지별 배정 교체 (교사) ──
  app.put<{ Params: { pageId: string } }>('/api/whiteboards/page/:pageId/groups', {
    preHandler: [authenticate, requireRole('teacher')],
  }, async (request, reply) => {
    const classroomId = await resolvePageClassroom(request, reply);
    if (!classroomId) return;
    const parsed = groupsBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: '잘못된 모둠 데이터입니다.' });
    const { pageId } = request.params;
    await ensurePageBoards(pageId, classroomId);
    const removed = await replacePageGroups(pageId, classroomId, parsed.data.groups);
    if (removed.length > 0) dropBoards(removed);
    return getPageView(pageId, classroomId, request.user);
  });

  // ─── PATCH /api/whiteboards/page/:pageId/settings — 열람 허용 / 전체 잠금 (교사) ──
  app.patch<{ Params: { pageId: string } }>('/api/whiteboards/page/:pageId/settings', {
    preHandler: [authenticate, requireRole('teacher')],
  }, async (request, reply) => {
    const classroomId = await resolvePageClassroom(request, reply);
    if (!classroomId) return;
    const parsed = z.object({
      allowCrossGroupView: z.boolean().optional(),
      lockedAll: z.boolean().optional(),
    }).safeParse(request.body);
    if (!parsed.success || Object.keys(parsed.data).length === 0) {
      return reply.status(400).send({ error: 'Invalid body' });
    }
    const { pageId } = request.params;
    const settings = await updatePageSettings(pageId, classroomId, parsed.data);
    const boardIds = await getBoardIdsForPage(pageId, classroomId);
    emitPageSettings(boardIds, pageId, classroomId, settings);
    return settings;
  });

  // ─── GET /api/whiteboards/groups/:gid — 보드 장면 ──
  app.get<{ Params: { gid: string } }>('/api/whiteboards/groups/:gid', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { gid } = request.params;
    const access = await getBoardAccess(gid, request.user);
    if (!access?.canRead) return reply.status(403).send({ error: 'Access denied' });
    const row = await getBoardRow(gid);
    if (!row) return reply.status(404).send({ error: 'Board not found' });
    const mem = getBoardSceneFromMemory(gid);
    return {
      id: row.id, pageId: row.pageId, classroomId: row.classroomId, name: row.name,
      locked: row.locked, hasPrevious: row.hasPrevious,
      backgroundColor: mem?.backgroundColor ?? row.backgroundColor,
      scene: mem?.scene ?? row.scene,
      users: getBoardUsers(gid),
    };
  });

  // ─── PATCH /api/whiteboards/groups/:gid — 이름 / 잠금 (교사) ──
  app.patch<{ Params: { gid: string } }>('/api/whiteboards/groups/:gid', {
    preHandler: [authenticate, requireRole('teacher')],
  }, async (request, reply) => {
    const { gid } = request.params;
    const access = await getBoardAccess(gid, request.user);
    if (!access?.canWrite) return reply.status(403).send({ error: 'Access denied' });
    const parsed = z.object({
      name: z.string().trim().min(1).max(30).optional(),
      locked: z.boolean().optional(),
    }).safeParse(request.body);
    if (!parsed.success || Object.keys(parsed.data).length === 0) {
      return reply.status(400).send({ error: 'Invalid body' });
    }
    const row = await updateGroup(gid, parsed.data);
    if (!row) return reply.status(404).send({ error: 'Board not found' });
    if (parsed.data.locked !== undefined) emitBoardLock(gid, parsed.data.locked);
    return { id: row.id, name: row.name, locked: row.locked };
  });

  // ─── POST /api/whiteboards/groups/:gid/reset — 비우기 (교사) ──
  app.post<{ Params: { gid: string } }>('/api/whiteboards/groups/:gid/reset', {
    preHandler: [authenticate, requireRole('teacher')],
  }, async (request, reply) => {
    const { gid } = request.params;
    const access = await getBoardAccess(gid, request.user);
    if (!access?.canWrite) return reply.status(403).send({ error: 'Access denied' });
    const row = await resetBoard(gid);
    if (!row) return reply.status(404).send({ error: 'Board not found' });
    emitBoardScene(gid, row.scene, row.backgroundColor, 'reset');
    return { ok: true, hasPrevious: row.hasPrevious };
  });

  // ─── POST /api/whiteboards/groups/:gid/restore-previous — 직전 상태로 (교사) ──
  app.post<{ Params: { gid: string } }>('/api/whiteboards/groups/:gid/restore-previous', {
    preHandler: [authenticate, requireRole('teacher')],
  }, async (request, reply) => {
    const { gid } = request.params;
    const access = await getBoardAccess(gid, request.user);
    if (!access?.canWrite) return reply.status(403).send({ error: 'Access denied' });
    const before = await getBoardRow(gid);
    if (!before) return reply.status(404).send({ error: 'Board not found' });
    if (!before.hasPrevious) return reply.status(409).send({ error: '되돌릴 직전 상태가 없습니다.' });
    const row = await restorePrevious(gid);
    if (!row) return reply.status(404).send({ error: 'Board not found' });
    emitBoardScene(gid, row.scene, row.backgroundColor, 'restore');
    return { ok: true, hasPrevious: row.hasPrevious };
  });

  // ─── POST /api/whiteboards/groups/:gid/apply-template — 빈 보드에만 원자 적용 ──
  app.post<{ Params: { gid: string } }>('/api/whiteboards/groups/:gid/apply-template', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { gid } = request.params;
    const access = await getBoardAccess(gid, request.user);
    if (!access?.canWrite) return reply.status(403).send({ error: 'Access denied' });
    if (!access.isTeacher && (access.locked || access.lockedAll)) {
      return reply.status(423).send({ error: '잠긴 보드입니다.' });
    }
    const parsed = z.object({
      elements: z.array(z.record(z.unknown())).min(1).max(600),
    }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid body' });
    const elements = parsed.data.elements.filter((el) =>
      typeof el.id === 'string' && typeof el.version === 'number' && typeof el.versionNonce === 'number',
    ) as unknown as WbElement[];
    if (elements.length === 0) return reply.status(400).send({ error: 'Invalid elements' });
    const name = await getProfileName(request.user.sub);
    const applied = await applyTemplateAtomic(gid, elements, { id: request.user.sub, name });
    return { applied };
  });
}
