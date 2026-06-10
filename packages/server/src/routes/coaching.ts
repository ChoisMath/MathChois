import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleGuard.js';
import { readFile, urlToStoragePath } from '../services/storage.service.js';
import { convertSolutionToLatex, reviewSolution, AI_MODEL_NAME } from '../services/ai.service.js';
import { createAttempt, listAttempts, listStudentHistory, listClassroomStudentHistory, getAttemptUsage, resetQuota, listPageStudents, COACHING_ATTEMPT_LIMIT } from '../services/coaching.service.js';
import { getPageById } from '../services/page.service.js';
import { getProblem, updateProblem } from '../services/problem.service.js';
import { isClassroomOwner, isClassroomMember } from '../services/classroom.service.js';

function imageMime(filePath: string): string {
  const ext = filePath.toLowerCase().split('.').pop() ?? '';
  return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' } as Record<string, string>)[ext] ?? 'image/png';
}

/** 코칭 SVG 검증: 자기완결적 <svg>만 허용, 스크립트·외부참조 차단(이미지로만 렌더). */
function sanitizeSvg(svg: string | null | undefined): string | null {
  if (!svg) return null;
  const s = svg.trim();
  if (!s.startsWith('<svg') || !s.includes('</svg>')) return null;
  if (/<script|on\w+\s*=|foreignObject|javascript:|<!ENTITY|xlink:href\s*=\s*["']?\s*http/i.test(s)) return null;
  if (s.length > 20000) return null;
  return s;
}

/** ai-coaching 버킷 이미지만 로드 */
async function loadWorkImage(imageUrl: string) {
  const parsed = urlToStoragePath(imageUrl);
  if (!parsed) throw Object.assign(new Error('잘못된 이미지 URL'), { statusCode: 400 });
  if (parsed.bucket !== 'ai-coaching') throw Object.assign(new Error('허용되지 않은 버킷'), { statusCode: 403 });
  const file = await readFile(parsed.bucket, parsed.path);
  if (!file) throw Object.assign(new Error('이미지를 찾을 수 없습니다'), { statusCode: 404 });
  return { base64: file.data.toString('base64'), mimeType: imageMime(parsed.path) };
}

export async function coachingRoutes(app: FastifyInstance) {
  const auth = { preHandler: [authenticate] };

  app.post<{ Body: { imageUrl: string; pageId: string } }>('/api/coaching/convert', auth, async (req, reply) => {
    const { imageUrl, pageId } = z.object({ imageUrl: z.string(), pageId: z.string() }).parse(req.body);
    const usage = await getAttemptUsage(req.user.sub, pageId);
    if (usage.used >= usage.limit) {
      return reply.status(429).send({ error: `AI 검토 횟수(${usage.limit}회)를 모두 사용했습니다. 선생님께 리셋을 요청하세요.` });
    }
    const { base64, mimeType } = await loadWorkImage(imageUrl);
    return convertSolutionToLatex(mimeType, base64);
  });

  app.post<{ Body: { pageId: string; workImageUrl: string; solutionLatex: string } }>(
    '/api/coaching/review', auth, async (req, reply) => {
    const { pageId, workImageUrl, solutionLatex } = z.object({
      pageId: z.string(), workImageUrl: z.string(), solutionLatex: z.string().min(1),
    }).parse(req.body);

    const usage = await getAttemptUsage(req.user.sub, pageId);
    if (usage.used >= usage.limit) {
      return reply.status(429).send({ error: `AI 검토 횟수(${usage.limit}회)를 모두 사용했습니다. 선생님께 리셋을 요청하세요.` });
    }

    const page = await getPageById(pageId);
    if (!page?.aiProblemId) return reply.status(400).send({ error: 'AI 코칭 페이지가 아닙니다' });
    // 정답·해설은 AI 검토에만 서버에서 사용 — 클라이언트로 반환되지 않음(attempt row에 미포함)
    const problem = await getProblem(page.aiProblemId);
    if (!problem) return reply.status(404).send({ error: '연결된 문항을 찾을 수 없습니다' });

    // 문제 단위 보조 그림 캐시: 있으면 재사용(AI 재생성 생략), 없고 새로 생성되면 문제에 저장
    const existingSvg = sanitizeSvg(problem.coachingSvg);

    const { base64, mimeType } = await loadWorkImage(workImageUrl);
    const analysis = await reviewSolution({
      problemLatex: problem.problemLatex,
      answer: problem.answer,
      solution: problem.solution,
      studentLatex: solutionLatex,
      workMimeType: mimeType,
      workBase64: base64,
      skipSvg: !!existingSvg,
    });

    const newSvg = existingSvg ?? sanitizeSvg(analysis.coachingSvg);
    if (!existingSvg && newSvg) {
      await updateProblem(page.aiProblemId, { coachingSvg: newSvg });
    }

    const attempt = await createAttempt({
      pageId,
      problemId: page.aiProblemId,
      studentId: req.user.sub,
      workImageUrl,
      solutionLatex,
      isCorrect: analysis.isCorrect,
      errorTags: analysis.errorTags ?? [],
      conceptTags: analysis.conceptTags ?? [],
      strengthNotes: analysis.strengthNotes,
      weaknessNotes: analysis.weaknessNotes,
      commentMarkdown: analysis.commentMarkdown,
      coachingSvg: newSvg,
      aiModel: AI_MODEL_NAME,
    });
    const after = await getAttemptUsage(req.user.sub, pageId);
    return { attempt, used: after.used, limit: after.limit, resetAt: after.resetAt };
  });

  app.get<{ Params: { pageId: string } }>('/api/coaching/pages/:pageId/attempts', auth, async (req) => {
    const attempts = await listAttempts(req.params.pageId, req.user.sub);
    const usage = await getAttemptUsage(req.user.sub, req.params.pageId);
    return { attempts, used: usage.used, limit: usage.limit, resetAt: usage.resetAt };
  });

  // 교사가 특정 학생의 페이지별 코칭 시도를 조회 (읽기 전용) — 클래스 소유·소속 검증
  app.get<{ Params: { classroomId: string; studentId: string; pageId: string } }>(
    '/api/coaching/classrooms/:classroomId/students/:studentId/pages/:pageId/attempts',
    { preHandler: [authenticate, requireRole('teacher')] },
    async (req, reply) => {
      const { classroomId, studentId, pageId } = req.params;
      if (!(await isClassroomOwner(classroomId, req.user.sub))) {
        return reply.status(403).send({ error: '이 클래스의 담당 교사가 아닙니다' });
      }
      if (!(await isClassroomMember(classroomId, studentId))) {
        return reply.status(403).send({ error: '이 클래스의 학생이 아닙니다' });
      }
      const attempts = await listAttempts(pageId, studentId);
      const usage = await getAttemptUsage(studentId, pageId);
      return { attempts, used: usage.used, limit: usage.limit, resetAt: usage.resetAt };
    },
  );

  app.get('/api/coaching/history', auth, async (req) => {
    const q = req.query as Record<string, string>;
    return listStudentHistory(req.user.sub, {
      from: q.from, to: q.to,
      page: q.page ? parseInt(q.page, 10) : undefined,
      pageSize: q.pageSize ? parseInt(q.pageSize, 10) : undefined,
    });
  });

  app.get<{ Params: { classroomId: string; studentId: string } }>(
    '/api/coaching/classrooms/:classroomId/students/:studentId/history',
    { preHandler: [authenticate, requireRole('teacher')] },
    async (req, reply) => {
      const { classroomId, studentId } = req.params;
      if (!(await isClassroomOwner(classroomId, req.user.sub))) {
        return reply.status(403).send({ error: '이 클래스의 담당 교사가 아닙니다' });
      }
      if (!(await isClassroomMember(classroomId, studentId))) {
        return reply.status(403).send({ error: '이 클래스의 학생이 아닙니다' });
      }
      const q = req.query as Record<string, string>;
      return listClassroomStudentHistory(classroomId, studentId, {
        from: q.from, to: q.to,
        page: q.page ? parseInt(q.page, 10) : undefined,
        pageSize: q.pageSize ? parseInt(q.pageSize, 10) : undefined,
      });
    },
  );

  // 교사: 학생의 페이지 횟수 리셋(reset_at = now). attempt 기록은 보존.
  app.post<{ Params: { classroomId: string; studentId: string; pageId: string } }>(
    '/api/coaching/classrooms/:classroomId/students/:studentId/pages/:pageId/reset',
    { preHandler: [authenticate, requireRole('teacher')] },
    async (req, reply) => {
      const { classroomId, studentId, pageId } = req.params;
      if (!(await isClassroomOwner(classroomId, req.user.sub))) {
        return reply.status(403).send({ error: '이 클래스의 담당 교사가 아닙니다' });
      }
      if (!(await isClassroomMember(classroomId, studentId))) {
        return reply.status(403).send({ error: '이 클래스의 학생이 아닙니다' });
      }
      await resetQuota(studentId, pageId);
      const usage = await getAttemptUsage(studentId, pageId);
      return { used: usage.used, limit: usage.limit, resetAt: usage.resetAt };
    },
  );

  // 교사: 해당 페이지에 시도한 학생 목록 + 각자 사용 횟수.
  app.get<{ Params: { classroomId: string; pageId: string } }>(
    '/api/coaching/classrooms/:classroomId/pages/:pageId/students',
    { preHandler: [authenticate, requireRole('teacher')] },
    async (req, reply) => {
      const { classroomId, pageId } = req.params;
      if (!(await isClassroomOwner(classroomId, req.user.sub))) {
        return reply.status(403).send({ error: '이 클래스의 담당 교사가 아닙니다' });
      }
      return listPageStudents(pageId);
    },
  );
}
