import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleGuard.js';
import { isClassroomOwner, isClassroomMember } from '../services/classroom.service.js';
import {
  getClassroomGroups, replaceClassroomGroups, autoDistributeClassroomGroups,
} from '../services/classroomGroup.service.js';

const groupsBodySchema = z.object({
  groups: z.array(z.object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(30),
    position: z.number().int().min(0),
    studentIds: z.array(z.string().uuid()).max(200),
  })).max(30),
});

/** 학급 기본 모둠 — 화이트보드 페이지 생성 시 복사되는 출발점 */
export async function classroomGroupRoutes(app: FastifyInstance) {

  // ─── GET /api/classrooms/:id/groups ──────────────
  app.get<{ Params: { id: string } }>('/api/classrooms/:id/groups', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const { sub, role } = request.user;
    const ok = role === 'teacher' ? await isClassroomOwner(id, sub) : await isClassroomMember(id, sub);
    if (!ok) return reply.status(403).send({ error: 'Access denied' });
    return getClassroomGroups(id);
  });

  // ─── PUT /api/classrooms/:id/groups — 전체 교체 (교사) ──
  app.put<{ Params: { id: string } }>('/api/classrooms/:id/groups', {
    preHandler: [authenticate, requireRole('teacher')],
  }, async (request, reply) => {
    const { id } = request.params;
    if (!(await isClassroomOwner(id, request.user.sub))) {
      return reply.status(403).send({ error: 'Not the classroom owner' });
    }
    const parsed = groupsBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: '잘못된 모둠 데이터입니다.' });
    return replaceClassroomGroups(id, parsed.data.groups);
  });

  // ─── POST /api/classrooms/:id/groups/auto — 자동 배분 (교사) ──
  app.post<{ Params: { id: string } }>('/api/classrooms/:id/groups/auto', {
    preHandler: [authenticate, requireRole('teacher')],
  }, async (request, reply) => {
    const { id } = request.params;
    if (!(await isClassroomOwner(id, request.user.sub))) {
      return reply.status(403).send({ error: 'Not the classroom owner' });
    }
    const parsed = z.object({ count: z.number().int().min(1).max(30) }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: '모둠 수는 1~30 사이여야 합니다.' });
    return autoDistributeClassroomGroups(id, parsed.data.count);
  });
}
