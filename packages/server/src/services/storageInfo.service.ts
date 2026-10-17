import fs from 'node:fs/promises';
import path from 'node:path';
import { isNotNull } from 'drizzle-orm';
import { env } from '../config/env.js';
import { db } from '../config/database.js';
import { visualizations, videos, pages } from '../db/schema.js';
import { urlToStoragePath } from './storage.service.js';

const VOLUME_ROOT = path.resolve(env.VOLUME_PATH);
const KNOWN_BUCKETS = [
  'chapter-pages', 'chapter-tools', 'visualizations', 'videos',
  'submission-files', 'problem-bank', 'ai-coaching', 'assignments', 'posts',
];

async function countFiles(dir: string): Promise<{ files: number; bytes: number }> {
  let files = 0;
  let bytes = 0;
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        const sub = await countFiles(full);
        files += sub.files;
        bytes += sub.bytes;
      } else if (e.isFile()) {
        files += 1;
        bytes += (await fs.stat(full)).size;
      }
    }
  } catch { /* 없는 디렉토리 */ }
  return { files, bytes };
}

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

/** DB 가 참조하는 URL 들 중 Volume 에 실제 파일이 없는 것을 샘플링(최대 limit 건) */
async function findMissing(urls: string[], limit = 20) {
  let missing = 0;
  const samples: string[] = [];
  for (const url of urls) {
    const parsed = urlToStoragePath(url);
    if (!parsed) continue;
    const abs = path.resolve(VOLUME_ROOT, parsed.bucket, parsed.path);
    if (!abs.startsWith(VOLUME_ROOT)) continue;
    if (!(await exists(abs))) {
      missing += 1;
      if (samples.length < limit) samples.push(url);
    }
  }
  return { total: urls.length, missing, samples };
}

/**
 * Volume 진단 정보.
 * - 어떤 env 로 경로가 정해졌는지(VOLUME_PATH / RAILWAY_VOLUME_MOUNT_PATH / 기본값)
 * - 루트 존재 여부·버킷별 파일 수/용량
 * - DB(시각화자료·영상·HTML 페이지)가 가리키는 파일이 실제로 있는지
 */
export async function getStorageInfo() {
  const rootExists = await exists(VOLUME_ROOT);
  let topLevel: string[] = [];
  try { topLevel = (await fs.readdir(VOLUME_ROOT)).sort(); } catch { /* ignore */ }

  const buckets = await Promise.all(
    [...new Set([...KNOWN_BUCKETS, ...topLevel])].sort().map(async (bucket) => ({
      bucket,
      exists: await exists(path.join(VOLUME_ROOT, bucket)),
      ...(await countFiles(path.join(VOLUME_ROOT, bucket))),
    })),
  );

  const [visRows, videoRows, htmlPages] = await Promise.all([
    db.select({ url: visualizations.htmlUrl }).from(visualizations),
    db.select({ url: videos.videoUrl }).from(videos),
    db.select({ url: pages.htmlUrl }).from(pages).where(isNotNull(pages.htmlUrl)),
  ]);

  const dbReferences = {
    visualizations: await findMissing(visRows.map((r) => r.url)),
    videos: await findMissing(videoRows.map((r) => r.url)),
    chapterHtmlPages: await findMissing(htmlPages.map((r) => r.url!).filter(Boolean)),
  };

  return {
    volumeRoot: VOLUME_ROOT,
    volumePathSource: env.VOLUME_PATH_SOURCE,
    env: {
      VOLUME_PATH: process.env.VOLUME_PATH ?? null,
      RAILWAY_VOLUME_MOUNT_PATH: process.env.RAILWAY_VOLUME_MOUNT_PATH ?? null,
      RAILWAY_VOLUME_NAME: process.env.RAILWAY_VOLUME_NAME ?? null,
      NODE_ENV: env.NODE_ENV,
    },
    rootExists,
    topLevel,
    buckets,
    dbReferences,
    warnings: [
      ...(env.VOLUME_PATH_SOURCE === 'default' && env.NODE_ENV === 'production'
        ? ['VOLUME_PATH / RAILWAY_VOLUME_MOUNT_PATH 가 없어 컨테이너 내부 ./local-storage 를 쓰고 있습니다. 재배포 시 업로드 파일이 사라집니다.'] : []),
      ...(!rootExists ? ['Volume 루트 디렉토리가 존재하지 않습니다.'] : []),
      ...(dbReferences.visualizations.missing > 0 ? [`시각화자료 ${dbReferences.visualizations.missing}건의 HTML 파일이 Volume 에 없습니다.`] : []),
      ...(dbReferences.videos.missing > 0 ? [`영상자료 ${dbReferences.videos.missing}건의 파일이 Volume 에 없습니다.`] : []),
      ...(dbReferences.chapterHtmlPages.missing > 0 ? [`챕터 HTML 페이지 ${dbReferences.chapterHtmlPages.missing}건의 파일이 Volume 에 없습니다.`] : []),
    ],
  };
}
