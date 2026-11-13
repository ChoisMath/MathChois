import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import {
  IB_MANIFEST_REL, iaPageCount, iaPageRel, isIaPageFile, isIbGuideFile, validateIbManifest,
  type IaDoc, type IbManifest,
} from '@mathchois/shared';
import { env } from '../config/env.js';
import { applyWatermark, buildWatermarkTile, createTileCache, watermarkText } from './ibWatermark.service.js';
import { saveTokenUpload, type UploadResult } from './tokenUpload.service.js';

// IB교육과정 안내 버킷(<VOLUME_PATH>/ib-guide) 전용 읽기·쓰기.
// 일반 storage.service 는 이 버킷을 일부러 거부하므로(원본 페이지 유출 방지) 여기서 node:fs 로 직접 다룬다.
// 페이지 원본은 이 모듈 밖으로 나가지 않고, 라우트는 워터마크 합성 결과만 보낸다.

export type { UploadResult };
export const IB_GUIDE_ROOT = path.resolve(env.VOLUME_PATH, 'ib-guide');
export const IB_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** 허용 목록을 통과한 rel 의 버킷 안 절대 경로. 루트 밖으로 해석되면 null. */
function resolveIbPath(rel: string): string | null {
  if (!isIbGuideFile(rel)) return null;
  const abs = path.resolve(IB_GUIDE_ROOT, rel);
  return abs.startsWith(IB_GUIDE_ROOT + path.sep) ? abs : null;
}

// ─── manifest ───────────────────────────────────────

let manifestCache: { mtimeMs: number; value: IbManifest | null } | null = null;

/** manifest/ia.json — 파일 mtime 이 바뀔 때만 다시 읽는다. 없거나 모양이 잘못되면 null. */
export async function readIbManifest(): Promise<IbManifest | null> {
  const file = path.join(IB_GUIDE_ROOT, IB_MANIFEST_REL);
  let mtimeMs: number;
  try {
    mtimeMs = (await stat(file)).mtimeMs;
  } catch {
    manifestCache = null;
    return null; // 아직 올린 적 없음
  }
  if (manifestCache && manifestCache.mtimeMs === mtimeMs) return manifestCache.value;
  let value: IbManifest | null = null;
  try {
    const json: unknown = JSON.parse(await readFile(file, 'utf8'));
    const errors = validateIbManifest(json);
    // mtime 별로 캐시되므로 같은 파일에 대해 한 번만 기록된다.
    if (errors.length) console.error('[ib-guide] manifest/ia.json 모양이 잘못되었습니다', errors.slice(0, 20));
    else value = json as IbManifest;
  } catch (err) {
    console.error('[ib-guide] manifest/ia.json 을 읽지 못했습니다', err);
  }
  manifestCache = { mtimeMs, value };
  return value;
}

// ─── 페이지 ─────────────────────────────────────────

/** 원본 페이지(WebP). manifest 의 페이지 수 범위(1..n) 밖이거나 파일이 없으면 null. */
export async function readIaPage(exId: string, doc: IaDoc, n: number): Promise<Buffer | null> {
  if (!Number.isInteger(n) || n < 1) return null;
  if (n > iaPageCount(await readIbManifest(), exId, doc)) return null;
  // 경로는 검증된 조각으로만 만든다(iaPageRel) — 그래도 허용 목록·루트 확인을 한 번 더 거친다.
  const rel = iaPageRel(exId, doc, n);
  const abs = isIaPageFile(rel) ? resolveIbPath(rel) : null;
  if (!abs) return null;
  try {
    return await readFile(abs);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

// 합성은 CPU·메모리를 많이 쓰고 sharp 는 libuv 스레드풀에서 돈다. 스레드풀을 합성이 다 차지하면
// 다른 요청의 fs·gzip·bcrypt·DNS 가 밀리므로 동시에 2개까지만 돌리고 나머지는 줄을 세운다.
const MAX_CONCURRENT_COMPOSITES = 2;
let running = 0;
const waiting: (() => void)[] = [];

async function withCompositeSlot<T>(task: () => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT_COMPOSITES) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  } else {
    running++;
  }
  try {
    return await task();
  } finally {
    // 자리를 다음 대기자에게 그대로 넘긴다(넘길 대기자가 없을 때만 running 을 줄인다).
    const next = waiting.shift();
    if (next) next();
    else running--;
  }
}

const tileCache = createTileCache();

/**
 * 사용자별 워터마크를 합성한 WebP. 실패하면 던진다(호출하는 쪽이 500 으로 답한다).
 * clientGone 이 자리를 얻은 시점에 true 면 합성하지 않고 null 을 돌려준다 — 호출하는 쪽은 아무것도 보내지 않는다.
 */
export async function watermarkedIaPage(
  page: Buffer,
  who: { id: string; name: string; email: string },
  now: Date = new Date(),
  clientGone: () => boolean = () => false,
): Promise<Buffer | null> {
  const text = watermarkText(who, now);
  // 날짜가 문구에 들어 있으므로 하루가 지나면 키가 바뀌어 새 타일을 만든다.
  const tile = await tileCache.get(`${who.id}|${text}`, () => buildWatermarkTile(text));
  // 줄을 서는 동안 페이지를 넘기거나 창을 닫은 요청은 자리를 얻어도 합성하지 않고 다음 차례로 넘긴다.
  return withCompositeSlot(async () => (clientGone() ? null : applyWatermark(page, tile)));
}

// ─── 토큰 업로드 ────────────────────────────────────

/**
 * manifest 는 shared validateIbManifest 를 통과해야 하고, files 에 적힌 페이지가 모두 이미 디스크에
 * 적힌 크기로 있어야 한다 — 그래서 ib:push 는 페이지를 다 올린 뒤 manifest 를 마지막에 올린다.
 */
async function validateIbFile(rel: string, tmp: string): Promise<string[]> {
  if (rel !== IB_MANIFEST_REL) return [];
  let errors: string[];
  try {
    const json: unknown = JSON.parse(await readFile(tmp, 'utf8'));
    errors = validateIbManifest(json);
    if (!errors.length) {
      for (const [fileRel, entry] of Object.entries((json as IbManifest).files)) {
        const abs = resolveIbPath(fileRel);
        let size: number | null = null;
        if (abs) {
          try {
            size = (await stat(abs)).size;
          } catch {
            size = null;
          }
        }
        if (size === null) errors.push(`file not uploaded: ${fileRel}`);
        else if (size !== entry.size) errors.push(`size mismatch: ${fileRel}`);
      }
    }
  } catch {
    errors = ['manifest: invalid json'];
  }
  if (errors.length) console.error(`[ib-guide] ${rel} 검증 실패`, errors.slice(0, 20));
  return errors;
}

export async function saveIbUpload(rel: string, stream: Readable, sha: string): Promise<UploadResult> {
  return saveTokenUpload({
    root: IB_GUIDE_ROOT, rel, stream, expectedSha: sha, maxBytes: IB_MAX_UPLOAD_BYTES,
    isAllowed: isIbGuideFile,
    validate: validateIbFile,
  });
}
