import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

// 토큰 인증 업로드의 공통 몸통 — 버킷 루트·허용 목록·검증기는 호출하는 쪽이 넘긴다.
// config/env 를 가져오지 않는다(테스트가 env 없이 돌도록).

export type UploadResult =
  | { ok: true; path: string; size: number }
  | { ok: false; status: 400 | 413 | 422; error: string };

export type TokenUploadOptions = {
  /** 버킷 루트(절대 경로). */
  root: string;
  rel: string;
  stream: Readable;
  /** 64자리 소문자 hex. */
  expectedSha: string;
  maxBytes: number;
  isAllowed: (rel: string) => boolean;
  /** sha 확인 뒤 rename 전에 임시 파일을 검사한다. 빈 배열이면 통과. */
  validate?: (rel: string, tmpFile: string) => Promise<string[]>;
};

class TooLarge extends Error {}

/**
 * 스트림을 `${dest}.<uuid>.part` 에 쓰며 sha256·바이트 수를 센다. 한도 초과(413)·sha 불일치(422)·
 * validate 실패(422)면 임시 파일을 지우고, 모두 통과해야 rename 으로 바꿔 넣는다.
 * 스트림 오류(클라이언트 중단 등)는 임시 파일을 지운 뒤 그대로 던진다.
 * 검사 순서: 허용 경로(+루트 밑 확인) → sha 형식 → 쓰기.
 */
export async function saveTokenUpload(o: TokenUploadOptions): Promise<UploadResult> {
  const { root, rel, stream, expectedSha, maxBytes, isAllowed, validate } = o;
  if (!isAllowed(rel)) return { ok: false, status: 400, error: 'path not allowed' };
  const dest = path.resolve(root, rel);
  if (!dest.startsWith(path.resolve(root) + path.sep)) return { ok: false, status: 400, error: 'path not allowed' };
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
    if (validate) {
      const errors = await validate(rel, tmp);
      if (errors.length) return { ok: false, status: 422, error: 'invalid manifest' };
    }
    await rename(tmp, dest);
    return { ok: true, path: rel, size: bytes };
  } finally {
    // 성공 시에는 이미 rename 되어 없으므로 force 로 조용히 넘어간다.
    await rm(tmp, { force: true });
  }
}
