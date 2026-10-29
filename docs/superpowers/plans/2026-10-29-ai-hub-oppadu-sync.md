# AI활용 허브 오빠두 동기화 (2단계) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 북마클릿 2개 + Mac 의 `npm run ai:oppadu` 로 오빠두 모션·슬라이드·브랜드의 새·바뀐 자료를 git 카탈로그와 `.media-out/` 에 증분 병합하고, `ai:push --sync-prompts` 로 웹에서 고치지 않은 원본 프롬프트만 갱신한다.

**Architecture:** 판단은 전부 shared 순수 함수(`oppaduSync.ts`·`brandLocalize.ts`·`oppaduReport.ts`)에 두고 클라이언트 Vitest 로 검증한다. Mac 쪽 스크립트(`scripts/ai-hub/oppadu/*`)는 내려받기·캐시·보관·파일 쓰기만 한다. 서버는 `ai_motion_prompts.edited_at` 과 `PUT /api/ai/prompts/:set?mode=sync`, `DELETE /api/ai/motion/:id/edited` 를 더하고, 클라이언트는 원본 편 복사 방식과 편집기 표시만 바꾼다.

**Tech Stack:** Fastify 5 · Drizzle ORM 0.45(`.for('update')`, `db.transaction`) · zod 3(서버) · React 19 · Vitest 2(클라이언트, shared 검증) · tsx 4 · esbuild 0.27.3(북마클릿 묶기) · Playwright(스모크·브랜드 사본 확인)

**Spec:** `docs/superpowers/specs/2026-10-29-ai-hub-oppadu-sync-design.md` (1단계: `docs/superpowers/specs/2026-10-28-ai-hub-migration-design.md`)

## Global Constraints

- 변형본(`source: 'chois'`·`'school'`)의 목록 정보·프롬프트·미디어는 어떤 경로로도 바꾸지 않는다. 서버 `?mode=sync` 도 변형본 id 가 오면 요청 전체 400 `{ error: 'remake ids in sync', ids }`.
- 오빠두에서 사라진 모션·슬라이드 id 는 카탈로그에 남긴다(보고만). 브랜드는 오빠두 목록을 따른다(보고만).
- 원본 모션 프롬프트는 v2 틀 원문(`v2.en`·`v2.ko`)으로 저장한다. 완성본(`final`)을 만들지 않는다.
- `ai:oppadu` 는 모든 내려받기·병합·검증이 끝난 뒤에만 쓴다. 실패 시 종료 코드 1, `.media-out/`·카탈로그 불변.
- 오빠두 요청은 동시 4개, 실패 시 3회 재시도(1단계 `fetchRetry`·`retryDelayMs`), `.part` 로 받은 뒤 이름 바꿈.
- 엔진 기준 해시 `b7a04f1a21e395c6ccc5363bd42f28e2e62697a702cfe64f64004b1a896f1086`(2026-10-28 받은 `ms-prompt.js`). 다르면 경고만.
- 화면 문구: 편집기 표시 "웹에서 고친 원본 · 오빠두 동기화에서 제외됨", 단추 "다음 동기화에서 오빠두 원본 받기".
- 서버 패키지에 테스트 러너를 추가하지 않는다. 순수 로직은 shared 로 빼고 `packages/client/src/lib/*.test.js` 에서 `@mathchois/shared` 를 import 해 검증한다(1단계 `aiHubMerge.test.js` 패턴).
- 서버 타입 검사는 `npx tsc -b packages/server/tsconfig.json`, 스크립트는 `npx tsc -p scripts/tsconfig.json`.
- 커밋 메시지는 한국어로 왜를 적고, 모델 이름을 넣지 않으며, 끝에 세션 트레일러 두 줄을 붙인다.

## Review Focus

1. 회원 응답의 한 편에만 `v2` 가 없고 `prompt`(옛 틀)만 있을 때 — 묶음 점검이 그 id 를 짚어 실패해야 한다(전체를 조용히 옛 틀로 저장하면 안 됨). → Task 1 테스트 `checkMotionBundle: v2 없는 편`.
2. 같은 날 `ai:oppadu` 를 두 번 돌리면 두 번째는 카탈로그·manifest 가 그대로이고 보고서는 "변경 없음". → Task 7 검증 단계 2회 실행.
3. 서버에 행이 있고 `edited_at` 이 있으면서 내용이 수집본과 같을 때 — 결정 순서(없음 → 편집됨 → 같음 → 다름)대로 `skipEdited` 이고 행을 쓰지 않는다. → Task 3 `decidePromptSync` 테스트.
4. `GALLERY.items` 에 화면 스크립트가 `add` 를 이미 이어 붙인 상태 — 같은 id 가 두 번 나와도 한 번만 병합. → Task 1 테스트 `motionUpstream: 중복 제거`.
5. 브랜드 목록 페이지에 keep list 밖 스크립트가 새로 생겨도 사본에 들어가지 않는다(광고·분석). → Task 5 테스트 `localizeBrandHtml: 모르는 스크립트 제거`.

---

### Task 1: shared — 모션 수집본 점검·병합

**Files:**
- Create: `packages/shared/src/ai-hub/oppaduSync.ts`
- Modify: `packages/shared/src/ai-hub/index.ts` (`export * from './oppaduSync.js';`)
- Test: `packages/client/src/lib/aiHubOppaduSync.test.js`

**Interfaces:**
- Consumes: `MotionPublic`, `MOTION_GROUPS`, `validateMotionCatalog`(motion.ts), `MOTION_FILE`(paths.ts), `validateTemplate`(promptEngine.ts), `MotionAdminRow`·`Triple`(merge.ts)
- Produces:
  ```ts
  export type OppaduMotionItem = { id: string; no: string | number; g: string; name: string; use: string; en: string; concept: string; kind?: string; kind_label?: string; secs?: number };
  export type OppaduMotionFull = { prompt?: string; ko?: string; v2?: { en: string; ko: string }; shots?: Triple[]; cues?: Triple[] };
  export type OppaduMotionBundle = { kind: 'oppadu-motion'; fetchedAt: string; page: string;
    config: { a: string; mv: string | number; data: string; member: boolean; add: OppaduMotionItem[]; groups?: unknown };
    gallery: { items: OppaduMotionItem[]; v2opts?: unknown }; full: { items: Record<string, OppaduMotionFull> } };
  export type MediaFile = { rel: string; url: string };
  export type SetReport = { added: string[]; updated: Record<string, string[]>; keptRemake: number; gone: string[] };
  export type BundleCheck<T> = { ok: true; bundle: T } | { ok: false; error: string };
  export function checkMotionBundle(raw: unknown): BundleCheck<OppaduMotionBundle>;
  export function motionUpstream(b: OppaduMotionBundle): OppaduMotionItem[];   // gallery.items 다음 add, id 중복 제거, 처음 나온 자리 유지
  export function mergeMotion(catalog: readonly MotionPublic[], b: OppaduMotionBundle):
    { list: MotionPublic[]; prompts: MotionAdminRow[]; media: MediaFile[]; report: SetReport };
  ```

- [ ] **Step 1: 실패하는 테스트** — `aiHubOppaduSync.test.js`(motion 부분). 픽스처: 카탈로그 `[chois 01-x, oppadu 51-a, oppadu 52-gone]`, 묶음 upstream `[01-x, 51-a(name 바뀜·secs 15), 53-new]`.
  - `checkMotionBundle`: `kind` 다르면 `ok:false`; `config.member === false` → error `'로그인·멤버십 확인 — 회원 전문을 받지 못했습니다'`; `full.items['51-a'].v2` 없음 → error `'1편의 전문이 없습니다 — 로그인·멤버십 확인 (51-a)'`(빠진 id 를 쉼표로); `shots`/`cues` 가 3열 표가 아니면 같은 오류.
  - `motionUpstream`: `gallery.items` 에 `add` 의 항목이 이미 들어 있어도 결과 id 가 유일하고 순서는 처음 나온 자리.
  - `mergeMotion`: `list.map(i=>i.id)` = `['01-x','51-a','53-new','52-gone']`; `01-x` 객체는 입력과 `toEqual`; `51-a.name`·`secs` 갱신, `report.updated['51-a']` = `['name','secs']`; `53-new` 는 `source:'oppadu'`, `featured:false`, `no` 숫자; `report` = `{ added:['53-new'], keptRemake:1, gone:['52-gone'], … }`.
  - `prompts` 는 `51-a`·`53-new` 만, `prompt === full.v2.en`, `ko === full.v2.ko`.
  - `media` 는 `51-a`·`53-new` 마다 3개: `{ rel:'motion/53-new/video.mp4', url:`${a}v/53-new.mp4?v=${mv}` }`, `preview.mp4`←`c/…mp4`, `poster.webp`←`p/…webp`.
  - 던지기: 처음 보는 분류 `g:'우주'` → `/unknown group "우주" \(53-new\)/`; id `'53_New'` → `/bad id/`; v2 틀이 `validateTemplate` 오류 → `/template 53-new/`.
- [ ] **Step 2: 실패 확인** — `cd packages/client && npx vitest run src/lib/aiHubOppaduSync.test.js` → FAIL(`checkMotionBundle is not exported`).
- [ ] **Step 3: 구현** — `oppaduSync.ts`. 갱신 필드 순서 고정 `['no','group','name','en','use','concept','kind','kindLabel','secs']`(upstream `g`→`group`, `kind_label`→`kindLabel`, `no`→`Number`). 목록 순서 = 카탈로그의 chois 항목(기존 순서) → upstream 순서의 비변형본 → 사라진 원본(기존 순서). 마지막에 `validateMotionCatalog` 오류가 있으면 `motion sync: …` 로 던진다.
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS, `npx vitest run` 전체 PASS.
- [ ] **Step 5: Commit** — `feat(ai-hub): 오빠두 모션 수집본 점검·증분 병합(변형본 보존·사라진 편 유지)`

---

### Task 2: shared — 슬라이드 수집본 점검·병합, 브랜드 목록 비교

**Files:**
- Modify: `packages/shared/src/ai-hub/oppaduSync.ts`
- Test: `packages/client/src/lib/aiHubOppaduSync.test.js`(slide·brand 부분)

**Interfaces:**
- Consumes: Task 1 의 `MediaFile`·`SetReport`·`BundleCheck`; `SlidePublic`·`SLIDE_FAMILIES`·`validateSlideCatalog`(slide.ts), `SLIDE_FILE`
- Produces:
  ```ts
  export type OppaduSlideStyle = { id: string; no: number; family: string; name: string; look: string; use: string;
    slides: number; cover: number; body: number; added: string; prompt?: string; sub?: string };
  export type OppaduSlideBundle = { kind: 'oppadu-slide'; fetchedAt: string; page: string; img: string; styles: OppaduSlideStyle[]; tags?: Record<string, string[]> };
  export function checkSlideBundle(raw: unknown): BundleCheck<OppaduSlideBundle>;
  export function mergeSlide(catalog: readonly SlidePublic[], b: OppaduSlideBundle):
    { list: SlidePublic[]; prompts: { id: string; prompt: string }[]; media: MediaFile[]; report: SetReport };
  export type BrandIndexLike = { generated_at?: string; brands: { slug: string }[] };
  export function diffBrandIndex(prev: BrandIndexLike | null, next: BrandIndexLike): { added: string[]; removed: string[]; total: number; generatedAt: string };
  ```

- [ ] **Step 1: 실패하는 테스트** — 카탈로그 `[school 24, oppadu 30, oppadu 99-gone]`, upstream 인기순 `[30(look 바뀜), 31-new, 24]`.
  - `checkSlideBundle`: `prompt` 가 빈 스타일이 있으면 error `'2개 스타일의 프롬프트가 없습니다 — 로그인·멤버십 확인 (30, 31)'`.
  - `mergeSlide`: `list` id 순서 `['30','31','24','99']`(인기순, 24 자리는 학교 덱 객체 그대로, 사라진 99 맨 끝); `report.updated['30']` = `['look']`; `prompts` 는 `30`·`31` 만, `prompt.trim()`.
  - `media` for `31`(slides 3, cover 1, body 2): 큰 그림 3 + `s/` 3 + `t/` 2 = 8개, 예 `{ rel:'slide/31/t/2.webp', url:`${img}t/31-2.webp` }`.
  - 던지기: `family:'neon'` → `/unknown family "neon" \(31\)/`; `slides:13` → `/more than 12 slides \(31\)/`; `cover:5, slides:3` → `/cover\/body out of range \(31\)/`.
  - `diffBrandIndex(prev [a,b], next [b,c] generated_at 'G')` → `{ added:['c'], removed:['a'], total:2, generatedAt:'G' }`; `prev null` → `added` 는 전부.
- [ ] **Step 2: 실패 확인** → **Step 3: 구현**(갱신 필드 `['no','family','name','look','use','slides','cover','body','added']`; 순서 규칙은 1단계 `buildSlideData` 와 같고, 오빠두 목록 밖 학교 덱은 기존 순서로 그 뒤, 사라진 원본은 맨 끝) → **Step 4: 통과 확인**(`npx vitest run`).
- [ ] **Step 5: Commit** — `feat(ai-hub): 오빠두 슬라이드 수집본 병합·브랜드 목록 비교`

---

### Task 3: 서버 — 웹 편집 표시·동기화 모드·표시 지우기

**Files:**
- Create: `packages/shared/src/ai-hub/promptSync.ts` (+ index export)
- Modify: `packages/server/src/db/schema.ts`(aiMotionPrompts), `packages/server/src/db/startupMigrate.ts`, `packages/server/src/services/aiHub.service.ts`, `packages/server/src/routes/aiHub.ts`, `packages/shared/src/ai-hub/render.ts`
- Test: `packages/client/src/lib/aiHubPromptSync.test.js`, `packages/client/src/lib/aiHubRender.test.js`(editedAt)

**Interfaces:**
- Consumes: `MOTION_CATALOG`·`SLIDE_CATALOG`
- Produces:
  ```ts
  export type SyncDecision = 'insert' | 'skipEdited' | 'unchanged' | 'update';
  export function decidePromptSync<T>(existing: { value: T; editedAt: Date | string | null } | null, incoming: T, same: (a: T, b: T) => boolean): SyncDecision;
  export function remakeIdsIn(catalog: readonly { id: string; source: string }[], ids: readonly string[]): string[];   // source 가 'chois'|'school' 인 것
  export type PromptSyncResult<B> = { inserted: number; updated: number; unchanged: number; skippedEdited: string[]; replaced: { id: string; before: B }[] };
  // render.ts: MotionPrompt 에 editedAt: string | null 추가, MotionItem.prompt 에도 실린다
  ```
  서버: `syncMotionPrompts(list: (MotionPromptInput & { id: string })[]): Promise<PromptSyncResult<MotionPromptInput>>`, `syncSlidePrompts(list: { id: string; prompt: string }[]): Promise<PromptSyncResult<string>>`, `clearMotionEdited(id: string): Promise<boolean>`; HTTP `PUT /api/ai/prompts/:set?mode=sync` → `{ ok: true, mode: 'sync', count, ...PromptSyncResult }`, `DELETE /api/ai/motion/:id/edited` → `{ id, editedAt: null }` | 404.

- [ ] **Step 1: 실패하는 테스트** — `aiHubPromptSync.test.js`: `decidePromptSync(null, x, eq)` → `'insert'`; `{value:x, editedAt:'2026-10-29T…'}` 와 같은/다른 incoming 모두 → `'skipEdited'`; `{value:x, editedAt:null}` 같은 값 → `'unchanged'`, 다른 값 → `'update'`. `remakeIdsIn([{id:'01-x',source:'chois'},{id:'51-a',source:'oppadu'}], ['51-a','01-x','99-new'])` → `['01-x']`. `aiHubRender.test.js` 에 `renderMotionItems` 가 `prompt.editedAt` 을 그대로 싣는 단언 추가.
- [ ] **Step 2: 실패 확인** → **Step 3: shared 구현**.
- [ ] **Step 4: 서버 구현**
  - 스키마 `editedAt: timestamp('edited_at', { withTimezone: true })`(nullable); `startupMigrate` 에 `ALTER TABLE ai_motion_prompts ADD COLUMN IF NOT EXISTS edited_at timestamptz`.
  - `upsertMotionPrompt` 는 insert·update 모두 `editedAt: new Date()`; `importMotionPrompts({ overwrite: true })` 의 set 에 `editedAt: null`.
  - `syncMotionPrompts`/`syncSlidePrompts`: `db.transaction` 안에서 `select().from(t).where(inArray(t.id, ids)).for('update')`(저장소 선례 `videoSubtitle.service.ts:88`) → 행마다 `decidePromptSync`(모션 `same` = en·ko·shots·cues 의 JSON 비교) → insert 는 한 번에 `values([...])`, update 는 행마다 `set({…, updatedAt: new Date()})`(editedAt 건드리지 않음). `before` 는 update 한 행의 이전 값.
  - 라우트: `mode` 쿼리가 `'sync'` 이고 `overwrite` 도 있으면 400 `{ error: 'mode=sync and overwrite cannot be combined' }`. sync 일 때 zod 통과 뒤 `remakeIdsIn(MOTION_CATALOG|SLIDE_CATALOG, ids)` 가 비지 않으면 400 `{ error: 'remake ids in sync', ids }`; 모션은 각 행 `validateTemplate(prompt)`·`validateTemplate(ko)` 오류 시 400 `{ error: 'invalid template', id, errors }`.
  - `DELETE /api/ai/motion/:id/edited`(`authenticate, requireAdmin`): 행이 없으면 404 `{ error: 'Unknown motion id' }`.
  - `loadMotionPrompts` 가 `editedAt: r.editedAt ? r.editedAt.toISOString() : null` 을 싣는다.
- [ ] **Step 5: 검증** — `cd packages/client && npx vitest run` PASS; `npx tsc -b packages/server/tsconfig.json` 통과; 로컬 서버(`npm run dev:server`, `.env` 의 `AI_MEDIA_UPLOAD_TOKEN`)에서 curl:
  1. `PUT /api/ai/prompts/slide?mode=sync` 본문 `[{"id":"998","prompt":"a"}]` → `inserted:1`; 같은 본문 다시 → `unchanged:1`; `prompt:"b"` → `updated:1`, `replaced:[{"id":"998","before":"a"}]`.
  2. 모션 `51-…` 행을 관리자 `PUT /api/ai/motion/:id/prompt` 로 저장 후 sync → `skippedEdited:["51-…"]`; `DELETE …/edited` 후 sync → `updated:1`.
  3. 본문에 `01-pixel` 포함 → 400 `remake ids in sync`. `?mode=sync&overwrite=1` → 400.
  4. 끝나면 테스트 행(`998` 등)을 지운다.
- [ ] **Step 6: Commit** — `feat(ai-hub): 웹에서 고친 원본 표시(edited_at)와 프롬프트 동기화 모드`

---

### Task 4: 클라이언트 — 원본 편 복사 방식·편집기 표시

**Files:**
- Create: `packages/client/src/lib/aiHub/copyState.js`
- Modify: `packages/client/src/components/aiHub/PromptCopy.jsx`, `packages/client/src/pages/AiHub/MotionDetailPage.jsx`, `packages/client/src/components/aiHub/editor/OriginalEditor.jsx`, `packages/client/src/pages/AiHub/MotionEditorPage.jsx`
- Test: `packages/client/src/lib/aiHub/copyState.test.js`

**Interfaces:**
- Consumes: Task 3 의 `item.prompt.editedAt`, `DELETE /api/ai/motion/:id/edited`; shared `state`, `DEF`
- Produces: `detailCopyState(item): PromptState | null` — `item.source === 'oppadu' && item.prompt?.v2` 이면 `state({ style: 'a', len: item.secs ?? DEF.len })`, 아니면 `null`(지금 동작: finalPrompt 기본 상태). `PromptCopy({ item, canEdit })`(props 를 `id, prompt` 에서 `item` 하나로).

- [ ] **Step 1: 실패하는 테스트** — `copyState.test.js`: 원본 v2 편(secs 15) → `{ style:'a', len:15 }` 포함; secs 없음 → `len: 10`; `source:'chois'` → `null`; 원본인데 `prompt.v2:false` → `null`; `prompt:null` → `null`. 그리고 `finalPrompt({ tpl:'{{#a}}EX\n{{#b}}TOPIC {{Topic=}}', st: detailCopyState(item), lang:'en' })` 결과에 `EX` 가 있고 `TOPIC` 이 없다.
- [ ] **Step 2: 실패 확인** → **Step 3: 구현** — `PromptCopy` 는 `finalPrompt({ tpl: prompt[lang], st: detailCopyState(item) ?? undefined, lang, withTables: true, tables: prompt })`. `OriginalEditor` 에 props `source`, `editedAt` 추가: `source === 'oppadu' && editedAt` 이면 리드 문단 위에 `<p className="ai-oe-edited" role="note">웹에서 고친 원본 · 오빠두 동기화에서 제외됨</p>` 와 단추(`className="ai-btn"`, `data-testid="original-unmark"`) "다음 동기화에서 오빠두 원본 받기" → `api.delete(\`/api/ai/motion/${id}/edited\`)` 성공 시 `reload()`, 실패 시 기존 `errors` 영역에 `errorsOf(err)`. `MotionEditorPage` 는 `source={item.source} editedAt={prompt?.editedAt ?? null}` 을 넘긴다.
- [ ] **Step 4: 통과 확인** — `npx vitest run` PASS, `npm run lint` 통과.
- [ ] **Step 5: Commit** — `feat(ai-hub): 원본 모션 복사는 「예시 그대로」·편 길이로, 편집기에 웹 편집 표시와 동기화 되돌리기`

---

### Task 5: 브랜드 사본 빌더

**Files:**
- Create: `packages/shared/src/ai-hub/brandLocalize.ts`(+ index export), `scripts/ai-hub/oppadu/brand-build.ts`
- Modify: `packages/shared/src/ai-hub/paths.ts`(`BRAND_ASSETS`, `BRAND_FILE`), `scripts/ai-hub/brand-import.ts`(함수로), `packages/client/src/lib/aiHubPaths.test.js`
- Test: `packages/client/src/lib/aiHubBrandLocalize.test.js`

**Interfaces:**
- Produces:
  ```ts
  // paths.ts — 사본이 갖는 자산(1단계 9개 + pcf-resources.js · pcf-resources.css · pcf-ui.css). BRAND_FILE 은 이 목록에서 만든다.
  export const BRAND_ASSETS: readonly string[] = ['assets/app.js','assets/ai-hub-static.js','assets/shell.js','assets/pcf-resources.js',
    'assets/app.css','assets/ai-hub.css','assets/shell.css','assets/tokens.css','assets/pcf-resources.css','assets/pcf-ui.css',
    'assets/fonts/PretendardVariable.woff2','data/brands-index.json'];
  // brandLocalize.ts
  export const BRAND_PAGE_URL = 'https://www.oppadu.com/ai/design-systems-site/';
  export const BRAND_BASE_URL = 'https://www.oppadu.com/tools/design-systems-site/';
  export function brandAssetUrls(indexHtml: string): Record<string, string>;   // BRAND_ASSETS 의 assets/* → 실제 URL(ver 쿼리 포함). 하나라도 없으면 던짐
  export function localizeBrandHtml(html: string, page: 'index' | 'detail'): string;
  export function localizeBrandCss(css: string): string;                       // 글꼴 절대 URL → fonts/PretendardVariable.woff2
  ```
  `scripts/ai-hub/brand-import.ts`: `export async function importBrand(src: string): Promise<{ files: number }>`(지금 최상위 코드를 함수로; `ASSETS` 대신 `BRAND_ASSETS`; 직접 실행 시 `importBrand(process.env.BRAND_SRC ?? …)`). `brand-build.ts`: `buildBrandSite(outDir: string, fetchText: (url: string) => Promise<string>, fetchFile: (url: string, to: string) => Promise<void>): Promise<{ index: BrandIndexLike }>`.

- [ ] **Step 1: 픽스처** — `packages/client/src/lib/__fixtures__/oppadu-brand-index.html`·`oppadu-brand-detail.html`: 2026-10-29 오빠두 페이지(`BRAND_PAGE_URL`, `${BRAND_BASE_URL}brand/11st.html`)에서 `<head>` 의 script·link 전부와 `<body>` 골격(`pcf-r1` 머리글 한 줄, `div.aih` 와 그 안의 `aih-side`·`aih-main`·`pcfrs-dsg-bar` 한 줄, 푸터 한 줄)만 남겨 줄인 것. 원본 출처를 파일 첫 줄 주석에 적는다.
- [ ] **Step 2: 실패하는 테스트** — `aiHubBrandLocalize.test.js`:
  - `brandAssetUrls(index)` 키가 `BRAND_ASSETS` 의 `assets/*` 와 같고 `assets/app.js` 값이 `…/tools/design-systems-site/assets/app.js?ver=…`.
  - `localizeBrandHtml(index,'index')`: `adsbygoogle`·`googletagmanager`·`chat.js`·`pcf.js`·`jquery` 문자열 없음; `src="assets/app.js"`·`src="assets/pcf-resources.js"`·`href="assets/pcf-ui.css"` 있음; `id="oppadu-dsg-js-before"` 블록 안 `"base":"./"`·`"member":true`; `pcf-r1` 없음, `class="aih aihx"` 있음; `data-otl-help-data` 유지; 모르는 `<script src="https://x.example/new.js">` 를 넣은 입력 → 결과에 `x.example` 없음.
  - `localizeBrandHtml(detail,'detail')`: `href="../assets/shell.css"`·`src="../assets/shell.js"`, `/wp-content/` 없음.
  - `localizeBrandCss("url('https://www.oppadu.com/wp-content/themes/generatepress_child/fonts/PretendardVariable.woff2')")` → `url('fonts/PretendardVariable.woff2')`.
  - `aiHubPaths.test.js`: `BRAND_ASSETS.every(a => isAiHubFile('brand/' + a))`, `'brand/assets/pcf.js'` 는 false.
- [ ] **Step 3: 실패 확인** → **Step 4: 구현** — 태그 단위 정규식 + `div.aih` 는 `<div`/`</div>` 깊이 세기로 잘라낸다(본문의 나머지는 버리고 `<script type="application/json" data-otl-help-data>` 는 위치와 상관없이 본문 끝에 둔다). 인라인 `<script>` 는 id `oppadu-dsg-js-before`·`oppadu-pcf-resources-js-before` 와 `data-otl-help-data` 만 남긴다. `BRAND_FILE` 는 `BRAND_ASSETS` 를 이스케이프해 만든 정규식 + `index.html`·`brand/<slug>.html`·`data/(hero|detail)/<slug>.json`.
- [ ] **Step 5: 빌더·import** — `brand-build.ts`: 목록 페이지 → `brandAssetUrls` → 자산 받기(css 는 `localizeBrandCss` 거침) → `brands-index.json` → slug 마다 `data/hero/<slug>.json`·`data/detail/<slug>.json`·`brand/<slug>.html`(`localizeBrandHtml(…,'detail')`) → `index.html`(`localizeBrandHtml(…,'index')`). 결과 파일이 모두 `isAiHubFile('brand/'+rel)` 을 통과하고, slug 수 = `brands.length` 가 아니면 던진다. `brand-import.ts` 를 `importBrand(src)` 로 바꾼다(동작·메시지 그대로, `SIBLING_LINKS` 는 유지해도 무해).
- [ ] **Step 6: 실제 사본 확인** — 스크래치 스크립트로 오빠두에서 `buildBrandSite('<scratch>/brand-site', …)` 를 실행하고, 그 폴더를 Node `http` 정적 서버(스크래치 스크립트, `.json` 은 `application/json`)로 띄워 Playwright 로 `index.html` 을 열어: 카드(`[role=listitem]`) 293개, 색 탭 「빨강」 누르면 카드 수 43, 찾기 칸에 `11st` 입력 시 1개, 카드 클릭 시 `body[data-view=detail]`, 콘솔 오류 0(외부 차단 요청 제외). 깨지면 원인 파일을 keep list(`BRAND_ASSETS`·인라인 id)에 더하고 Step 2 테스트를 갱신한 뒤 다시 확인.
- [ ] **Step 7: 검증·Commit** — `npx vitest run` PASS, `npx tsc -p scripts/tsconfig.json` 통과 → `feat(ai-hub): 오빠두 공개 자료로 브랜드 룩북 사본 만들기(색 탭·찾기 자산 포함)`

---

### Task 6: 북마클릿

**Files:**
- Create: `scripts/ai-hub/oppadu/bookmarklets/motion.ts`, `scripts/ai-hub/oppadu/bookmarklets/slide.ts`, `scripts/ai-hub/oppadu/bookmarklets.ts`
- Modify: `package.json`(루트 devDependencies `"esbuild": "0.27.3"` — 이미 lockfile 에 있는 판, scripts `"ai:oppadu": "tsx scripts/ai-hub/oppadu/main.ts"`), `.gitignore`(`.oppadu/`)

**Interfaces:**
- Consumes: Task 1·2 의 `checkMotionBundle`·`checkSlideBundle`, 묶음 타입
- Produces: `buildBookmarklets(): Promise<{ motion: string; slide: string }>`(`javascript:` URL), `writeBookmarkletsPage(file: string): Promise<void>` → `.oppadu/bookmarklets.html`(링크 「오빠두 모션 받기」·「오빠두 슬라이드 받기」와 끌어 놓기 안내 한 줄)

- [ ] **Step 1: 북마클릿 소스** — `/// <reference lib="dom" />`.
  - `motion.ts`: `location.pathname` 이 `/ai/motion-styles/` 가 아니면 `alert('오빠두 모션 스타일 페이지에서 눌러 주세요')`. `const c = window.OPD_MOTION_L` — `!c?.member || !c.rest || !c.nonce` 면 `alert('로그인·멤버십 확인 — 회원 전문을 받지 못했습니다')`. `fetch(c.rest, { credentials: 'same-origin', headers: { 'X-WP-Nonce': c.nonce } })` → 묶음(스펙 ① 모양, `config: { a, mv, data, member, add, groups }`, `gallery: { items: window.GALLERY.items, v2opts: window.GALLERY.v2opts }`) → `checkMotionBundle` 실패면 `alert(error)`, 성공이면 `Blob` + `<a download="oppadu-motion-YYYY-MM-DD.json">` 클릭, `alert('N편 저장했어요')`.
  - `slide.ts`: 같은 틀로 `window.OPD_SLIDE_STYLES`·`window.OPD_SLS_TAGS` → `checkSlideBundle` → `oppadu-slide-YYYY-MM-DD.json`.
- [ ] **Step 2: 묶기** — `bookmarklets.ts`: esbuild `build({ entryPoints:[file], bundle:true, format:'iife', minify:true, write:false, platform:'browser', target:'chrome120', alias: { '@mathchois/shared': '<repo>/packages/shared/src/index.ts' } })` — esbuild 는 tsconfig paths 를 쓰지 않으므로 alias 로 shared 소스를 직접 묶는다. 결과 `outputFiles[0].text` 를 `javascript:` + `encodeURIComponent` 로.
- [ ] **Step 3: 검증** — `npm run ai:oppadu -- --bookmarklets`(Task 7 이 이 인자를 `writeBookmarkletsPage` 로 넘기기 전까지는 `npx tsx -e "import('./scripts/ai-hub/oppadu/bookmarklets.ts').then(m=>m.writeBookmarkletsPage('.oppadu/bookmarklets.html'))"`) → 파일 생성, 각 URL 길이 < 60000. Playwright 로 `https://www.oppadu.com/ai/slide-styles/`(비로그인)를 열어 슬라이드 북마클릿 본문(`decodeURIComponent` 후 `javascript:` 제거)을 `page.evaluate` 로 실행 → 대화상자 문구가 `프롬프트가 없습니다` 를 포함(손님은 prompt 없음); 모션 페이지에서는 `로그인·멤버십 확인`. 다운로드가 일어나지 않음을 확인.
- [ ] **Step 4: Commit** — `feat(ai-hub): 오빠두 회원 자료 받기 북마클릿(점검 후 JSON 저장)`

---

### Task 7: `npm run ai:oppadu` 수집·병합·쓰기·보고서

**Files:**
- Create: `scripts/ai-hub/oppadu/main.ts`, `scripts/ai-hub/oppadu/fetchCache.ts`, `scripts/ai-hub/oppadu/engine.ts`, `packages/shared/src/ai-hub/oppaduReport.ts`(+ index export)
- Test: `packages/client/src/lib/aiHubOppaduReport.test.js`

**Interfaces:**
- Consumes: Task 1·2 `mergeMotion`·`mergeSlide`·`diffBrandIndex`·`check*Bundle`, Task 5 `buildBrandSite`·`importBrand`, Task 6 `writeBookmarkletsPage`, 1단계 `fetchRetry`·`mapLimit`(http.ts), `writeManifest`(manifest.ts), `formatCatalogSource`, `AI_DIR`·`OUT_DIR`·`manifestFile`(volumeLayout.ts)
- Produces:
  ```ts
  // engine.ts
  export const ENGINE_SHA256 = 'b7a04f1a21e395c6ccc5363bd42f28e2e62697a702cfe64f64004b1a896f1086';
  // fetchCache.ts
  export const CACHE_DIR: string;  // .oppadu/cache
  export function cachePath(url: string): string;   // <host><pathname>[@<query 의 v|ver 값>]
  export function reusable(url: string, refreshMedia: boolean): boolean;   // ?v=/?ver= 있거나 _slide-styles-assets/img/ 아래면 true(refreshMedia 면 그림만 false)
  export async function fetchToCache(urls: readonly string[], opts: { refreshMedia: boolean }): Promise<{ failed: string[]; fetched: number }>;
  // oppaduReport.ts
  export type RunReport = { date: string; motion?: SetReport & { media: number }; slide?: SetReport & { media: number };
    brand?: { added: string[]; removed: string[]; total: number; generatedAt: string }; engineChanged: boolean; skipped: string[] };
  export function formatReport(r: RunReport): { markdown: string; summary: string[] };
  export function formatPushResult(set: 'motion' | 'slide', r: PromptSyncResult<unknown>, backup: string): string;
  ```
  보고서 줄(정확한 문구):
  - `모션: 추가 3 (…) · 갱신 2 (57-x: name·secs) · 변형본이라 건너뜀 50 · 오빠두에서 사라진 0 · 미디어 새로/바뀜 9` (목록이 비면 괄호 생략)
  - `슬라이드: … · 그림 새로/바뀜 0` (나머지는 모션과 같음)
  - `브랜드: 293개 (오빠두 생성 2026-10-14) · 추가 0 · 사라진 0` (사라진 slug 가 있으면 괄호 안 slug)
  - `⚠ 오빠두 프롬프트 엔진이 바뀌었습니다 — promptEngine.ts 확인 필요`(engineChanged 일 때만)
  - 변경이 하나도 없으면 첫 줄 `변경 없음`
  - 마지막 줄 `다음 할 일: npm run ai:push -- --set motion --sync-prompts → --set slide --sync-prompts → --set brand`
  - `formatPushResult` = `motion: 넣음 3 · 바뀜 56 · 같음 0 · 웹에서 고쳐 건너뜀 0 · 백업 <path>`(건너뜀 id 가 있으면 괄호)

- [ ] **Step 1: 실패하는 테스트** — `aiHubOppaduReport.test.js`: 위 문구 각각, 빈 보고서 → `summary[0] === '변경 없음'`, engineChanged false 면 ⚠ 줄 없음.
- [ ] **Step 2: 실패 확인** → **Step 3: 보고서 구현** → **Step 4: 통과 확인**.
- [ ] **Step 5: `main.ts`** — 인자 `--set motion|slide|brand`(생략 = 셋), `--motion <file>`, `--slide <file>`(생략 시 `~/Downloads` 의 최신 `oppadu-motion-*.json`/`oppadu-slide-*.json`, 이름의 날짜 내림차순), `--dry-run`, `--refresh-media`, `--bookmarklets`(Task 6 함수만 부르고 끝).
  순서: ① `manifestFile(set)` 없으면 `먼저 npm run ai:pull 을 실행하세요 (.media-out/ai-hub/manifest/<set>.json 없음)` 로 종료 1 ② 묶음 읽기·`check*Bundle`(파일 없고 `--set` 명시 안 했으면 그 set 을 `skipped` 에 넣고 건너뜀) ③ 받을 URL 모으기(모션: `config.data`(gallery-data.js)·`${a}js/ms-prompt.js` + `mergeMotion(...).media`; 슬라이드: `mergeSlide(...).media`; 브랜드: `buildBrandSite` 가 쓰는 fetcher 를 `fetchToCache` 기반으로) → `fetchToCache`, `failed` 가 있으면 목록 출력 후 종료 1 ④ `ms-prompt.js` sha 와 `ENGINE_SHA256` 비교 ⑤ 병합(던지면 메시지 출력 후 종료 1) ⑥ `--dry-run` 이면 보고서만 출력하고 끝 ⑦ 쓰기: 캐시 → `.media-out/ai-hub/<rel>`(바이트가 다를 때만, 바뀐 수를 `media` 로) → `writeManifest(set)` → 브랜드 `importBrand(.oppadu/<date>/brand-site)` → `.media-out/prompts/<set>.oppadu.json` → `formatCatalogSource` 로 `*.data.ts` → `.oppadu/<date>/` 에 묶음 둘·`gallery-data.js`·`ms-prompt.js`·`brands-index.json`·`report.md` 보관 ⑧ `summary` 출력.
- [ ] **Step 6: 검증** — 스크래치에서 실제 공개 자료 + 합성 묶음으로:
  1. 합성 묶음(스크래치에): 오빠두 공개 `gallery-data.js`·모션 페이지의 `OPD_MOTION_L` 로 `oppadu-motion-2026-10-29.json` 을 만들고 `member:true`, `full.items[id] = { v2:{ en:'## 1. X {{a=b}}', ko:'## 1. 엑스 {{a=b}}' }, shots:[], cues:[] }`(점검 통과용 가짜 전문). 슬라이드는 공개 `OPD_SLIDE_STYLES` 의 각 스타일에 `prompt:'p'`.
  2. 임시 `.media-out/ai-hub/manifest/{motion,slide,brand}.json` 을 `{}` 로 만들고 `npm run ai:oppadu -- --motion <합성> --slide <합성> --dry-run` → 요약에 `모션: 추가 3 (120-…, 121-…, 122-…)`, `슬라이드: 추가 0`, `브랜드: 293개`, 파일 변화 없음(`git status` 깨끗).
  3. `--dry-run` 없이 실행 → `git diff --stat` 에 `motion.data.ts` 3편 추가, `.media-out/ai-hub/motion/120-…/{video.mp4,preview.mp4,poster.webp}` 존재.
  4. 바로 다시 실행 → 첫 줄 `변경 없음`, `git diff` 추가 변화 없음, 새 내려받기 0(캐시).
  5. `git checkout -- packages/shared/src/ai-hub/*.data.ts`, `.media-out/`·`.oppadu/` 삭제 — 실제 반영은 사용자가 Mac 에서 한다.
- [ ] **Step 7: Commit** — `feat(ai-hub): ai:oppadu — 오빠두 새 자료 수집·증분 병합·보고서`

---

### Task 8: `ai:push --sync-prompts`

**Files:**
- Modify: `scripts/ai-hub/media-push.ts`, `scripts/ai-hub/volumeLayout.ts`

**Interfaces:**
- Consumes: Task 3 `?mode=sync` 응답, Task 7 `formatPushResult`
- Produces: `syncPromptsFile(set: 'motion' | 'slide'): string` → `.media-out/prompts/<set>.oppadu.json`; `latestOppaduDir(): string | null`(`.oppadu/` 아래 `YYYY-MM-DD` 이름 중 최신)

- [ ] **Step 1: 구현** — `--sync-prompts` 는 `--set motion|slide` 에서만, `--overwrite-prompts`·`--no-prompts` 와 함께면 `--sync-prompts cannot be combined with --overwrite-prompts/--no-prompts` 로 종료 1. 파일이 없으면 `run npm run ai:oppadu first` 로 종료 1(아무것도 올리기 전). 요청 URL `/api/ai/prompts/<set>?mode=sync`. 응답의 `replaced` 를 `<latestOppaduDir>/replaced-prompts-<set>.json` 에 쓰고(없으면 `.oppadu/<오늘>/` 만듦), `formatPushResult` 줄을 출력하고 그 폴더 `report.md` 끝에 `\n## push\n<줄>\n` 로 덧붙인다. 파일 → 프롬프트 → manifest 순서와 실패 시 manifest 미전송은 그대로.
- [ ] **Step 2: 검증** — `npx tsc -p scripts/tsconfig.json`; 로컬 서버로 Task 7 사본의 `.media-out` 에서 `AI_PUSH_URL=http://localhost:3001 npm run ai:push -- --set slide --sync-prompts --dry-run` 은 업로드 목록만, `--dry-run` 없이 → `slide: 넣음 …` 줄과 백업 파일 생성; `--sync-prompts --overwrite-prompts` → 종료 1. 테스트로 넣은 행은 지운다.
- [ ] **Step 3: Commit** — `feat(ai-hub): ai:push --sync-prompts — 웹에서 고치지 않은 원본만 갱신하고 이전 내용 백업`

---

### Task 9: 스모크·문서

**Files:**
- Modify: `packages/server/scripts/ai-hub-e2e-setup.ts`, `packages/client/e2e/ai-hub.smoke.mjs`, `scripts/ai-hub/README.md`, `CLAUDE.md`, `.claude/PROJECT_MAP.md`

- [ ] **Step 1: 설정 확장** — 픽스처 모션을 `['01-pixel', '51-pop-poster']` 둘로(`51-pop-poster` 는 카탈로그상 `oppadu`; 3파일 + manifest 키; DB 행은 v2 틀 `'## 1. Intro\n{{#a}}EXAMPLE LINE\n{{#b}}TOPIC {{Topic=}}'`(영·국 같은 꼴), `edited_at = now()`). `manifestIsOurs` 와 `--cleanup` 은 이 두 id 만 든 manifest 를 우리 것으로 본다. 관리자 계정 하나(`ai-admin@…`, `isAdmin: true`)를 더 만들고 출력 JSON 에 넣는다.
- [ ] **Step 2: 스모크 추가** — 학생: `/ai/motion/51-pop-poster` 에서 `copy-prompt-en` 클릭 → `context.grantPermissions(['clipboard-read','clipboard-write'])` 후 `navigator.clipboard.readText()` 에 `EXAMPLE LINE` 있고 `TOPIC` 없음. 관리자: `/ai/motion/51-pop-poster/edit` → `original-switch` 켬 → "웹에서 고친 원본 · 오빠두 동기화에서 제외됨" 보임 → `original-unmark` 클릭 → `DELETE` 200 → 표시 사라짐. `01-pixel`(chois) 편집기에는 표시 없음.
- [ ] **Step 3: 실행** — `cd packages/server && npx tsx --env-file=.env scripts/ai-hub-e2e-setup.ts > "$SCRATCH/aihub.json" && cd ../client && node e2e/ai-hub.smoke.mjs "$SCRATCH/aihub.json"` → 모든 줄 ✓, 이어서 `--cleanup`.
- [ ] **Step 4: 문서** — `scripts/ai-hub/README.md` 에 「오빠두 새 자료 반영」(북마클릿 설치 `npm run ai:oppadu -- --bookmarklets` → 북마클릿 둘 → `npm run ai:oppadu` → 보고서·`git diff` 확인 → `ai:push --sync-prompts` 둘 + brand → 커밋·main) 과 인자 표. `CLAUDE.md` 명령 블록에 `npm run ai:oppadu`, AI활용 허브 단락에 `edited_at`·`?mode=sync`·`DELETE /api/ai/motion/:id/edited`·2단계 명세 링크. `PROJECT_MAP.md` 라우트·컬럼·`scripts/ai-hub/oppadu/`.
- [ ] **Step 5: 전체 검증** — `npm run lint`, `cd packages/client && npx vitest run`, `npx tsc -p scripts/tsconfig.json`, `npm run build` 모두 통과.
- [ ] **Step 6: Commit** — `test(ai-hub): 원본 복사·웹 편집 표시 스모크 · docs: 오빠두 동기화 절차`

---

## 첫 동기화 (코드 배포 뒤, Mac 에서 — 사용자 작업)

1. 1단계 첫 이전(`ai:pull` → `ai:push` 셋)이 끝나 있는지 확인(`.media-out/ai-hub/manifest/*.json`).
2. `npm run ai:oppadu -- --bookmarklets` → `.oppadu/bookmarklets.html` 을 Chrome 으로 열어 링크 둘을 즐겨찾기 막대로.
3. 로그인한 Chrome 에서 오빠두 모션·슬라이드 페이지를 열고 각 북마클릿.
4. `npm run ai:oppadu` → 요약·`.oppadu/<날짜>/report.md`·`git diff` 확인.
5. `AI_PUSH_URL=https://class.chois.pro AI_MEDIA_UPLOAD_TOKEN=… npm run ai:push -- --set motion --sync-prompts`, `--set slide --sync-prompts`, `--set brand`.
6. 카탈로그 커밋 → main → 배포 후 `/ai/motion` 에 새 편(120–122) 확인.
