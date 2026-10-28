// 1회성 이전: me.chois.pro(폐쇄 예정)의 모션·슬라이드·브랜드 자료와 비공개 프롬프트를 .media-out/ 으로 전부 내려받는다.
// 사용: npm run ai:pull [-- --set motion|slide|brand] [--dry-run]
// 순서: manifest(토큰) → 각 파일(공개 주소, sha256 대조·3회 재시도, 같은 sha 는 건너뜀) → 프롬프트 JSON(토큰)
// 받은 파일은 곧바로 MathChois 배치(.media-out/ai-hub/<rel>)로 둔다. 이어서 ai:push 로 class.chois.pro 에 올린다.
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, statSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { meUrlPath, toAiHubRel, validateManifest, type Manifest } from '@mathchois/shared';
import { baseUrl, fetchRetry, mapLimit, requireEnv } from './http.js';
import { sha256File } from './manifest.js';
import { AI_DIR, SETS, hasFlag, manifestFile, parseSetArg, promptsFile } from './volumeLayout.js';

const CONCURRENCY = 6;
const TRIES = 3;
const ADMIN_FILES = { motion: 'private/motion-admin.json', slide: 'private/slide-admin.json' } as const;

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;

async function main() {
  const argv = process.argv.slice(2);
  const only = parseSetArg(argv, false);
  const dryRun = hasFlag(argv, '--dry-run');
  const me = baseUrl(process.env.ME_PULL_URL, 'https://me.chois.pro');
  const auth = { authorization: `Bearer ${requireEnv('ME_MEDIA_UPLOAD_TOKEN', 'me.chois.pro MEDIA_UPLOAD_TOKEN')}` };

  const tokenGet = async (urlPath: string, label: string) => {
    const res = await fetchRetry(`${me}${urlPath}`, () => ({ headers: auth }), { label });
    if (res.status === 401) throw new Error(`${label}: 401 — ME_MEDIA_UPLOAD_TOKEN was rejected by ${me}`);
    return res;
  };

  /** 받아야 하면 true. 이미 같은 sha 가 있으면 false. */
  const needsDownload = async (dest: string, sha: string, size: number) =>
    !(existsSync(dest) && statSync(dest).size === size && (await sha256File(dest)) === sha);

  const download = async (url: string, token: boolean, dest: string, sha: string): Promise<void> => {
    let lastError = 'unknown';
    for (let t = 1; t <= TRIES; t++) {
      const tmp = `${dest}.part`;
      try {
        const res = await fetchRetry(url, () => (token ? { headers: auth } : {}), { label: path.basename(dest) });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        await mkdir(path.dirname(dest), { recursive: true });
        const hash = createHash('sha256');
        const meter = new Transform({ transform(chunk, _enc, done) { hash.update(chunk); done(null, chunk); } });
        await pipeline(Readable.fromWeb(res.body as never), meter, createWriteStream(tmp));
        if (hash.digest('hex') !== sha) throw new Error('sha256 mismatch');
        await rename(tmp, dest);
        return;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        await rm(tmp, { force: true });
      }
    }
    throw new Error(lastError);
  };

  let totalFailed = 0;
  for (const set of only ? [only] : SETS) {
    const res = await tokenGet(`/api/media/manifest?set=${set}`, `manifest ${set}`);
    if (!res.ok) throw new Error(`manifest ${set}: HTTP ${res.status}`);
    const remote = (await res.json()) as Record<string, { size: number; sha256: string; updatedAt: string }>;

    // me 의 manifest 라우트는 파일이 없으면 200 {} 를 돌려준다 — 빈 채로 "성공"하면 이전이 조용히 빠지므로 실패로 본다.
    if (Object.keys(remote).length === 0) {
      console.error(`FAILED set ${set}: ${me} returned an empty manifest (the manifest file is missing on its volume, or the wrong URL/token)`);
      totalFailed++;
      continue;
    }

    const jobs: { key: string; rel: string; url: string; token: boolean; entry: Manifest[string] }[] = [];
    const skipped: string[] = [];
    for (const [key, entry] of Object.entries(remote)) {
      const rel = toAiHubRel(key);
      const from = meUrlPath(key);
      if (rel === null || from === null) skipped.push(key);
      else jobs.push({ key, rel, url: `${me}${from.path}`, token: from.token, entry });
    }
    if (skipped.length) console.warn(`set ${set}: ${skipped.length} path(s) MathChois does not accept were skipped, e.g. ${skipped.slice(0, 3).join(', ')}`);

    const todo = new Set<string>();
    await mapLimit(jobs, CONCURRENCY, async (j) => {
      if (await needsDownload(path.join(AI_DIR, j.rel), j.entry.sha256, j.entry.size)) todo.add(j.rel);
    });

    const failed: string[] = [];
    if (!dryRun) {
      let done = 0;
      await mapLimit(jobs.filter((j) => todo.has(j.rel)), CONCURRENCY, async (j) => {
        try {
          await download(j.url, j.token, path.join(AI_DIR, j.rel), j.entry.sha256);
          if (++done % 25 === 0) console.info(`  ${set}: ${done}/${todo.size}`);
        } catch (err) {
          failed.push(j.rel);
          console.error(`FAILED ${j.rel}: ${err instanceof Error ? err.message : err}`);
        }
      });
      // 내려받은(또는 이미 있던) 파일만 MathChois 키로 바꿔 manifest 에 둔다.
      const converted: Manifest = {};
      for (const j of jobs.slice().sort((a, b) => (a.rel < b.rel ? -1 : 1))) if (!failed.includes(j.rel)) converted[j.rel] = j.entry;
      const errors = validateManifest(converted);
      if (errors.length) throw new Error(`manifest ${set}: ${errors.slice(0, 5).join('; ')}`);
      await mkdir(path.dirname(manifestFile(set)), { recursive: true });
      await writeFile(manifestFile(set), JSON.stringify(converted, null, 1) + '\n');
    }

    const bytes = jobs.reduce((sum, j) => sum + j.entry.size, 0);
    const label = dryRun ? `${todo.size} to download` : `${todo.size - failed.length} downloaded, ${jobs.length - todo.size} up to date`;
    console.info(`set ${set}: ${jobs.length} files, ${mb(bytes)}, ${failed.length} failed (${label})`);
    totalFailed += failed.length;
  }

  // 비공개 프롬프트(motion/slide)는 파일이 아니라 JSON 한 벌 — 토큰이 있어야 받을 수 있다.
  for (const set of (only ? [only] : SETS).filter((s): s is 'motion' | 'slide' => s !== 'brand')) {
    const res = await tokenGet(`/api/media/file?path=${encodeURIComponent(ADMIN_FILES[set])}`, `prompts ${set}`);
    // 프롬프트는 me.chois.pro 폐쇄 뒤에는 되찾을 수 없는 유일한 비공개 자료라, 404 를 포함한 모든 200 아님은 실패다.
    if (res.status !== 200) {
      console.error(`FAILED prompts ${set}: ${ADMIN_FILES[set]} → HTTP ${res.status} from ${me} (is GET /api/media/file deployed there?)`);
      totalFailed++;
      continue;
    }
    const text = await res.text();
    const rows: unknown = JSON.parse(text);
    if (!Array.isArray(rows) || rows.some((r) => typeof r !== 'object' || r === null || typeof (r as { id?: unknown }).id !== 'string')) {
      throw new Error(`prompts ${set}: not a list of { id, … }`);
    }
    if (dryRun) {
      console.info(`prompts ${set}: ${rows.length} items (dry run, not written)`);
      continue;
    }
    await mkdir(path.dirname(promptsFile(set)), { recursive: true });
    await writeFile(promptsFile(set), text);
    console.info(`prompts ${set}: ${rows.length} items → ${path.relative(process.cwd(), promptsFile(set))}`);
  }

  if (totalFailed) {
    console.error(`${totalFailed} failed — rerun ai:pull (finished files are skipped)`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  // fetch 실패는 message 가 'fetch failed' 뿐이라 원인(연결 거부·DNS·프록시 등)을 같이 보인다.
  const cause = err instanceof Error && err.cause instanceof Error ? ` (${err.cause.message})` : '';
  console.error(`${err instanceof Error ? err.message : err}${cause}`);
  process.exit(1);
});
