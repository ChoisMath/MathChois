import { readFile } from 'node:fs/promises';
import { embedBrandHtml, isBrandSiteFile } from '@mathchois/shared';
import { resolveAiHubPath } from './aiHubUpload.service.js';

// 오빠두엑셀 브랜드 룩북 사본(<VOLUME_PATH>/ai-hub/brand/)을 iframe 으로 서빙한다.
// 요청 경로는 isBrandSiteFile 허용 목록을 통과해야 하고(업로드와 같은 규칙), 해석된 경로가
// ai-hub 루트 밑인지 resolveAiHubPath 가 한 번 더 확인한다.

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
};

export type BrandFileResult =
  | { status: 404 }
  | { status: 200; body: Buffer | string; contentType: string; cacheControl: string };

export async function serveBrandFile(rel: string): Promise<BrandFileResult> {
  if (!isBrandSiteFile(rel)) return { status: 404 };
  const file = resolveAiHubPath('brand/' + rel);
  if (!file) return { status: 404 };

  let data: Buffer;
  try {
    data = await readFile(file);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { status: 404 };
    throw err;
  }

  const contentType = CONTENT_TYPES[rel.slice(rel.lastIndexOf('.'))] ?? 'application/octet-stream';
  if (contentType.startsWith('text/html')) {
    return { status: 200, body: embedBrandHtml(data.toString('utf8')), contentType, cacheControl: 'private, no-cache' };
  }
  return { status: 200, body: data, contentType, cacheControl: 'private, max-age=600' };
}
