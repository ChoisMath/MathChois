import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';

const VOLUME_ROOT = path.resolve(env.VOLUME_PATH);

/**
 * 경로 traversal 방지: 최종 경로가 Volume 루트 내인지 확인
 */
function safePath(...segments: string[]): string {
  const resolved = path.resolve(VOLUME_ROOT, ...segments);
  if (!resolved.startsWith(VOLUME_ROOT)) {
    throw new Error('Path traversal detected');
  }
  return resolved;
}

/** 파일 저장 → 서빙 URL 반환 */
export async function uploadFile(
  bucket: string,
  directory: string,
  fileName: string,
  data: Buffer,
): Promise<string> {
  const dir = safePath(bucket, directory);
  await fs.mkdir(dir, { recursive: true });

  const filePath = safePath(bucket, directory, fileName);
  await fs.writeFile(filePath, data);

  // URL 패턴: /api/files/{bucket}/{directory}/{fileName}
  return `/api/files/${bucket}/${directory}/${fileName}`;
}

/** 파일 읽기 (스트림 대신 Buffer — 이미지는 작으므로 충분) */
export async function readFile(bucket: string, filePath: string): Promise<{
  data: Buffer;
  mimeType: string;
} | null> {
  try {
    const absPath = safePath(bucket, filePath);
    const data = await fs.readFile(absPath);
    const mimeType = getMimeType(filePath);
    return { data, mimeType };
  } catch {
    return null;
  }
}

/** 파일 삭제 */
export async function removeFile(bucket: string, filePath: string): Promise<boolean> {
  try {
    const absPath = safePath(bucket, filePath);
    await fs.unlink(absPath);
    return true;
  } catch {
    return false;
  }
}

/** 여러 파일 삭제 */
export async function removeFiles(bucket: string, filePaths: string[]): Promise<void> {
  await Promise.all(filePaths.map((p) => removeFile(bucket, p)));
}

/** 디렉토리 삭제 (비어 있을 때만) */
export async function removeDirectoryIfEmpty(bucket: string, dirPath: string): Promise<boolean> {
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
  return {
    bucket: parsed.bucket,
    dir: parsed.path.slice(0, lastSlash),
  };
}

/** URL에서 storage path 추출: /api/files/chapter-pages/chapters/xxx → chapters/xxx */
export function urlToStoragePath(url: string): { bucket: string; path: string } | null {
  const prefix = '/api/files/';
  const idx = url.indexOf(prefix);
  if (idx === -1) return null;

  const rest = url.slice(idx + prefix.length);
  const slashIdx = rest.indexOf('/');
  if (slashIdx === -1) return null;

  return {
    bucket: rest.slice(0, slashIdx),
    path: rest.slice(slashIdx + 1),
  };
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
  };
  return types[ext] ?? 'application/octet-stream';
}
