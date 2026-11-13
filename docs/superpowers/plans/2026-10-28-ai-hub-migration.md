# AI활용 허브 이전 (AI Hub Migration) 1단계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** me.chois.pro 의 모션·슬라이드·브랜드 갤러리와 자료를 class.chois.pro 로 옮기고, 학급별 토글로 학생에게 열며, 오빠두 v2 엔진 기반 모션 프롬프트 편집기를 둔다.

**Architecture:** 카탈로그·프롬프트 엔진·접근 규칙·경로 허용 목록은 `@mathchois/shared/ai-hub/*` 순수 모듈에 두고 클라이언트 Vitest 로 검증한다. 서버는 `routes/aiHub.ts` 하나로 열람 API·관리자 프롬프트 저장·토큰 업로드·브랜드 사본 서빙을 맡고, 미디어는 Volume 버킷 `ai-hub/` 를 기존 `/api/files/*` 로 낸다. 클라이언트는 `AiHubRoute` 가드 아래 `AiHubLayout` + 갤러리 셋 + 전체 화면 편집기이고, 자료 이전·추가는 루트 `scripts/ai-hub/*` 가 맡는다.

**Tech Stack:** Fastify 5 · Drizzle ORM 0.45 · zod 3(서버)/4(스크립트) · PostgreSQL · React 19 · React Router 7 · lucide-react 0.575 · Vitest(클라이언트) · tsx · Playwright(스모크)

**Spec:** `docs/superpowers/specs/2026-10-28-ai-hub-migration-design.md`

## Global Constraints

- 접근: 비로그인 → `/`, 역할 없음 → `/choose-role`, 교사·관리자는 항상, 학생은 `ai_hub_enabled` 학급이 1개 이상일 때만. 서버 `/api/ai/*` 열람 라우트는 전부 `authenticate + requireAiHub`.
- 원본 틀·장면표·소리 큐 저장(`PUT /api/ai/motion/:id/prompt`)은 `isAdmin` 만. 빈칸·옵션·복사는 교사 누구나, 상태는 브라우저 `localStorage`.
- 미디어 주소는 `/api/files/ai-hub/<rel>?v=<sha256 앞 8자>`. 허용 경로는 `shared/ai-hub/paths.ts` 의 정규식 4개가 유일한 진실.
- 업로드 토큰 env `AI_MEDIA_UPLOAD_TOKEN`(≥ 32자, 선택). 없으면 업로드 라우트 셋은 503 `{ error: 'upload disabled' }`. 토큰 비교는 `timingSafeEqual`.
- 프롬프트 엔진 상수: `DEF = { style:'b', logo:true, sound:true, music:false, render:'hf', len:10, ratio:'16:9', lang:'ko' }`, `LEN = { min:3, max:90, long:30 }`, 비율 6종 `16:9 9:16 1:1 4:5 4:3 3:4`, 언어 11종 `ko en ja zh-Hans zh-Hant es fr de vi th id`.
- 출처 문구: 모션·슬라이드 푸터 "© oppadu.com/ai 의 자료를 가공하거나 출처를 밝혀 옮긴 것입니다." · 브랜드 "© oppadu.com/ai 에서 옮겨온 자료입니다." · 원본 카드 배지 「원본」 · 출처 줄 "출처 오빠두엑셀 「모션 스타일 갤러리」 원본 예시·프롬프트"(슬라이드는 「슬라이드 스타일 갤러리」).
- 아이콘만 있는 단추는 `components/common/IconButton.jsx`. 라벨·배지는 `whitespace-nowrap`, 누르는 영역 44px.
- 모든 파일 상단 주석·커밋 메시지는 이 저장소 관례(한국어, 왜를 적는다). 커밋 메시지에 모델 이름을 넣지 않는다.
- 서버 패키지에 테스트 러너를 추가하지 않는다. 순수 로직은 shared 로 빼고 `packages/client/src/lib/*.test.js` 에서 `@mathchois/shared` 를 import 해 검증한다(`classroomColorShared.test.js` 패턴, Vitest `environment: node`).

## Review Focus

1. 학생이 허용 학급에서 빠지거나 교사가 토글을 끈 뒤에도 열려 있던 `/ai/*` 화면 — 다음 API 호출이 403 이면 가드가 학급 목록으로 보내야 한다 (Task 7 의 `resolveAiHubRedirect` 테스트 + Task 3 의 curl 절차).
2. 틀에 `{{#compose}}` 처럼 조건이 둘 이상 붙은 줄과 `!` 부정이 섞인 줄 — 모두 맞아야 남는다 (Task 2 테스트 `rows: 조건 여럿`).
3. 길이를 직접 정하지 않은 채 10초 편에서 45초 편으로 넘어가면 길이 칸은 그 편의 `secs` 를 따라가고, 직접 정했으면 유지된다 (Task 11 `editorStore.test.js`).
4. 업로드 경로에 `..`·절대 경로·허용 목록 밖 파일이 오면 400 이고 Volume 에 아무것도 남지 않는다 (Task 1 `paths.test.js` + Task 5 curl 절차).
5. 브랜드 사본의 `index.html` 에 `</head>` 가 없을 때도 셸 숨김 스타일이 들어간다 (Task 6 `embedBrandHtml` 테스트).

---

### Task 1: shared — 카탈로그·출처·경로·접근 규칙

**Files:**
- Create: `packages/shared/src/ai-hub/motion.ts`, `motion.data.ts`, `slide.ts`, `slide.data.ts`, `source.ts`, `paths.ts`, `access.ts`, `catalog.ts`
- Modify: `packages/shared/src/index.ts` (export 추가)
- Test: `packages/client/src/lib/aiHubCatalog.test.js`, `aiHubPaths.test.js`, `aiHubAccess.test.js`

**Interfaces:**
- Produces:
  - `MOTION_GROUPS`, `MOTION_SOURCES`, `type MotionPublic`, `MOTION_CATALOG: readonly MotionPublic[]`
  - `SLIDE_FAMILIES`, `SLIDE_SOURCES`, `type SlidePublic`, `SLIDE_CATALOG: readonly SlidePublic[]`
  - `validateMotionCatalog(list: unknown): string[]`, `validateSlideCatalog(list: unknown): string[]` (오류 문장 배열, 빈 배열 = 정상)
  - `OPPADU = { motion, slide, brand }`, `creditLine(tab: 'motion'|'slide'|'brand'): string`, `ORIGINAL_BADGE = '원본'`, `creditText(tab)` = "출처 오빠두엑셀 「…」 원본 예시·프롬프트" 의 조각 `{ lead:'출처', gallery:'오빠두엑셀 「모션 스타일 갤러리」', tail:'원본 예시·프롬프트', href }`
  - `MOTION_FILE`, `SLIDE_FILE`, `BRAND_FILE`, `MANIFEST_FILE`, `isAiHubFile(rel: string): boolean`, `isBrandSiteFile(rel): boolean`, `mediaUrl(rel: string, sha256: string): string` → `/api/files/ai-hub/${rel}?v=${sha.slice(0,8)}`
  - `canUseAiHub(a: { role: 'teacher'|'student'|null; isAdmin: boolean; allowedClassroomCount: number }): boolean`, `aiHubAbilities(a) → { allowed, canEdit, canEditOriginal }`

- [ ] **Step 1: 카탈로그 데이터 생성**

복구 브랜치의 목록을 TS 상수로 변환한다(한 번만; 이후는 Task 12 의 import 스크립트가 다시 쓴다).

```bash
cd /home/user/my-introduction && git show origin/feat/ai-oppadu-originals:content/motion/public.json > /tmp/motion.json && git show origin/feat/ai-oppadu-originals:content/slide/public.json > /tmp/slide.json
```

`motion.data.ts` 는 `export const MOTION_CATALOG = [...] as const satisfies readonly MotionPublic[];` 꼴로, 항목 키는 `id,no,group,name,en,use,concept,featured,source` (복구 JSON 그대로, 106개). `slide.data.ts` 도 같은 꼴(748개, `topic` 은 있을 때만).

- [ ] **Step 2: 실패하는 테스트 작성** — `aiHubCatalog.test.js`

```js
import { MOTION_CATALOG, SLIDE_CATALOG, validateMotionCatalog, validateSlideCatalog, MOTION_SOURCES } from '@mathchois/shared';
it('motion catalog: 106 items, ids unique, 01-pixel first', () => {
  expect(MOTION_CATALOG.length).toBe(106);
  expect(new Set(MOTION_CATALOG.map((m) => m.id)).size).toBe(106);
  expect(MOTION_CATALOG[0].id).toBe('01-pixel');
  expect(validateMotionCatalog(MOTION_CATALOG)).toEqual([]);
});
it('slide catalog: 748 items, popularity order kept, 118 school', () => {
  expect(SLIDE_CATALOG.length).toBe(748);
  expect(SLIDE_CATALOG.filter((s) => s.source === 'school').length).toBe(118);
  expect(SLIDE_CATALOG[0].id).toBe('24');
  expect(validateSlideCatalog(SLIDE_CATALOG)).toEqual([]);
});
it('validate reports duplicate id/no, bad id, cover out of range', () => {
  expect(validateMotionCatalog([{ ...MOTION_CATALOG[0] }, { ...MOTION_CATALOG[0] }])).toContain('duplicate motion id: 01-pixel');
  expect(validateMotionCatalog([{ ...MOTION_CATALOG[0], id: 'pixel' }])).toContain('bad motion id: pixel');
  expect(validateSlideCatalog([{ ...SLIDE_CATALOG[0], cover: 99 }])).toContain('cover/body out of range: 24');
  expect(validateMotionCatalog([{ ...MOTION_CATALOG[0], source: 'x' }])).toContain('bad source: 01-pixel');
});
```

`aiHubPaths.test.js`:

```js
import { isAiHubFile, isBrandSiteFile, mediaUrl } from '@mathchois/shared';
it.each(['motion/01-pixel/video.mp4', 'motion/119-coin-stack-lesson/poster.webp', 'slide/24/1.webp', 'slide/426/s/12.webp', 'slide/24/t/4.webp', 'manifest/motion.json', 'brand/index.html', 'brand/brand/apple.html', 'brand/data/detail/apple.json', 'brand/assets/fonts/PretendardVariable.woff2'])('allows %s', (p) => expect(isAiHubFile(p)).toBe(true));
it.each(['../motion/01-pixel/video.mp4', '/motion/01-pixel/video.mp4', 'motion/01-pixel/raw.mov', 'slide/24/13.webp', 'slide/24/x/1.webp', 'brand/assets/evil.js', 'brand/../index.html', 'manifest/x.json', 'motion/01-pixel/video.mp4?v=1'])('rejects %s', (p) => expect(isAiHubFile(p)).toBe(false));
it('brand site paths are relative to brand/', () => { expect(isBrandSiteFile('index.html')).toBe(true); expect(isBrandSiteFile('brand/index.html')).toBe(false); });
it('mediaUrl', () => expect(mediaUrl('motion/01-pixel/video.mp4', 'abcdef0123456789')).toBe('/api/files/ai-hub/motion/01-pixel/video.mp4?v=abcdef01'));
```

`aiHubAccess.test.js` — 명세 결정표 6행:

```js
import { canUseAiHub, aiHubAbilities } from '@mathchois/shared';
it.each([
  [{ role: null, isAdmin: false, allowedClassroomCount: 0 }, false],
  [{ role: 'student', isAdmin: false, allowedClassroomCount: 0 }, false],
  [{ role: 'student', isAdmin: false, allowedClassroomCount: 1 }, true],
  [{ role: 'teacher', isAdmin: false, allowedClassroomCount: 0 }, true],
  [{ role: 'student', isAdmin: true, allowedClassroomCount: 0 }, true],
])('canUseAiHub(%o) = %s', (a, ok) => expect(canUseAiHub(a)).toBe(ok));
it('abilities', () => {
  expect(aiHubAbilities({ role: 'student', isAdmin: false, allowedClassroomCount: 1 })).toEqual({ allowed: true, canEdit: false, canEditOriginal: false });
  expect(aiHubAbilities({ role: 'teacher', isAdmin: false, allowedClassroomCount: 0 })).toEqual({ allowed: true, canEdit: true, canEditOriginal: false });
  expect(aiHubAbilities({ role: 'teacher', isAdmin: true, allowedClassroomCount: 0 })).toEqual({ allowed: true, canEdit: true, canEditOriginal: true });
});
```

- [ ] **Step 3: 실패 확인**

Run: `cd packages/client && npx vitest run src/lib/aiHub`
Expected: FAIL — `@mathchois/shared` 에 export 없음.

- [ ] **Step 4: 구현**

`motion.ts`/`slide.ts`: 타입·상수·`validate*Catalog`(id 정규식 `^\d{2,3}-[a-z0-9-]+$` / `^\d{2,3}$`, no·id 중복, `source` 가 목록에 있는지, `cover/body ≤ slides`, 슬라이드 `slides ≤ 12`). `paths.ts`: 명세의 정규식 4개 + `isBrandSiteFile(rel) = BRAND_FILE.test('brand/' + rel)`. `access.ts`: 결정표. `source.ts`: 문구 상수. `index.ts` 에 `export * from './ai-hub/index.js'`(ai-hub 폴더에 index.ts 로 모아 export).

- [ ] **Step 5: 통과 확인** — `npx vitest run src/lib/aiHub` PASS, `npm run typecheck -w @mathchois/shared` 오류 0.

- [ ] **Step 6: Commit** — `feat(ai-hub): shared 카탈로그·출처·경로·접근 규칙`

---

### Task 2: shared — 프롬프트 엔진 이식

**Files:**
- Create: `packages/shared/src/ai-hub/promptEngine.ts`, `packages/shared/src/ai-hub/motionOpts.ts`
- Test: `packages/client/src/lib/aiHubPromptEngine.test.js`

**Interfaces:**
- Produces (명세 「프롬프트 엔진」 API 그대로): `DEF, LEN, RATIOS, LANGS, type PromptState, type Blank = { name, def, opt, on }, type Segment = { t?: string; b?: string; o?: string }, clampLen, state, blanks, hasStyle, rows, text, opt, isV2(tpl), validateTemplate(tpl): string[], tablesMarkdown(item: { shots: Row[]; cues: Row[] }, lang: 'en'|'ko'): string, finalPrompt(args: { tpl: string; st?: Partial<PromptState>|null; values?: Record<string,string>; off?: Record<string,boolean>; lang: 'en'|'ko'; withTables?: boolean; tables?: { shots; cues } }): string`
- `MOTION_OPTS: { labels: Record<string, unknown>; en: OptTexts; ko: OptTexts }` — 오빠두 `v2opts` 그대로.

- [ ] **Step 1: 원본 자료 확보**

```bash
curl -sS -A 'Mozilla/5.0' -o /tmp/ms-prompt.js 'https://www.oppadu.com/wp-content/themes/generatepress_child/tools/_motion-styles-assets/js/ms-prompt.js'
curl -sS -A 'Mozilla/5.0' -o /tmp/gallery-data.js 'https://www.oppadu.com/wp-content/themes/generatepress_child/tools/_motion-styles-assets/gallery-data.js'
```

`gallery-data.js` 의 `window.GALLERY` 객체에서 `v2opts`(`labels`·`en`·`ko`)만 꺼내 `motionOpts.ts` 에 `export const MOTION_OPTS = {...} as const;` 로 둔다(JSON.parse 로 꺼내고 손으로 고치지 않는다). 이 세션 스크래치 사본: `/tmp/claude-0/-home-user/4e7b165d-f807-5320-90b7-4c84cb350ab2/scratchpad/oppadu/`.

- [ ] **Step 2: 실패하는 테스트 작성** — `aiHubPromptEngine.test.js`

```js
import { DEF, LEN, state, blanks, hasStyle, rows, text, opt, isV2, validateTemplate, tablesMarkdown, finalPrompt, MOTION_OPTS } from '@mathchois/shared';
const L = MOTION_OPTS;
const V1 = '## 1. Channel\n- Name: {{Channel name=Chois}}\n- Tagline: {{Tagline=vibe}}\n- Logo: {{?Logo=use my logo}}\n- Numbers: {{-Numbers=none}}\n## 2. Scene\n';
const V2 = '{{#b}}- Brand: {{Brand name=}}\n{{#a}}- Brand: {{Brand name=PULSE}}\n- Length: {{@len}}\n{{#sound}}{{#!remotion}}- Sound: {{@sound}}\n## 3. Files\n- Attach {{@files}}\n{{#logo}}- {{@logo}}\n- Literal \\{{x}}\n';
it('state: defaults, clamp, invalid values fall back', () => {
  expect(state(null)).toEqual(DEF);
  expect(state({ len: 200, ratio: '2:1', lang: 'xx', style: 'z', render: 'x' })).toMatchObject({ len: LEN.max, ratio: '16:9', lang: 'ko', style: 'b', render: 'hf' });
  expect(state({ len: 1 }).len).toBe(LEN.min);
});
it('blanks: v1 — order, opt flags, dedupe', () => {
  expect(blanks(V1)).toEqual([
    { name: 'Channel name', def: 'Chois', opt: false, on: true },
    { name: 'Tagline', def: 'vibe', opt: false, on: true },
    { name: 'Logo', def: 'use my logo', opt: true, on: true },
    { name: 'Numbers', def: 'none', opt: true, on: false },
  ]);
});
it('blanks(st): only lines kept under the state; a/b switch', () => {
  expect(blanks(V2, { style: 'b' })[0].def).toBe('');
  expect(blanks(V2, { style: 'a' })[0].def).toBe('PULSE');
  expect(hasStyle(V2)).toBe(true); expect(hasStyle(V1)).toBe(false);
  expect(isV2(V2)).toBe(true); expect(isV2(V1)).toBe(false);
});
it('rows: 조건 여럿 — {{#sound}}{{#!remotion}} line drops when remotion', () => {
  const on = text(rows(V2, { st: { sound: true, render: 'hf' }, L: L.en, lang: 'en' }), () => 'X');
  const off = text(rows(V2, { st: { sound: true, render: 'remotion' }, L: L.en, lang: 'en' }), () => 'X');
  expect(on).toContain('- Sound:'); expect(off).not.toContain('- Sound:');
});
it('rows: off blank drops its line; section renumber; literal \\{{', () => {
  const t = text(rows(V1, { off: { Logo: true }, lang: 'en' }), (n) => ({ 'Channel name': 'C', Tagline: 'T' })[n] ?? '');
  expect(t).not.toContain('Logo'); expect(t).toContain('## 2. Scene');
  const t2 = text(rows('## 1. A\n{{#remotion}}## 2. B\n## 3. C\n', { st: { render: 'hf' }, lang: 'en' }), () => '');
  expect(t2).toBe('## 1. A\n## 2. C');
  expect(text(rows(V2, { st: { logo: false }, L: L.en, lang: 'en' }), () => '')).toContain('- Literal {{x}}');
});
it('opt: files join (en: a, b, and c / ko: 쉼표), hook, len, format, lang', () => {
  const st = state({ logo: true, sound: true });
  expect(opt('files', st, L.en, 'en')).toBe(`${L.en.fFonts}, ${L.en.fLogo}, and ${L.en.fSound}`);
  expect(opt('files', state({ logo: true, sound: false }), L.en, 'en')).toBe(`${L.en.fFonts} and ${L.en.fLogo}`);
  expect(opt('files', state({ logo: false, sound: false }), L.en, 'en')).toBe(L.en.fFonts);
  expect(opt('files', st, L.ko, 'ko')).toBe([L.ko.fFonts, L.ko.fLogo, L.ko.fSound].join(', '));
  expect(opt('hook', state({ sound: false }), L.en, 'en')).toBe(L.en.hookOff);
  expect(opt('len', state({ len: 12 }), L.ko, 'ko')).toBe('12' + L.ko.secs);
  expect(opt('format', state({ ratio: '9:16' }), L.ko, 'ko')).toBe('세로(9:16) 1080×1920, 30fps');
  expect(opt('shape', state({ ratio: '16:9' }), L.ko, 'ko')).toBe('');
  expect(opt('lang', state({ lang: 'en' }), L.ko, 'ko')).toBe(L.ko.onscreen.replace('{lang}', '영어'));
});
it('rows: long video adds L.long line under the len line', () => {
  const rs = rows('- Length: {{@len}}\n', { st: { len: 45 }, L: L.ko, lang: 'ko' });
  expect(rs.length).toBe(2); expect(rs[1].some((s) => s.o === 'long')).toBe(true);
  expect(rows('- Length: {{@len}}\n', { st: { len: 30 }, L: L.ko, lang: 'ko' }).length).toBe(1);
});
it('validateTemplate', () => {
  expect(validateTemplate(V2)).toEqual([]);
  expect(validateTemplate('{{#magic}}- x')).toEqual(['1행: 알 수 없는 조건 magic']);
  expect(validateTemplate('- {{Name=')).toEqual(['1행: 닫히지 않은 {{']);
  expect(validateTemplate('- a {{#sound}} b')).toEqual(['1행: 줄 가운데 {{#조건}}']);
});
it('tablesMarkdown + finalPrompt with tables', () => {
  const tables = { shots: [['0–1', 'a|b', 'why']], cues: [['0.0', 'kick', 'ev']] };
  expect(tablesMarkdown(tables, 'ko')).toContain('| 0–1 | a\\|b | why |');
  const out = finalPrompt({ tpl: V1, lang: 'en', withTables: true, tables });
  expect(out.startsWith('## 1. Channel\n- Name: Chois')).toBe(true);
  expect(out).toContain("## 8. Shot list (director's intent)");
  expect(finalPrompt({ tpl: V2, st: { style: 'b' }, lang: 'en' })).toContain('- Brand: [Brand name]');
});
```

- [ ] **Step 3: 실패 확인** — `npx vitest run src/lib/aiHubPromptEngine` FAIL.

- [ ] **Step 4: 구현** — `promptEngine.ts`

`ms-prompt.js` 의 `TOK`, `HEAD_COND`, `clampLen/state/cond/join/opt/blanks/hasStyle/rows/text` 를 함수 단위로 그대로 옮긴다(동작 변경 금지, 타입만 붙임). 추가 함수:
- `isV2(tpl) = /\{\{[@#]/.test(tpl)`.
- `validateTemplate(tpl)`: 줄마다 (1) `HEAD_COND` 를 벗긴 뒤 남은 줄에 `{{#` 이 있으면 "줄 가운데 {{#조건}}", (2) 줄 맨 앞 조건 이름이 `sound|compose|logo|a|b|hf|remotion`(선택적 `!`) 밖이면 "알 수 없는 조건 <이름>", (3) `{{` 의 개수가 `}}` 보다 많으면 "닫히지 않은 {{". 메시지 형식 `${n}행: …`.
- `tablesMarkdown`·`finalPrompt`: me.chois.pro `web/src/components/motion-gallery/admin/placeholders.ts` 의 `tablesMarkdown`(절 제목 "## 8. Shot list (director's intent)" / "## 9. Sound cue sheet", 국문 "## 8. 장면표 (감독의 의도)" / "## 9. 소리 큐 시트", 안내문, 셀의 `|`→`\|`, 개행→공백)을 옮기고, `finalPrompt` = `text(rows(tpl, { st: state(st), off, L: MOTION_OPTS[lang], lang }), name => off[name] ? '' : (values[name] || (state(st).style === 'b' && isV2(tpl) ? '' : def) || '[' + name + ']'))` + (withTables && tables ? tablesMarkdown : '').

- [ ] **Step 5: 통과 확인** — PASS, shared typecheck 0.

- [ ] **Step 6: Commit** — `feat(ai-hub): 오빠두 v2 프롬프트 엔진 이식`

---

### Task 3: 서버 — 학급 토글·DB·접근 가드

**Files:**
- Modify: `packages/server/src/db/schema.ts` (classrooms.aiHubEnabled, `aiMotionPrompts`, `aiSlidePrompts`), `packages/server/src/db/startupMigrate.ts`, `packages/server/src/services/classroom.service.ts:19-80,105-113` (select·update 에 `aiHubEnabled`), `packages/server/src/routes/classrooms.ts:100-132`
- Create: `packages/server/src/middleware/aiHub.ts`, `packages/server/src/services/aiHubAccess.service.ts`, `packages/server/src/routes/aiHub.ts`(이 Task 에서는 `/api/ai/access` 만), `packages/server/src/app.ts` 에 `app.register(aiHubRoutes)`

**Interfaces:**
- Consumes: Task 1 `aiHubAbilities`.
- Produces: `requireAiHub(request, reply)` preHandler; `countAllowedClassrooms(studentId): Promise<number>`; `abilitiesFor(user: TokenPayload): Promise<{ allowed, canEdit, canEditOriginal }>`; `GET /api/ai/access`; 학급 응답 필드 `aiHubEnabled: boolean`; `PATCH /api/classrooms/:id { aiHubEnabled?: boolean }`.

- [ ] **Step 1: 스키마·마이그레이션**

`schema.ts`: `aiHubEnabled: boolean('ai_hub_enabled').notNull().default(false)` (classrooms), 새 테이블
`aiMotionPrompts('ai_motion_prompts', { id: text PK, promptEn: text notNull, promptKo: text notNull, shots: jsonb $type<[string,string,string][]> notNull, cues: 동일, updatedAt: timestamptz defaultNow notNull })`,
`aiSlidePrompts('ai_slide_prompts', { id: text PK, prompt: text notNull, updatedAt })`.
`startupMigrate.ts` 끝(`backfillClassroomColors` 앞)에 `ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS ai_hub_enabled boolean NOT NULL DEFAULT false` 와 두 `CREATE TABLE IF NOT EXISTS`, `log.info('startup migration: ai hub ensured')`.

- [ ] **Step 2: 학급 서비스·라우트**

`getTeacherClassrooms`·`getStudentClassrooms` select 에 `aiHubEnabled: classrooms.aiHubEnabled`; `updateClassroom(id, data: { name?; color?; aiHubEnabled?: boolean })`. PATCH 라우트: `aiHubEnabled !== undefined && typeof aiHubEnabled !== 'boolean'` → 400 `{ error: 'aiHubEnabled must be boolean' }`; patch 에 포함.

- [ ] **Step 3: 가드·access 라우트**

`aiHubAccess.service.ts`: `countAllowedClassrooms(studentId)` = `SELECT count(*) FROM classroom_members cm JOIN classrooms c ON c.id = cm.classroom_id WHERE cm.student_id = $1 AND c.ai_hub_enabled`; `abilitiesFor(user)` = `aiHubAbilities({ role: user.role ?? null, isAdmin: !!user.isAdmin, allowedClassroomCount: user.role === 'student' ? await countAllowedClassrooms(user.sub) : 0 })`.
`middleware/aiHub.ts`: `requireAiHub` — `(await abilitiesFor(request.user)).allowed` 아니면 403 `{ error: 'AI hub not enabled for you' }`.
`routes/aiHub.ts`: `app.get('/api/ai/access', { preHandler: [authenticate] }, (req) => abilitiesFor(req.user))`.

- [ ] **Step 4: 검증(수동, 로컬 DB)**

```bash
cd packages/server && npx tsc --noEmit && npm run dev
```
curl 절차(토큰은 `POST /api/auth/login` 응답): 교사 `GET /api/ai/access` → `{"allowed":true,"canEdit":true,"canEditOriginal":false}`; 학생(허용 학급 없음) → `allowed:false`; 교사 `PATCH /api/classrooms/:id {"aiHubEnabled":true}` → 응답에 `aiHubEnabled:true`; 같은 학생 다시 → `allowed:true`; `PATCH {"aiHubEnabled":"yes"}` → 400. 서버 로그에 `ai hub ensured`.

- [ ] **Step 5: Commit** — `feat(ai-hub): 학급 AI활용 토글·프롬프트 테이블·접근 가드`

---

### Task 4: 서버 — 열람 API·관리자 프롬프트 저장

**Files:**
- Create: `packages/shared/src/ai-hub/render.ts`, `packages/server/src/services/aiHub.service.ts`
- Modify: `packages/server/src/routes/aiHub.ts`
- Test: `packages/client/src/lib/aiHubRender.test.js`

**Interfaces:**
- Consumes: Task 1 카탈로그·`mediaUrl`, Task 2 `validateTemplate`, Task 3 `requireAiHub`.
- Produces (shared): `type Manifest = Record<string, { size: number; sha256: string; updatedAt: string }>`, `renderMotionItems(catalog, manifest, prompts: Map<string, MotionPrompt>): MotionItem[]` (`MotionItem = MotionPublic & { video, poster, preview: string|null, prompt: { en, ko, shots, cues, v2: boolean } | null }`), `renderSlideItems(catalog, manifest, prompts: Map<string,string>): SlideItem[]` (`SlidePublic & { images: string[]; thumbs: string[]; coverCard; bodyCard; prompt: string|null }`).
- Produces (server): `readManifest(set: 'motion'|'slide'|'brand'): Promise<Manifest|null>` (Volume `ai-hub/manifest/<set>.json`, mtime 캐시), `listMotion()`, `listSlide()`, `upsertMotionPrompt(id, { en, ko, shots, cues })`, `upsertMotionPrompts(list)`, `upsertSlidePrompts(list)`; 라우트 `GET /api/ai/motion`, `GET /api/ai/slide`, `PUT /api/ai/motion/:id/prompt`.

- [ ] **Step 1: 실패하는 테스트** — `aiHubRender.test.js`

```js
import { renderMotionItems, renderSlideItems, MOTION_CATALOG, SLIDE_CATALOG } from '@mathchois/shared';
const e = (c) => ({ size: 1, sha256: c.repeat(64), updatedAt: 'x' });
it('motion: only items with video+poster, preview optional, prompt null when missing', () => {
  const m = { 'motion/01-pixel/video.mp4': e('a'), 'motion/01-pixel/poster.webp': e('b'), 'motion/11-rpg/video.mp4': e('c') };
  const out = renderMotionItems(MOTION_CATALOG, m, new Map());
  expect(out.map((i) => i.id)).toEqual(['01-pixel']);
  expect(out[0]).toMatchObject({ video: '/api/files/ai-hub/motion/01-pixel/video.mp4?v=aaaaaaaa', poster: '/api/files/ai-hub/motion/01-pixel/poster.webp?v=bbbbbbbb', preview: null, prompt: null });
});
it('motion: prompt row attached with v2 flag', () => {
  const m = { 'motion/01-pixel/video.mp4': e('a'), 'motion/01-pixel/poster.webp': e('b') };
  const p = new Map([['01-pixel', { en: '{{#a}}x', ko: 'y', shots: [], cues: [] }]]);
  expect(renderMotionItems(MOTION_CATALOG, m, p)[0].prompt).toEqual({ en: '{{#a}}x', ko: 'y', shots: [], cues: [], v2: true });
});
it('slide: all k images + thumbs + cover/body cards required', () => {
  const s = SLIDE_CATALOG[0]; // id 24, slides 8, cover 1, body 3
  const m = {};
  for (let k = 1; k <= s.slides; k++) { m[`slide/24/${k}.webp`] = e('a'); m[`slide/24/s/${k}.webp`] = e('b'); }
  m['slide/24/t/1.webp'] = e('c'); m['slide/24/t/3.webp'] = e('d');
  const out = renderSlideItems([s], m, new Map([['24', 'P']]));
  expect(out[0].images.length).toBe(8); expect(out[0].coverCard).toContain('/t/1.webp?v=cccccccc'); expect(out[0].prompt).toBe('P');
  delete m['slide/24/s/5.webp'];
  expect(renderSlideItems([s], m, new Map())).toEqual([]);
});
it('null manifest → []', () => { expect(renderMotionItems(MOTION_CATALOG, null, new Map())).toEqual([]); });
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/lib/aiHubRender` FAIL.

- [ ] **Step 3: shared `render.ts` 구현** — me.chois.pro `web/src/lib/media.ts`(`renderedMotions`)·`slides.ts`(`renderedSlides`)의 규칙을 `mediaUrl` 기반으로 옮긴다.

- [ ] **Step 4: 서버 서비스·라우트**

`aiHub.service.ts`: `readManifest` 는 `env.VOLUME_PATH/ai-hub/manifest/<set>.json` 을 `stat` mtime 이 바뀔 때만 다시 읽고 JSON 이 깨지면 `null` + `log.error`. `listMotion()` = `renderMotionItems(MOTION_CATALOG, await readManifest('motion'), await loadMotionPrompts())`(Drizzle `select` 전체 → Map). `upsertMotionPrompt` = `insert … onConflictDoUpdate({ target: id, set: { promptEn, promptKo, shots, cues, updatedAt: new Date() } })`.
라우트: `GET /api/ai/motion`·`/api/ai/slide` preHandler `[authenticate, requireAiHub]`; `PUT /api/ai/motion/:id/prompt` preHandler `[authenticate, requireAdmin]`, zod 본문 `{ en: string.min(1).max(20000), ko: 동일, shots: tuple(string×3)[].max(60), cues: 동일 }`, `validateTemplate(en).concat(validateTemplate(ko))` 가 비어 있지 않으면 400 `{ error: 'invalid template', errors }`, id 가 카탈로그에 없으면 404. 응답 = `{ id, en, ko, shots, cues, v2, updatedAt }`.

- [ ] **Step 5: 검증** — `npx tsc --noEmit`; curl: 교사 `GET /api/ai/motion` → `[]`(Volume 비어 있음); 관리자 `PUT /api/ai/motion/01-pixel/prompt` 정상 본문 → 200; `{{#magic}}` 본문 → 400 `errors: ['1행: 알 수 없는 조건 magic']`; 교사(비관리자) → 403; `PUT /api/ai/motion/zzz/prompt` → 404.

- [ ] **Step 6: Commit** — `feat(ai-hub): 모션·슬라이드 열람 API 와 관리자 프롬프트 저장`

---

### Task 5: 서버 — 토큰 업로드 API

**Files:**
- Create: `packages/server/src/services/aiHubUpload.service.ts`
- Modify: `packages/server/src/config/env.ts` (`AI_MEDIA_UPLOAD_TOKEN: z.string().min(32).optional()`), `packages/server/src/routes/aiHub.ts`, `packages/server/src/routes/storage.ts:268-270`
- Create (shared): `packages/shared/src/ai-hub/upload.ts` — `tokenMatches(header: string|undefined, expected: string|undefined): boolean`, `validateManifest(json: unknown): string[]`
- Test: `packages/client/src/lib/aiHubUpload.test.js`

**Interfaces:**
- Produces: `PUT /api/ai/media?path=<rel>`, `GET /api/ai/media/manifest?set=`, `PUT /api/ai/prompts/:set`; `ai-hub` 버킷의 `?v=` 요청에 immutable 캐시.

- [ ] **Step 1: 실패하는 테스트** — `aiHubUpload.test.js`

```js
import { tokenMatches, validateManifest } from '@mathchois/shared';
it('tokenMatches: bearer, exact, constant length', () => {
  expect(tokenMatches('Bearer abc', 'abc')).toBe(true);
  expect(tokenMatches('Bearer abd', 'abc')).toBe(false);
  expect(tokenMatches('abc', 'abc')).toBe(false);
  expect(tokenMatches('Bearer abc', undefined)).toBe(false);
});
it('validateManifest', () => {
  expect(validateManifest({ 'motion/01-pixel/video.mp4': { size: 1, sha256: 'a'.repeat(64), updatedAt: 't' } })).toEqual([]);
  expect(validateManifest({ 'motion/01-pixel/video.mp4': { size: -1, sha256: 'zz', updatedAt: 't' } })).toEqual(['motion/01-pixel/video.mp4: bad entry']);
  expect(validateManifest({ '../x': { size: 1, sha256: 'a'.repeat(64), updatedAt: 't' } })).toEqual(['../x: path not allowed']);
});
```

`tokenMatches` 는 shared 에서 길이 비교 + 문자 비교를 상수 시간으로(`crypto` 없이 XOR 누적) 구현하고, 서버는 그대로 쓴다.

- [ ] **Step 2: 실패 확인** → **Step 3: 구현**

`aiHubUpload.service.ts`: `saveUpload(rel, stream, expectedSha, maxBytes = 100 MiB)` — me.chois.pro `web/src/lib/media-upload.ts` 의 `handleUpload` 를 Node stream 으로: 임시 파일 `${dest}.${randomUUID()}.part` 에 쓰며 sha256·바이트 수를 세고, 초과면 삭제 후 `413`, sha 불일치면 삭제 후 `422`, `manifest/*.json` 이면 `validateManifest` 실패 시 `422`, 성공 시 `rename`. Fastify 에서는 `app.addContentTypeParser('application/octet-stream', (req, payload, done) => done(null, payload))` 로 raw 스트림을 받는다(라우트 플러그인 안에서 등록).
라우트 셋은 공통 preHandler `requireUploadToken`: env 없으면 503, 토큰 불일치 401. `PUT /api/ai/media` 는 `isAiHubFile(path)` 아니면 400. `GET /api/ai/media/manifest` 는 `set` 이 셋 밖이면 400, 파일 없으면 `{}`. `PUT /api/ai/prompts/:set`: `motion` 은 zod `MotionAdmin[]`(id·prompt·ko·shots·cues) → `upsertMotionPrompts`; `slide` 는 `{ id, prompt }[]` → `upsertSlidePrompts`; 응답 `{ ok: true, count }`.
`storage.ts`: 기존 immutable 캐시 줄은 그대로 두되 `bucket === 'ai-hub' && !request.query.v` 면 `Cache-Control: private, no-cache`(버전 없는 주소는 캐시하지 않는다).

- [ ] **Step 4: 검증(curl)** — `AI_MEDIA_UPLOAD_TOKEN` 을 `.env` 에 넣고 재시작. (1) 토큰 없이 `PUT /api/ai/media?path=motion/01-pixel/poster.webp` → 401. (2) 토큰 + `path=../x` → 400, `ls local-storage/ai-hub` 에 아무것도 없음. (3) 올바른 sha 로 작은 webp 업로드 → 200 `{ ok, path, size }`, 파일 존재. (4) sha 틀리게 → 422, `.part` 없음. (5) manifest 업로드 후 `GET /api/ai/media/manifest?set=motion` 이 같은 JSON. (6) env 제거 후 → 503.

- [ ] **Step 5: Commit** — `feat(ai-hub): 토큰 업로드 API(미디어·manifest·프롬프트)`

---

### Task 6: 서버 — 브랜드 사본 서빙

**Files:**
- Create: `packages/shared/src/ai-hub/brandEmbed.ts` (`BRAND_EMBED_STYLE`, `embedBrandHtml(html: string): string`), `packages/server/src/services/brandSite.service.ts`
- Modify: `packages/server/src/routes/aiHub.ts`
- Test: `packages/client/src/lib/aiHubBrandEmbed.test.js`

- [ ] **Step 1: 실패하는 테스트**

```js
import { embedBrandHtml, BRAND_EMBED_STYLE } from '@mathchois/shared';
it('inserts before </head>', () => expect(embedBrandHtml('<html><head><title>x</title></head><body></body></html>')).toBe(`<html><head><title>x</title>${BRAND_EMBED_STYLE}\n</head><body></body></html>`));
it('no head → before <body', () => expect(embedBrandHtml('<body>hi</body>')).toBe(`${BRAND_EMBED_STYLE}\n<body>hi</body>`));
it('neither → prepended', () => expect(embedBrandHtml('plain')).toBe(`${BRAND_EMBED_STYLE}\nplain`));
```

- [ ] **Step 2: 실패 확인** → **Step 3: 구현**

`BRAND_EMBED_STYLE` 은 me.chois.pro `web/src/lib/brand-embed.ts` 의 문자열 그대로. `brandSite.service.ts`: `serveBrandFile(rel): Promise<{ status: 404 } | { status: 200; body: Buffer|string; contentType; cacheControl }>` — `isBrandSiteFile(rel)` 아니면 404, `env.VOLUME_PATH/ai-hub/brand/<rel>` 읽기, 확장자별 `Content-Type`(`.html` text/html; charset=utf-8, `.js`, `.css`, `.json`, `.woff2` font/woff2), HTML 은 `embedBrandHtml`, 캐시 HTML `private, no-cache` / 그 외 `private, max-age=600`.
라우트 `GET /api/ai/brand/site/*`(공개): `rel = params['*'] || 'index.html'`; 200 이면 헤더 `Content-Security-Policy: buildFrameAncestors()`(`routes/storage.ts` 에서 import), `Cross-Origin-Resource-Policy: cross-origin`, `X-Robots-Tag: noindex`, `reply.raw.removeHeader('X-Frame-Options')`, `reply.raw.removeHeader('Origin-Agent-Cluster')`.

- [ ] **Step 4: 검증** — `local-storage/ai-hub/brand/index.html` 에 `<html><head></head><body>ok</body></html>` 를 두고 `curl -i http://localhost:3001/api/ai/brand/site/` → 200, 본문에 `data-chois-embed`, 헤더에 `frame-ancestors`, `X-Frame-Options` 없음; `/api/ai/brand/site/../index.html` 과 `/api/ai/brand/site/assets/evil.js` → 404.

- [ ] **Step 5: Commit** — `feat(ai-hub): 브랜드 룩북 사본 서빙 라우트`

---

### Task 7: 클라이언트 — 가드·레이아웃·라우트·학급 토글

**Files:**
- Create: `packages/client/src/lib/aiHub/guard.js`, `packages/client/src/hooks/useAiHubData.js`, `packages/client/src/pages/AiHub/AiHubRoute.jsx`, `AiHubLayout.jsx`, `AiHubLayout.css`
- Modify: `packages/client/src/App.jsx:96-190`, `packages/client/src/pages/Classrooms/ClassroomDetail.jsx:168-180,290-335`, `packages/client/src/lib/dataCache.js`
- Test: `packages/client/src/lib/aiHub/guard.test.js`

**Interfaces:**
- Produces: `resolveAiHubRedirect({ isAuthenticated, role, allowed }): string | null` (null = 통과; `/`, `/choose-role`, `/${role}/classrooms`); `useAiHubData()` → `{ access, motion, slide, reload, status }` (컨텍스트, `GET /api/ai/access`·`/api/ai/motion`·`/api/ai/slide` 를 한 번 받아 `dataCache` 의 새 Map 에 둠; `invalidateAiHubCache()`); `AiHubLayout` 가 `<Outlet context={{ access, motion, slide }}/>` 로 내린다; 라우트 다섯 + 편집기 자리(`/ai/motion/:id/edit` 는 Task 11 이 채움, 이 Task 에서는 "준비 중" 요소).
- 학급 상세: `AI활용` 단추(교사·관리자 항상, 학생은 `classroom.aiHubEnabled`), `#` 패널 스위치 「학생에게 AI활용 열기」.

- [ ] **Step 1: 실패하는 테스트** — `guard.test.js`

```js
import { resolveAiHubRedirect } from './guard';
it.each([
  [{ isAuthenticated: false, role: null, allowed: null }, '/'],
  [{ isAuthenticated: true, role: null, allowed: null }, '/choose-role'],
  [{ isAuthenticated: true, role: 'student', allowed: false }, '/student/classrooms'],
  [{ isAuthenticated: true, role: 'student', allowed: true }, null],
  [{ isAuthenticated: true, role: 'teacher', allowed: true }, null],
])('%o → %s', (a, out) => expect(resolveAiHubRedirect(a)).toBe(out));
```

- [ ] **Step 2: 실패 확인** → **Step 3: 구현**

`AiHubRoute`: `useAuth()`; `isLoading` 또는 access 로딩 중 → `ProtectedRoute` 와 같은 "로딩 중…" 화면; `resolveAiHubRedirect` 결과가 있으면 `<Navigate replace/>`; API 403 은 `allowed:false` 로 본다. `useAiHubData` 의 fetch 가 403 을 받으면 `access.allowed=false` 로 바꾼다(Review Focus 1).
`AiHubLayout`: `Navbar` + 머리글(`<h1>AI활용</h1>`, 탭 칩 `NavLink` 모션·슬라이드·브랜드 `aria-current="page"`, 탭별 소개 한 줄(me.chois.pro `ai-tabs.ts` 의 `intro.ko` 세 문장 그대로, 모바일 `<md` 접힘 토글 "소개 펼치기/접기"), 오른쪽 "학급으로" 링크 = `location.state?.from ?? `/${role}/classrooms``) + `<Outlet/>` + `<footer>{creditLine(tab)}</footer>`.
`App.jsx`: 명세의 라우트 트리. `ClassroomDetail`: 단추는 `IconButton`(`Sparkles`, label "AI활용", `onClick={() => navigate('/ai', { state: { from: location.pathname + location.search } })}`); 스위치는 `<label><input type="checkbox" role="switch" aria-checked …/> 학생에게 AI활용 열기</label>` → `api.patch` 실패 시 되돌리고 `setAiError('AI활용 설정을 저장하지 못했어요')`를 `colorError` 자리에 표시.

- [ ] **Step 4: 검증** — `npx vitest run src/lib/aiHub` PASS; `npm run lint`; 브라우저: 교사 학급 상세에서 스위치 켜기 → 새로고침 후 유지 → 학생 로그인 → 헤더 AI활용 단추 → `/ai/motion` 열림(빈 상태 문구) → 교사가 끄면 학생이 다음 탭을 누를 때 학급 목록으로.

- [ ] **Step 5: Commit** — `feat(ai-hub): /ai 가드·레이아웃·학급 AI활용 토글`

---

### Task 8: 클라이언트 — 모션 갤러리·상세

**Files:**
- Create: `packages/client/src/components/aiHub/{FilterPicker,MotionCard,MotionGallery,PromptCopy,OriginalBadge,OriginalCredit,KeyNav}.jsx`, `packages/client/src/pages/AiHub/{MotionGalleryPage,MotionDetailPage}.jsx`, `packages/client/src/lib/aiHub/clipboard.js`, `packages/client/src/lib/aiHub/motionNav.js`
- Test: `packages/client/src/lib/aiHub/motionNav.test.js`

**Interfaces:**
- Consumes: Task 7 `useOutletContext().motion`, Task 2 `finalPrompt`.
- Produces: `neighbors(items, id) → { item, prev, next, index } | null`, `groupFilter(items, g) → { present: string[], shown }`; `writeClipboard(text): Promise<void>`(Clipboard API → textarea 폴백).

- [ ] **Step 1: 실패하는 테스트** — `motionNav.test.js`: `neighbors` 가 첫/마지막 항목에서 `prev/next` 를 null 로, 없는 id 는 null; `groupFilter` 가 없는 분류 요청을 전체로 되돌리고 `present` 는 카탈로그 `MOTION_GROUPS` 순서를 지킨다.

- [ ] **Step 2: 실패 확인** → **Step 3: 구현**

me.chois.pro 의 `MotionGallery.tsx`·`MotionCard.tsx`·`FilterPicker.tsx`·`PromptCopy.tsx`·`KeyNav.tsx`·`motion/[id]/page.tsx` 를 JSX 로 옮긴다: `next/link`→`Link`, `useSearchParams`(React Router) 로 `?g=`(`setSearchParams(…, { replace: true })`), `useRouter().push`→`navigate`. 카드 격자 `grid-cols-2 sm:3 lg:4 xl:5 2xl:6`, 호버 미리보기는 `matchMedia('(hover: hover)')` 일 때만. `source==='oppadu'` 면 `OriginalBadge`(카드 모서리)·`OriginalCredit`(상세, 조각 사이 `{' '}`). 복사 단추 둘: `finalPrompt({ tpl: prompt[lang], lang, withTables: true, tables: prompt })`, 프롬프트 없으면 `disabled` + "프롬프트 데이터 준비 중". 교사·관리자(`access.canEdit`)에게 `Link to={`/ai/motion/${id}/edit`}` "빈칸 편집·장면표". 빈 상태: "예시를 준비하고 있어요" (+ `access.canEditOriginal` 이면 "`npm run ai:push` 로 자료를 올리세요").

- [ ] **Step 4: 검증** — 테스트 PASS, lint; Task 5 의 curl 로 `01-pixel` 포스터·영상·manifest 와 Task 4 의 프롬프트를 올린 뒤 브라우저에서 카드 1장 → 상세 → 영문 복사(클립보드에 `## 8.` 표 포함) → ←/→ 키.

- [ ] **Step 5: Commit** — `feat(ai-hub): 모션 갤러리·상세`

---

### Task 9: 클라이언트 — 슬라이드 갤러리·뷰어

**Files:**
- Create: `packages/client/src/lib/aiHub/slideOrder.js`, `slideHash.js`, `packages/client/src/components/aiHub/{SlideCard,SlideGallery,SlideSortMenu,SlideViewer,SlidePrompt}.jsx`, `packages/client/src/pages/AiHub/SlideGalleryPage.jsx`
- Test: `packages/client/src/lib/aiHub/slideOrder.test.js`, `slideHash.test.js`

- [ ] **Step 1: 테스트 이식** — me.chois.pro `web/src/components/slide-gallery/slide-order.test.ts`·`slide-hash.test.ts` 를 JS 로 옮긴다(`parseQuery(params, present)` 기본 `{ family:null, sort:'pop', view:'cover' }`, `toSearch` 가 기본값은 생략, `arrange` 의 `no`/`new`(added 내림차순 → no 내림차순) 정렬, `opensOutsideFilter`, `stepSlide` 의 스타일 넘김(마지막 장 → 다음 스타일 0장, 첫 장에서 ← → 이전 스타일 마지막 장), `stepStyle` 순환, `readHashId` 의 디코드 실패 → `''`).

- [ ] **Step 2: 실패 확인** → **Step 3: 구현** — 컴포넌트는 me.chois.pro 의 TSX 를 JSX 로(`useSearchParams`·`useSyncExternalStore` 그대로). 뷰어 `<dialog>` 는 `showModal()`, 닫기 → `setHashId(null)`, 키 ←/→, 스와이프 40px, 전체 화면 단추는 `document.fullscreenEnabled` 일 때만, 설명 칸에 `topic` 있을 때만 "예시 주제", `source==='oppadu'` 면 `OriginalCredit`(슬라이드 갤러리 문구). `SlidePrompt`: 없으면 "프롬프트 데이터 준비 중".

- [ ] **Step 4: 검증** — 테스트 PASS; 브라우저에서 `?f=hand&s=new&v=body#24` 로 열면 뷰어가 24 를 열고 거르기 밖이어도 전체 순서로 넘어간다.

- [ ] **Step 5: Commit** — `feat(ai-hub): 슬라이드 갤러리·뷰어`

---

### Task 10: 클라이언트 — 브랜드 페이지

**Files:**
- Create: `packages/client/src/pages/AiHub/BrandPage.jsx`

- [ ] **Step 1: 구현** — `<iframe data-testid="brand-frame" src="/api/ai/brand/site/" title="브랜드 룩북" allow="clipboard-write" className="ai-brand-frame"/>`; CSS `height: calc(100dvh - var(--ai-head-h) - var(--ai-foot-h))`(레이아웃이 머리글·푸터 높이를 CSS 변수로 둔다).
- [ ] **Step 2: 검증** — Task 6 의 index.html 로 iframe 안에 "ok" 가 보이고 콘솔에 CSP 오류 없음.
- [ ] **Step 3: Commit** — `feat(ai-hub): 브랜드 룩북 페이지`

---

### Task 11: 클라이언트 — 모션 프롬프트 편집기

**Files:**
- Create: `packages/client/src/lib/aiHub/editorStore.js`, `packages/client/src/pages/AiHub/MotionEditorPage.jsx`, `MotionEditorPage.css`, `packages/client/src/components/aiHub/editor/{PromptPane,BlankRow,OptionRows,PromptPreview,RowsTable,OriginalEditor,InfoTip}.jsx`
- Modify: `packages/client/src/App.jsx` (Task 7 의 자리 교체)
- Test: `packages/client/src/lib/aiHub/editorStore.test.js`

**Interfaces:**
- Consumes: Task 2 엔진 전부, Task 4 `PUT /api/ai/motion/:id/prompt`, Task 7 `useAiHubData().reload`.
- Produces (`editorStore.js`, 순수 + localStorage 어댑터): 키 `aiHub.fill`·`aiHub.opt`·`aiHub.lang`·`aiHub.lenOwn`·`aiHub.sound`·`aiHub.withTables`; `loadStore(storage) → Store`, `saveStore(storage, store)`, `effectiveLen(store, item) → number`(lenOwn 이면 `store.opt.len`, 아니면 `item.secs ?? 10`), `pairBlanks(enBlanks, koBlanks) → Blank & { key }[]`(같은 자리 칸을 한 key 로), `valueOf(store, blank, emptyMode) → string`, `isDirty(store, blanks, defaults) → boolean`, `resetStore(store) → Store`, `migrateChannelName(store)`(`채널 이름` 값이 있고 `브랜드 이름` 이 없으면 복사). `MAIN_KEYS = ['채널 이름','브랜드 이름','한 줄 소개','주제','숫자']`.

- [ ] **Step 1: 실패하는 테스트** — `editorStore.test.js`

```js
it('loadStore defaults when storage empty or broken', …);                    // opt = DEF, lang 'en', withTables true, sound false
it('effectiveLen follows item.secs until user sets length', () => {
  const s = loadStore(mem()); expect(effectiveLen(s, { secs: 45 })).toBe(45); expect(effectiveLen(s, {})).toBe(10);
  const own = { ...s, lenOwn: true, opt: { ...s.opt, len: 20 } }; expect(effectiveLen(own, { secs: 45 })).toBe(20);
});
it('pairBlanks keys ko blanks by en name when counts match, else by own name', …);
it('valueOf: emptyMode hides defaults; user value wins', …);
it('migrateChannelName copies 채널 이름 → 브랜드 이름 once', …);
it('isDirty false at defaults, true after value/off/opt change', …);
```

- [ ] **Step 2: 실패 확인** → **Step 3: `editorStore.js` 구현** → **Step 4: 통과 확인**

- [ ] **Step 5: 화면 구현** — 명세 「편집기」의 순서 그대로.

`MotionEditorPage`: `useParams().id`, `useAiHubData()`(가드 밖이므로 직접 호출; 403 이면 `/ai` 로), `access.canEdit` 가 아니면(학생) `<Navigate to={`/ai/motion/${id}`} replace/>` — 학생은 열람 API 는 되므로 이 검사가 없으면 편집기가 그대로 열린다. `neighbors()`. 머리(닫기 `navigate(-1)` 또는 `/ai/motion/:id`, 이전/다음 `Link`, "n / N", `분류 › 이름`, 소리 토글 `aria-pressed`, 관리자면 "원본 편집" 스위치). 왼쪽 영상(`muted autoPlay loop playsInline controls`, 소리 토글이 `muted` 를 바꾸고 `onVolumeChange` 로 되돌림). 오른쪽 `role="tablist"` 프롬프트/장면표/소리 큐; 키 1·2·3·←/→·Esc 는 입력 요소 포커스·편집 모드에서 무시.
`PromptPane`: `isV2 = isV2(prompt.en)`, `twoWay = hasStyle(prompt.en)`, `st = { ...store.opt, len: effectiveLen(store, item) }`, `bl = pairBlanks(blanks(tpl.en, st), blanks(tpl.ko, st))`, `emptyMode = isV2 && st.style === 'b'`. 행 배치: v2 는 모두 `rowsMain`; v1 은 `MAIN_KEYS` 만 위, 나머지 `<details>` "세부 설정 · {total}가지 중 {used}가지 사용"(`total` = MAIN 밖 칸 수(+v2 면 3), `used` = 켜진 수). `OptionRows`(v2 만): 방식 세그먼트(twoWay), 길이 `<input type=number min=3 max=90>`(범위 밖 안내 `lenMax`/`lenMin` 문구는 `MOTION_OPTS.labels`), 화면 세그먼트 6(+"30fps"), 렌더링 세그먼트 + `InfoTip`(`renderRmInfo`, 링크), 화면 글자 `<select>`, "옵션" 제목 + 체크 3열(`music` 은 `sound` 꺼지면 disabled) + `InfoTip` 셋(`logoInfo`/`soundInfo`/`musicInfo`). 행동 줄: 언어 세그먼트, 「기본값으로」(`isDirty`), 「프롬프트 복사」, 「장면표·소리 큐 포함」. `PromptPreview`: `rows()` 결과를 줄마다 `div.ai-ln`(머리 `## ` → `.ai-ln--h`, 목록 `- ` → `.ai-ln--li`, `**굵게**`·`` `코드` ``), 칸은 `<mark data-k class="is-own|is-empty">`, 글자 수 `n자`, 복사 미니. 복사 글자 = `finalPrompt({ tpl: tpl[lang], st, values, off, lang, withTables, tables: prompt })`.
`RowsTable`: 3열 표 + 건수("n개 장면 · {secs}초" / "n개 큐").
`OriginalEditor`(관리자): `textarea` 둘(영문·국문, 위에 문법 요약 6줄), 표 둘(행 추가·삭제), 저장 → `api.put` → 성공 시 `reload()`·"저장됨", 400 이면 `errors` 를 줄 번호와 함께 목록으로, 되돌리기 = 서버 값으로.

- [ ] **Step 6: 검증** — 테스트 PASS, lint; 브라우저: 교사로 `/ai/motion/01-pixel/edit` → 옛 틀이면 주 칸만 위·세부 설정 접힘, 값 바꾸면 미리보기 `mark.is-own`·「기본값으로」 등장, 다른 스타일로 넘어가도 값 유지, 복사 → 클립보드; v2 틀(Task 4 curl 로 `{{#b}}…` 넣은 편) → 방식·길이·화면·렌더링·언어·옵션 줄, 길이 45 → 미리보기에 「긴 영상의 짜임」 줄, Remotion 고르면 `{{#!remotion}}` 줄 사라짐; 관리자 「원본 편집」 → `{{#magic}}` 저장 시 "1행: 알 수 없는 조건 magic"; 학생이 `/ai/motion/01-pixel/edit` 를 직접 입력 → 상세 `/ai/motion/01-pixel` 로 돌아감.

- [ ] **Step 7: Commit** — `feat(ai-hub): 모션 프롬프트 편집기(오빠두 v2 구성)`

---

### Task 12: 스크립트 — 자료 이전·추가 (`scripts/ai-hub/`)

**Files:**
- Create: `scripts/ai-hub/{manifest.ts, volumeLayout.ts, pull.ts, media-push.ts, media-prepare.ts, motion-import.ts, slide-import.ts, brand-import.ts, README.md}`, `scripts/tsconfig.json`
- Create (shared): `packages/shared/src/ai-hub/merge.ts` — `splitGallery(items: SourceItem[], featured: readonly string[], originals: OriginalItem[] = []): { publicList: MotionPublic[]; adminList: MotionAdmin[] }`, `buildSlideData(entries, decks, originals = [])`, `diffManifest(local: Manifest, remote: Manifest): string[]`
- Modify: `package.json`(루트: devDependencies `tsx@^4`, `zod@^4`; scripts `ai:pull`, `ai:push`, `ai:prepare`, `ai:motion:import`, `ai:slide:import`, `ai:brand:import`), `.gitignore`(`.media-out/`)
- Test: `packages/client/src/lib/aiHubMerge.test.js`

**Interfaces:**
- Consumes: Task 5 업로드 API, Task 1 `paths`/`validate*Catalog`, Task 4 manifest 형식.
- Produces: 명세 「자료 이전과 추가」 표의 명령 6개. env `AI_PUSH_URL`(기본 `http://localhost:3001`), `AI_MEDIA_UPLOAD_TOKEN`, `ME_PULL_URL`(기본 `https://me.chois.pro`), `ME_MEDIA_UPLOAD_TOKEN`, `MOTION_SRC`, `SLIDE_SRC`, `BRAND_SRC`, `OPPADU_SLIDE_SRC`.

- [ ] **Step 1: 실패하는 테스트** — `aiHubMerge.test.js`: 복구 브랜치 `scripts/__tests__/motion-import.test.ts`·`scripts/slide-import.test.ts` 의 사례를 JS 로 옮긴다(Chois 판이 있으면 `chois`, 없으면 원본 `oppadu` 로 뒤에 붙음; 원본 `final.en/ko` 가 `prompt/ko` 가 됨; 슬라이드는 원본 인기순 자리에 학교 덱, 목록 밖 학교 덱은 뒤; `diffManifest` 는 sha 가 다른 키만 정렬해 돌려줌).

- [ ] **Step 2: 실패 확인** → **Step 3: shared `merge.ts` 구현**(복구 브랜치 코드 이식, zod 대신 `validate*Catalog` 호출) → **Step 4: 통과 확인**

- [ ] **Step 5: 스크립트 구현**

- `volumeLayout.ts`: me.chois.pro 경로 ↔ MathChois 경로 변환 `toAiHubRel('media/motion/01-pixel/video.mp4') → 'motion/01-pixel/video.mp4'`, `'private/brand/index.html' → 'brand/index.html'`, manifest 키도 같이 변환.
- `manifest.ts`: `sha256File`, `buildManifest(outDir, set)` (`motion`: 편마다 3파일, `slide`: 모든 webp, `brand`: manifest.json 제외 전부).
- `pull.ts`: `GET ${ME_PULL_URL}/api/media/manifest?set=motion|slide|brand`(Bearer `ME_MEDIA_UPLOAD_TOKEN`) → 키마다 `.media-out/ai-hub/<toAiHubRel(key)>` 에 없거나 sha 가 다르면 내려받음(모션·슬라이드 `${ME}/media/<rel without media/>`, 브랜드 `${ME}/ai/brand/site/<rel without private/brand/>`), sha 대조 실패 시 재시도 3회; `private/motion-admin.json`·`private/slide-admin.json` 은 `${ME}/api/media/file?path=`(Task 13) 로 받아 `.media-out/prompts/{motion,slide}.json`; manifest 는 키를 변환해 `.media-out/ai-hub/manifest/<set>.json`. 동시 6개. 끝에 "set motion: 150 files, 288 MB, 0 failed" 요약.
- `media-push.ts`: me.chois.pro `scripts/media-push.ts` 이식 — `--set` 필수, 원격 manifest(`GET /api/ai/media/manifest`) 와 `diffManifest`, `PUT /api/ai/media?path=<rel>` 스트리밍(`x-content-sha256`), 프롬프트 JSON 은 `PUT /api/ai/prompts/<set>`(motion·slide), 마지막에 manifest.
- `media-prepare.ts`·`motion-import.ts`·`slide-import.ts`·`brand-import.ts`: me.chois.pro + 복구 브랜치 코드 이식. 출력 경로만 `.media-out/ai-hub/<set>/…`, 카탈로그는 `packages/shared/src/ai-hub/{motion,slide}.data.ts` 로 쓴다(JSON.stringify 결과를 `export const … = … as const satisfies …;` 로 감싸고 `validate*Catalog` 통과 확인).
- `README.md`: 명령 6개·env·첫 이전 순서.

- [ ] **Step 6: 검증**

```bash
npx tsx scripts/ai-hub/pull.ts --dry-run    # manifest 3개 읽고 받을 파일 수만 출력
```
로컬 서버(Task 5 토큰)로: `.media-out/ai-hub/motion/01-pixel/{video.mp4,preview.mp4,poster.webp}` 와 `prompts/motion.json`(1편) 픽스처를 두고 `npm run ai:push -- --set motion` → "3 changed of 3", 두 번째 실행 → "0 changed of 3"; `GET /api/ai/motion` 에 `01-pixel` 이 프롬프트와 함께 나옴.

- [ ] **Step 7: Commit** — `feat(ai-hub): 자료 이전·추가 스크립트(pull/push/import/prepare)`

---

### Task 13: my-introduction — 토큰 보호 파일 내려받기 API

**Files (저장소 `/home/user/my-introduction`, 브랜치 `claude/focused-gates-3ixrhl`):**
- Create: `web/src/app/api/media/file/route.ts`
- Test: `web/src/lib/media-download.test.ts` (새 `web/src/lib/media-download.ts` 의 `downloadablePath(rel): boolean` = `isUploadablePath(rel)`)

- [ ] **Step 1: 실패하는 테스트** — `downloadablePath('private/motion-admin.json')` true, `'private/slide-admin.json'` true, `'media/motion/manifest.json'` true, `'../x'` false, `'private/members.json'` false.
- [ ] **Step 2: 실패 확인**(`npm run test -w web` 또는 루트 `npx vitest run`) → **Step 3: 구현** — `GET /api/media/file?path=` : `tokenMatches(authorization, MEDIA_UPLOAD_TOKEN)` 아니면 401, `downloadablePath` 아니면 400, 파일 없으면 404, 있으면 `application/octet-stream` 스트림.
- [ ] **Step 4: 통과 확인** → `npm run check` 통과.
- [ ] **Step 5: Commit & push** — `feat(media): 토큰 보호 파일 내려받기 API(class.chois.pro 이전용)`; 배포는 사용자가 main 병합으로.

---

### Task 14: 스모크·문서·첫 이전 절차

**Files:**
- Create: `packages/client/e2e/ai-hub.smoke.mjs`, `packages/server/scripts/ai-hub-e2e-setup.ts`
- Modify: `CLAUDE.md`(「Core feature」 아래 AI활용 허브 단락, 명령 표에 `ai:*`), `.claude/PROJECT_MAP.md`(라우트·테이블·폴더), `packages/server/.env.example`(`AI_MEDIA_UPLOAD_TOKEN`)

- [ ] **Step 1: 설정 스크립트** — `units-e2e-setup.ts` 패턴으로 교사 1·학생 1·학급 1(토글 꺼짐)·`ai_motion_prompts` 1행(옛 틀)과 Volume 픽스처(`01-pixel` 3파일 + manifest, 브랜드 `index.html`)를 만들고 JSON 을 출력.
- [ ] **Step 2: 스모크** — `units.smoke.mjs` 틀: 학생 `/ai` → `/student/classrooms` 로 돌아감(check) → 교사 학급 상세에서 스위치 켬 → 학생 헤더에 `AI활용` 단추 → `/ai/motion` 카드 1장 → 상세에서 `copy-prompt-en` 활성 → `/ai/slide` 빈 상태 문구 → `/ai/brand` iframe 로드 → 교사 `/ai/motion/01-pixel/edit` 에서 `세부 설정` 존재, 값 입력 후 `prompt-output` 글자 수 변함 → 콘솔 오류 0.
- [ ] **Step 3: 실행** — `cd packages/server && npx tsx --env-file=.env scripts/ai-hub-e2e-setup.ts > "$SCRATCH/aihub.json" && cd ../client && node e2e/ai-hub.smoke.mjs "$SCRATCH/aihub.json"` → 모든 줄 ✓.
- [ ] **Step 4: 문서** — CLAUDE.md·PROJECT_MAP 갱신, `.env.example`. 첫 이전 절차는 `scripts/ai-hub/README.md` 에(Task 12) 두고 CLAUDE.md 에서 링크.
- [ ] **Step 5: 전체 검증** — `npm run lint`, `cd packages/client && npx vitest run`, `npm run build`(shared → client → server) 모두 통과.
- [ ] **Step 6: Commit** — `test(ai-hub): 브라우저 스모크 · docs: AI활용 허브 문서`

---

## 첫 이전 (코드 배포 뒤, Mac 에서 — 사용자 작업)

1. Railway ChoisClass 서비스에 `AI_MEDIA_UPLOAD_TOKEN`(`openssl rand -hex 32`) 추가, 배포 완료 확인.
2. `cd ~/dev/MathChois && ME_MEDIA_UPLOAD_TOKEN=<me.chois.pro 토큰> npm run ai:pull` → `.media-out/` 요약 3줄, 실패 0.
3. `AI_PUSH_URL=https://class.chois.pro AI_MEDIA_UPLOAD_TOKEN=<새 토큰> npm run ai:push -- --set motion`, `--set slide`, `--set brand`.
4. class.chois.pro 에서 교사 로그인 → `/ai/motion` 50편·`/ai/slide` 113종·`/ai/brand` 룩북 확인.
5. `.media-out/` 은 지우지 않는다(원천 백업). me.chois.pro `/ai` 정리는 별도 작업.
