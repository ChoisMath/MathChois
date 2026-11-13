// .media-out/ai-hub/ 의 파일 목록과 sha256 을 manifest 로 만든다(서버가 같은 형식을 `validateManifest` 로 검사한다).
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isAiHubFile, validateManifest, type Manifest } from '@mathchois/shared';
import { AI_DIR, manifestFile, type AiSet } from './volumeLayout.js';

const MOTION_FILES = ['video.mp4', 'preview.mp4', 'poster.webp'] as const;

export async function sha256File(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

async function walk(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries.filter((e) => e.isFile()).map((e) => path.join(e.parentPath, e.name));
}

/**
 * `outDir`(= .media-out/ai-hub) 아래 `set` 의 파일을 훑어 manifest 를 만든다. 키는 `isAiHubFile` 을 통과한 상대 경로만
 * (그 밖의 파일은 서버가 받지 않으므로 빼고 알린다). 모션은 편마다 3파일, 슬라이드는 모든 webp, 브랜드는 manifest.json 만 뺀 전부.
 */
export async function buildManifest(outDir: string, set: AiSet): Promise<Manifest> {
  const base = path.join(outDir, set);
  const files = set === 'motion'
    ? (await walk(base)).filter((f) => (MOTION_FILES as readonly string[]).includes(path.basename(f)))
    : set === 'slide'
      ? (await walk(base)).filter((f) => f.endsWith('.webp'))
      : (await walk(base)).filter((f) => path.basename(f) !== 'manifest.json' || path.dirname(f) !== base);
  const out: Manifest = {};
  const ignored: string[] = [];
  for (const file of files) {
    const rel = path.relative(outDir, file).split(path.sep).join('/');
    if (!isAiHubFile(rel)) {
      ignored.push(rel);
      continue;
    }
    const info = await stat(file);
    out[rel] = { size: info.size, sha256: await sha256File(file), updatedAt: info.mtime.toISOString() };
  }
  if (ignored.length) console.warn(`manifest ${set}: ${ignored.length} file(s) not allowed on the server were left out, e.g. ${ignored.slice(0, 3).join(', ')}`);
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/** manifest 를 만들어 검증한 뒤 `.media-out/ai-hub/manifest/<set>.json` 에 쓴다. */
export async function writeManifest(set: AiSet, outDir = AI_DIR): Promise<Manifest> {
  const manifest = await buildManifest(outDir, set);
  const errors = validateManifest(manifest);
  if (errors.length) throw new Error(`manifest ${set}: ${errors.slice(0, 5).join('; ')}`);
  const file = manifestFile(set);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(manifest, null, 1) + '\n');
  return manifest;
}
