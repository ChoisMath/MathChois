// .media-out/ai-hub/ 을 서버(class.chois.pro)와 비교해 바뀐 파일만 올린다.
// 사용: npm run ai:push -- --set motion|slide|brand [--dry-run] [--no-prompts] [--overwrite-prompts] [--sync-prompts]
// 순서: 원격 manifest 와 sha 비교 → 바뀐 파일 PUT /api/ai/media(스트리밍, 동시 4개) → 프롬프트 JSON PUT /api/ai/prompts/:set
// → 마지막에 manifest. 하나라도 실패하면 manifest 는 올리지 않는다(다음 실행이 실패한 파일을 다시 찾도록).
// 프롬프트는 기본으로 서버에 없는 id 만 들어간다 — 관리자가 웹에서 고친 원본 템플릿을 덮어쓰지 않는다.
// 파일 내용으로 덮어써야 할 때만 --overwrite-prompts (PUT …?overwrite=1).
// --sync-prompts(motion|slide): ai:oppadu 가 만든 .media-out/prompts/<set>.oppadu.json 을 PUT …?mode=sync 로 보낸다 — 웹에서 고치지 않은
// 원본만 갱신하고, 바뀐 행의 이전 내용은 .oppadu/<날짜>/replaced-prompts-<set>.json 에 백업, 결과 줄은 그날 report.md 에 덧붙인다.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { diffManifest, formatPushBlock, formatPushResult, readSyncResponse, validateManifest, type Manifest, type PromptSyncResult } from '@mathchois/shared';
import { baseUrl, fetchRetry, mapLimit, requireEnv } from './http.js';
import { sha256File } from './manifest.js';
import { AI_DIR, OPPADU_DIR, hasFlag, latestOppaduDir, manifestFile, parseSetArg, promptsFile, syncPromptsFile, type AiSet } from './volumeLayout.js';

const CONCURRENCY = 4;

async function readJsonFile(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, 'utf8'));
}

const pad = (n: number) => String(n).padStart(2, '0');
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * 서버가 바꾼 행의 이전 내용(`replaced`)을 최신 `.oppadu/<날짜>/replaced-prompts-<set>.json` 에 저장하고(폴더가 없으면 오늘 날짜로 만든다),
 * 결과 줄을 그 폴더 report.md 끝에 덧붙인다. 같은 날 다시 올려도 앞선 백업을 잃지 않도록 이미 있는 백업 뒤에 이어 붙인다.
 */
async function writeSyncBackup(set: 'motion' | 'slide', r: PromptSyncResult<unknown>): Promise<string> {
  const dir = latestOppaduDir() ?? path.join(OPPADU_DIR, today());
  await mkdir(dir, { recursive: true });
  const backup = path.join(dir, `replaced-prompts-${set}.json`);
  let entries: unknown[] = [];
  if (existsSync(backup)) {
    try {
      const prev = JSON.parse(await readFile(backup, 'utf8'));
      if (Array.isArray(prev)) entries = prev;
    } catch { /* 깨진 백업은 새 내용으로 대체 */ }
  }
  await writeFile(backup, `${JSON.stringify([...entries, ...r.replaced], null, 2)}\n`);
  const shown = path.relative(process.cwd(), backup);
  await appendFile(path.join(dir, 'report.md'), formatPushBlock(formatPushResult(set, r, shown)));
  return shown;
}

async function main() {
  const argv = process.argv.slice(2);
  const set = parseSetArg(argv, true) as AiSet;
  const dryRun = hasFlag(argv, '--dry-run');
  const noPrompts = hasFlag(argv, '--no-prompts');
  const overwritePrompts = hasFlag(argv, '--overwrite-prompts');
  const syncPrompts = hasFlag(argv, '--sync-prompts');
  if (syncPrompts) {
    if (overwritePrompts || noPrompts) throw new Error('--sync-prompts cannot be combined with --overwrite-prompts/--no-prompts');
    if (set === 'brand') throw new Error('--sync-prompts needs --set motion|slide (brand has no prompts)');
  }
  const base = baseUrl(process.env.AI_PUSH_URL, 'http://localhost:3001');
  const auth = { authorization: `Bearer ${requireEnv('AI_MEDIA_UPLOAD_TOKEN', 'the server\'s upload token')}` };

  const manifestPath = manifestFile(set);
  if (!existsSync(manifestPath)) {
    throw new Error(`${path.relative(process.cwd(), manifestPath)} missing — run ai:pull (first migration) or ai:${set === 'motion' ? 'prepare' : set + ':import'} first`);
  }
  // 프롬프트는 DB 에만 들어가는 유일한 비공개 자료다. 파일이 없는데 조용히 넘어가면 me.chois.pro 폐쇄 뒤 영영 잃으므로 올리기 전에 멈춘다.
  const promptPath = set === 'brand' ? null : syncPrompts ? syncPromptsFile(set) : promptsFile(set);
  if (promptPath && syncPrompts && !existsSync(promptPath)) {
    throw new Error(`${path.relative(process.cwd(), promptPath)} missing — run npm run ai:oppadu first`);
  }
  if (promptPath && !syncPrompts && !noPrompts && !existsSync(promptPath)) {
    throw new Error(`${path.relative(process.cwd(), promptPath)} missing — run ai:pull / ai:${set}:import first, or pass --no-prompts for a media-only push`);
  }
  const local = (await readJsonFile(manifestPath)) as Manifest;
  const localErrors = validateManifest(local);
  if (localErrors.length) throw new Error(`local manifest invalid: ${localErrors.slice(0, 5).join('; ')}`);

  const remoteRes = await fetchRetry(`${base}/api/ai/media/manifest?set=${set}`, () => ({ headers: auth }), { label: 'manifest fetch' });
  if (remoteRes.status === 401 || remoteRes.status === 503) {
    throw new Error(`manifest fetch: ${remoteRes.status} ${remoteRes.status === 401 ? 'AI_MEDIA_UPLOAD_TOKEN was rejected' : 'upload is disabled on the server (AI_MEDIA_UPLOAD_TOKEN unset there)'}`);
  }
  if (!remoteRes.ok) throw new Error(`manifest fetch failed: ${remoteRes.status} ${await remoteRes.text()}`);
  const remote = (await remoteRes.json()) as Manifest;
  const remoteErrors = validateManifest(remote);
  if (remoteErrors.length) throw new Error(`remote manifest invalid: ${remoteErrors.slice(0, 5).join('; ')}`);

  const changed = diffManifest(local, remote);
  console.info(`${changed.length} changed of ${Object.keys(local).length}`);
  if (dryRun) {
    for (const rel of changed) console.info(`would upload ${rel}`);
    return;
  }

  const putFile = async (rel: string, expectedSha?: string) => {
    const file = path.join(AI_DIR, rel);
    if (!existsSync(file)) throw new Error('file missing locally');
    const sha = await sha256File(file);
    // manifest 가 오래되면 서버 manifest 가 실제 파일과 어긋나므로 올리기 전에 막는다.
    if (expectedSha && sha !== expectedSha) throw new Error('file changed since the manifest was built — rebuild it');
    const size = statSync(file).size;
    const res = await fetchRetry(`${base}/api/ai/media?path=${encodeURIComponent(rel)}`, () => ({
      method: 'PUT',
      // manifest/*.json 도 포함해 언제나 octet-stream — 서버는 본문을 파서 없이 스트림으로 받는다.
      headers: { ...auth, 'x-content-sha256': sha, 'content-length': String(size), 'content-type': 'application/octet-stream' },
      body: Readable.toWeb(createReadStream(file)) as ReadableStream,
      duplex: 'half',
    } as RequestInit), { label: rel });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  };

  const failures: string[] = [];
  const attempt = async (rel: string, run: () => Promise<void>) => {
    try {
      await run();
      console.info(`uploaded ${rel}`);
    } catch (err) {
      failures.push(rel);
      console.error(`FAILED ${rel}: ${err instanceof Error ? err.message : err}`);
    }
  };

  await mapLimit(changed, CONCURRENCY, (rel) => attempt(rel, () => putFile(rel, local[rel]?.sha256)));

  if (promptPath) {
    if (noPrompts) {
      console.info('--no-prompts — prompts not sent');
    } else {
      const body = JSON.stringify(await readJsonFile(promptPath));
      await attempt(`prompts/${set}`, async () => {
        const query = syncPrompts ? '?mode=sync' : overwritePrompts ? '?overwrite=1' : '';
        const res = await fetchRetry(`${base}/api/ai/prompts/${set}${query}`, () => ({
          method: 'PUT', headers: { ...auth, 'content-type': 'application/json' }, body,
        }), { label: `prompts/${set}` });
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        if (syncPrompts && set !== 'brand') {
          // 2단계 이전 서버는 mode 를 무시하고 1단계 응답을 준다 — 백업을 쓰지 않고 이 단계를 실패로 둔다(manifest 보류, 종료 코드 1).
          const r = readSyncResponse(await res.json());
          try {
            console.info(formatPushResult(set, r, await writeSyncBackup(set, r)));
          } catch (err) {
            // 서버는 이미 바꿨다. 백업을 못 쓰면 이전 내용이 사라지므로 화면에라도 남긴다.
            console.error(`backup write failed: ${err instanceof Error ? err.message : err}\n${JSON.stringify(r.replaced)}`);
            throw err;
          }
          return;
        }
        const r = (await res.json()) as { count: number; inserted?: number; updated?: number; skipped?: number };
        console.info(overwritePrompts
          ? `prompts ${set}: ${r.count} sent — ${r.inserted} inserted, ${r.updated} updated (--overwrite-prompts)`
          : `prompts ${set}: ${r.count} sent — ${r.inserted} inserted, ${r.skipped} skipped (already on the server; web edits kept — --overwrite-prompts replaces them)`);
      });
    }
  }

  if (failures.length) {
    console.error(`${failures.length} failed, manifest not uploaded — fix and rerun`);
    process.exitCode = 1;
    return;
  }
  await attempt(`manifest/${set}.json`, () => putFile(`manifest/${set}.json`));
  if (failures.length) {
    process.exitCode = 1;
    return;
  }
  console.info('done');
}

main().catch((err) => {
  // fetch 실패는 message 가 'fetch failed' 뿐이라 원인(연결 거부·DNS·프록시 등)을 같이 보인다.
  const cause = err instanceof Error && err.cause instanceof Error ? ` (${err.cause.message})` : '';
  console.error(`${err instanceof Error ? err.message : err}${cause}`);
  process.exit(1);
});
