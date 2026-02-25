import { eq, desc, inArray, and } from 'drizzle-orm';
import { db } from '../config/database.js';
import { posts, postFiles, postClassrooms, classroomMembers } from '../db/schema.js';

/** 교사: 자신의 게시글 전체 조회 */
export async function getTeacherPosts(teacherId: string) {
  const rows = await db
    .select()
    .from(posts)
    .where(eq(posts.teacherId, teacherId))
    .orderBy(desc(posts.createdAt));

  return Promise.all(rows.map(async (post) => {
    const files = await db
      .select()
      .from(postFiles)
      .where(eq(postFiles.postId, post.id));

    const classroomLinks = await db
      .select({ classroomId: postClassrooms.classroomId })
      .from(postClassrooms)
      .where(eq(postClassrooms.postId, post.id));

    return {
      ...post,
      files,
      classroomIds: classroomLinks.map((l) => l.classroomId),
    };
  }));
}

/** 학생: 소속 교실에 게시된 글만 조회 */
export async function getStudentPosts(studentId: string) {
  // 학생이 속한 교실 ID
  const memberRows = await db
    .select({ classroomId: classroomMembers.classroomId })
    .from(classroomMembers)
    .where(eq(classroomMembers.studentId, studentId));

  if (memberRows.length === 0) return [];
  const classroomIds = memberRows.map((r) => r.classroomId);

  // 해당 교실에 게시된 글 ID
  const postLinks = await db
    .select({ postId: postClassrooms.postId })
    .from(postClassrooms)
    .where(inArray(postClassrooms.classroomId, classroomIds));

  if (postLinks.length === 0) return [];
  const postIds = [...new Set(postLinks.map((l) => l.postId))];

  const rows = await db
    .select()
    .from(posts)
    .where(inArray(posts.id, postIds))
    .orderBy(desc(posts.createdAt));

  return Promise.all(rows.map(async (post) => {
    const files = await db
      .select()
      .from(postFiles)
      .where(eq(postFiles.postId, post.id));
    return { ...post, files };
  }));
}

/** 게시글 생성 */
export async function createPost(data: {
  teacherId: string;
  title: string;
  content?: string;
  classroomIds: string[];
  files?: { fileName: string; fileUrl: string; fileSize: number; mimeType?: string }[];
}) {
  const [post] = await db
    .insert(posts)
    .values({
      teacherId: data.teacherId,
      title: data.title,
      content: data.content ?? '',
    })
    .returning();

  // 교실 연결
  if (data.classroomIds.length > 0) {
    await db.insert(postClassrooms).values(
      data.classroomIds.map((cid) => ({ postId: post.id, classroomId: cid })),
    );
  }

  // 파일 연결
  if (data.files && data.files.length > 0) {
    await db.insert(postFiles).values(
      data.files.map((f) => ({
        postId: post.id,
        fileName: f.fileName,
        fileUrl: f.fileUrl,
        fileSize: f.fileSize,
        mimeType: f.mimeType ?? null,
      })),
    );
  }

  return post;
}

/** 게시글 수정 */
export async function updatePost(id: string, data: {
  title?: string;
  content?: string;
  classroomIds?: string[];
  files?: { fileName: string; fileUrl: string; fileSize: number; mimeType?: string }[];
}) {
  const updates: Record<string, unknown> = {};
  if (data.title !== undefined) updates.title = data.title;
  if (data.content !== undefined) updates.content = data.content;
  updates.updatedAt = new Date();

  const [updated] = await db
    .update(posts)
    .set(updates)
    .where(eq(posts.id, id))
    .returning();

  // 교실 연결 교체
  if (data.classroomIds !== undefined) {
    await db.delete(postClassrooms).where(eq(postClassrooms.postId, id));
    if (data.classroomIds.length > 0) {
      await db.insert(postClassrooms).values(
        data.classroomIds.map((cid) => ({ postId: id, classroomId: cid })),
      );
    }
  }

  // 파일 교체
  if (data.files !== undefined) {
    await db.delete(postFiles).where(eq(postFiles.postId, id));
    if (data.files.length > 0) {
      await db.insert(postFiles).values(
        data.files.map((f) => ({
          postId: id,
          fileName: f.fileName,
          fileUrl: f.fileUrl,
          fileSize: f.fileSize,
          mimeType: f.mimeType ?? null,
        })),
      );
    }
  }

  return updated ?? null;
}

/** 게시글 삭제 (CASCADE로 files, classrooms도 삭제됨) */
export async function deletePost(id: string) {
  // 파일 URL 먼저 조회 (Storage 정리용)
  const files = await db
    .select({ fileUrl: postFiles.fileUrl })
    .from(postFiles)
    .where(eq(postFiles.postId, id));

  await db.delete(posts).where(eq(posts.id, id));

  return files.map((f) => f.fileUrl);
}

/** 게시글 소유자 확인 */
export async function isPostOwner(postId: string, teacherId: string): Promise<boolean> {
  const rows = await db
    .select({ id: posts.id })
    .from(posts)
    .where(and(eq(posts.id, postId), eq(posts.teacherId, teacherId)))
    .limit(1);
  return rows.length > 0;
}
