import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleGuard.js';
import { isClassroomOwner } from '../services/classroom.service.js';
import { getClassroomDashboard } from '../services/dashboard.service.js';

export async function dashboardRoutes(app: FastifyInstance) {
  app.get<{ Params: { classroomId: string } }>(
    '/api/dashboard/classrooms/:classroomId',
    { preHandler: [authenticate, requireRole('teacher')] },
    async (req, reply) => {
      const { classroomId } = req.params;
      if (!(await isClassroomOwner(classroomId, req.user.sub))) {
        return reply.status(403).send({ error: '이 클래스의 담당 교사가 아닙니다' });
      }
      return getClassroomDashboard(classroomId);
    },
  );
}
