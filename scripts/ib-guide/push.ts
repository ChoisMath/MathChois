// IA 작성 예시 PDF 폴더를 쪽 이미지로 바꿔 서버(class.chois.pro) ib-guide 버킷에 올린다. 절차·옵션: scripts/ib-guide/README.md
// 사용: npm run ib:push -- --dir "<PDF 폴더>" [--dry-run] [--only ex26]
// 순서: 폴더의 PDF → .ib-out/ia/<exId>/<doc>/NNN.webp(바뀐 PDF 만 다시 그림) → .ib-out/manifest/ia.json
// → 서버 manifest 와 sha 비교 → 바뀐 쪽만 PUT /api/ib/media(스트리밍, 동시 4개) → 마지막에 manifest.
// 서버는 manifest 에 적힌 파일이 크기까지 맞게 디스크에 있어야 manifest 를 받으므로, 하나라도 실패하면 manifest 는 올리지 않는다.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import {
  IB_MANIFEST_REL, diffIbFiles, iaPageRel, isIaExampleId, planIaFiles, validateIbManifest,
  type IaDoc, type IaExample, type IaFile, type IbManifest,
} from '@mathchois/shared';
import { baseUrl, fetchRetry, mapLimit, requireEnv } from '../ai-hub/http.js';
import { sha256File } from '../ai-hub/manifest.js';
import { renderPdf } from './render.js';

const CONCURRENCY = 4;
// 예시 30개 × 문서 3개면 쪽이 수백 장이라 분당 300 요청 한도에 걸릴 수 있다. 하나라도 떨어지면 manifest 를 못 올리므로 오래 기다린다.
const MEDIA_ATTEMPTS = 30;
// 연결 끊김·프록시 오류(502/503/504)는 잠깐 뒤 다시 보내면 대개 붙는다. 4번까지, 2·4·8초 간격.
const TRANSIENT_ATTEMPTS = 4;
const TRANSIENT_STATUS = new Set([502, 503, 504]);
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** 저장소 루트(npm run 실행 위치) 기준 `.ib-out/` — 서버 `<VOLUME_PATH>/ib-guide/` 와 같은 배치. git 에 넣지 않는다. */
const OUT_DIR = path.resolve('.ib-out');
const outPath = (rel: string) => path.join(OUT_DIR, ...rel.split('/'));
const docDir = (exId: string, doc: IaDoc) => path.join(OUT_DIR, 'ia', exId, doc);
const SOURCE_FILE = '.source.json';

/** 지난 변환의 기록 — 원본 sha 가 같고 쪽 파일이 모두 있으면 다시 그리지 않는다. */
type SourceRecord = { file: string; sha256: string; pages: number; popupNotes: number };

function argValue(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  if (i === -1) return undefined;
  const v = argv[i + 1];
  if (!v || v.startsWith('--')) throw new Error(`${flag} needs a value`);
  return v;
}

async function readSource(exId: string, doc: IaDoc): Promise<SourceRecord | null> {
  const dir = docDir(exId, doc);
  try {
    const r = JSON.parse(await readFile(path.join(dir, SOURCE_FILE), 'utf8')) as SourceRecord;
    if (typeof r.sha256 !== 'string' || !Number.isInteger(r.pages) || r.pages < 1) return null;
    for (let n = 1; n <= r.pages; n++) {
      if (!existsSync(outPath(iaPageRel(exId, doc, n)))) return null;
    }
    return { ...r, popupNotes: Number.isInteger(r.popupNotes) ? r.popupNotes : 0 };
  } catch {
    return null;
  }
}

/** 원본이 지난번과 같으면 기록을, 아니면 폴더를 비우고 다시 그린 기록을 돌려준다. */
async function renderItem(dirIn: string, item: IaFile): Promise<{ record: SourceRecord; rendered: boolean }> {
  const pdf = path.join(dirIn, item.name);
  const sha256 = await sha256File(pdf);
  const prev = await readSource(item.exId, item.doc);
  if (prev && prev.sha256 === sha256) return { record: prev, rendered: false };

  const out = docDir(item.exId, item.doc);
  // 쪽 수가 줄어든 PDF 의 남은 쪽이 섞이지 않도록 폴더째 비운다.
  await rm(out, { recursive: true, force: true });
  console.info(`render ${item.name} → ${path.relative(process.cwd(), out)}`);
  let rendered: { pages: number; popupNotes: number };
  try {
    rendered = await renderPdf(pdf, out);
  } catch (err) {
    // 처음 실행에서 어느 PDF 가 깨졌는지 바로 알 수 있게 파일 이름을 붙인다.
    throw new Error(`render ${item.name}: ${err instanceof Error ? err.message : err}`);
  }
  const { pages, popupNotes } = rendered;
  const record: SourceRecord = { file: item.name, sha256, pages, popupNotes };
  await writeFile(path.join(out, SOURCE_FILE), `${JSON.stringify(record, null, 2)}\n`);
  return { record, rendered: true };
}

type ExampleText = { title: string; note: string };

async function readExampleTexts(dirIn: string, known: Set<string>): Promise<Map<string, ExampleText>> {
  const file = path.join(dirIn, 'examples.json');
  const out = new Map<string, ExampleText>();
  if (!existsSync(file)) return out;
  let json: unknown;
  try {
    json = JSON.parse(await readFile(file, 'utf8'));
  } catch (err) {
    throw new Error(`examples.json: ${err instanceof Error ? err.message : err}`);
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) throw new Error('examples.json: must be an object like { "ex26": { "title": "…", "note": "…" } }');
  for (const [id, v] of Object.entries(json)) {
    if (!known.has(id)) {
      console.warn(`examples.json: ${id} has no PDF in the folder — ignored`);
      continue;
    }
    const e = (typeof v === 'object' && v !== null ? v : {}) as { title?: unknown; note?: unknown };
    out.set(id, { title: typeof e.title === 'string' ? e.title : '', note: typeof e.note === 'string' ? e.note : '' });
  }
  return out;
}

async function main() {
  const argv = process.argv.slice(2);
  const dirIn = argValue(argv, '--dir');
  if (!dirIn) throw new Error('usage: npm run ib:push -- --dir "<PDF folder>" [--dry-run] [--only ex26]');
  const dryRun = argv.includes('--dry-run');
  const only = argValue(argv, '--only');
  if (only !== undefined && !isIaExampleId(only)) throw new Error(`--only needs an example id like ex26 (got ${only})`);
  const base = baseUrl(process.env.IB_PUSH_URL, 'http://localhost:3001');
  const auth = { authorization: `Bearer ${requireEnv('IB_MEDIA_UPLOAD_TOKEN', 'the server\'s IB upload token')}` };

  // 1. 폴더(맨 위만) → 예시·문서 목록
  const names = (await readdir(dirIn, { withFileTypes: true })).filter((e) => e.isFile()).map((e) => e.name);
  const plan = planIaFiles(names);
  if (plan.duplicates.length) {
    for (const d of plan.duplicates) console.error(`${d.exId}/${d.doc} has more than one PDF — keep one:\n  ${d.names.join('\n  ')}`);
    process.exitCode = 1;
    return;
  }
  for (const name of plan.skipped) console.info(`skip ${name} (not …ex<no>_student|annotated|comments.pdf)`);
  if (only && !plan.items.some((it) => it.exId === only)) throw new Error(`--only ${only}: no PDF for that example in the folder`);

  // 2. 변환(바뀐 PDF 만). --only 면 그 예시만 다시 그리고, 나머지는 지난 변환 결과를 그대로 manifest 에 싣는다.
  const records = new Map<IaFile, SourceRecord>();
  let renderedCount = 0;
  for (const item of plan.items) {
    let record: SourceRecord | null;
    if (only && item.exId !== only) {
      record = await readSource(item.exId, item.doc);
      if (!record) {
        console.warn(`${item.name}: not rendered yet — left out (run without --only to add it)`);
        continue;
      }
    } else {
      const r = await renderItem(dirIn, item);
      record = r.record;
      if (r.rendered) renderedCount++;
    }
    records.set(item, record);
    if (record.popupNotes > 0) {
      console.warn(`⚠ ${item.name}: 말풍선 메모 ${record.popupNotes}개는 쪽 이미지에 글이 보이지 않습니다 — PDF에서 메모를 본문에 인쇄(Flatten)한 뒤 다시 올리세요.`);
    }
  }

  // 3. 설명(선택)
  const texts = await readExampleTexts(dirIn, new Set(plan.items.map((it) => it.exId)));

  // 4. manifest — 지금 폴더에 PDF 가 있는 문서만. 폴더에서 지운 PDF 는 여기서 빠져 화면에서 사라진다.
  const examples = new Map<string, IaExample>();
  const files: IbManifest['files'] = {};
  for (const [item, record] of records) {
    let ex = examples.get(item.exId);
    if (!ex) {
      const t = texts.get(item.exId);
      ex = { id: item.exId, no: item.no, title: t?.title ?? '', note: t?.note ?? '', docs: {} };
      examples.set(item.exId, ex);
    }
    ex.docs[item.doc] = { pages: record.pages };
    for (let n = 1; n <= record.pages; n++) {
      const rel = iaPageRel(item.exId, item.doc, n);
      const file = outPath(rel);
      files[rel] = { sha256: await sha256File(file), size: statSync(file).size };
    }
  }
  const manifest: IbManifest = {
    version: 1,
    examples: [...examples.values()].sort((a, b) => a.no - b.no),
    files: Object.fromEntries(Object.entries(files).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
  };
  const errors = validateIbManifest(manifest);
  if (errors.length) throw new Error(`manifest invalid: ${errors.slice(0, 5).join('; ')}`);
  const manifestPath = outPath(IB_MANIFEST_REL);
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  // 5. 서버와 비교
  const remoteRes = await fetchRetry(`${base}/api/ib/media/manifest`, () => ({ headers: auth }), { label: 'manifest fetch' });
  if (remoteRes.status === 401) throw new Error('manifest fetch: 401 IB_MEDIA_UPLOAD_TOKEN was rejected');
  if (remoteRes.status === 503) throw new Error('manifest fetch: 503 upload is disabled on the server (IB_MEDIA_UPLOAD_TOKEN unset there)');
  if (!remoteRes.ok) throw new Error(`manifest fetch failed: ${remoteRes.status} ${await remoteRes.text()}`);
  // 처음에는 서버가 `{}` 를 준다 — files 가 없으면 전부 올릴 대상.
  const remote = (await remoteRes.json()) as Partial<IbManifest>;
  const changed = diffIbFiles(manifest.files, remote.files);
  const pageCount = Object.keys(manifest.files).length;
  console.info(`${changed.length} changed of ${pageCount} page files (${renderedCount} PDF rendered)`);
  if (dryRun) {
    for (const rel of changed) console.info(`would upload ${rel}`);
    console.info(`would upload ${IB_MANIFEST_REL}`);
    return;
  }

  // 6. 바뀐 쪽 올리기
  const retryLater = async (rel: string, why: string, attempt: number) => {
    const wait = 2000 * 2 ** (attempt - 1);
    console.warn(`${why} ${rel}: retrying in ${wait / 1000}s (attempt ${attempt + 1}/${TRANSIENT_ATTEMPTS})`);
    await sleep(wait);
  };
  const putFile = async (rel: string) => {
    const file = outPath(rel);
    const sha = await sha256File(file);
    // manifest 를 만든 뒤 파일이 바뀌면 서버 manifest 가 실제 파일과 어긋나므로 올리기 전에 막는다.
    const expected = manifest.files[rel]?.sha256;
    if (expected && sha !== expected) throw new Error('file changed since the manifest was built — rerun');
    const size = statSync(file).size;
    for (let attempt = 1; ; attempt++) {
      let res: Response;
      try {
        // 스트림 본문은 다시 쓸 수 없으므로 요청 설정은 시도마다 새로 만든다(fetchRetry 의 init 도 마찬가지). 429 는 fetchRetry 가 기다린다.
        res = await fetchRetry(`${base}/api/ib/media?path=${encodeURIComponent(rel)}`, () => ({
          method: 'PUT',
          headers: { ...auth, 'x-content-sha256': sha, 'content-length': String(size), 'content-type': 'application/octet-stream' },
          body: Readable.toWeb(createReadStream(file)) as ReadableStream,
          duplex: 'half',
        } as RequestInit), { label: rel, attempts: MEDIA_ATTEMPTS });
      } catch (err) {
        // fetch 의 네트워크 실패는 TypeError 다. 429 를 다 기다리고도 실패한 것(Error)은 다시 보내지 않는다.
        if (!(err instanceof TypeError) || attempt >= TRANSIENT_ATTEMPTS) throw err;
        const cause = err.cause instanceof Error ? ` (${err.cause.message})` : '';
        await retryLater(rel, `${err.message}${cause}`, attempt);
        continue;
      }
      if (res.ok) return;
      const body = await res.text();
      if (!TRANSIENT_STATUS.has(res.status) || attempt >= TRANSIENT_ATTEMPTS) throw new Error(`${res.status} ${body}`);
      await retryLater(rel, String(res.status), attempt);
    }
  };

  const failures: string[] = [];
  const attempt = async (rel: string) => {
    try {
      await putFile(rel);
      console.info(`uploaded ${rel}`);
    } catch (err) {
      failures.push(rel);
      console.error(`FAILED ${rel}: ${err instanceof Error ? err.message : err}`);
    }
  };
  await mapLimit(changed, CONCURRENCY, attempt);
  if (failures.length) {
    console.error(`${failures.length} failed, manifest not uploaded — fix and rerun:\n  ${failures.join('\n  ')}`);
    process.exitCode = 1;
    return;
  }

  // 7. manifest 는 마지막에
  await attempt(IB_MANIFEST_REL);
  if (failures.length) {
    process.exitCode = 1;
    return;
  }
  console.info(`done — ${manifest.examples.length} examples, ${pageCount} pages, ${changed.length} uploaded, ${pageCount - changed.length} unchanged`);
}

main().catch((err) => {
  // fetch 실패는 message 가 'fetch failed' 뿐이라 원인(연결 거부·DNS·프록시 등)을 같이 보인다.
  const cause = err instanceof Error && err.cause instanceof Error ? ` (${err.cause.message})` : '';
  console.error(`${err instanceof Error ? err.message : err}${cause}`);
  process.exit(1);
});
