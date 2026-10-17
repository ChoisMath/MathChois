import { eq, and, or, ilike, desc, sql, type SQL } from 'drizzle-orm';
import { db } from '../config/database.js';
import { videos, classroomVideos, classrooms, profiles } from '../db/schema.js';
import { removeFile, urlToStoragePath } from './storage.service.js';

export type VideoInsert = typeof videos.$inferInsert;

export interface VideoListFilters {
  q?: string;
  subject?: string;
  majorUnit?: string;
  minorUnit?: string;
  createdBy?: string;
  page?: number;
  pageSize?: number;
}

const videoColumns = {
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
  createdByName: profiles.name,
};

export async function createVideo(values: VideoInsert) {
  const [row] = await db.insert(videos).values(values).returning();
  return row;
}

export async function getVideoById(id: string) {
  const rows = await db.select(videoColumns).from(videos)
    .leftJoin(profiles, eq(videos.createdBy, profiles.id))
    .where(eq(videos.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function updateVideo(id: string, patch: Partial<VideoInsert>) {
  const [row] = await db.update(videos)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(videos.id, id)).returning();
  return row ?? null;
}

/** 이 영상을 배정한 학급 목록 (삭제 차단 안내용) */
export async function getVideoUsage(videoId: string) {
  const rows = await db.select({
    classroomVideoId: classroomVideos.id,
    classroomId: classrooms.id,
    classroomName: classrooms.name,
  }).from(classroomVideos)
    .innerJoin(classrooms, eq(classroomVideos.classroomId, classrooms.id))
    .where(eq(classroomVideos.videoId, videoId));
  return { classrooms: rows };
}

/**
 * 영상 삭제.
 * - 기본: 학급에 배정 중이면 삭제하지 않고 409 를 던진다(설계 결정 Q1: 차단).
 * - `force`: 소유자가 모든 학급 배정(classroom_videos)을 먼저 해제한 뒤 영상을 지운다
 *   (댓글·시청 기록은 FK cascade). 다른 교사 학급의 배정도 소유자 판단으로 해제한다.
 * 레코드 삭제 후 원본 파일·썸네일도 제거한다.
 */
export async function removeVideo(id: string, opts: { force?: boolean } = {}) {
  const row = await getVideoById(id);
  if (!row) return null;
  const usage = await getVideoUsage(id);
  if (usage.classrooms.length > 0 && !opts.force) {
    throw Object.assign(
      new Error(`${usage.classrooms.length}개 학급에 배정된 영상입니다. 각 학급의 [영상] 탭에서 배정을 해제한 뒤 삭제하세요.`),
      { statusCode: 409, usage },
    );
  }
  await db.transaction(async (tx) => {
    if (opts.force) await tx.delete(classroomVideos).where(eq(classroomVideos.videoId, id));
    await tx.delete(videos).where(eq(videos.id, id));
  });
  await removeVideoFiles(row.videoUrl, row.thumbnailUrl);
  return row;
}

export async function removeVideoFiles(videoUrl?: string | null, thumbnailUrl?: string | null) {
  for (const url of [videoUrl, thumbnailUrl]) {
    if (!url) continue;
    const parsed = urlToStoragePath(url);
    if (parsed) await removeFile(parsed.bucket, parsed.path).catch(() => {});
  }
}

function buildWhere(f: VideoListFilters): SQL | undefined {
  const conds: SQL[] = [];
  if (f.createdBy) conds.push(eq(videos.createdBy, f.createdBy));
  if (f.subject)   conds.push(eq(videos.subject, f.subject));
  if (f.majorUnit) conds.push(eq(videos.majorUnit, f.majorUnit));
  if (f.minorUnit) conds.push(eq(videos.minorUnit, f.minorUnit));
  if (f.q) {
    const kw = `%${f.q}%`;
    const search = or(ilike(videos.title, kw), ilike(videos.description, kw));
    if (search) conds.push(search);
  }
  return conds.length ? and(...conds) : undefined;
}

export async function listVideos(f: VideoListFilters) {
  const page = Math.max(1, Number.isFinite(f.page) ? Number(f.page) : 1);
  const pageSize = Math.min(100, Math.max(1, Number.isFinite(f.pageSize) ? Number(f.pageSize) : 20));
  const where = buildWhere(f);

  const items = await db.select(videoColumns).from(videos)
    .leftJoin(profiles, eq(videos.createdBy, profiles.id))
    .where(where)
    .orderBy(desc(videos.createdAt))
    .limit(pageSize).offset((page - 1) * pageSize);

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
    .from(videos).where(where);

  return { items, total: count, page, pageSize };
}

export async function getVideoFacets() {
  const toSortedStrings = (rows: { v: string | null }[]) =>
    rows.map((r) => r.v).filter((v): v is string => !!v).sort();

  const [subjects, majorUnits, minorUnits] = await Promise.all([
    db.selectDistinct({ v: videos.subject }).from(videos).then(toSortedStrings),
    db.selectDistinct({ v: videos.majorUnit }).from(videos).then(toSortedStrings),
    db.selectDistinct({ v: videos.minorUnit }).from(videos).then(toSortedStrings),
  ]);

  return { subject: subjects, majorUnit: majorUnits, minorUnit: minorUnits };
}
