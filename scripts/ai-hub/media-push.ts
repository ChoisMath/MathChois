// .media-out/ai-hub/ 을 서버(class.chois.pro)와 비교해 바뀐 파일만 올린다.
// 사용: npm run ai:push -- --set motion|slide|brand [--dry-run]
// 순서: 원격 manifest 와 sha 비교 → 바뀐 파일 PUT /api/ai/media(스트리밍, 동시 4개) → 프롬프트 JSON PUT /api/ai/prompts/:set
// → 마지막에 manifest. 하나라도 실패하면 manifest 는 올리지 않는다(다음 실행이 실패한 파일을 다시 찾도록).
import { createReadStream, existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { diffManifest, validateManifest, type Manifest } from '@mathchois/shared';
import { baseUrl, fetchRetry, mapLimit, requireEnv } from './http.js';
import { sha256File } from './manifest.js';
import { AI_DIR, hasFlag, manifestFile, parseSetArg, promptsFile, type AiSet } from './volumeLayout.js';

const CONCURRENCY = 4;

async function readJsonFile(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function main() {
  const argv = process.argv.slice(2);
  const set = parseSetArg(argv, true) as AiSet;
  const dryRun = hasFlag(argv, '--dry-run');
  const noPrompts = hasFlag(argv, '--no-prompts');
  const base = baseUrl(process.env.AI_PUSH_URL, 'http://localhost:3001');
  const auth = { authorization: `Bearer ${requireEnv('AI_MEDIA_UPLOAD_TOKEN', 'the server\'s upload token')}` };

  const manifestPath = manifestFile(set);
  if (!existsSync(manifestPath)) {
    throw new Error(`${path.relative(process.cwd(), manifestPath)} missing — run ai:pull (first migration) or ai:${set === 'motion' ? 'prepare' : set + ':import'} first`);
  }
  // 프롬프트는 DB 에만 들어가는 유일한 비공개 자료다. 파일이 없는데 조용히 넘어가면 me.chois.pro 폐쇄 뒤 영영 잃으므로 올리기 전에 멈춘다.
  const promptPath = set === 'brand' ? null : promptsFile(set);
  if (promptPath && !noPrompts && !existsSync(promptPath)) {
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
        const res = await fetchRetry(`${base}/api/ai/prompts/${set}`, () => ({
          method: 'PUT', headers: { ...auth, 'content-type': 'application/json' }, body,
        }), { label: `prompts/${set}` });
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        console.info(`prompts ${set}: ${JSON.stringify(await res.json())}`);
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
