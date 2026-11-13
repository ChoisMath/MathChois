# IB교육과정 안내 허브 · IA작성예시 (보호 열람) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teachers push IA example PDFs from their PC as page images; permitted users read them at `/ib/ia` with [학생 보고서] [주석본] [채점 코멘트] tabs, every page arriving with the viewer's name burned into the pixels and no PDF ever reaching the server or the browser.

**Architecture:** A new hub `/ib/*` mirrors the AI활용 hub (route guard + layout outside DashboardLayout, per-classroom switch, shared access function). Page images live unwatermarked in a new Volume bucket `ib-guide` that every generic storage path refuses; the only way out is `GET /api/ib/ia/:exId/:doc/pages/:n`, which checks login + permission per request and composites a per-user watermark tile with sharp. Material goes in through a token-authenticated upload API driven by `npm run ib:push`, which rasterises PDFs locally with pdf.js + @napi-rs/canvas.

**Tech Stack:** Fastify 5, Drizzle/Postgres, sharp (new server dependency), pdfjs-dist 6.4.299 legacy build + @napi-rs/canvas (script only), React 19 + React Router 7, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-10-ib-guide-ia-examples-design.md` — read it first; this plan argues from it.

## Global Constraints

- Branch `claude/practical-rubin-0a2viy`; commit per task; no PR unless asked; no model identifiers in committed artifacts.
- **No PDF and no page image is ever committed.** `.ib-out/` goes in `.gitignore` in Task 6; test fixtures are generated at run time.
- **Never send an unwatermarked page.** Any failure between reading the page and finishing the composite is a 500.
- Bucket name `ib-guide`. Allowed paths: `ia/ex\d{2}/(student|annotated|comments)/\d{3}\.webp` and `manifest/ia.json`. Example ids `ex01`–`ex99`; pages `001`–`999`.
- Access rule: admin or teacher always; student only with ≥ 1 classroom whose `ib_guide_enabled` is true. Re-checked on every request.
- Page images: 1600 px wide WebP quality 80. Watermarked response: `webp({ quality: 80, effort: 2 })`.
- Watermark (values verified by a probe on sharp 0.34.5 — keep them): Pango markup `<span foreground="#000000" alpha="14%">TEXT</span>`, `font: 'Pretendard 18'`, `dpi: 144`, `rgba: true`; extend top/bottom 36, left/right 24 (transparent); rotate −30° (transparent); composite with `tile: true`. Text is `이름 · 이메일 · YYYY-MM-DD` (Asia/Seoul date).
- Response headers on page images: `Content-Type: image/webp`, `Content-Disposition: inline`, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, `X-Robots-Tag: noindex`, `Cross-Origin-Resource-Policy: same-origin`.
- Env var `IB_MEDIA_UPLOAD_TOKEN` (≥ 32 chars; empty/unset → upload API 503; shorter → boot warning + treated as unset). Separate from `AI_MEDIA_UPLOAD_TOKEN`.
- UI copy (exact): hub title `IB교육과정 안내`, tab `IA작성예시`, header button label `IB안내`, switch `학생에게 IB 안내 열기`, doc tabs `학생 보고서` · `주석본` · `채점 코멘트`, empty list `아직 올라온 예시가 없어요`, print notice `인쇄할 수 없는 자료입니다`, card title `예시 26` (number without leading zero).
- Shared code is exercised by tests in `packages/client/src/lib/*.test.js` (repo convention: `aiHub*.test.js`). Server unit tests are `packages/server/src/**/*.test.ts` and **must not import `config/env.ts`** (it exits the process without a full env) — keep tested server modules env-free and pass roots/paths as arguments.
- Library usage: before using a sharp or pdf.js API not listed in this plan, check the current docs (Context7 `/lovell/sharp`; pdf.js via the installed `node_modules/pdfjs-dist` types). The calls listed here were run against the installed versions on 2026-11-10.
- Checks before each commit: the task's tests; before the final commit `npm run lint`, `npm test -w @mathchois/client`, `npm test -w @mathchois/server`, `npm run build`.

## Review Focus

1. **A generic storage path leaks the unwatermarked image.** `copyHtmlToChapterTools`, coaching/problem image readers and `/api/files/*` all go through `storage.service`. Expected: every generic read/write/delete/stat on `ib-guide` (including `x/../ib-guide` spellings) fails closed. Tests in Task 3.
2. **Name or email breaks the watermark.** A display name containing `&`, `<`, `>` is invalid Pango markup; a very long email makes a tile larger than the page, which `composite` rejects. Expected: escaped / tile shrunk to fit, image still served watermarked. Tests in Task 2.
3. **Font file missing in the container.** sharp does **not** throw for a bad `fontfile` — it silently falls back (or renders tofu). Expected: the service checks the file itself and throws; Docker check looks at a real rendered name. Tests in Task 2, check in Task 9.
4. **Annotated PDFs whose notes live in popup annotations.** pdf.js paints highlight/ink/free-text appearances onto the canvas but not the text of sticky-note popups. Expected: `ib:push` counts annotations that carry `contents` but no painted text and prints a warning per document, so the teacher learns before students do. Step in Task 6.
5. **Switch turned off while a student is reading.** Expected: the next page request is 403 and the client leaves for the classroom list rather than showing endless retry buttons. Checks in Task 5 (API smoke) and Task 8 (browser smoke).
6. **Folder with odd file names.** ` (1)` suffixes, `_comment` vs `_comments`, upper case, two files for one example/doc, unrelated PDFs. Expected: suffix/case/singular accepted, duplicates stop the run naming both files, unrelated files listed and skipped. Tests in Task 1.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/shared/src/ib-guide/access.ts` | `canUseIbGuide` decision table |
| `packages/shared/src/ib-guide/paths.ts` | doc kinds, allowed bucket paths, page path builder |
| `packages/shared/src/ib-guide/fileName.ts` | PC folder file-name parsing and grouping |
| `packages/shared/src/ib-guide/manifest.ts` | manifest type, validation, diff, page counts |
| `packages/server/src/services/ibWatermark.service.ts` | text → tile → composite (env-free) |
| `packages/server/src/utils/bucketPath.ts` | resolved-path-inside-bucket test (env-free) |
| `packages/server/src/services/tokenUpload.service.ts` | streamed sha-checked upload into a root (env-free) |
| `packages/server/src/services/ibGuideAccess.service.ts` | classroom count → access |
| `packages/server/src/services/ibGuide.service.ts` | bucket root, manifest cache, page read, upload wrapper, composite limiter |
| `packages/server/src/middleware/ibGuide.ts` | `requireIbGuide` |
| `packages/server/src/routes/ibGuide.ts` | the five `/api/ib/*` routes |
| `packages/server/scripts/ib-guide-e2e-setup.ts` | fixtures for API + browser smoke |
| `scripts/ib-guide/{push,render}.ts`, `README.md` | PDF → WebP → upload |
| `packages/client/src/lib/ibGuide/{guard,viewer,pageFetch}.js` | redirect rule, viewer maths, authed bitmap fetch |
| `packages/client/src/pages/IbGuide/*` | route guard, layout, list, viewer |
| `packages/client/src/components/ibGuide/ProtectedPage.jsx` | one page on a canvas |

---

### Task 1: Shared `ib-guide` module

**Files:**
- Create: `packages/shared/src/ib-guide/{access,paths,fileName,manifest,index}.ts`
- Modify: `packages/shared/src/index.ts` (add `export * from './ib-guide/index.js';`)
- Test: `packages/client/src/lib/ibGuideShared.test.js`

**Interfaces — Produces:**

```ts
// access.ts
export type IbGuideAccessInput = { role: 'teacher' | 'student' | null; isAdmin: boolean; allowedClassroomCount: number };
export function canUseIbGuide(a: IbGuideAccessInput): boolean;

// paths.ts
export const IA_DOCS = ['student', 'annotated', 'comments'] as const;
export type IaDoc = (typeof IA_DOCS)[number];
export const IB_MANIFEST_REL = 'manifest/ia.json';
export function isIaDoc(v: unknown): v is IaDoc;
export function isIaExampleId(v: unknown): v is string;          // /^ex\d{2}$/
export function isIaPageFile(rel: string): boolean;              // ia/exNN/<doc>/NNN.webp, NNN 001..999
export function isIbGuideFile(rel: string): boolean;             // page file or IB_MANIFEST_REL
export function iaPageRel(exId: string, doc: IaDoc, n: number): string; // ('ex26','student',1) → 'ia/ex26/student/001.webp'

// fileName.ts
export type IaFile = { name: string; exId: string; no: number; doc: IaDoc };
export function parseIaFileName(name: string): Omit<IaFile, 'name'> | null;
export function planIaFiles(names: readonly string[]): {
  items: IaFile[];                                             // sorted by no, then IA_DOCS order
  skipped: string[];                                           // .pdf names that did not parse
  duplicates: { exId: string; doc: IaDoc; names: string[] }[]; // same example+doc more than once
};

// manifest.ts
export type IaExample = { id: string; no: number; title: string; note: string; docs: Partial<Record<IaDoc, { pages: number }>> };
export type IbFileEntry = { sha256: string; size: number };
export type IbManifest = { version: 1; examples: IaExample[]; files: Record<string, IbFileEntry> };
export function validateIbManifest(json: unknown): string[];    // [] = valid
export function iaPageCount(m: IbManifest | null, exId: string, doc: IaDoc): number; // 0 when absent
export function diffIbFiles(local: IbManifest['files'], remote: IbManifest['files'] | undefined): string[]; // rels whose sha differs or is missing remotely, sorted
```

- [ ] **Step 1: Write the failing tests** in `ibGuideShared.test.js` (import everything from `@mathchois/shared`):

```js
describe('canUseIbGuide', () => {
  it.each([
    [{ role: null, isAdmin: false, allowedClassroomCount: 0 }, false],
    [{ role: 'student', isAdmin: false, allowedClassroomCount: 0 }, false],
    [{ role: 'student', isAdmin: false, allowedClassroomCount: 1 }, true],
    [{ role: 'teacher', isAdmin: false, allowedClassroomCount: 0 }, true],
    [{ role: 'student', isAdmin: true, allowedClassroomCount: 0 }, true],
  ])('%o → %s', (a, ok) => expect(canUseIbGuide(a)).toBe(ok));
});

describe('paths', () => {
  it('builds and accepts page paths', () => {
    expect(iaPageRel('ex26', 'student', 1)).toBe('ia/ex26/student/001.webp');
    expect(isIbGuideFile('ia/ex26/annotated/024.webp')).toBe(true);
    expect(isIbGuideFile('manifest/ia.json')).toBe(true);
  });
  it.each(['ia/ex26/student/000.webp', 'ia/ex26/student/1.webp', 'ia/ex7/student/001.webp', 'ia/ex26/other/001.webp',
    'ia/ex26/student/001.png', '/ia/ex26/student/001.webp', 'ia/ex26/student/../student/001.webp',
    'ia/ex26/student/001.webp?x=1', 'manifest/other.json', 'ia/ex26/student/001.pdf'])('rejects %s', (rel) =>
    expect(isIbGuideFile(rel)).toBe(false));
});

describe('parseIaFileName', () => {
  it.each([
    ['COMMON_1-29__ex26_student.pdf', { exId: 'ex26', no: 26, doc: 'student' }],
    ['COMMON_1-29__ex26_annotated (1).pdf', { exId: 'ex26', no: 26, doc: 'annotated' }],
    ['COMMON_1-29__ex24_comments (1).pdf', { exId: 'ex24', no: 24, doc: 'comments' }],
    ['COMMON_1-29__ex3_comment.pdf', { exId: 'ex03', no: 3, doc: 'comments' }],
    ['common_1-29__EX26_STUDENT.PDF', { exId: 'ex26', no: 26, doc: 'student' }],
  ])('%s', (name, want) => expect(parseIaFileName(name)).toEqual(want));
  it.each(['notes.pdf', 'COMMON_1-29__ex26_student.docx', 'COMMON_1-29__ex0_student.pdf', 'COMMON_1-29__ex126_student.pdf',
    'COMMON_1-29__index26_student.pdf'])('null for %s', (name) => expect(parseIaFileName(name)).toBeNull());
});

it('planIaFiles sorts, skips and reports duplicates', () => {
  const r = planIaFiles(['a__ex02_comments.pdf', 'a__ex10_student.pdf', 'a__ex02_student.pdf', 'a__ex02_student (1).pdf', 'readme.pdf', 'x.txt']);
  expect(r.items.map((i) => `${i.exId}/${i.doc}`)).toEqual(['ex02/student', 'ex02/student', 'ex02/comments', 'ex10/student']);
  expect(r.skipped).toEqual(['readme.pdf']);            // non-pdf files are ignored silently
  expect(r.duplicates).toEqual([{ exId: 'ex02', doc: 'student', names: ['a__ex02_student (1).pdf', 'a__ex02_student.pdf'] }]);
});

describe('validateIbManifest', () => {
  const sha = 'a'.repeat(64);
  const ok = () => ({ version: 1,
    examples: [{ id: 'ex26', no: 26, title: '', note: '', docs: { student: { pages: 2 }, comments: { pages: 1 } } }],
    files: { 'ia/ex26/student/001.webp': { sha256: sha, size: 10 }, 'ia/ex26/student/002.webp': { sha256: sha, size: 10 },
      'ia/ex26/comments/001.webp': { sha256: sha, size: 10 } } });
  it('accepts a consistent manifest', () => expect(validateIbManifest(ok())).toEqual([]));
  it('accepts an empty one', () => expect(validateIbManifest({ version: 1, examples: [], files: {} })).toEqual([]));
  it.each([
    ['not an object', () => [], /object/],
    ['wrong version', () => ({ ...ok(), version: 2 }), /version/],
    ['missing page file', () => { const m = ok(); delete m.files['ia/ex26/student/002.webp']; return m; }, /ia\/ex26\/student\/002\.webp/],
    ['file no example claims', () => { const m = ok(); m.files['ia/ex27/student/001.webp'] = { sha256: sha, size: 1 }; return m; }, /ex27/],
    ['path outside the allow-list', () => { const m = ok(); m.files['../x'] = { sha256: sha, size: 1 }; return m; }, /not allowed/],
    ['id/no mismatch', () => { const m = ok(); m.examples[0].no = 5; return m; }, /ex26/],
    ['duplicate id', () => { const m = ok(); m.examples.push(m.examples[0]); return m; }, /duplicate/],
    ['example without docs', () => { const m = ok(); m.examples[0].docs = {}; m.files = {}; return m; }, /docs/],
    ['pages = 0', () => { const m = ok(); m.examples[0].docs.comments.pages = 0; return m; }, /pages/],
    ['bad sha', () => { const m = ok(); m.files['ia/ex26/comments/001.webp'].sha256 = 'zz'; return m; }, /entry/],
    ['title too long', () => { const m = ok(); m.examples[0].title = 'x'.repeat(201); return m; }, /title/],
  ])('rejects %s', (_n, make, re) => expect(validateIbManifest(make()).join('\n')).toMatch(re));
});

it('iaPageCount and diffIbFiles', () => {
  const sha = (c) => c.repeat(64);
  const m = { version: 1, examples: [{ id: 'ex26', no: 26, title: '', note: '', docs: { student: { pages: 3 } } }], files: {} };
  expect(iaPageCount(m, 'ex26', 'student')).toBe(3);
  expect(iaPageCount(m, 'ex26', 'annotated')).toBe(0);
  expect(iaPageCount(null, 'ex26', 'student')).toBe(0);
  expect(diffIbFiles({ b: { sha256: sha('a'), size: 1 }, a: { sha256: sha('b'), size: 1 }, c: { sha256: sha('c'), size: 1 } },
    { a: { sha256: sha('b'), size: 1 }, c: { sha256: sha('d'), size: 1 } })).toEqual(['b', 'c']);
  expect(diffIbFiles({ a: { sha256: sha('a'), size: 1 } }, undefined)).toEqual(['a']);
});
```

- [ ] **Step 2: Run** `npm test -w @mathchois/client -- ibGuideShared` — Expected: FAIL (exports missing).
- [ ] **Step 3: Implement the five files.** Decisions the tests do not fix: title ≤ 200 chars, note ≤ 500; `pages` integer 1–999; manifest keys other than `version`/`examples`/`files` are an error; `planIaFiles` treats only names ending in `.pdf` (case-insensitive) as candidates and sorts `duplicates[].names` alphabetically. No `node:` imports (the module is bundled into the client).
- [ ] **Step 4: Run** the same command — Expected: PASS. Also `npm run typecheck -w @mathchois/shared` — no errors.
- [ ] **Step 5: Commit** `feat(ib-guide): shared access rule, paths, file names, manifest`.

---

### Task 2: Watermark service

**Files:**
- Create: `packages/server/src/services/ibWatermark.service.ts`
- Create: `packages/server/assets/fonts/Pretendard-Regular.otf`, `packages/server/assets/fonts/LICENSE-Pretendard.txt`
- Modify: `packages/server/package.json` (dependency `sharp`)
- Test: `packages/server/src/services/ibWatermark.service.test.ts`

**Interfaces — Produces (env-free):**

```ts
export const WATERMARK_FONT_FILE: string; // absolute; resolved from import.meta.url as ../../assets/fonts/Pretendard-Regular.otf (same relative path from src/services and dist/services)
export function watermarkText(who: { name: string; email: string }, now: Date): string;
export async function buildWatermarkTile(text: string, fontFile?: string): Promise<Buffer>; // PNG with alpha; rejects if fontFile is unreadable
export async function applyWatermark(page: Buffer, tile: Buffer): Promise<Buffer>;          // WebP, same pixel size as page
export function createTileCache(max?: number): { get(key: string, build: () => Promise<Buffer>): Promise<Buffer> }; // default 200, least-recently-used eviction, concurrent gets for one key share one build
```

- [ ] **Step 1: Add the dependency and the font.**
  - `npm install sharp@latest -w @mathchois/server` (check the release notes / Context7 `/lovell/sharp` for the installed version; requires Node ≥ 20.9).
  - `npm pack pretendard@1.3.9` in a temp dir outside the repo; copy `package/dist/public/static/Pretendard-Regular.otf` (1,574,352 bytes) and `package/dist/LICENSE.txt` (→ `LICENSE-Pretendard.txt`, SIL OFL 1.1) into `packages/server/assets/fonts/`.
- [ ] **Step 2: Write the failing tests.**

```ts
const white = (w = 1600, h = 2263) => sharp({ create: { width: w, height: h, channels: 3, background: '#ffffff' } }).webp().toBuffer();

it('watermarkText uses the Seoul date', () => {
  expect(watermarkText({ name: '홍길동', email: 'a@b.kr' }, new Date('2026-11-10T16:30:00Z'))).toBe('홍길동 · a@b.kr · 2026-11-11');
});
it('watermarkText trims and shortens a long name', () => {
  const t = watermarkText({ name: `  ${'가'.repeat(60)}  `, email: 'a@b.kr' }, new Date('2026-11-10T00:00:00Z'));
  expect(t.startsWith('가'.repeat(40) + '…')).toBe(true);
});
it('composites onto a page: same size, webp, pixels changed', async () => {
  const page = await white();
  const out = await applyWatermark(page, await buildWatermarkTile('홍길동 · a@b.kr · 2026-11-10'));
  const meta = await sharp(out).metadata();
  expect([meta.format, meta.width, meta.height]).toEqual(['webp', 1600, 2263]);
  const { data } = await sharp(out).greyscale().raw().toBuffer({ resolveWithObject: true });
  expect(Math.min(...data.subarray(0, 400_000))).toBeLessThan(250);   // ink landed in the top rows too
});
it('survives markup characters in the name', async () => {
  const tile = await buildWatermarkTile('A&B <script> "x" · a@b.kr · 2026-11-10');
  expect((await sharp(tile).metadata()).width).toBeGreaterThan(100);
});
it('shrinks a tile that is larger than the page', async () => {
  const tile = await buildWatermarkTile(`${'x'.repeat(120)}@example.com`);
  const out = await applyWatermark(await white(400, 300), tile);
  expect((await sharp(out).metadata()).width).toBe(400);
});
it('rejects when the font file is missing', async () => {
  await expect(buildWatermarkTile('x', '/nope/font.otf')).rejects.toThrow(/font/i);
});
it('renders Korean glyphs from the bundled font, not tofu', async () => {
  // 가 and 힣 must produce different ink; a font without Hangul draws the same box for both.
  const ink = async (ch: string) => (await sharp(await buildWatermarkTile(ch.repeat(8))).raw().toBuffer()).toString('base64');
  expect(await ink('가')).not.toBe(await ink('힣'));
});
it('tile cache builds once per key and evicts the oldest', async () => {
  const cache = createTileCache(2); let n = 0; const build = async () => Buffer.from([++n]);
  const [a1, a2] = await Promise.all([cache.get('a', build), cache.get('a', build)]);
  expect(a1).toBe(a2); expect(n).toBe(1);
  await cache.get('b', build); await cache.get('a', build); await cache.get('c', build); // evicts b
  await cache.get('b', build); expect(n).toBe(4);
});
```

- [ ] **Step 3: Run** `npm test -w @mathchois/server -- ibWatermark` — Expected: FAIL (module missing).
- [ ] **Step 4: Implement.** Pinned calls:
  - Text image: `sharp({ text: { text: markup, font: 'Pretendard 18', fontfile, rgba: true, dpi: 144 } })` with `markup = '<span foreground="#000000" alpha="14%">' + escaped + '</span>'`; escape `&`, `<`, `>` (and quotes) before wrapping.
  - Font check: `fs.access(fontFile, R_OK)` first; throw `Error('watermark font missing: …')` on failure.
  - Tile: `.extend({ top: 36, bottom: 36, left: 24, right: 24, background: transparent })` → `.rotate(-30, { background: transparent })` → `.png()`. `extend` and `rotate` in one pipeline apply in sharp's fixed operation order, so render the extended image to a buffer first, then rotate it in a second pipeline.
  - Composite: read page metadata; if the tile is wider or taller than the page, `resize({ width, height, fit: 'inside' })` it first; then `sharp(page).composite([{ input: tile, tile: true }]).webp({ quality: 80, effort: 2 })`.
  - `watermarkText`: name trimmed, more than 40 characters → first 40 + `…`; an empty name becomes `이름 없음`; date via `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' })`.
- [ ] **Step 5: Run** the tests — Expected: PASS.
- [ ] **Step 6: Commit** `feat(ib-guide): server watermark compositing with bundled Korean font`.

---

### Task 3: Close the `ib-guide` bucket to every generic storage path

**Files:**
- Create: `packages/server/src/utils/bucketPath.ts`
- Modify: `packages/server/src/services/storage.service.ts`, `packages/server/src/routes/storage.ts`
- Test: `packages/server/src/utils/bucketPath.test.ts`

**Interfaces — Produces:**

```ts
// utils/bucketPath.ts (env-free)
/** Relative path ('/'-separated, '' for the bucket itself) when path.resolve(volumeRoot, ...segments) is inside volumeRoot/bucket, else null. */
export function bucketRelPath(volumeRoot: string, bucket: string, ...segments: string[]): string | null;

// storage.service.ts
export function ibGuideRelPath(...segments: string[]): string | null; // same contract as the existing aiHubRelPath
```

- [ ] **Step 1: Write the failing test.**

```ts
const root = path.resolve('/vol');
it.each([
  [['ib-guide', 'ia/ex26/student/001.webp'], 'ia/ex26/student/001.webp'],
  [['ib-guide'], ''],
  [['x/../ib-guide', 'manifest/ia.json'], 'manifest/ia.json'],
  [['chapter-pages', '../ib-guide/ia/ex01/student/001.webp'], 'ia/ex01/student/001.webp'],
  [['ib-guide-other', 'a'], null],
  [['chapter-pages', 'a.png'], null],
  [['ib-guide', '../../etc/passwd'], null],
])('bucketRelPath(%j) = %j', (segs, want) => expect(bucketRelPath(root, 'ib-guide', ...segs)).toBe(want));
```

- [ ] **Step 2: Run** `npm test -w @mathchois/server -- bucketPath` — FAIL.
- [ ] **Step 3: Implement `bucketRelPath`**, re-implement `aiHubRelPath` on top of it (behaviour unchanged) and add `ibGuideRelPath`.
- [ ] **Step 4: Fail closed in `storage.service.ts`.** For any path where `ibGuideRelPath(bucket, filePath) !== null`: `statFile` and `readFile` return `null`, `openFileStream` throws, `uploadFile`/`uploadStream` throw, `removeFile`/`removeDirectoryIfEmpty` return `false`. `urlToStoragePath`/`urlToParentDir` return `null` for such URLs, so `copyHtmlToChapterTools` and the coaching/problem readers cannot be pointed at the bucket.
- [ ] **Step 5: Routes in `routes/storage.ts`.** `serveFile`: 404 `{ error: 'File not found' }` before `statFile` when the path is in `ib-guide` (no public file exists in this bucket). Upload and both delete routes: 403 `{ error: 'This bucket is managed by the IB guide upload API' }` next to the existing `touchesAiHub` checks.
- [ ] **Step 6: Audit.** `grep -rn "VOLUME_PATH\|VOLUME_ROOT\|fastifyStatic" packages/server/src` — list every reader of the Volume in the commit message body and confirm none can return a file under `ib-guide` (expected readers: `storage.service`, `storageInfo.service` (names/sizes only, admin), `aiHub*.service`, `brandSite.service`, plus the new IB service in Task 5).
- [ ] **Step 7: Run** `npm test -w @mathchois/server` — PASS; `npx tsc -b packages/server/tsconfig.json` — no errors.
- [ ] **Step 8: Commit** `feat(ib-guide): generic storage refuses the ib-guide bucket`.

---

### Task 4: Reusable token upload + env var

**Files:**
- Create: `packages/server/src/services/tokenUpload.service.ts`
- Modify: `packages/server/src/services/aiHubUpload.service.ts`, `packages/server/src/config/env.ts`
- Test: `packages/server/src/services/tokenUpload.service.test.ts`

**Interfaces — Produces:**

```ts
// tokenUpload.service.ts (env-free)
export type UploadResult = { ok: true; path: string; size: number } | { ok: false; status: 400 | 413 | 422; error: string };
export type TokenUploadOptions = {
  root: string;                                   // absolute bucket root
  rel: string;
  stream: Readable;
  expectedSha: string;                            // 64 hex
  maxBytes: number;
  isAllowed: (rel: string) => boolean;
  validate?: (rel: string, tmpFile: string) => Promise<string[]>; // [] = ok; runs after the sha check, before rename
};
export async function saveTokenUpload(o: TokenUploadOptions): Promise<UploadResult>;
```

`aiHubUpload.service.ts` keeps `saveUpload(rel, stream, expectedSha, maxBytes?)`, `resolveAiHubPath` and `MAX_UPLOAD_BYTES` with the same behaviour, now delegating to `saveTokenUpload`.

- [ ] **Step 1: Write the failing tests** (use `fs.mkdtemp(path.join(os.tmpdir(), 'tok-'))` as `root`, `Readable.from([Buffer])` as the stream, real sha256):
  - ok → `{ ok: true, path: rel, size }`, file content equals input, no `*.part` file left in the directory.
  - `isAllowed` false → `{ ok: false, status: 400, error: 'path not allowed' }`, nothing written.
  - allowed `rel` that resolves outside root (`isAllowed: () => true`, `rel: '../x'`) → 400.
  - sha mismatch → 422 `sha256 mismatch`, destination absent, no `.part` left.
  - `maxBytes` exceeded → 413 `too large`, destination absent.
  - `validate` returning `['bad']` → 422, destination absent; an existing file at `rel` keeps its old content.
  - bad `expectedSha` format → 400.
- [ ] **Step 2: Run** `npm test -w @mathchois/server -- tokenUpload` — FAIL.
- [ ] **Step 3: Implement** by moving the body of `saveUpload` into `saveTokenUpload` (temp file `${dest}.${randomUUID()}.part`, metered sha/size transform, rename on success, `rm` in `finally`); the AI hub manifest check becomes the `validate` callback passed by `aiHubUpload.service.ts`.
- [ ] **Step 4: `config/env.ts`** — add `IB_MEDIA_UPLOAD_TOKEN` with the same preprocess and the same short-token warning as `AI_MEDIA_UPLOAD_TOKEN` (factor the length check into one loop over both names; message names the variable and says the IB guide upload API answers 503).
- [ ] **Step 5: Run** `npm test -w @mathchois/server` and `npx tsc -b packages/server/tsconfig.json` — PASS / no errors.
- [ ] **Step 6: Commit** `refactor(upload): bucket-agnostic token upload; add IB_MEDIA_UPLOAD_TOKEN`.

---

### Task 5: Access, classroom switch and `/api/ib/*` routes

**Files:**
- Create: `packages/server/src/services/ibGuideAccess.service.ts`, `packages/server/src/services/ibGuide.service.ts`, `packages/server/src/middleware/ibGuide.ts`, `packages/server/src/routes/ibGuide.ts`, `packages/server/scripts/ib-guide-e2e-setup.ts`, `packages/server/scripts/ib-guide-api-smoke.ts`
- Modify: `packages/server/src/app.ts` (register `ibGuideRoutes` after `aiHubRoutes`), `packages/server/src/db/schema.ts`, `packages/server/src/db/startupMigrate.ts`, `packages/server/src/services/classroom.service.ts`, `packages/server/src/routes/classrooms.ts`

**Interfaces — Consumes:** Task 1 (`canUseIbGuide`, `isIaDoc`, `isIaExampleId`, `iaPageRel`, `iaPageCount`, `validateIbManifest`, `isIbGuideFile`, `IB_MANIFEST_REL`, `IbManifest`), Task 2 (`watermarkText`, `buildWatermarkTile`, `applyWatermark`, `createTileCache`), Task 4 (`saveTokenUpload`), existing `tokenMatches`, `authenticate`, `getProfileById`.

**Interfaces — Produces:**

```ts
// ibGuideAccess.service.ts
export async function countIbGuideClassrooms(studentId: string): Promise<number>;
export async function ibGuideAccessFor(user: TokenPayload): Promise<{ allowed: boolean }>;
// middleware/ibGuide.ts
export async function requireIbGuide(request, reply): Promise<void>;   // 403 { error: 'IB guide not enabled for you' }
// ibGuide.service.ts
export const IB_GUIDE_ROOT: string;                                    // path.resolve(env.VOLUME_PATH, 'ib-guide')
export const IB_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export async function readIbManifest(): Promise<IbManifest | null>;    // re-read when the file's mtime changes; invalid/missing → null
export async function readIaPage(exId: string, doc: IaDoc, n: number): Promise<Buffer | null>; // null unless 1 ≤ n ≤ manifest page count and the file exists
export async function watermarkedIaPage(page: Buffer, who: { id: string; name: string; email: string }, now?: Date): Promise<Buffer>; // tile cache key `${id}|${text}`; at most 4 composites at once, the rest queue
export async function saveIbUpload(rel: string, stream: Readable, sha: string): Promise<UploadResult>; // manifest uploads are validated with validateIbManifest AND every listed file must already exist on disk with the listed size
```

HTTP contract (all JSON errors are `{ error: string }`):

| Route | Guards | Success | Failures |
|---|---|---|---|
| `GET /api/ib/access` | `authenticate` | `{ allowed: boolean }` | 401 |
| `GET /api/ib/ia` | `authenticate`, `requireIbGuide` | `{ examples: IaExample[] }` sorted by `no` (never `files`); `{ examples: [] }` without a manifest | 401, 403 |
| `GET /api/ib/ia/:exId/:doc/pages/:n` | `authenticate`, `requireIbGuide` | watermarked WebP + the headers in Global Constraints | 401, 403, 404 (bad id/doc/n or outside manifest), 500 (profile missing, font/composite failure) |
| `PUT /api/ib/media?path=` | `onRequest` token | `{ ok: true, path, size }` | 503 no token, 401, 400, 413, 422 (all with `connection: close`, as in `routes/aiHub.ts`) |
| `GET /api/ib/media/manifest` | `onRequest` token | the manifest, or `{}`; `Cache-Control: no-store` | 503, 401 |

- [ ] **Step 1: Column and switch.** `schema.ts`: `ibGuideEnabled: boolean('ib_guide_enabled').notNull().default(false)` next to `aiHubEnabled`. `startupMigrate.ts`: `ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS ib_guide_enabled boolean NOT NULL DEFAULT false` + a log line. `classroom.service.ts`: select `ibGuideEnabled` wherever `aiHubEnabled` is selected; `updateClassroom` accepts it. `routes/classrooms.ts` PATCH: accept `ibGuideEnabled` (400 `ibGuideEnabled must be boolean` otherwise).
- [ ] **Step 2: Access service + middleware**, mirroring `aiHubAccess.service.ts` / `middleware/aiHub.ts` with `c.ib_guide_enabled`.
- [ ] **Step 3: `ibGuide.service.ts`.** Reads use `node:fs` directly under `IB_GUIDE_ROOT` (the generic storage service refuses this bucket by design). `readIaPage` builds the path only from validated parts via `iaPageRel`.
- [ ] **Step 4: Routes.** The plugin registers its own `application/octet-stream` stream parser (Fastify encapsulates the one in `aiHubRoutes`). The page route validates `exId` with `isIaExampleId`, `doc` with `isIaDoc`, `n` with `/^[1-9]\d{0,2}$/`; loads the profile with `getProfileById(request.user.sub)` (missing → 500); wraps read + composite in one try/catch that logs and answers 500 without a body image; on success logs `request.log.info({ userId, exId, doc, page }, 'ib-guide page view')`.
- [ ] **Step 5: Fixture script `ib-guide-e2e-setup.ts`** (model: `scripts/ai-hub-e2e-setup.ts`, same ownership-marker discipline, `--cleanup` flag). Creates teacher `ib-guide.teacher@chois.test` (on the allow-list), students `ib-guide.student@chois.test` (name `아이비 학생`, member of classroom code `IBGUIDE01`, switch **off**) and `ib-guide.outsider@chois.test` (no classroom), password `Test1234!`; writes page images generated with sharp — `ex01`: student 3 pages, annotated 3, comments 1; `ex02`: student 2 pages only — each a 1600×2263 white WebP with a large black digit block so pages differ; writes a valid `manifest/ia.json`; prints `{ teacher, student, outsider, password, classroomId, classCode }` as JSON. Refuses to run when `ib-guide/` already holds files without its marker.
- [ ] **Step 6: API smoke `ib-guide-api-smoke.ts`** — `npx tsx --env-file=.env scripts/ib-guide-api-smoke.ts <fixture.json>` against a running server on 3001, exits non-zero on the first failed check, prints one ✓/✗ line per check:
  1. no token → `GET /api/ib/ia` 401; page route 401.
  2. student (switch off) → `/api/ib/access` `{ allowed: false }`; list 403; page 403.
  3. teacher PATCHes the classroom `{ ibGuideEnabled: true }` → 200 and the body carries `ibGuideEnabled: true`.
  4. student → access true; list has `ex01`,`ex02` with the page counts above and no `files` key.
  5. student page `ex01/student/1` → 200, `content-type: image/webp`, `cache-control: private, no-store`, `content-disposition: inline`; decoded size 1600×2263; bytes differ from the file on disk; bytes differ from the **teacher's** response for the same page (per-user watermark).
  6. `ex01/student/4`, `ex02/annotated/1`, `ex99/student/1`, `ex01/other/1`, `ex01/student/0`, `ex01/student/1.webp` → 404.
  7. `GET /api/files/ib-guide/ia/ex01/student/001.webp`, `/api/files/ib-guide/manifest/ia.json`, `/api/files/x/../ib-guide/manifest/ia.json`, `/api/files/chapter-pages/%2e%2e/ib-guide/manifest/ia.json` → 404 (send the last two with a raw-path client so the URL is not normalised).
  8. teacher `POST /api/files/upload` to bucket `ib-guide` → 403; teacher delete of an `ib-guide` file → 403 and the file still exists.
  9. outsider → 403 on list and page.
  10. token upload: wrong token 401; `path=ia/ex03/student/001.webp` with correct sha → 200; wrong sha → 422; `path=../x` → 400; manifest listing a page that was not uploaded → 422 and the old manifest is still served.
  11. teacher sets `ibGuideEnabled: false` → the student's very next page request is 403.
- [ ] **Step 7: Run it.** Start Postgres locally (PostgreSQL 16 binaries are in `/usr/lib/postgresql/16/bin`; create a throwaway cluster/database under the scratch dir), write `packages/server/.env` (not committed) with `DATABASE_URL`, two 16+ char JWT secrets, dummy Google ids, `VOLUME_PATH=<scratch>/vol`, a 64-hex `IB_MEDIA_UPLOAD_TOKEN`; `npm run db:push -w @mathchois/server`; `npm run dev:server`; run setup then the smoke. Expected: every line ✓, exit 0. Then `--cleanup`.
- [ ] **Step 8: Run** `npm test -w @mathchois/server`, `npx tsc -b packages/server/tsconfig.json` — PASS / no errors.
- [ ] **Step 9: Commit** `feat(ib-guide): access rule, classroom switch and protected page API`.

---

### Task 6: `npm run ib:push`

**Files:**
- Create: `scripts/ib-guide/render.ts`, `scripts/ib-guide/push.ts`, `scripts/ib-guide/README.md`
- Modify: root `package.json` (script `"ib:push": "tsx scripts/ib-guide/push.ts"`; devDependencies `sharp`, `@napi-rs/canvas`, `pdfjs-dist@6.4.299` — the versions already in the lockfile), `.gitignore` (`.ib-out/`)

**Interfaces — Consumes:** Task 1 (`planIaFiles`, `iaPageRel`, `IbManifest`, `validateIbManifest`, `diffIbFiles`, `IB_MANIFEST_REL`); `scripts/ai-hub/http.ts` (`mapLimit`, `fetchRetry`, `baseUrl`, `requireEnv`); `scripts/ai-hub/manifest.ts` (`sha256File`).

**Interfaces — Produces:**

```ts
// render.ts
export async function renderPdf(pdfFile: string, outDir: string): Promise<{ pages: number; popupNotes: number }>;
// writes outDir/001.webp … ; popupNotes = annotations with non-empty contents whose subtype is 'Text' or 'Popup'
```

CLI: `npm run ib:push -- --dir <folder> [--dry-run] [--only ex26]`. Env: `IB_PUSH_URL` (default `http://localhost:3001`), `IB_MEDIA_UPLOAD_TOKEN`.

- [ ] **Step 1: `render.ts`.** Calls verified against the installed versions:
  - `import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'`; `getDocument({ data, standardFontDataUrl: <node_modules/pdfjs-dist/standard_fonts/>, cMapUrl: <…/cmaps/>, cMapPacked: true }).promise` (resolve the two directories from `import.meta.resolve('pdfjs-dist/package.json')`, with a trailing slash).
  - per page: `getViewport({ scale: 1600 / baseWidth })`, `createCanvas(round(w), round(h))` from `@napi-rs/canvas`, `page.render({ canvas, canvasContext, viewport }).promise`, `canvas.toBuffer('image/png')` → `sharp(png).webp({ quality: 80 })`. Release with `page.cleanup()` and destroy the document at the end.
  - `popupNotes`: sum over pages of `(await page.getAnnotations()).filter(...)` as defined above.
- [ ] **Step 2: `push.ts` flow.**
  1. Read the folder (top level only), `planIaFiles`. Duplicates → print each group and exit 1. Print skipped names. `--only exNN` filters `items`.
  2. For each item: output dir `.ib-out/ia/<exId>/<doc>/`. Skip rendering when `.ib-out/ia/<exId>/<doc>/.source.json` records the same source sha256 and page count and all page files exist; otherwise clear the dir, `renderPdf`, write `.source.json`. If `popupNotes > 0` print: `⚠ <file>: 말풍선 메모 <n>개는 쪽 이미지에 글이 보이지 않습니다 — PDF에서 메모를 본문에 인쇄(Flatten)한 뒤 다시 올리세요.`
  3. Optional `<dir>/examples.json` (`{ "ex26": { "title": "…", "note": "…" } }`); unknown ids → warning.
  4. Build the manifest from **all** docs present in `.ib-out/ia` that correspond to a PDF currently in the folder (so `--only` keeps the other examples listed, and a PDF removed from the folder drops out). Validate with `validateIbManifest`; write `.ib-out/manifest/ia.json`.
  5. `GET /api/ib/media/manifest` (401 → "IB_MEDIA_UPLOAD_TOKEN was rejected", 503 → "upload is disabled on the server"); `diffIbFiles`; `--dry-run` prints `would upload <rel>` and stops.
  6. Upload changed files with `mapLimit(…, 4, …)` + `fetchRetry` (PUT, `x-content-sha256`, `content-length`, `application/octet-stream`, streamed body with `duplex: 'half'`, as in `scripts/ai-hub/media-push.ts`). Any failure → list them, exit 1, **do not** upload the manifest.
  7. Upload the manifest last. Print a summary: examples, pages, uploaded, unchanged.
- [ ] **Step 3: README** — first upload (token in Railway + PowerShell `$env:` lines for Windows, the `--dir` path quoted), adding/removing an example, `examples.json` format, the popup-note warning and what to do, the 429 retry note (uploads are limited to 300 requests/minute; the script waits and continues), "PDF와 `.ib-out/`은 git에 넣지 않는다".
- [ ] **Step 4: Verify end to end** with the Task 5 server running (fixtures cleaned up first). Generate a sample folder in the scratch dir with a small Node script using `jspdf` (already a client dependency): `S__ex01_student.pdf` (3 pages), `S__ex01_annotated (1).pdf` (3 pages, one page with a jsPDF text annotation — `doc.createAnnotation({ type: 'text', title: 'note', contents: 'hidden popup', bounds: … })`, check the installed jsPDF's annotations plugin for the exact shape), `S__ex01_comments.pdf` (1 page), `S__ex02_student.pdf` (2 pages), `notes.pdf`.
  - `npm run ib:push -- --dir <folder> --dry-run` → lists 9 page files + manifest, skips `notes.pdf`, prints the popup warning for the annotated file; nothing on the server.
  - real run → exit 0; `GET /api/ib/ia` as teacher shows ex01 (3/3/1) and ex02 (2).
  - run again → `0 changed`, no renders.
  - delete `S__ex02_student.pdf`, run again → list shows only ex01; `GET …/ex02/student/pages/1` is 404.
  - add a second `S__ex01_student (2).pdf` → exit 1 naming both files.
  - Open one rendered page image and one watermarked response (Read tool) to confirm text is sharp at 1600 px.
- [ ] **Step 5: Commit** `feat(ib-guide): ib:push — render PDFs to page images and upload`.

---

### Task 7: Client hub shell, list page, classroom entry

**Files:**
- Create: `packages/client/src/lib/ibGuide/guard.js`, `packages/client/src/hooks/useIbGuideData.js`, `packages/client/src/pages/IbGuide/{IbGuideRoute,IbGuideLayout,IaListPage}.jsx`, `packages/client/src/pages/IbGuide/IbGuide.css`
- Modify: `packages/client/src/App.jsx`, `packages/client/src/pages/Classrooms/ClassroomDetail.jsx`
- Test: `packages/client/src/lib/ibGuide/guard.test.js`

**Interfaces — Produces:**

```js
// guard.js — same contract as lib/aiHub/guard.js
export function resolveIbGuideRedirect({ isAuthenticated, role, allowed }) // → '/' | `/${role ?? 'student'}/classrooms` | null
// useIbGuideData.js
export const IbGuideDataContext; export function useIbGuideData() // { access: { allowed }, examples: IaExample[], status: 'loading'|'ready'|'error', reload(), from: string|null }
```

- [ ] **Step 1: Failing test** for `resolveIbGuideRedirect`: not authenticated → `/`; `allowed: false` + role `student` → `/student/classrooms`; `allowed: false` + role `null` → `/student/classrooms`; `allowed: false` + `teacher` → `/teacher/classrooms`; `allowed: null` → `null`; `allowed: true` → `null`. Run `npm test -w @mathchois/client -- ibGuide/guard` — FAIL, then implement — PASS.
- [ ] **Step 2: `IbGuideRoute.jsx`** — same flow as `AiHubRoute.jsx`: on every pathname change `GET /api/ib/access`; when allowed and examples are not loaded yet, `GET /api/ib/ia`; 403 → `allowed: false`; error screen text `IB 안내를 불러오지 못했어요.` with `다시 시도`; remembers `location.state.from` (same validation regex). Examples are kept in component state only (no `dataCache` entry — the list is small and must reflect removals).
- [ ] **Step 3: `IbGuideLayout.jsx`** — `Navbar` with title `IB교육과정 안내` (lucide `GraduationCap`) and a tab group (`aria-label="IB 안내 분류"`) holding one `NavLink` `IA작성예시` → `/ib/ia`; a head row with the intro line `IB 수학 내부평가(IA) 보고서 예시입니다. 학생 보고서, 채점자 주석본, 기준별 채점 코멘트를 함께 볼 수 있습니다.` and a `학급으로` link (`from ?? /{role}/classrooms`); `<main>` with `<Suspense>` + `<Outlet />`. Reuse the `.ai-hub-*` visual tokens by copying only the rules it needs into `IbGuide.css` under `.ib-guide-*` class names (the AI hub CSS file stays untouched).
- [ ] **Step 4: `IaListPage.jsx`** — responsive card grid (`min 220px` columns). Each card is a `Link` to `/ib/ia/<id>` with `예시 <no>`, title (when non-empty), and one badge per available doc in `IA_DOCS` order: `학생 보고서 24쪽`, `주석본 24쪽`, `채점 코멘트 2쪽`. Empty state `아직 올라온 예시가 없어요`. No thumbnails (spec §5).
- [ ] **Step 5: `App.jsx`** — lazy imports and routes, placed after the AI hub block:

```jsx
<Route element={<IbGuideRoute />}>
  <Route element={<IbGuideLayout />}>
    <Route path="/ib" element={<Navigate to="/ib/ia" replace />} />
    <Route path="/ib/ia" element={<IaListPage />} />
  </Route>
  {/* /ib/ia/:exId is added in Task 8 */}
</Route>
```

- [ ] **Step 6: `ClassroomDetail.jsx`** — next to the AI활용 `IconButton`: `<IconButton icon={GraduationCap} label="IB안내" onClick={() => navigate('/ib', { state: { from: location.pathname + location.search } })} />` shown when `isTeacher || profile?.isAdmin || classroom.ibGuideEnabled`. Under the "학생에게 AI활용 열기" switch add the `학생에게 IB 안내 열기` switch with a `handleIbGuideToggle` that mirrors `handleAiHubToggle` (optimistic update, rollback on failure, own `savingIb` flag, PATCH `{ ibGuideEnabled }`).
- [ ] **Step 7: Verify.** `npm test -w @mathchois/client -- ibGuide`, `npm run lint` (0 errors). With server + Vite running and Task 5 fixtures loaded: teacher sees both switches, turns the IB one on, reloads — it stays on; student sees `IB안내`, opens it, sees two cards with the badge texts above; outsider visiting `/ib/ia` lands on `/student/classrooms`.
- [ ] **Step 8: Commit** `feat(ib-guide): hub shell, example list and classroom switch`.

---

### Task 8: Protected viewer

**Files:**
- Create: `packages/client/src/lib/ibGuide/viewer.js`, `packages/client/src/lib/ibGuide/pageFetch.js`, `packages/client/src/components/ibGuide/ProtectedPage.jsx`, `packages/client/src/pages/IbGuide/IaViewerPage.jsx`, `packages/client/src/pages/IbGuide/IaViewer.css`, `packages/client/e2e/ib-guide.smoke.mjs`
- Modify: `packages/client/src/lib/api.ts` (add `api.blob`), `packages/client/src/App.jsx` (route `/ib/ia/:exId` inside `<IbGuideRoute>`, outside the layout)
- Test: `packages/client/src/lib/ibGuide/viewer.test.js`

**Interfaces — Produces:**

```js
// viewer.js (pure)
export const ZOOM_STEPS = [50, 75, 100, 125, 150, 200];      // percent of fit-width
export function stepZoom(current, dir)                        // dir ±1 → neighbouring step, clamped
export function pagesToLoad(visible, total, around = 2)       // visible: number[] (1-based) → sorted unique page numbers within [1,total]
export function availableDocs(example)                        // IA_DOCS filtered to those with pages
export function resolveDoc(example, requested)                // requested if available, else first available, else null
export function carryPage({ from, to, page, counts, remembered }) // page to show after switching tabs
export function neighbours(examples, exId)                    // { prev: id|null, next: id|null } by `no`
// pageFetch.js
export async function fetchPageBitmap(exId, doc, n, { signal }) // → ImageBitmap; throws ApiError (status) on non-200
// api.ts
api.blob(url: string, init?: { signal?: AbortSignal }): Promise<Blob> // same Authorization + single 401-refresh retry as apiFetch; non-ok → ApiError(status)
```

`carryPage` rules: `student ↔ annotated` keeps the same page number, clamped to the target's count; switching **to** `comments` returns `remembered.comments ?? 1`; switching **from** `comments` returns `remembered[to] ?? 1`.

- [ ] **Step 1: Failing tests** in `viewer.test.js`:

```js
it('stepZoom', () => { expect(stepZoom(100, 1)).toBe(125); expect(stepZoom(200, 1)).toBe(200); expect(stepZoom(50, -1)).toBe(50); expect(stepZoom(110, -1)).toBe(100); });
it('pagesToLoad', () => {
  expect(pagesToLoad([3, 4], 24)).toEqual([1, 2, 3, 4, 5, 6]);
  expect(pagesToLoad([1], 2)).toEqual([1, 2]);
  expect(pagesToLoad([], 24)).toEqual([]);
  expect(pagesToLoad([24], 24, 1)).toEqual([23, 24]);
});
const ex = { id: 'ex26', no: 26, docs: { student: { pages: 24 }, annotated: { pages: 22 }, comments: { pages: 2 } } };
it('docs', () => {
  expect(availableDocs({ docs: { comments: { pages: 1 }, student: { pages: 2 } } })).toEqual(['student', 'comments']);
  expect(resolveDoc(ex, 'annotated')).toBe('annotated');
  expect(resolveDoc({ docs: { comments: { pages: 1 } } }, 'student')).toBe('comments');
  expect(resolveDoc({ docs: {} }, 'student')).toBeNull();
  expect(resolveDoc(ex, 'bogus')).toBe('student');
});
it('carryPage', () => {
  const counts = { student: 24, annotated: 22, comments: 2 };
  expect(carryPage({ from: 'student', to: 'annotated', page: 7, counts, remembered: {} })).toBe(7);
  expect(carryPage({ from: 'student', to: 'annotated', page: 24, counts, remembered: {} })).toBe(22);
  expect(carryPage({ from: 'student', to: 'comments', page: 7, counts, remembered: {} })).toBe(1);
  expect(carryPage({ from: 'comments', to: 'student', page: 2, counts, remembered: { student: 7 } })).toBe(7);
  expect(carryPage({ from: 'comments', to: 'annotated', page: 2, counts, remembered: {} })).toBe(1);
});
it('neighbours', () => {
  const list = [{ id: 'ex03', no: 3 }, { id: 'ex01', no: 1 }, { id: 'ex10', no: 10 }];
  expect(neighbours(list, 'ex03')).toEqual({ prev: 'ex01', next: 'ex10' });
  expect(neighbours(list, 'ex01')).toEqual({ prev: null, next: 'ex03' });
  expect(neighbours(list, 'ex99')).toEqual({ prev: null, next: null });
});
```

Run `npm test -w @mathchois/client -- ibGuide/viewer` — FAIL; implement `viewer.js` — PASS.

- [ ] **Step 2: `api.blob` + `pageFetch.js`.** `fetchPageBitmap` = `api.blob('/api/ib/ia/<exId>/<doc>/pages/<n>', { signal })` → `createImageBitmap(blob)`. No object URL is ever created.
- [ ] **Step 3: `ProtectedPage.jsx`** — props `{ exId, doc, n, load, width, onDenied }`. Renders a box with `aspect-ratio: 1600 / 2263` (corrected to the bitmap's real ratio once known) containing a `<canvas>`. When `load` turns true: fetch, size the canvas to the bitmap, `drawImage`, `bitmap.close()`. When `load` turns false after drawing: set canvas width/height to 0 (frees memory) and abort any pending fetch. Failure: `403` → `onDenied()`; anything else → `이 쪽을 불러오지 못했어요` + `다시 시도` button. The canvas has `aria-label="<docLabel> <n>쪽"`, `draggable={false}`, and `onContextMenu`/`onDragStart` call `preventDefault`.
- [ ] **Step 4: `IaViewerPage.jsx`** (uses `useIbGuideData()` for `examples`).
  - Unknown `exId` (examples loaded) → `<Navigate to="/ib/ia" replace />`. `doc` comes from `?doc=`, normalised with `resolveDoc`; changing tabs uses `setSearchParams({ doc }, { replace: true })`.
  - Top bar (sticky): `IconButton` back to `/ib/ia` (label `목록`), heading `예시 <no>` + title, tablist with the three labels (`role="tablist"`/`role="tab"`, missing docs `disabled`), prev/next example `IconButton`s (labels `이전 예시`/`다음 예시`, disabled at the ends), zoom out/in (`축소`/`확대`) with the current percent, page indicator `3 / 24`.
  - Body: one `ProtectedPage` per page in a scroll container; an `IntersectionObserver` (root = the scroll container, `rootMargin: '200px 0px'`) tracks visible pages; `load` = page ∈ `pagesToLoad(visible, total)`. At most 3 fetches run at once (small queue inside the page component's parent; pages nearest the top-most visible page go first). Page indicator = the top-most visible page.
  - Tab switch: store the current page in a `remembered` ref keyed by doc, compute `carryPage`, then scroll that page's box into view after the new list mounts. Changing `exId` resets `remembered` and scrolls to the top.
  - Width = fit container (max 1000 px) × zoom/100; horizontal scroll appears above 100%.
  - `onDenied` → `navigate('/' + (profile?.role ?? 'student') + '/classrooms', { replace: true })`.
  - Deterrents: root has `user-select: none; -webkit-touch-callout: none`; `keydown` listener on `window` cancels Ctrl/⌘+P and Ctrl/⌘+S while mounted; `IaViewer.css` has `@media print { .ia-viewer > * { display: none !important } .ia-viewer::after { content: '인쇄할 수 없는 자료입니다'; } }`. No download or print control exists.
- [ ] **Step 5: Browser smoke `e2e/ib-guide.smoke.mjs`** (model: `e2e/ai-hub.smoke.mjs`; `node e2e/ib-guide.smoke.mjs <fixture.json> [screenshotDir]`, run with server 3001 + Vite 3000 and Task 5 fixtures; launch with `executablePath: process.env.CHROMIUM_PATH || undefined`). Checks:
  1. student (switch off): no `IB안내` button in the classroom header; `goto('/ib/ia')` ends on `/student/classrooms`.
  2. teacher turns on `학생에게 IB 안내 열기`.
  3. student: `IB안내` button → `/ib/ia`, two cards; `예시 1` shows `학생 보고서 3쪽`, `주석본 3쪽`, `채점 코멘트 1쪽`.
  4. open `예시 1`: 3 canvases, the first has non-zero width; indicator `1 / 3`.
  5. scroll to page 3, click `주석본` → URL has `doc=annotated`, indicator `3 / 3`; click `채점 코멘트` → `1 / 1`; click `학생 보고서` → `3 / 3`.
  6. `예시 2`: tabs `주석본` and `채점 코멘트` are disabled.
  7. network log for the whole session: no response with `content-type` containing `pdf`, no request URL containing `/api/files/ib-guide`, every `/api/ib/ia/*/pages/*` response has `cache-control: private, no-store`; the page has no `<img>` whose `src` contains `/api/ib/` and no `blob:` URL in `performance.getEntries()`.
  8. `page.emulateMedia({ media: 'print' })` → all canvases are hidden.
  9. teacher turns the switch off; student scrolls to a page that was not loaded yet (reload first) → ends on `/student/classrooms`.
  10. zero console errors.
  Save a `deviceScaleFactor: 2` screenshot of the viewer at step 4 and **look at it**: the watermark must read `아이비 학생 · ib-guide.student@chois.test · <today>` diagonally across the page, with the page content legible beneath it.
- [ ] **Step 6: Run** `npm test -w @mathchois/client`, `npm run lint`, the smoke (all ✓), then fixture `--cleanup`.
- [ ] **Step 7: Commit** `feat(ib-guide): protected IA viewer with doc tabs`.

---

### Task 9: Deployment and docs

**Files:**
- Modify: `packages/server/Dockerfile`, `CLAUDE.md`, `.claude/PROJECT_MAP.md`

- [ ] **Step 1: Dockerfile, production stage.**
  - Replace `RUN npm ci --omit=dev --omit=optional --ignore-scripts` with `RUN npm ci --omit=dev --ignore-scripts && rm -rf node_modules/@napi-rs` and rewrite the comment: sharp ships its native binaries as optional dependencies (`@img/sharp-*`), so optional packages must be installed; `@napi-rs/canvas` (pdf.js's optional dependency, browser-irrelevant) is removed afterwards.
  - Add `COPY packages/server/assets packages/server/assets` (the font).
- [ ] **Step 2: Build and check the image.** `docker build -f packages/server/Dockerfile -t mathchois-ib-check .` then run a one-off container that imports the compiled watermark service and writes a watermarked white page for the name `홍길동`:

```bash
docker run --rm -v "$SCRATCH/out:/out" mathchois-ib-check node --input-type=module -e "
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { buildWatermarkTile, applyWatermark, WATERMARK_FONT_FILE } from '/app/packages/server/dist/services/ibWatermark.service.js';
const page = await sharp({ create: { width: 1600, height: 2263, channels: 3, background: '#fff' } }).webp().toBuffer();
writeFileSync('/out/wm.webp', await applyWatermark(page, await buildWatermarkTile('홍길동 · a@b.kr · 2026-11-10')));
console.log('ok', WATERMARK_FONT_FILE);"
```

  Expected: prints `ok /app/packages/server/assets/fonts/Pretendard-Regular.otf`; open `$SCRATCH/out/wm.webp` (convert a crop to PNG and Read it) and confirm **홍길동 is drawn as Hangul, not boxes** — the image has no system fonts, so this proves the bundled font is used. Also confirm `ls /app/node_modules/@napi-rs` fails inside the image. If no Docker daemon is available in the session, say so in the report and reproduce the install step in a clean temp copy (`npm ci --omit=dev --ignore-scripts && rm -rf node_modules/@napi-rs`, then the same Node snippet) and mark the Docker check as **not done** — a host with system fonts cannot prove the bundled font is the one in use.
- [ ] **Step 3: Docs.**
  - `CLAUDE.md`: Commands (`npm run ib:push`), Environment Variables (`IB_MEDIA_UPLOAD_TOKEN`), a bullet under the core features for the IB hub (routes, access rule + switch, bucket rules, watermark, "never serve unwatermarked", spec + README links), the bucket list in Gotchas (`ib-guide` — closed to `/api/files/*` and all generic storage functions), data model (`classrooms.ib_guide_enabled`).
  - `.claude/PROJECT_MAP.md`: new folders, client + server route tables, scripts.
- [ ] **Step 4: Full check.** `npm run lint`, `npm test -w @mathchois/client`, `npm test -w @mathchois/server`, `npm run build` — all pass.
- [ ] **Step 5: Commit** `chore(ib-guide): ship sharp + font in the image; docs`, then `git push -u origin claude/practical-rubin-0a2viy`.
- [ ] **Step 6: Hand-off note for the teacher** (in the final report, not a file): set `IB_MEDIA_UPLOAD_TOKEN` on Railway → deploy → on the PC set `IB_PUSH_URL=https://class.chois.pro` and the token → `npm run ib:push -- --dir "G:\내 드라이브\2026 포산고등학교\수업관련\IB_SL_공통자료\IA내부평가 관련자료\COMMON_1-29" --dry-run` → real run → turn on `학생에게 IB 안내 열기` for the IB classroom. Mention any popup-note warnings the first run prints.
