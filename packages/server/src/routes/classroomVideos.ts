import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleGuard.js';
import { isClassroomOwner, isClassroomMember } from '../services/classroom.service.js';
import { getVideoById } from '../services/video.service.js';
import * as svc from '../services/classroomVideo.service.js';
import { getIO } from '../socket/index.js';
import { emitVideoCommentChanged } from '../socket/handlers/videos.js';

/** 교실 소유 교사 또는 소속 학생인지 — 학급 영상/댓글 공통 접근 가드 */
async function canAccessClassroom(req: FastifyRequest, classroomId: string): Promise<boolean> {
  if (req.user.role === 'teacher') return isClassroomOwner(classroomId, req.user.sub);
  if (req.user.role === 'student') return isClassroomMember(classroomId, req.user.sub);
  return false;
}

async function loadClassroomVideoOr404(req: FastifyRequest, reply: FastifyReply, id: string) {
  const cv = await svc.getClassroomVideoById(id);
  if (!cv) {
    reply.status(404).send({ error: '학급 영상을 찾을 수 없습니다' });
    return null;
  }
  if (!(await canAccessClassroom(req, cv.classroomId))) {
    reply.status(403).send({ error: '접근 권한이 없습니다' });
    return null;
  }
  return cv;
}

const commentBody = z.object({
  content: z.string().trim().min(1).max(5000),
  parentId: z.string().uuid().nullable().optional(),
  isPrivate: z.boolean().optional(),
  timestampSec: z.number().int().nonnegative().nullable().optional(),
});

function safeEmit(classroomVideoId: string) {
  try { emitVideoCommentChanged(getIO(), classroomVideoId); } catch { /* 소켓 미초기화(테스트 등) */ }
}

export async function classroomVideoRoutes(app: FastifyInstance) {
  const auth = { preHandler: [authenticate] };
  const teacher = { preHandler: [authenticate, requireRole('teacher')] };

  // ─── 학급 배정 ───────────────────────────────────

  app.get<{ Params: { cid: string } }>('/api/classrooms/:cid/videos', auth, async (req, reply) => {
    if (!(await canAccessClassroom(req, req.params.cid))) {
      return reply.status(403).send({ error: '접근 권한이 없습니다' });
    }
    return svc.listClassroomVideos(req.params.cid);
  });

  app.post<{ Params: { cid: string } }>('/api/classrooms/:cid/videos', teacher, async (req, reply) => {
    if (!(await isClassroomOwner(req.params.cid, req.user.sub))) {
      return reply.status(403).send({ error: '교실 소유자만 영상을 배정할 수 있습니다' });
    }
    const body = z.object({ videoId: z.string().uuid(), note: z.string().nullable().optional() }).parse(req.body);
    const video = await getVideoById(body.videoId);
    if (!video) return reply.status(404).send({ error: '영상자료를 찾을 수 없습니다' });
    try {
      const row = await svc.addClassroomVideo(req.params.cid, body.videoId, req.user.sub, body.note);
      return reply.status(201).send(row);
    } catch (err) {
      const e = err as { statusCode?: number; message: string };
      if (e.statusCode === 409) return reply.status(409).send({ error: e.message });
      throw err;
    }
  });

  app.patch<{ Params: { cid: string } }>('/api/classrooms/:cid/videos/reorder', teacher, async (req, reply) => {
    if (!(await isClassroomOwner(req.params.cid, req.user.sub))) {
      return reply.status(403).send({ error: '교실 소유자만 순서를 바꿀 수 있습니다' });
    }
    const { ids } = z.object({ ids: z.array(z.string().uuid()) }).parse(req.body);
    return svc.reorderClassroomVideos(req.params.cid, ids);
  });

  app.get<{ Params: { id: string } }>('/api/classroom-videos/:id', auth, async (req, reply) => {
    const cv = await loadClassroomVideoOr404(req, reply, req.params.id);
    if (!cv) return;
    return svc.getClassroomVideoDetail(cv.id);
  });

  app.patch<{ Params: { id: string } }>('/api/classroom-videos/:id', teacher, async (req, reply) => {
    const cv = await loadClassroomVideoOr404(req, reply, req.params.id);
    if (!cv) return;
    const body = z.object({ note: z.string().nullable().optional() }).parse(req.body);
    return svc.updateClassroomVideo(cv.id, { note: body.note ?? null });
  });

  app.delete<{ Params: { id: string } }>('/api/classroom-videos/:id', teacher, async (req, reply) => {
    const cv = await loadClassroomVideoOr404(req, reply, req.params.id);
    if (!cv) return;
    await svc.removeClassroomVideo(cv.id);
    return reply.status(204).send();
  });

  // ─── 댓글 ───────────────────────────────────────

  app.get<{ Params: { id: string } }>('/api/classroom-videos/:id/comments', auth, async (req, reply) => {
    const cv = await loadClassroomVideoOr404(req, reply, req.params.id);
    if (!cv) return;
    return svc.listCommentThreads(cv.id, { id: req.user.sub, isTeacher: req.user.role === 'teacher' });
  });

  app.post<{ Params: { id: string } }>('/api/classroom-videos/:id/comments', auth, async (req, reply) => {
    const cv = await loadClassroomVideoOr404(req, reply, req.params.id);
    if (!cv) return;
    const body = commentBody.parse(req.body);
    const isTeacher = req.user.role === 'teacher';

    // "교사만 확인"은 루트 댓글에만, 학생만 설정할 수 있다. 대댓글은 루트의 공개 범위를 상속한다.
    let isPrivate = !isTeacher && !!body.isPrivate;

    if (body.parentId) {
      const parent = await svc.getCommentById(body.parentId);
      if (!parent || parent.classroomVideoId !== cv.id) {
        return reply.status(404).send({ error: '원 댓글을 찾을 수 없습니다' });
      }
      if (parent.parentId) {
        return reply.status(400).send({ error: '대댓글에는 답글을 달 수 없습니다' });
      }
      // 다른 학생의 비공개 스레드에는 답글 불가
      if (parent.isPrivate && !isTeacher && parent.authorId !== req.user.sub) {
        return reply.status(403).send({ error: '이 댓글에는 답글을 달 수 없습니다' });
      }
      isPrivate = parent.isPrivate;
    }

    const created = await svc.createComment({
      classroomVideoId: cv.id,
      authorId: req.user.sub,
      parentId: body.parentId ?? null,
      content: body.content,
      isPrivate,
      timestampSec: body.timestampSec ?? null,
    });
    safeEmit(cv.id);
    return reply.status(201).send(created);
  });

  app.patch<{ Params: { id: string } }>('/api/video-comments/:id', auth, async (req, reply) => {
    const comment = await svc.getCommentById(req.params.id);
    if (!comment) return reply.status(404).send({ error: '댓글을 찾을 수 없습니다' });
    if (comment.authorId !== req.user.sub) {
      return reply.status(403).send({ error: '본인 댓글만 수정할 수 있습니다' });
    }
    const { content } = z.object({ content: z.string().trim().min(1).max(5000) }).parse(req.body);
    const updated = await svc.updateComment(comment.id, content);
    safeEmit(comment.classroomVideoId);
    return updated;
  });

  app.delete<{ Params: { id: string } }>('/api/video-comments/:id', auth, async (req, reply) => {
    const comment = await svc.getCommentById(req.params.id);
    if (!comment) return reply.status(404).send({ error: '댓글을 찾을 수 없습니다' });
    const cv = await svc.getClassroomVideoById(comment.classroomVideoId);
    if (!cv) return reply.status(404).send({ error: '학급 영상을 찾을 수 없습니다' });
    // 설계 결정 Q3: 본인 삭제 + 교실 소유 교사는 모든 댓글 삭제
    const isOwnerTeacher = req.user.role === 'teacher' && (await isClassroomOwner(cv.classroomId, req.user.sub));
    if (comment.authorId !== req.user.sub && !isOwnerTeacher) {
      return reply.status(403).send({ error: '삭제 권한이 없습니다' });
    }
    await svc.removeComment(comment.id);
    safeEmit(cv.id);
    return reply.status(204).send();
  });
}
