import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/roleGuard.js';
import {
  getAllUsers,
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

export async function adminRoutes(app: FastifyInstance) {

  // ─── GET /api/admin/users — 전체 사용자 목록 ──────

  app.get('/api/admin/users', {
    preHandler: [authenticate, requireAdmin],
  }, async () => {
    return getAllUsers();
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
    const updated = await updateUserRole(request.params.id, role);
    if (!updated) {
      return reply.status(404).send({ error: 'User not found' });
    }
    return updated;
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
