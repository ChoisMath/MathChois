import { eq, and, asc, desc, sql, inArray, isNull } from 'drizzle-orm';
import { db } from '../config/database.js';
import { classroomVideos, videos, videoComments, classrooms, chapters, profiles, classroomMembers, videoProgress, videoCommentReads } from '../db/schema.js';

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
  chapterId: classroomVideos.chapterId,
  position: classroomVideos.position,
  createdAt: classroomVideos.createdAt,
  video: videoSelect,
  // 필기 챕터(left join) — 연결이 없거나 챕터가 삭제되면 null
  chapter: { id: chapters.id, title: chapters.title },
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
    .leftJoin(chapters, eq(classroomVideos.chapterId, chapters.id))
    .where(eq(classroomVideos.classroomId, classroomId))
    .orderBy(asc(classroomVideos.position), asc(classroomVideos.createdAt));
}

export async function getClassroomVideoById(id: string) {
  const rows = await db.select(classroomVideoSelect)
    .from(classroomVideos)
    .innerJoin(videos, eq(classroomVideos.videoId, videos.id))
    .leftJoin(chapters, eq(classroomVideos.chapterId, chapters.id))
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

export type ClassroomVideoPatch = { note?: string | null; chapterId?: string | null };

/** 전달된 키만 갱신한다(note 만 보내면 chapterId 는 유지). */
export async function updateClassroomVideo(id: string, patch: ClassroomVideoPatch) {
  const set: Partial<typeof classroomVideos.$inferInsert> = {};
  if ('note' in patch) set.note = patch.note ?? null;
  if ('chapterId' in patch) set.chapterId = patch.chapterId ?? null;
  if (Object.keys(set).length > 0) {
    await db.update(classroomVideos).set(set).where(eq(classroomVideos.id, id));
  }
  return getClassroomVideoById(id);
}

/** chapterId 가 해당 학급의 챕터인지 — 다른 학급 챕터를 필기 챕터로 연결하는 것을 막는다. */
export async function isChapterInClassroom(chapterId: string, classroomId: string) {
  const [row] = await db.select({ id: chapters.id }).from(chapters)
    .where(and(eq(chapters.id, chapterId), eq(chapters.classroomId, classroomId)))
    .limit(1);
  return !!row;
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

// ─── 시청 기록 (video_progress) ──────────────────────

/** 완료 판정 비율: 최대 도달 위치가 길이의 90% 이상이면 완료 */
export const PROGRESS_COMPLETE_RATIO = 0.9;

function toProgressRow(r: {
  classroomVideoId: string; studentId: string; positionSec: number; maxPositionSec: number;
  completed: boolean; updatedAt: Date;
}) {
  return {
    classroomVideoId: r.classroomVideoId,
    studentId: r.studentId,
    positionSec: r.positionSec,
    maxPositionSec: r.maxPositionSec,
    completed: r.completed,
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** 0~100 반올림·클램프. durationSec 없으면 null */
export function progressPercent(maxPositionSec: number, durationSec: number | null | undefined) {
  if (durationSec == null || !(durationSec > 0)) return null;
  const pct = Math.round((maxPositionSec / durationSec) * 100);
  return Math.max(0, Math.min(100, pct));
}

/**
 * 학생 시청 위치 upsert (classroomVideoId, studentId 유니크).
 * - positionSec: 현재 위치(그대로 덮어씀)
 * - maxPositionSec: 기존값과 새 값 중 큰 값
 * - completed: durationSec>0 이고 maxPositionSec >= 90% 면 true. 한 번 true 가 되면 유지.
 */
export async function upsertProgress(
  classroomVideoId: string,
  studentId: string,
  input: { positionSec: number; durationSec?: number | null },
) {
  const positionSec = Math.max(0, Math.floor(input.positionSec));
  const durationSec = input.durationSec != null && input.durationSec > 0 ? Math.floor(input.durationSec) : 0;
  const threshold = durationSec > 0 ? durationSec * PROGRESS_COMPLETE_RATIO : null;
  const insertCompleted = threshold != null && positionSec >= threshold;

  const maxExpr = sql`GREATEST(${videoProgress.maxPositionSec}, ${positionSec})`;
  const completedExpr = threshold != null
    ? sql`(${videoProgress.completed} OR ${maxExpr} >= ${threshold})`
    : sql`${videoProgress.completed}`;

  const [row] = await db.insert(videoProgress)
    .values({ classroomVideoId, studentId, positionSec, maxPositionSec: positionSec, completed: insertCompleted })
    .onConflictDoUpdate({
      target: [videoProgress.classroomVideoId, videoProgress.studentId],
      set: {
        positionSec,
        maxPositionSec: maxExpr,
        completed: completedExpr,
        updatedAt: sql`now()`,
      },
    })
    .returning();
  return toProgressRow(row);
}

/** videos.durationSec 이 비어 있을 때만 채운다(이미 값이 있으면 건드리지 않음). */
export async function backfillVideoDuration(videoId: string, durationSec: number) {
  await db.update(videos)
    .set({ durationSec: Math.floor(durationSec), updatedAt: new Date() })
    .where(and(eq(videos.id, videoId), isNull(videos.durationSec)));
}

export async function getProgress(classroomVideoId: string, studentId: string) {
  const rows = await db.select().from(videoProgress)
    .where(and(eq(videoProgress.classroomVideoId, classroomVideoId), eq(videoProgress.studentId, studentId)))
    .limit(1);
  return rows[0] ? toProgressRow(rows[0]) : null;
}

/** 교사용: 학급 영상 하나의 학생별 시청 현황 (학급 구성원 전원 — 기록 없는 학생 포함) */
export async function getProgressSummary(classroomVideoId: string) {
  const cv = await getClassroomVideoById(classroomVideoId);
  if (!cv) return null;
  const durationSec = cv.video.durationSec ?? null;

  const rows = await db.select({
    studentId: classroomMembers.studentId,
    name: profiles.name,
    avatarUrl: profiles.avatarUrl,
    positionSec: videoProgress.positionSec,
    maxPositionSec: videoProgress.maxPositionSec,
    completed: videoProgress.completed,
    updatedAt: videoProgress.updatedAt,
  })
    .from(classroomMembers)
    .innerJoin(profiles, eq(classroomMembers.studentId, profiles.id))
    .leftJoin(videoProgress, and(
      eq(videoProgress.studentId, classroomMembers.studentId),
      eq(videoProgress.classroomVideoId, classroomVideoId),
    ))
    .where(eq(classroomMembers.classroomId, cv.classroomId))
    .orderBy(asc(profiles.name), asc(classroomMembers.joinedAt));

  const students = rows.map((r) => {
    const maxPositionSec = r.maxPositionSec ?? 0;
    return {
      studentId: r.studentId,
      name: r.name,
      avatarUrl: r.avatarUrl,
      positionSec: r.positionSec ?? 0,
      maxPositionSec,
      progressPct: r.updatedAt ? progressPercent(maxPositionSec, durationSec) : (durationSec ? 0 : null),
      completed: !!r.completed,
      updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
    };
  });

  return {
    classroomVideoId,
    durationSec,
    students,
    watchedCount: students.filter((s) => s.updatedAt != null).length,
    completedCount: students.filter((s) => s.completed).length,
    totalStudents: students.length,
  };
}

/** 학생용: 학급의 모든 영상에 대한 본인 시청 기록 맵 (cvId → progress) */
export async function getProgressByClassroom(classroomId: string, studentId: string) {
  const rows = await db.select({
    classroomVideoId: videoProgress.classroomVideoId,
    positionSec: videoProgress.positionSec,
    maxPositionSec: videoProgress.maxPositionSec,
    completed: videoProgress.completed,
  })
    .from(videoProgress)
    .innerJoin(classroomVideos, eq(videoProgress.classroomVideoId, classroomVideos.id))
    .where(and(eq(classroomVideos.classroomId, classroomId), eq(videoProgress.studentId, studentId)));

  const out: Record<string, { positionSec: number; maxPositionSec: number; completed: boolean }> = {};
  for (const r of rows) {
    out[r.classroomVideoId] = { positionSec: r.positionSec, maxPositionSec: r.maxPositionSec, completed: r.completed };
  }
  return out;
}

/** 교사용: 학급의 모든 영상에 대한 시청/완료 학생 수 맵 (cvId → stats). 영상 전부 포함(0건도). */
export async function getProgressStatsByClassroom(classroomId: string) {
  const [{ totalStudents }] = await db.select({ totalStudents: sql<number>`count(*)::int` })
    .from(classroomMembers).where(eq(classroomMembers.classroomId, classroomId));

  const rows = await db.select({
    classroomVideoId: classroomVideos.id,
    watchedCount: sql<number>`count(${videoProgress.id})::int`,
    completedCount: sql<number>`count(*) filter (where ${videoProgress.completed})::int`,
  })
    .from(classroomVideos)
    .leftJoin(videoProgress, and(
      eq(videoProgress.classroomVideoId, classroomVideos.id),
      // 현재 학급 구성원의 기록만 집계(탈퇴 학생 제외)
      sql`EXISTS (SELECT 1 FROM classroom_members cm WHERE cm.classroom_id = ${classroomVideos.classroomId} AND cm.student_id = ${videoProgress.studentId})`,
    ))
    .where(eq(classroomVideos.classroomId, classroomId))
    .groupBy(classroomVideos.id);

  const out: Record<string, { watchedCount: number; completedCount: number; totalStudents: number }> = {};
  for (const r of rows) {
    out[r.classroomVideoId] = {
      watchedCount: r.watchedCount,
      completedCount: r.completedCount,
      totalStudents: Number(totalStudents),
    };
  }
  return out;
}

// ─── 댓글 읽음/미읽음 (video_comment_reads) ───────────

/** 사용자×학급영상 읽음 시각을 지금으로 upsert */
export async function markCommentsSeen(classroomVideoId: string, userId: string) {
  await db.insert(videoCommentReads)
    .values({ classroomVideoId, userId })
    .onConflictDoUpdate({
      target: [videoCommentReads.classroomVideoId, videoCommentReads.userId],
      set: { lastSeenAt: sql`now()` },
    });
}

/**
 * 미읽음 댓글 집계 쿼리. classroom_videos(cv) 기준 LEFT JOIN 이므로 댓글이 없는 영상도 0건 행이 나온다.
 * 미읽음 = 본인이 쓰지 않았고, lastSeenAt(없으면 -infinity) 이후 작성됐고, viewer 가 열람 가능한 댓글.
 *  - 교사(교실 소유자): 전부
 *  - 학생: 공개 스레드(루트/대댓글 모두 is_private=false — 대댓글은 루트 공개범위를 상속) 또는
 *          본인이 쓴 비공개 루트에 달린 대댓글(교사 답변)
 * keyExpr 로 그룹 키(cv.id 또는 cv.classroom_id), scope 로 cv 범위를 지정한다.
 */
function unreadCountQuery(viewer: { id: string; isTeacher: boolean }, keyExpr: ReturnType<typeof sql>, scope: ReturnType<typeof sql>) {
  // 열람 가능 조건은 c 의 JOIN 조건에 넣어 영상마다 항상 한 행(0 포함)이 나오게 한다.
  const visible = viewer.isTeacher
    ? sql`TRUE`
    : sql`(NOT c.is_private OR (c.parent_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM video_comments root WHERE root.id = c.parent_id AND root.author_id = ${viewer.id})))`;
  return sql`
    SELECT ${keyExpr} AS key, count(c.id)::int AS unread
    FROM classroom_videos cv
    LEFT JOIN video_comment_reads r
      ON r.classroom_video_id = cv.id AND r.user_id = ${viewer.id}
    LEFT JOIN video_comments c
      ON c.classroom_video_id = cv.id
     AND c.author_id <> ${viewer.id}
     AND c.created_at > COALESCE(r.last_seen_at, '-infinity'::timestamptz)
     AND ${visible}
    WHERE ${scope}
    GROUP BY ${keyExpr}
  `;
}

function sumUnread(rows: Iterable<{ key: string; unread: number }>) {
  const map: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    const n = Number(r.unread) || 0;
    map[r.key] = n;
    total += n;
  }
  return { map, total };
}

/** 학급 하나의 영상별 미읽음 댓글 수 */
export async function getUnreadCountsForClassroom(classroomId: string, viewer: { id: string; isTeacher: boolean }) {
  const rows = await db.execute<{ key: string; unread: number }>(
    unreadCountQuery(viewer, sql`cv.id`, sql`cv.classroom_id = ${classroomId}`),
  );
  const { map, total } = sumUnread(rows);
  return { byClassroomVideo: map, total };
}

/**
 * 사용자가 속한 모든 학급의 미읽음 댓글 수 (학급별 + 합계).
 * 교사: 소유 학급, 학생: 소속 학급. 한 번의 GROUP BY 쿼리.
 */
export async function getUnreadTotalForUser(userId: string, role: 'teacher' | 'student') {
  const isTeacher = role === 'teacher';
  const scope = isTeacher
    ? sql`cv.classroom_id IN (SELECT id FROM classrooms WHERE teacher_id = ${userId})`
    : sql`cv.classroom_id IN (SELECT classroom_id FROM classroom_members WHERE student_id = ${userId})`;
  const rows = await db.execute<{ key: string; unread: number }>(
    unreadCountQuery({ id: userId, isTeacher }, sql`cv.classroom_id`, scope),
  );
  const { map, total } = sumUnread(rows);
  return { byClassroom: map, total };
}
