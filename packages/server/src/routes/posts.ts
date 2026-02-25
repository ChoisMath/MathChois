import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleGuard.js';
import {
  getTeacherPosts,
  getStudentPosts,
  getPostsByClassroom,
  getPostById,
  createPost,
  updatePost,
  deletePost,
  isPostOwner,
} from '../services/post.service.js';
import { urlToStoragePath, removeFile, removeDirectoryIfEmpty, urlToParentDir } from '../services/storage.service.js';

export async function postRoutes(app: FastifyInstance) {

  // ─── GET /api/posts — 게시글 목록 ─────────────

  app.get('/api/posts', {
    preHandler: [authenticate],
  }, async (request) => {
    const { sub, role } = request.user;
    if (role === 'teacher') {
      return getTeacherPosts(sub);
    }
    return getStudentPosts(sub);
  });

  // ─── GET /api/classrooms/:cid/posts — 교실별 게시글 목록

  app.get<{ Params: { cid: string } }>('/api/classrooms/:cid/posts', {
    preHandler: [authenticate],
  }, async (request) => {
    return getPostsByClassroom(request.params.cid);
  });

  // ─── GET /api/posts/:id — 게시글 상세 (편집용) ──

  app.get<{ Params: { id: string } }>('/api/posts/:id', {
    preHandler: [authenticate, requireRole('teacher')],
  }, async (request, reply) => {
    const post = await getPostById(request.params.id);
    if (!post) {
      return reply.status(404).send({ error: 'Post not found' });
    }
    return post;
  });

  // ─── POST /api/posts — 게시글 생성 ────────────

  app.post<{
    Body: {
      title: string;
      content?: string;
      classroomIds: string[];
      files?: { fileName: string; fileUrl: string; fileSize: number; mimeType?: string }[];
    };
  }>('/api/posts', {
    preHandler: [authenticate, requireRole('teacher')],
  }, async (request, reply) => {
    const { title, content, classroomIds, files } = request.body;
    if (!title?.trim()) {
      return reply.status(400).send({ error: 'Title is required' });
    }
    const post = await createPost({
      teacherId: request.user.sub,
      title: title.trim(),
      content,
      classroomIds: classroomIds ?? [],
      files,
    });
    return reply.status(201).send(post);
  });

  // ─── PATCH /api/posts/:id — 게시글 수정 ──────

  app.patch<{
    Params: { id: string };
    Body: {
      title?: string;
      content?: string;
      classroomIds?: string[];
      files?: { fileName: string; fileUrl: string; fileSize: number; mimeType?: string }[];
    };
  }>('/api/posts/:id', {
    preHandler: [authenticate, requireRole('teacher')],
  }, async (request, reply) => {
    const isOwner = await isPostOwner(request.params.id, request.user.sub);
    if (!isOwner) {
      return reply.status(403).send({ error: 'Not the post owner' });
    }
    const updated = await updatePost(request.params.id, request.body);
    if (!updated) {
      return reply.status(404).send({ error: 'Post not found' });
    }
    return updated;
  });

  // ─── DELETE /api/posts/:id — 게시글 삭제 ─────

  app.delete<{ Params: { id: string } }>('/api/posts/:id', {
    preHandler: [authenticate, requireRole('teacher')],
  }, async (request, reply) => {
    const isOwner = await isPostOwner(request.params.id, request.user.sub);
    if (!isOwner) {
      return reply.status(403).send({ error: 'Not the post owner' });
    }

    const fileUrls = await deletePost(request.params.id);

    // Storage 파일 정리
    for (const url of fileUrls) {
      const parsed = urlToStoragePath(url);
      if (parsed) {
        await removeFile(parsed.bucket, parsed.path);
      }
    }

    // 빈 디렉토리 정리
    if (fileUrls.length > 0) {
      const parentDir = urlToParentDir(fileUrls[0]);
      if (parentDir) {
        await removeDirectoryIfEmpty(parentDir.bucket, parentDir.dir);
      }
    }

    return reply.status(204).send();
  });
}
