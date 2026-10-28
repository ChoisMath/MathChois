import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/roleGuard.js';
import {
  getAllUsers,
  getTeachersWithStudents,
  updateUserRole,
  setUserAdmin,
  deleteUser,
  getUserDetail,
  getClassroomOverview,
  getSystemStats,
  resetAllData,
  resetUserData,
} from '../services/admin.service.js';
import { getProfileById, setMustResetPassword, updateProfileName } from '../services/auth.service.js';
import {
  listAllowedTeachers,
  addAllowedTeachers,
  removeAllowedTeacher,
  getAllowedTeacherById,
} from '../services/access.service.js';
import { parseEmailList, EMAIL_LIST_MAX } from '@mathchois/shared';
import { getStorageInfo } from '../services/storageInfo.service.js';

export async function adminRoutes(app: FastifyInstance) {

  // ─── GET /api/admin/users — 전체 사용자 목록 ──────

  app.get('/api/admin/users', {
    preHandler: [authenticate, requireAdmin],
  }, async () => {
    return getAllUsers();
  });

  // ─── GET /api/admin/teachers-with-students — 교사→클래스→학생 계층 ──

  app.get('/api/admin/teachers-with-students', {
    preHandler: [authenticate, requireAdmin],
  }, async () => {
    return getTeachersWithStudents();
  });

  // ─── GET /api/admin/users/:id/detail — 사용자 상세 ──

  app.get<{ Params: { id: string } }>('/api/admin/users/:id/detail', {
    preHandler: [authenticate, requireAdmin],
  }, async (request, reply) => {
    const detail = await getUserDetail(request.params.id);
    if (!detail) {
      return reply.status(404).send({ error: 'User not found' });
    }
    return detail;
  });

  // ─── PATCH /api/admin/users/:id/role — 역할 변경 ──

  app.patch<{
    Params: { id: string };
    Body: { role: 'teacher' | 'student' };
  }>('/api/admin/users/:id/role', {
    preHandler: [authenticate, requireAdmin],
  }, async (request, reply) => {
    const { role } = request.body;
    if (role !== 'teacher' && role !== 'student') {
      return reply.status(400).send({ error: 'Invalid role (teacher or student)' });
    }
    const target = await getProfileById(request.params.id);
    if (!target) {
      return reply.status(404).send({ error: 'User not found' });
    }
    // 관리자는 교사이자 관리자 — 학생으로 내리려면 먼저 관리자 권한을 해제해야 한다
    if (target.isAdmin && role === 'student') {
      return reply.status(400).send({ error: '관리자는 항상 교사입니다. 먼저 관리자 권한을 해제해 주세요.' });
    }
    const updated = await updateUserRole(request.params.id, role, request.user.sub);
    if (!updated) {
      return reply.status(404).send({ error: 'User not found' });
    }
    return updated;
  });

  // ─── 교사 허용 목록 — 여기 등록된 이메일만 교사로 로그인할 수 있다 ─────

  // GET /api/admin/allowed-teachers — 목록(+ 가입한 계정)
  app.get('/api/admin/allowed-teachers', {
    preHandler: [authenticate, requireAdmin],
  }, async () => {
    return listAllowedTeachers();
  });

  // POST /api/admin/allowed-teachers — 이메일 여러 개 등록. 형식이 아닌 항목은 invalid 로 돌려주고 나머지는 처리한다.
  app.post<{ Body: { emails?: string[] | string } }>('/api/admin/allowed-teachers', {
    preHandler: [authenticate, requireAdmin],
  }, async (request, reply) => {
    const parsed = parseEmailList(request.body?.emails ?? '');
    if (parsed.tooMany) {
      return reply.status(400).send({ error: `한 번에 ${EMAIL_LIST_MAX}개까지 등록할 수 있습니다.` });
    }
    if (parsed.valid.length === 0) {
      return reply.status(400).send({ error: '등록할 이메일을 입력해 주세요.', invalid: parsed.invalid });
    }
    const result = await addAllowedTeachers(parsed.valid, request.user.sub);
    return reply.status(201).send({ ...result, invalid: parsed.invalid });
  });

  // DELETE /api/admin/allowed-teachers/:id — 목록에서 빼면 그 계정은 바로 학생이 된다(관리자 계정 제외)
  app.delete<{ Params: { id: string } }>('/api/admin/allowed-teachers/:id', {
    preHandler: [authenticate, requireAdmin],
  }, async (request, reply) => {
    const entry = await getAllowedTeacherById(request.params.id);
    if (!entry) {
      return reply.status(404).send({ error: 'Not found' });
    }
    const me = await getProfileById(request.user.sub);
    if (me?.email && me.email.toLowerCase() === entry.email) {
      return reply.status(400).send({ error: '자기 자신은 교사 목록에서 뺄 수 없습니다.' });
    }
    await removeAllowedTeacher(entry.id);
    return reply.status(204).send();
  });

  // ─── PATCH /api/admin/users/:id/admin — 관리자 토글 ──

  app.patch<{
    Params: { id: string };
    Body: { isAdmin: boolean };
  }>('/api/admin/users/:id/admin', {
    preHandler: [authenticate, requireAdmin],
  }, async (request, reply) => {
    // 자기 자신의 관리자 해제 방지
    if (request.params.id === request.user.sub && !request.body.isAdmin) {
      return reply.status(400).send({ error: '자기 자신의 관리자 권한은 해제할 수 없습니다.' });
    }
    const updated = await setUserAdmin(request.params.id, request.body.isAdmin);
    if (!updated) {
      return reply.status(404).send({ error: 'User not found' });
    }
    return updated;
  });

  // ─── DELETE /api/admin/users/:id — 사용자 삭제 ─────

  app.delete<{ Params: { id: string } }>('/api/admin/users/:id', {
    preHandler: [authenticate, requireAdmin],
  }, async (request, reply) => {
    // 자기 자신 삭제 방지
    if (request.params.id === request.user.sub) {
      return reply.status(400).send({ error: '자기 자신은 삭제할 수 없습니다.' });
    }
    const deleted = await deleteUser(request.params.id);
    if (!deleted) {
      return reply.status(404).send({ error: 'User not found' });
    }
    return { success: true };
  });

  // ─── POST /api/admin/users/:id/reset — 사용자 데이터 초기화 ──

  app.post<{ Params: { id: string } }>('/api/admin/users/:id/reset', {
    preHandler: [authenticate, requireAdmin],
  }, async (request, reply) => {
    try {
      const result = await resetUserData(request.params.id);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return reply.status(400).send({ error: message });
    }
  });

  // ─── GET /api/admin/classrooms — 전체 클래스룸 개요 ──

  app.get('/api/admin/classrooms', {
    preHandler: [authenticate, requireAdmin],
  }, async () => {
    return getClassroomOverview();
  });

  // ─── GET /api/admin/stats — 시스템 통계 ────────────

  app.get('/api/admin/stats', {
    preHandler: [authenticate, requireAdmin],
  }, async () => {
    return getSystemStats();
  });

  // ─── GET /api/admin/storage-info — Volume 진단 (경로 출처·버킷별 파일 수·누락 파일) ─────
  // "시각화자료가 안 보인다" 같은 문제를 Railway CLI 없이 확인하기 위한 엔드포인트.

  app.get('/api/admin/storage-info', {
    preHandler: [authenticate, requireAdmin],
  }, async () => {
    return getStorageInfo();
  });

  // ─── POST /api/admin/reset — 전체 데이터 초기화 ─────

  app.post('/api/admin/reset', {
    preHandler: [authenticate, requireAdmin],
  }, async () => {
    return resetAllData();
  });

  // ─── POST /api/admin/users/:id/reset-password — 비밀번호 초기화 ──

  app.post<{ Params: { id: string } }>('/api/admin/users/:id/reset-password', {
    preHandler: [authenticate, requireAdmin],
  }, async (request, reply) => {
    // authMethod 먼저 확인 (Google 계정에 플래그 설정 방지)
    const profile = await getProfileById(request.params.id);
    if (!profile) {
      return reply.status(404).send({ error: 'User not found' });
    }
    if (profile.authMethod !== 'email') {
      return reply.status(400).send({ error: 'Google 계정은 비밀번호 초기화가 불가합니다.' });
    }
    await setMustResetPassword(request.params.id);
    return { success: true };
  });

  // ─── PATCH /api/admin/users/:id/name — 사용자 이름 변경 ──

  app.patch<{
    Params: { id: string };
    Body: { name: string };
  }>('/api/admin/users/:id/name', {
    preHandler: [authenticate, requireAdmin],
  }, async (request, reply) => {
    const { name } = request.body ?? {};
    if (!name || !name.trim()) {
      return reply.status(400).send({ error: '이름을 입력해 주세요.' });
    }
    const updated = await updateProfileName(request.params.id, name.trim());
    if (!updated) {
      return reply.status(404).send({ error: 'User not found' });
    }
    return updated;
  });
}
