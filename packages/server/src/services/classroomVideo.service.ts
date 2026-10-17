import { eq, and, asc, desc, sql, inArray, isNull } from 'drizzle-orm';
import { db } from '../config/database.js';
import { classroomVideos, videos, videoComments, classrooms, profiles } from '../db/schema.js';

// ─── 학급 배정 ───────────────────────────────────────

const videoSelect = {
  id: videos.id,
  createdBy: videos.createdBy,
  title: videos.title,
  subject: videos.subject,
  majorUnit: videos.majorUnit,
  minorUnit: videos.minorUnit,
  description: videos.description,
  videoUrl: videos.videoUrl,
  thumbnailUrl: videos.thumbnailUrl,
  mimeType: videos.mimeType,
  fileSize: videos.fileSize,
  durationSec: videos.durationSec,
  createdAt: videos.createdAt,
  updatedAt: videos.updatedAt,
};

const classroomVideoSelect = {
  id: classroomVideos.id,
  classroomId: classroomVideos.classroomId,
  videoId: classroomVideos.videoId,
  addedBy: classroomVideos.addedBy,
  note: classroomVideos.note,
  position: classroomVideos.position,
  createdAt: classroomVideos.createdAt,
  video: videoSelect,
  // 루트 댓글 수(대댓글 제외). 비공개 스레드도 포함한 총수 — 카드 배지 용도.
  commentCount: sql<number>`(
    SELECT count(*)::int FROM video_comments vc
    WHERE vc.classroom_video_id = ${classroomVideos.id} AND vc.parent_id IS NULL
  )`,
};

export async function listClassroomVideos(classroomId: string) {
  return db.select(classroomVideoSelect)
    .from(classroomVideos)
    .innerJoin(videos, eq(classroomVideos.videoId, videos.id))
    .where(eq(classroomVideos.classroomId, classroomId))
    .orderBy(asc(classroomVideos.position), asc(classroomVideos.createdAt));
}

export async function getClassroomVideoById(id: string) {
  const rows = await db.select(classroomVideoSelect)
    .from(classroomVideos)
    .innerJoin(videos, eq(classroomVideos.videoId, videos.id))
    .where(eq(classroomVideos.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/** 시청 화면용 상세: 배정 + 학급 + 같은 학급의 다른 영상 */
export async function getClassroomVideoDetail(id: string) {
  const cv = await getClassroomVideoById(id);
  if (!cv) return null;
  const [cls] = await db.select({ id: classrooms.id, name: classrooms.name, teacherId: classrooms.teacherId })
    .from(classrooms).where(eq(classrooms.id, cv.classroomId)).limit(1);
  if (!cls) return null;
  const all = await listClassroomVideos(cv.classroomId);
  return { ...cv, classroom: cls, siblings: all.filter((v) => v.id !== cv.id) };
}

export async function addClassroomVideo(classroomId: string, videoId: string, addedBy: string, note?: string | null) {
  const [{ maxPos }] = await db.select({ maxPos: sql<number>`COALESCE(MAX(${classroomVideos.position}), -1)` })
    .from(classroomVideos).where(eq(classroomVideos.classroomId, classroomId));
  try {
    const [row] = await db.insert(classroomVideos)
      .values({ classroomId, videoId, addedBy, note: note ?? null, position: Number(maxPos) + 1 })
      .returning();
    return getClassroomVideoById(row.id);
  } catch (err: unknown) {
    // drizzle 0.44 는 DB 오류를 DrizzleQueryError 로 감싸므로 cause 의 코드도 본다
    const e = err as { code?: string; cause?: { code?: string } };
    if (e.code === '23505' || e.cause?.code === '23505') {
      throw Object.assign(new Error('이미 이 학급에 배정된 영상입니다.'), { statusCode: 409 });
    }
    throw err;
  }
}

export async function updateClassroomVideo(id: string, patch: { note?: string | null }) {
  await db.update(classroomVideos).set(patch).where(eq(classroomVideos.id, id));
  return getClassroomVideoById(id);
}

export async function reorderClassroomVideos(classroomId: string, ids: string[]) {
  await db.transaction(async (tx) => {
    for (let i = 0; i < ids.length; i++) {
      await tx.update(classroomVideos)
        .set({ position: i })
        .where(and(eq(classroomVideos.id, ids[i]), eq(classroomVideos.classroomId, classroomId)));
    }
  });
  return listClassroomVideos(classroomId);
}

export async function removeClassroomVideo(id: string) {
  const [row] = await db.delete(classroomVideos).where(eq(classroomVideos.id, id)).returning();
  return row ?? null;
}

// ─── 댓글 ───────────────────────────────────────────

const commentSelect = {
  id: videoComments.id,
  classroomVideoId: videoComments.classroomVideoId,
  authorId: videoComments.authorId,
  parentId: videoComments.parentId,
  content: videoComments.content,
  isPrivate: videoComments.isPrivate,
  timestampSec: videoComments.timestampSec,
  createdAt: videoComments.createdAt,
  updatedAt: videoComments.updatedAt,
  author: {
    id: profiles.id,
    name: profiles.name,
    avatarUrl: profiles.avatarUrl,
    role: profiles.role,
  },
};

export async function getCommentById(id: string) {
  const rows = await db.select(commentSelect).from(videoComments)
    .innerJoin(profiles, eq(videoComments.authorId, profiles.id))
    .where(eq(videoComments.id, id)).limit(1);
  return rows[0] ?? null;
}

/**
 * 스레드 목록(루트 + 대댓글).
 * viewer 가 교사(교실 소유자)면 전부, 학생이면 공개 스레드 + 본인이 쓴 비공개 스레드만.
 */
export async function listCommentThreads(classroomVideoId: string, viewer: { id: string; isTeacher: boolean }) {
  const roots = await db.select(commentSelect).from(videoComments)
    .innerJoin(profiles, eq(videoComments.authorId, profiles.id))
    .where(and(eq(videoComments.classroomVideoId, classroomVideoId), isNull(videoComments.parentId)))
    .orderBy(desc(videoComments.createdAt));

  const visibleRoots = viewer.isTeacher
    ? roots
    : roots.filter((r) => !r.isPrivate || r.authorId === viewer.id);

  if (visibleRoots.length === 0) return [];
  const rootIds = visibleRoots.map((r) => r.id);

  const replies = await db.select(commentSelect).from(videoComments)
    .innerJoin(profiles, eq(videoComments.authorId, profiles.id))
    .where(inArray(videoComments.parentId, rootIds))
    .orderBy(asc(videoComments.createdAt));

  const byParent = new Map<string, typeof replies>();
  for (const r of replies) {
    const list = byParent.get(r.parentId!) ?? [];
    list.push(r);
    byParent.set(r.parentId!, list);
  }
  return visibleRoots.map((r) => ({ ...r, replies: byParent.get(r.id) ?? [] }));
}

export async function createComment(values: {
  classroomVideoId: string;
  authorId: string;
  parentId?: string | null;
  content: string;
  isPrivate: boolean;
  timestampSec?: number | null;
}) {
  const [row] = await db.insert(videoComments).values({
    classroomVideoId: values.classroomVideoId,
    authorId: values.authorId,
    parentId: values.parentId ?? null,
    content: values.content,
    isPrivate: values.isPrivate,
    timestampSec: values.timestampSec ?? null,
  }).returning();
  return getCommentById(row.id);
}

export async function updateComment(id: string, content: string) {
  await db.update(videoComments).set({ content, updatedAt: new Date() }).where(eq(videoComments.id, id));
  return getCommentById(id);
}

export async function removeComment(id: string) {
  const [row] = await db.delete(videoComments).where(eq(videoComments.id, id)).returning();
  return row ?? null;
}
