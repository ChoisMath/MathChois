import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import path from 'node:path';
import { env } from '../config/env.js';
import { bucketRelPath } from '../utils/bucketPath.js';

const VOLUME_ROOT = path.resolve(env.VOLUME_PATH);

/**
 * 해석된 경로가 AI활용 허브 버킷(ai-hub) 안이면 버킷 기준 상대 경로('/' 구분, 버킷 자체면 ''), 아니면 null.
 * 버킷 이름 문자열만 비교하면 `x/../ai-hub` 나 경로 안의 `..` 로 우회되므로 실제로 해석된 경로로 판단한다.
 */
export function aiHubRelPath(...segments: string[]): string | null {
  return bucketRelPath(VOLUME_ROOT, 'ai-hub', ...segments);
}

/**
 * aiHubRelPath 와 같은 규칙으로 IB 안내 버킷(ib-guide) 안인지 판단한다.
 * ib-guide 에는 워터마크 없는 원본 페이지가 있어 공개 파일이 하나도 없다 — 이 모듈의 일반 함수는
 * 읽기·쓰기·확인·삭제를 모두 거부하고, 원본은 IB 전용 서비스가 권한 확인·워터마크 합성 뒤에만 내보낸다.
 */
export function ibGuideRelPath(...segments: string[]): string | null {
  return bucketRelPath(VOLUME_ROOT, 'ib-guide', ...segments);
}

function ibGuideDenied(): Error {
  return Object.assign(new Error('ib-guide 버킷은 일반 저장소 경로로 접근할 수 없습니다'), { statusCode: 403 });
}

/**
 * 경로 traversal 방지: 최종 경로가 Volume 루트 내인지 확인.
 * ib-guide 버킷 안으로 해석되는 경로도 던진다 — 위 함수들의 앞선 확인(null/false 반환)을 빠뜨린
 * 새 함수가 생겨도 원본 페이지에 닿지 못하고 닫힌 쪽으로 실패하게 한다.
 */
function safePath(...segments: string[]): string {
  const resolved = path.resolve(VOLUME_ROOT, ...segments);
  if (!resolved.startsWith(VOLUME_ROOT)) {
    throw new Error('Path traversal detected');
  }
  if (ibGuideRelPath(...segments) !== null) throw ibGuideDenied();
  return resolved;
}

/** 파일 저장 → 서빙 URL 반환 */
export async function uploadFile(
  bucket: string,
  directory: string,
  fileName: string,
  data: Buffer,
): Promise<string> {
  if (ibGuideRelPath(bucket, directory, fileName) !== null) throw ibGuideDenied();
  const dir = safePath(bucket, directory);
  await fs.mkdir(dir, { recursive: true });

  const filePath = safePath(bucket, directory, fileName);
  await fs.writeFile(filePath, data);

  // URL 패턴: /api/files/{bucket}/{directory}/{fileName}
  return `/api/files/${bucket}/${directory}/${fileName}`;
}

/**
 * 스트림을 디스크에 직접 기록한다(메모리 버퍼링 없음 — 수 GB 영상 업로드용).
 * 기록 도중 오류/한도 초과(`onAbort`가 true 반환) 시 부분 파일을 삭제한다.
 */
export async function uploadStream(
  bucket: string,
  directory: string,
  fileName: string,
  source: Readable,
  isTruncated?: () => boolean,
): Promise<{ url: string; size: number }> {
  if (ibGuideRelPath(bucket, directory, fileName) !== null) throw ibGuideDenied();
  const dir = safePath(bucket, directory);
  await fs.mkdir(dir, { recursive: true });
  const filePath = safePath(bucket, directory, fileName);

  try {
    await pipeline(source, createWriteStream(filePath));
    if (isTruncated?.()) {
      throw Object.assign(new Error('파일 크기 한도를 초과했습니다.'), { statusCode: 413 });
    }
    const { size } = await fs.stat(filePath);
    return { url: `/api/files/${bucket}/${directory}/${fileName}`, size };
  } catch (err) {
    await fs.unlink(filePath).catch(() => {});
    throw err;
  }
}

/** 파일 메타(크기·MIME) — 스트리밍 서빙용. 없으면 null */
export async function statFile(bucket: string, filePath: string): Promise<{
  size: number;
  mimeType: string;
} | null> {
  if (ibGuideRelPath(bucket, filePath) !== null) return null;
  try {
    const absPath = safePath(bucket, filePath);
    const st = await fs.stat(absPath);
    if (!st.isFile()) return null;
    return { size: st.size, mimeType: getMimeType(filePath) };
  } catch {
    return null;
  }
}

/** 파일 읽기 스트림 (Range 요청용 start/end 는 inclusive 바이트 오프셋) */
export function openFileStream(bucket: string, filePath: string, range?: { start: number; end: number }) {
  if (ibGuideRelPath(bucket, filePath) !== null) throw ibGuideDenied();
  const absPath = safePath(bucket, filePath);
  return createReadStream(absPath, range ? { start: range.start, end: range.end } : undefined);
}

/** 파일 읽기 (스트림 대신 Buffer — 이미지는 작으므로 충분) */
export async function readFile(bucket: string, filePath: string): Promise<{
  data: Buffer;
  mimeType: string;
} | null> {
  if (ibGuideRelPath(bucket, filePath) !== null) return null;
  try {
    const absPath = safePath(bucket, filePath);
    const data = await fs.readFile(absPath);
    const mimeType = getMimeType(filePath);
    return { data, mimeType };
  } catch {
    return null;
  }
}

/**
 * 파일 삭제. ai-hub·ib-guide 버킷은 토큰 업로드 API 만 관리하므로 지우지 않는다(false = 지운 것 없음) —
 * DB 에 저장된 URL 을 지우는 서비스가 어떤 경로로든 허브·IB 자료를 지우지 못하게 한다.
 */
export async function removeFile(bucket: string, filePath: string): Promise<boolean> {
  if (aiHubRelPath(bucket, filePath) !== null) return false;
  if (ibGuideRelPath(bucket, filePath) !== null) return false;
  try {
    const absPath = safePath(bucket, filePath);
    await fs.unlink(absPath);
    return true;
  } catch {
    return false;
  }
}

/** 여러 파일 삭제 (removeFile 을 거치므로 ai-hub·ib-guide 는 건너뛴다) */
export async function removeFiles(bucket: string, filePaths: string[]): Promise<void> {
  await Promise.all(filePaths.map((p) => removeFile(bucket, p)));
}

/** 디렉토리 삭제 (비어 있을 때만, ai-hub·ib-guide 버킷은 건드리지 않는다) */
export async function removeDirectoryIfEmpty(bucket: string, dirPath: string): Promise<boolean> {
  if (aiHubRelPath(bucket, dirPath) !== null) return false;
  if (ibGuideRelPath(bucket, dirPath) !== null) return false;
  try {
    const absPath = safePath(bucket, dirPath);
    const entries = await fs.readdir(absPath);
    if (entries.length === 0) {
      await fs.rmdir(absPath);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** URL에서 부모 디렉토리 경로 추출 */
export function urlToParentDir(url: string): { bucket: string; dir: string } | null {
  const parsed = urlToStoragePath(url);
  if (!parsed) return null;
  const lastSlash = parsed.path.lastIndexOf('/');
  if (lastSlash === -1) return null;
  const dir = parsed.path.slice(0, lastSlash);
  // 마지막 조각이 `..` 이면 파일 경로는 버킷 밖이어도 부모는 ib-guide 일 수 있다 — 부모도 따로 본다.
  if (ibGuideRelPath(parsed.bucket, dir) !== null) return null;
  return { bucket: parsed.bucket, dir };
}

/**
 * URL에서 storage path 추출: /api/files/chapter-pages/chapters/xxx → chapters/xxx
 * ib-guide 를 가리키는 URL 은 null — DB 에 저장된 URL 을 받아 파일을 읽거나 복제하는 호출부
 * (copyHtmlToChapterTools, 코칭·문제 이미지 읽기 등)가 원본 페이지에 닿지 못하게 한다.
 */
export function urlToStoragePath(url: string): { bucket: string; path: string } | null {
  const prefix = '/api/files/';
  const idx = url.indexOf(prefix);
  if (idx === -1) return null;

  const rest = url.slice(idx + prefix.length);
  const slashIdx = rest.indexOf('/');
  if (slashIdx === -1) return null;

  const bucket = rest.slice(0, slashIdx);
  const filePath = rest.slice(slashIdx + 1);
  if (ibGuideRelPath(bucket, filePath) !== null) return null;
  return { bucket, path: filePath };
}

/**
 * 시각화자료 원본 HTML을 chapter-tools 버킷으로 복제한다.
 * 페이지는 이 복사본을 참조하므로 원본 수정/삭제와 독립적이다.
 */
export async function copyHtmlToChapterTools(
  sourceHtmlUrl: string,
  chapterId: string,
): Promise<string> {
  const parsed = urlToStoragePath(sourceHtmlUrl);
  if (!parsed) {
    throw Object.assign(new Error('잘못된 HTML URL'), { statusCode: 400 });
  }
  if (parsed.bucket !== 'visualizations') {
    throw Object.assign(new Error('시각화자료 버킷의 HTML만 복제할 수 있습니다'), { statusCode: 400 });
  }
  const file = await readFile(parsed.bucket, parsed.path);
  if (!file) {
    throw Object.assign(new Error('원본 HTML 파일을 찾을 수 없습니다'), { statusCode: 400 });
  }
  const baseName = parsed.path.split('/').pop() ?? 'tool.html';
  const fileName = `${Date.now()}_${baseName}`;
  return uploadFile('chapter-tools', `chapters/${chapterId}`, fileName, file.data);
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const types: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.zip': 'application/zip',
    '.txt': 'text/plain',
    '.vtt': 'text/vtt', // <track> 은 이 MIME 을 요구한다
    '.html': 'text/html',
    '.htm': 'text/html',
    '.mp4': 'video/mp4',
    '.m4v': 'video/x-m4v',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.ogv': 'video/ogg',
    '.mp3': 'audio/mpeg',
  };
  return types[ext] ?? 'application/octet-stream';
}
