import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { isAiHubFile, MANIFEST_FILE, validateManifest } from '@mathchois/shared';
import { env } from '../config/env.js';
import { saveTokenUpload, type UploadResult } from './tokenUpload.service.js';

// 이전 스크립트가 쓰는 토큰 업로드(me.chois.pro web/src/lib/media-upload.ts 의 handleUpload 이식).
// 파일은 <VOLUME_PATH>/ai-hub/<rel> 에만 쓴다 — rel 은 isAiHubFile 허용 목록을 통과해야 하고,
// 해석된 경로가 ai-hub 루트 밑인지 한 번 더 확인한다. 쓰기 몸통은 tokenUpload.service 와 공유한다.

export type { UploadResult };
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const AI_HUB_ROOT = path.resolve(env.VOLUME_PATH, 'ai-hub');

/** 허용 경로면 ai-hub 루트 밑 절대 경로, 아니면 null. */
export function resolveAiHubPath(rel: string): string | null {
  if (!isAiHubFile(rel)) return null;
  const dest = path.resolve(AI_HUB_ROOT, rel);
  return dest.startsWith(AI_HUB_ROOT + path.sep) ? dest : null;
}

/** manifest 경로면 shared validateManifest 로 검사한다. */
async function validateAiHubFile(rel: string, tmp: string): Promise<string[]> {
  if (!MANIFEST_FILE.test(rel)) return [];
  let errors: string[];
  try {
    errors = validateManifest(JSON.parse(await readFile(tmp, 'utf8')));
  } catch {
    errors = ['manifest: invalid json'];
  }
  if (errors.length) console.error(`[ai-hub] ${rel} 검증 실패`, errors.slice(0, 20));
  return errors;
}

export function saveUpload(
  rel: string,
  stream: Readable,
  expectedSha: string,
  maxBytes = MAX_UPLOAD_BYTES,
): Promise<UploadResult> {
  return saveTokenUpload({
    root: AI_HUB_ROOT, rel, stream, expectedSha, maxBytes,
    isAllowed: isAiHubFile,
    validate: validateAiHubFile,
  });
}
