import { and, asc, eq, inArray } from 'drizzle-orm';
import { SUBTITLE_LANGS, subtitleLangLabel, type VideoSubtitle } from '@mathchois/shared';
import { db } from '../config/database.js';
import { videos, videoSubtitles } from '../db/schema.js';
import { uploadFile, removeFile, urlToStoragePath } from './storage.service.js';

// routes/videos.ts VIDEO_BUCKET 과 같음 (라우트 → video.service → 이 서비스 순서로 import 되므로 라우트를 import 하면 순환)
const SUBTITLE_BUCKET = 'videos';

type SubtitleRow = typeof videoSubtitles.$inferSelect;

function toDto(row: SubtitleRow): VideoSubtitle {
  return {
    id: row.id,
    lang: row.lang,
    label: row.label,
    url: row.url,
    cueCount: row.cueCount,
    lastEnd: row.lastEndSec,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function langOrder(lang: string): number {
  const i = SUBTITLE_LANGS.findIndex((l) => l.code === lang);
  return i === -1 ? SUBTITLE_LANGS.length : i;
}

async function removeStoredFile(url: string | null | undefined) {
  if (!url) return;
  const parsed = urlToStoragePath(url);
  if (parsed) await removeFile(parsed.bucket, parsed.path).catch(() => {});
}

/**
 * 쿼리로 받은 영상 URL → DB 의 `videos.video_url` 과 비교할 후보.
 * 절대 URL 이면 pathname 만 쓰고, 브라우저가 퍼센트 인코딩한 한글 파일명도 맞도록 디코드한 형태를 함께 넣는다.
 */
export function videoUrlCandidates(input: string): string[] {
  let pathname: string;
  try {
    pathname = new URL(input, 'http://local').pathname;
  } catch {
    return [];
  }
  const out = new Set([pathname]);
  try { out.add(decodeURIComponent(pathname)); } catch { /* 잘못된 인코딩은 원문만 */ }
  return [...out];
}

/** 영상 URL 로 그 영상의 자막 목록(SUBTITLE_LANGS 순서). 없으면 [] */
export async function listSubtitlesByVideoUrl(videoUrl: string): Promise<VideoSubtitle[]> {
  const candidates = videoUrlCandidates(videoUrl);
  if (!candidates.length) return [];
  const rows = await db.select({ s: videoSubtitles }).from(videoSubtitles)
    .innerJoin(videos, eq(videoSubtitles.videoId, videos.id))
    .where(inArray(videos.videoUrl, candidates))
    .orderBy(asc(videoSubtitles.lang));
  return rows.map((r) => toDto(r.s)).sort((a, b) => langOrder(a.lang) - langOrder(b.lang));
}

/**
 * WebVTT 문서를 저장하고 (videoId, lang) 행을 추가/교체한다.
 * - 파일을 먼저 쓰고 트랜잭션 안에서 기존 행을 `FOR UPDATE` 로 잠근 뒤 upsert 한다 → 동시에 두 번 교체해도
 *   각자 자기 직전 파일을 정확히 하나씩 지운다.
 * - upsert 가 실패하면(영상이 그 사이 삭제돼 FK 위반 등) 방금 쓴 파일을 지워 고아 파일을 남기지 않는다.
 */
export async function saveSubtitle(p: {
  videoId: string; lang: string; vtt: string; cueCount: number; lastEndSec: number; createdBy: string;
}): Promise<VideoSubtitle> {
  const url = await uploadFile(
    SUBTITLE_BUCKET, 'subtitles', `${Date.now()}_${p.videoId}_${p.lang}.vtt`, Buffer.from(p.vtt, 'utf8'),
  );
  const values = {
    url,
    label: subtitleLangLabel(p.lang),
    cueCount: p.cueCount,
    lastEndSec: p.lastEndSec,
    createdBy: p.createdBy,
    updatedAt: new Date(),
  };
  let previousUrl: string | null = null;
  let row: SubtitleRow;
  try {
    row = await db.transaction(async (tx) => {
      const [existing] = await tx.select({ url: videoSubtitles.url }).from(videoSubtitles)
        .where(and(eq(videoSubtitles.videoId, p.videoId), eq(videoSubtitles.lang, p.lang)))
        .for('update');
      previousUrl = existing?.url ?? null;
      const [saved] = await tx.insert(videoSubtitles)
        .values({ videoId: p.videoId, lang: p.lang, ...values })
        .onConflictDoUpdate({ target: [videoSubtitles.videoId, videoSubtitles.lang], set: values })
        .returning();
      return saved!;
    });
  } catch (err) {
    await removeStoredFile(url);
    throw err;
  }
  if (previousUrl && previousUrl !== url) await removeStoredFile(previousUrl);
  return toDto(row);
}

/** 자막 행 + 파일 삭제. 없으면 false */
export async function removeSubtitle(videoId: string, lang: string): Promise<boolean> {
  const [row] = await db.delete(videoSubtitles)
    .where(and(eq(videoSubtitles.videoId, videoId), eq(videoSubtitles.lang, lang)))
    .returning({ url: videoSubtitles.url });
  if (!row) return false;
  await removeStoredFile(row.url);
  return true;
}

/** 영상의 모든 자막 파일 URL (영상 삭제 시 파일 정리용 — 행은 FK cascade) */
export async function subtitleUrlsForVideo(videoId: string): Promise<string[]> {
  const rows = await db.select({ url: videoSubtitles.url }).from(videoSubtitles)
    .where(eq(videoSubtitles.videoId, videoId));
  return rows.map((r) => r.url);
}
