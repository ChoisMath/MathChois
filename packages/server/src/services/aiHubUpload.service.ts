import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { isAiHubFile, MANIFEST_FILE, validateManifest } from '@mathchois/shared';
import { env } from '../config/env.js';

// 이전 스크립트가 쓰는 토큰 업로드(me.chois.pro web/src/lib/media-upload.ts 의 handleUpload 이식).
// 파일은 <VOLUME_PATH>/ai-hub/<rel> 에만 쓴다 — rel 은 isAiHubFile 허용 목록을 통과해야 하고,
// 해석된 경로가 ai-hub 루트 밑인지 한 번 더 확인한다.

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const AI_HUB_ROOT = path.resolve(env.VOLUME_PATH, 'ai-hub');

export type UploadResult =
  | { ok: true; path: string; size: number }
  | { ok: false; status: 400 | 413 | 422; error: string };

class TooLarge extends Error {}

/** 허용 경로면 ai-hub 루트 밑 절대 경로, 아니면 null. */
export function resolveAiHubPath(rel: string): string | null {
  if (!isAiHubFile(rel)) return null;
  const dest = path.resolve(AI_HUB_ROOT, rel);
  return dest.startsWith(AI_HUB_ROOT + path.sep) ? dest : null;
}

/**
 * 스트림을 `${dest}.<uuid>.part` 에 쓰며 sha256·바이트 수를 센다. 한도 초과(413)·sha 불일치(422)·
 * manifest 검증 실패(422)·스트림 오류면 임시 파일을 지우고, 모두 통과해야 rename 으로 바꿔 넣는다.
 * 스트림 오류(클라이언트 중단 등)는 임시 파일을 지운 뒤 그대로 던진다.
 */
export async function saveUpload(
  rel: string,
  stream: Readable,
  expectedSha: string,
  maxBytes = MAX_UPLOAD_BYTES,
): Promise<UploadResult> {
  const dest = resolveAiHubPath(rel);
  if (!dest) return { ok: false, status: 400, error: 'path not allowed' };
  if (!/^[0-9a-f]{64}$/.test(expectedSha)) return { ok: false, status: 400, error: 'missing sha' };

  await mkdir(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.${randomUUID()}.part`;
  const hash = createHash('sha256');
  let bytes = 0;
  const meter = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      bytes += chunk.length;
      if (bytes > maxBytes) return done(new TooLarge());
      hash.update(chunk);
      done(null, chunk);
    },
  });

  try {
    try {
      await pipeline(stream, meter, createWriteStream(tmp));
    } catch (err) {
      if (err instanceof TooLarge) return { ok: false, status: 413, error: 'too large' };
      throw err;
    }
    if (hash.digest('hex') !== expectedSha) return { ok: false, status: 422, error: 'sha256 mismatch' };
    if (MANIFEST_FILE.test(rel)) {
      let errors: string[];
      try {
        errors = validateManifest(JSON.parse(await readFile(tmp, 'utf8')));
      } catch {
        errors = ['manifest: invalid json'];
      }
      if (errors.length) {
        console.error(`[ai-hub] ${rel} 검증 실패`, errors.slice(0, 20));
        return { ok: false, status: 422, error: 'invalid manifest' };
      }
    }
    await rename(tmp, dest);
    return { ok: true, path: rel, size: bytes };
  } finally {
    // 성공 시에는 이미 rename 되어 없으므로 force 로 조용히 넘어간다.
    await rm(tmp, { force: true });
  }
}
