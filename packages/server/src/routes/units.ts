import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { UNIT_TITLE_MAX, UNIT_DESCRIPTION_MAX } from '@mathchois/shared';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleGuard.js';
import { isClassroomOwner, isClassroomMember } from '../services/classroom.service.js';
import * as svc from '../services/unit.service.js';

/** 교실 소유 교사 또는 소속 학생인지 — 단원 목록 접근 가드 (classroomVideos.ts 와 같은 규칙) */
async function canAccessClassroom(req: FastifyRequest, classroomId: string): Promise<boolean> {
  if (req.user.role === 'teacher') return isClassroomOwner(classroomId, req.user.sub);
  if (req.user.role === 'student') return isClassroomMember(classroomId, req.user.sub);
  return false;
}

const titleSchema = z.string().trim().min(1, '단원 이름을 입력하세요').max(UNIT_TITLE_MAX, `단원 이름은 ${UNIT_TITLE_MAX}자 이하로 입력하세요`);
// 빈 문자열은 null 로 저장한다.
const descriptionSchema = z.string().trim()
  .max(UNIT_DESCRIPTION_MAX, `설명은 ${UNIT_DESCRIPTION_MAX}자 이하로 입력하세요`)
  .nullable().optional()
  .transform((v) => (v == null || v === '' ? null : v));

const createBody = z.object({
  title: titleSchema,
  description: descriptionSchema,
  isHidden: z.boolean().optional(),
});
const patchBody = z.object({
  title: titleSchema.optional(),
  description: z.string().trim()
    .max(UNIT_DESCRIPTION_MAX, `설명은 ${UNIT_DESCRIPTION_MAX}자 이하로 입력하세요`)
    .nullable().optional()
    .transform((v) => (v === undefined ? undefined : v === null || v === '' ? null : v)),
  isHidden: z.boolean().optional(),
});
const itemsBody = z.object({
  chapterIds: z.array(z.string().uuid()).max(200).optional(),
  classroomVideoIds: z.array(z.string().uuid()).max(200).optional(),
});
const reorderBody = z.object({ ids: z.array(z.string().uuid()) });

/** zod 실패 → 400 { error: 첫 issue message }. 성공이면 파싱된 값, 실패면 응답을 보내고 null. */
function parseBody<S extends z.ZodType>(schema: S, body: unknown, reply: FastifyReply): z.output<S> | null {
  const r = schema.safeParse(body);
  if (r.success) return r.data;
  reply.status(400).send({ error: r.error.issues[0]?.message ?? '요청 형식이 올바르지 않습니다.' });
  return null;
}

export async function unitRoutes(app: FastifyInstance) {
  const auth = { preHandler: [authenticate] };
  const teacher = { preHandler: [authenticate, requireRole('teacher')] };

  /** 교사용: 단원을 불러와 소유권 확인. 없으면 404, 소유자가 아니면 403. */
  async function loadOwnedUnit(req: FastifyRequest, reply: FastifyReply, id: string) {
    const unit = await svc.getUnitById(id);
    if (!unit) {
      reply.status(404).send({ error: '단원을 찾을 수 없습니다' });
      return null;
    }
    if (!(await isClassroomOwner(unit.classroomId, req.user.sub))) {
      reply.status(403).send({ error: '접근 권한이 없습니다' });
      return null;
    }
    return unit;
  }

  app.get<{ Params: { cid: string } }>('/api/classrooms/:cid/units', auth, async (req, reply) => {
    if (!(await canAccessClassroom(req, req.params.cid))) {
      return reply.status(403).send({ error: '접근 권한이 없습니다' });
    }
    return svc.listUnits(req.params.cid, { includeHidden: req.user.role !== 'student' });
  });

  app.post<{ Params: { cid: string } }>('/api/classrooms/:cid/units', teacher, async (req, reply) => {
    if (!(await isClassroomOwner(req.params.cid, req.user.sub))) {
      return reply.status(403).send({ error: '교실 소유자만 단원을 만들 수 있습니다' });
    }
    const body = parseBody(createBody, req.body, reply);
    if (!body) return;
    const unit = await svc.createUnit(req.params.cid, {
      title: body.title,
      description: body.description ?? null,
      isHidden: body.isHidden ?? false,
    });
    return reply.status(201).send(unit);
  });

  app.put<{ Params: { cid: string } }>('/api/classrooms/:cid/units/reorder', teacher, async (req, reply) => {
    if (!(await isClassroomOwner(req.params.cid, req.user.sub))) {
      return reply.status(403).send({ error: '교실 소유자만 순서를 바꿀 수 있습니다' });
    }
    const body = parseBody(reorderBody, req.body, reply);
    if (!body) return;
    const ok = await svc.reorderUnits(req.params.cid, body.ids);
    if (!ok) return reply.status(400).send({ error: '단원 목록이 올바르지 않습니다' });
    return { ok: true };
  });

  app.patch<{ Params: { id: string } }>('/api/units/:id', teacher, async (req, reply) => {
    const unit = await loadOwnedUnit(req, reply, req.params.id);
    if (!unit) return;
    const body = parseBody(patchBody, req.body, reply);
    if (!body) return;
    const updated = await svc.updateUnit(unit.id, body);
    if (!updated) return reply.status(404).send({ error: '단원을 찾을 수 없습니다' });
    return updated;
  });

  // 챕터·학급영상을 이 단원으로 한꺼번에 옮긴다(가져오기). 하나라도 이 학급의 항목이 아니면 전부 취소.
  app.post<{ Params: { id: string } }>('/api/units/:id/items', teacher, async (req, reply) => {
    const unit = await loadOwnedUnit(req, reply, req.params.id);
    if (!unit) return;
    const body = parseBody(itemsBody, req.body, reply);
    if (!body) return;
    const ok = await svc.assignItemsToUnit(unit.id, unit.classroomId, {
      chapterIds: body.chapterIds ?? [],
      classroomVideoIds: body.classroomVideoIds ?? [],
    });
    if (!ok) return reply.status(400).send({ error: '이 학급의 항목이 아닙니다' });
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>('/api/units/:id', teacher, async (req, reply) => {
    const unit = await loadOwnedUnit(req, reply, req.params.id);
    if (!unit) return;
    await svc.deleteUnit(unit.id);
    return reply.status(204).send();
  });
}
