import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleGuard.js';
import { readFile, urlToStoragePath } from '../services/storage.service.js';
import { convertSolutionToLatex, reviewSolution, AI_MODEL_NAME } from '../services/ai.service.js';
import { createAttempt, listAttempts, listStudentHistory, listClassroomStudentHistory } from '../services/coaching.service.js';
import { getPageById } from '../services/page.service.js';
import { getProblem } from '../services/problem.service.js';
import { isClassroomOwner, isClassroomMember } from '../services/classroom.service.js';

function imageMime(filePath: string): string {
  const ext = filePath.toLowerCase().split('.').pop() ?? '';
  return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' } as Record<string, string>)[ext] ?? 'image/png';
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

  app.post<{ Body: { imageUrl: string } }>('/api/coaching/convert', auth, async (req) => {
    const { imageUrl } = z.object({ imageUrl: z.string() }).parse(req.body);
    const { base64, mimeType } = await loadWorkImage(imageUrl);
    return convertSolutionToLatex(mimeType, base64);
  });

  app.post<{ Body: { pageId: string; workImageUrl: string; solutionLatex: string } }>(
    '/api/coaching/review', auth, async (req, reply) => {
    const { pageId, workImageUrl, solutionLatex } = z.object({
      pageId: z.string(), workImageUrl: z.string(), solutionLatex: z.string().min(1),
    }).parse(req.body);

    const page = await getPageById(pageId);
    if (!page?.aiProblemId) return reply.status(400).send({ error: 'AI 코칭 페이지가 아닙니다' });
    // 정답·해설은 AI 검토에만 서버에서 사용 — 클라이언트로 반환되지 않음(attempt row에 미포함)
    const problem = await getProblem(page.aiProblemId);
    if (!problem) return reply.status(404).send({ error: '연결된 문항을 찾을 수 없습니다' });

    const { base64, mimeType } = await loadWorkImage(workImageUrl);
    const analysis = await reviewSolution({
      problemLatex: problem.problemLatex,
      answer: problem.answer,
      solution: problem.solution,
      studentLatex: solutionLatex,
      workMimeType: mimeType,
      workBase64: base64,
    });

    return createAttempt({
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
      aiModel: AI_MODEL_NAME,
    });
  });

  app.get<{ Params: { pageId: string } }>('/api/coaching/pages/:pageId/attempts', auth, async (req) => {
    return listAttempts(req.params.pageId, req.user.sub);
  });

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
}
