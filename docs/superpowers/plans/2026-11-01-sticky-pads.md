# 메모지(포스트잇) 배경 도형 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Students and teachers can drop locked, character-styled sticky pads ("메모지") onto the infinite canvas of every annotation viewer and write on them; pads are moved, resized and deleted only through the existing image-move tool.

**Architecture:** A pad is one locked Excalidraw `image` element whose picture is a deterministic SVG data URL generated client-side by a new pure module `lib/stickyPads.js` (4 types × 6 original mascots × 3 patterns). The shared `DrawingToolbar` gets a 메모지 button + picker popover (new `StickyPicker.jsx`), inserts pads behind existing ink, remembers the last choice in `toolPrefs`, and extends image-move mode to unlock/relock pads and delete selected ones. Viewers only add the `sticky_` id prefix to their lasso/scribble exclusions, pass the paper rect ref, and (comment viewers) pass `stickyOpacity={70}`. No server, DB or socket changes.

**Tech Stack:** React 19, Excalidraw 0.18.1 (`image` elements, `locked`, `customData`, `api.onChange`), Vitest + jsdom, lucide-react (`StickyNote`, `Trash2`), viewer.css tokens.

**Spec:** `docs/superpowers/specs/2026-11-01-sticky-pads-design.md`

## Global Constraints

- Branch `claude/friendly-hopper-ug1yjn`; commit per task; no PR unless asked; no model identifiers in committed artifacts.
- Do not import `@excalidraw/excalidraw` in jsdom tests (roughjs resolution fails) — modules under test must not import it either; `stickyPads.js` is dependency-free apart from `lib/classroomColor.js`.
- Colors come only from `lib/classroomColor.js` `COLOR_STYLES` (`tint`/`cover`/`deep`); ink `#1c2b4a`; blush `#f6a5a5` at 70%; pattern lines 13% ink 1px; watermark 12%. No shadows in SVG.
- Friend ↔ classroom color: `circle→sky, square→mustard, triangle→coral, star→lavender, cloud→sage, heart→rose`. Labels: 동글·네모·세모·별·뭉게·하티.
- User-facing name is 메모지 (never 스티커/포스트잇 in UI copy). Sentence case, no uppercase labels, no numbering in the picker.
- Element contract: `id` starts with `sticky_`; `customData.sticky = { v: 1, type, friend, pattern }`; `locked: true`; `fileId = 'stickyf_v1_<type>_<friend>_<pattern>'`; file `mimeType 'image/svg+xml'`.
- Undo: this app records history from `onChange` snapshots (`hooks/useExcalidrawUndo.js`), so insert/delete need no `captureUpdate`; follow the existing image-insert call shape (`api.updateScene({ elements })`).
- Toolbar order lives in `lib/toolPrefs.js` `TOOLBAR_ORDER` and is asserted by `DrawingToolbar.test.js`; `'sticky'` goes right before `'image_add'`.
- All six viewers that render `<DrawingToolbar>` (StudyViewer ×2, TeacherStudyViewer ×2, StudentWorkViewer ×2, AssignmentStudyViewer, AssignmentWorkViewer, CoachingViewer) get the same props; whiteboard untouched.
- Phone (≤640px): picker fills the width and scrolls vertically; every cell ≥ 44px hit area.
- Verify each task with `npm test -w @mathchois/client -- <file>`; before the final commit run `npm run lint` (0 errors) and `npm run build -w @mathchois/client`.

## Review Focus

1. A pad inserted after ink already exists must sit **behind** that ink (array index right after `__bg_image__`, or 0) — otherwise it hides the student's work. Test in Task 3.
2. In the teacher comment viewers the student's own pads arrive as `__sn_sticky_…` (locked, 60% opacity). Image-move must unlock only ids that start with `sticky_`, never the student's. Test in Task 4.
3. `addFiles` followed by `updateScene` in the same tick can leave the image blank (known in StudyViewer). Insert on the next animation frame. Test in Task 3.
4. Switching page (`pageId` prop change) or toggling image-move while the picker is open must close the picker, and leaving image-move must relock every own pad even if it was selected. Tests in Tasks 3 and 4.
5. "전체 지우기" must remove pads too (keeps only `__bg_image__`), and a pad whose SVG file is missing from `files` (older note edited elsewhere) must not crash insertion of new pads — `buildStickyElement` always re-adds its file. Tests in Tasks 3 and 4.

---

### Task 1: `lib/stickyPads.js` — pad model and SVG generator

**Files:**
- Create: `packages/client/src/lib/stickyPads.js`
- Test: `packages/client/src/lib/stickyPads.test.js`

**Interfaces:**
- Consumes: `COLOR_STYLES` from `packages/client/src/lib/classroomColor.js` (`{ coral|mustard|sage|sky|lavender|rose: { cover, tint, deep, label } }`).
- Produces:
  ```js
  export const STICKY_TYPES    = ['tab', 'face', 'mark', 'cut'];
  export const STICKY_FRIENDS  = ['circle', 'square', 'triangle', 'star', 'cloud', 'heart'];
  export const STICKY_PATTERNS = ['plain', 'ruled', 'grid'];
  export const STICKY_ID_PREFIX = 'sticky_';
  export const STICKY_FILE_PREFIX = 'stickyf_v1_';
  export const STICKY_DEFAULT = Object.freeze({ type: 'tab', friend: 'circle', pattern: 'plain' });
  export const TYPE_LABEL    = { tab: '모서리 탭', face: '얼굴 메모지', mark: '워터마크', cut: '다이컷' };
  export const FRIEND_LABEL  = { circle: '동글', square: '네모', triangle: '세모', star: '별', cloud: '뭉게', heart: '하티' };
  export const PATTERN_LABEL = { plain: '민무늬', ruled: '줄', grid: '모눈' };
  export function isStickySpec(spec): boolean                       // valid type/friend/pattern strings
  export function friendColor(friend): { cover, tint, deep }         // from COLOR_STYLES via the friend→color map
  export function stickyAspect(type): number                         // height/width: tab 1, face 200/180, mark 190/200, cut 170/180
  export function stickyFileId(spec): string                         // 'stickyf_v1_tab_circle_ruled'
  export function stickySvg(spec): string                            // deterministic '<svg viewBox="0 0 W H" …>…</svg>'
  export function stickyDataUrl(spec): string                        // 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
  export function stickyFile(spec, now = Date.now()): { id, mimeType: 'image/svg+xml', dataURL, created }
  export function isStickyElement(el): boolean                       // !!el?.customData?.sticky
  export function isOwnSticky(el): boolean                           // isStickyElement(el) && el.id.startsWith(STICKY_ID_PREFIX)
  export function buildStickyElement(spec, { x, y, width, opacity = 100, id, now = Date.now(), rand = Math.random }): object
  ```
  `buildStickyElement` returns the same field set as the existing image insert in `DrawingToolbar.jsx` (`handleImageFileChange`), with `id: id ?? STICKY_ID_PREFIX + rand().toString(36).slice(2, 9)`, `height = width * stickyAspect(type)`, `locked: true`, `opacity`, `customData: { sticky: { v: 1, ...spec } }`, `fileId: stickyFileId(spec)`, `status: 'saved'`.

- [ ] **Step 1: Write the failing tests**

```js
// packages/client/src/lib/stickyPads.test.js
import { describe, it, expect } from 'vitest';
import {
  STICKY_TYPES, STICKY_FRIENDS, STICKY_PATTERNS, STICKY_ID_PREFIX,
  stickyFileId, stickySvg, stickyDataUrl, stickyAspect, stickyFile,
  buildStickyElement, isStickyElement, isOwnSticky, isStickySpec, friendColor,
} from './stickyPads';
import { COLOR_STYLES } from './classroomColor';

describe('stickyPads — 모델', () => {
  it('fileId 는 조합마다 하나이고 결정적이다', () => {
    const s = { type: 'tab', friend: 'circle', pattern: 'ruled' };
    expect(stickyFileId(s)).toBe('stickyf_v1_tab_circle_ruled');
    expect(stickySvg(s)).toBe(stickySvg({ ...s }));
  });
  it('유형별 비율', () => {
    expect(stickyAspect('tab')).toBe(1);
    expect(stickyAspect('face')).toBeCloseTo(200 / 180);
    expect(stickyAspect('mark')).toBeCloseTo(190 / 200);
    expect(stickyAspect('cut')).toBeCloseTo(170 / 180);
  });
  it('72 조합 모두 viewBox 가 있고 width/height 속성은 없는 SVG 를 만든다', () => {
    for (const type of STICKY_TYPES) for (const friend of STICKY_FRIENDS) for (const pattern of STICKY_PATTERNS) {
      const svg = stickySvg({ type, friend, pattern });
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toMatch(/viewBox="0 0 \d+ \d+"/);
      expect(svg).not.toMatch(/<svg[^>]*\swidth=/);
      expect(svg.length).toBeLessThan(8000);
    }
  });
  it('무늬: ruled 는 간격 22 수평선, grid 는 간격 14 모눈, plain 은 둘 다 없음', () => {
    const base = { type: 'tab', friend: 'square' };
    expect(stickySvg({ ...base, pattern: 'ruled' })).toContain('data-pattern="ruled"');
    expect(stickySvg({ ...base, pattern: 'ruled' })).toMatch(/height="22"/);
    expect(stickySvg({ ...base, pattern: 'grid' })).toContain('data-pattern="grid"');
    expect(stickySvg({ ...base, pattern: 'grid' })).toMatch(/width="14" height="14"/);
    expect(stickySvg({ ...base, pattern: 'plain' })).not.toContain('data-pattern');
  });
  it('친구 색은 학급 색 그대로 (동글=하늘, 세모=코랄)', () => {
    expect(friendColor('circle')).toEqual({ cover: COLOR_STYLES.sky.cover, tint: COLOR_STYLES.sky.tint, deep: COLOR_STYLES.sky.deep });
    expect(stickySvg({ type: 'tab', friend: 'triangle', pattern: 'plain' })).toContain(COLOR_STYLES.coral.tint);
  });
  it('워터마크 유형은 종이색 면 + 12% 윤곽, 다이컷은 clipPath 를 쓴다', () => {
    expect(stickySvg({ type: 'mark', friend: 'cloud', pattern: 'grid' })).toContain('#f8fafd');
    expect(stickySvg({ type: 'mark', friend: 'cloud', pattern: 'plain' })).toMatch(/opacity="\.12"|opacity="0\.12"/);
    expect(stickySvg({ type: 'cut', friend: 'heart', pattern: 'ruled' })).toContain('<clipPath');
  });
  it('dataUrl 과 file', () => {
    const s = { type: 'face', friend: 'star', pattern: 'plain' };
    expect(stickyDataUrl(s).startsWith('data:image/svg+xml;utf8,')).toBe(true);
    expect(stickyFile(s, 5)).toEqual({ id: 'stickyf_v1_face_star_plain', mimeType: 'image/svg+xml', dataURL: stickyDataUrl(s), created: 5 });
  });
  it('isStickySpec', () => {
    expect(isStickySpec({ type: 'cut', friend: 'cloud', pattern: 'grid' })).toBe(true);
    expect(isStickySpec({ type: 'oval', friend: 'cloud', pattern: 'grid' })).toBe(false);
    expect(isStickySpec(null)).toBe(false);
  });
});

describe('stickyPads — 요소', () => {
  const spec = { type: 'tab', friend: 'circle', pattern: 'plain' };
  it('잠긴 image 요소 하나, customData.sticky, 비율 높이, 접두사 id', () => {
    const el = buildStickyElement(spec, { x: 10, y: 20, width: 200, now: 7, rand: () => 0.5 });
    expect(el).toMatchObject({
      type: 'image', fileId: 'stickyf_v1_tab_circle_plain', status: 'saved', locked: true, opacity: 100,
      x: 10, y: 20, width: 200, height: 200, isDeleted: false, customData: { sticky: { v: 1, ...spec } },
    });
    expect(el.id.startsWith(STICKY_ID_PREFIX)).toBe(true);
    expect(el.updated).toBe(7);
  });
  it('opacity 와 id 를 넘기면 그대로 쓴다; face 는 높이가 더 크다', () => {
    const el = buildStickyElement({ ...spec, type: 'face' }, { x: 0, y: 0, width: 180, opacity: 70, id: 'sticky_fixed' });
    expect(el.opacity).toBe(70);
    expect(el.id).toBe('sticky_fixed');
    expect(el.height).toBeCloseTo(200);
  });
  it('isStickyElement / isOwnSticky', () => {
    const own = buildStickyElement(spec, { x: 0, y: 0, width: 100 });
    expect(isStickyElement(own)).toBe(true);
    expect(isOwnSticky(own)).toBe(true);
    expect(isOwnSticky({ ...own, id: '__sn_' + own.id })).toBe(false);   // 교사 창에 내려온 학생 메모지
    expect(isStickyElement({ type: 'image', id: 'img_1' })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /home/user/MathChois && npm test -w @mathchois/client -- src/lib/stickyPads.test.js`
Expected: FAIL — `Failed to resolve import "./stickyPads"`.

- [ ] **Step 3: Implement `packages/client/src/lib/stickyPads.js`**

Module header comment in Korean naming the spec. Internals the tests do not pin, decided here:

- `FRIEND_COLOR = { circle: 'sky', square: 'mustard', triangle: 'coral', star: 'lavender', cloud: 'sage', heart: 'rose' }`.
- `VIEWBOX = { tab: [180, 180], face: [180, 200], mark: [200, 190], cut: [180, 170] }`; `stickyAspect = h / w`.
- One `face(cx, cy, scale)` helper drawing eyes (r 2.6·scale at ±11·scale), mouth, blush (`#f6a5a5` opacity .7); one `friendBody(friend, cx, cy, r, fill, stroke)` helper for the six outlines (circle, rounded square rx 10/32·r, triangle, 5-point star, cloud of four arcs, heart). Reuse these for the tab avatar (`tab`), the body (`face`), the watermark (`mark`, `opacity=".12"`, no fill, stroke 3) and the hanging avatar (`cut`).
- `cut` outlines per friend: circle=apple (with leaf in `sage` cover), square=stamp (rounded rect with scalloped `stroke-dasharray` border), triangle=cake slice, star=shooting star (tail), cloud=cloud, heart=speech bubble; all wrapped in `<clipPath id="c">` + `<g clip-path="url(#c)">` for the pattern.
- Patterns as `<pattern id="p" patternUnits="userSpaceOnUse" …>` with `data-pattern="ruled"` (`width="22" height="22"`, path `M0 21.5H22`) or `data-pattern="grid"` (`width="14" height="14"`, path `M14 0H0V14`), stroke `#1c2b4a` `stroke-opacity=".13"`; applied as a full-face `<rect fill="url(#p)">` (for `face`, from y=56 down; for `cut`, inside the clip).
- `mark`: face `#f8fafd`, border `deep` at `stroke-opacity=".5"` 1.2, tab `M0 0H44V20Q44 26 38 26H0Z` filled `deep`.
- `tab`: face `tint`, notch path `M0 0H150V28H180V170Q160 182 130 178L0 180Z`, avatar circle d=32 at (164,14) filled `cover`, ink stroke 2.
- Element field set copied from `handleImageFileChange` in `DrawingToolbar.jsx` (strokeColor/backgroundColor transparent, roughness 0, groupIds [], frameId null, roundness null, link null, version 1, versionNonce/seed from `rand`, boundElements null, scale [1,1]).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -w @mathchois/client -- src/lib/stickyPads.test.js`
Expected: PASS (11 tests).

- [ ] **Step 5: Eyeball the 72 SVGs once**

Write a throwaway script in the scratchpad that imports `stickySvg` (plain `node --experimental-vm-modules` is not needed: use `npx vite-node` from `packages/client`, or a one-off vitest file that writes `scratchpad/sticky/all.html` with every combination in a grid) and screenshot it with the existing Playwright pattern (`createRequire(import.meta.url)('playwright')`). Fix any outline that does not read as its friend at 40px. Do not commit the script or the image.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/lib/stickyPads.js packages/client/src/lib/stickyPads.test.js
git commit -m "feat(sticky): pad model and deterministic SVG generator (4 types x 6 friends x 3 patterns)"
```

---

### Task 2: `toolPrefs.js` — toolbar order and last-choice memory

**Files:**
- Modify: `packages/client/src/lib/toolPrefs.js` (`TOOLBAR_ORDER` at line 28; add key + two functions after `saveToolWidth`)
- Modify: `packages/client/src/components/study/DrawingToolbar.test.js:43-60` (expected order array)
- Test: `packages/client/src/lib/toolPrefs.test.js`

**Interfaces:**
- Consumes: `STICKY_DEFAULT`, `isStickySpec` from Task 1.
- Produces: `TOOLBAR_ORDER` containing `'sticky'` immediately before `'image_add'`; `loadStickyLast(): { type, friend, pattern }`; `saveStickyLast(spec): void` (localStorage key `mc_sticky_last`, JSON).

- [ ] **Step 1: Write the failing tests**

Append to `toolPrefs.test.js` (follow its existing `localStorage.clear()` pattern):

```js
describe('toolPrefs — 메모지', () => {
  it('TOOLBAR_ORDER: sticky 는 image_add 바로 앞', () => {
    const i = TOOLBAR_ORDER.indexOf('sticky');
    expect(i).toBeGreaterThan(0);
    expect(TOOLBAR_ORDER[i + 1]).toBe('image_add');
    expect(TOOLBAR_ORDER[i - 1]).toBe('image_reload');
  });
  it('마지막 메모지 선택: 기본값 → 저장 → 잘못된 값이면 기본값', () => {
    expect(loadStickyLast()).toEqual({ type: 'tab', friend: 'circle', pattern: 'plain' });
    saveStickyLast({ type: 'cut', friend: 'heart', pattern: 'grid' });
    expect(loadStickyLast()).toEqual({ type: 'cut', friend: 'heart', pattern: 'grid' });
    localStorage.setItem('mc_sticky_last', JSON.stringify({ type: 'nope', friend: 'heart', pattern: 'grid' }));
    expect(loadStickyLast()).toEqual({ type: 'tab', friend: 'circle', pattern: 'plain' });
    localStorage.setItem('mc_sticky_last', '{not json');
    expect(loadStickyLast()).toEqual({ type: 'tab', friend: 'circle', pattern: 'plain' });
  });
});
```

In `DrawingToolbar.test.js` the first test's literal array: insert `'sticky'` between `'image_reload'` and `'image_add'` (the toolbar itself renders the button in Task 3; until then this file's order test fails — that is expected and is fixed in Task 3, so run only `toolPrefs.test.js` here).

- [ ] **Step 2: Run to verify failure**

Run: `npm test -w @mathchois/client -- src/lib/toolPrefs.test.js`
Expected: FAIL — `loadStickyLast is not a function` / order index -1.

- [ ] **Step 3: Implement**

In `toolPrefs.js`: add `'sticky'` to `TOOLBAR_ORDER`; `const STICKY_KEY = 'mc_sticky_last';` `loadStickyLast()` parses JSON inside try/catch and returns `{ ...STICKY_DEFAULT }` unless `isStickySpec(parsed)`; `saveStickyLast(spec)` writes only when `isStickySpec(spec)`. Update the file's header comment list of keys (line 4-6 style) with `mc_sticky_last`.

- [ ] **Step 4: Run to verify pass**

Run: `npm test -w @mathchois/client -- src/lib/toolPrefs.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/lib/toolPrefs.js packages/client/src/lib/toolPrefs.test.js packages/client/src/components/study/DrawingToolbar.test.js
git commit -m "feat(sticky): toolbar order slot and last-choice memory in toolPrefs"
```

---

### Task 3: 메모지 button, picker popover and insertion

**Files:**
- Create: `packages/client/src/components/study/StickyPicker.jsx`
- Modify: `packages/client/src/components/study/DrawingToolbar.jsx` (imports; props; state; insert handler; button before `data-tb="image_add"` at line 635)
- Modify: `packages/client/src/components/study/viewer.css` (new `.vw-tb-pop*` rules after `.vw-tb-mini` block, line ~149; phone rules in the existing `@media (max-width: 640px)` block at line 228)
- Test: `packages/client/src/components/study/DrawingToolbar.test.js`, `packages/client/src/components/study/StickyPicker.test.js`

**Interfaces:**
- Consumes: Task 1 exports; `loadStickyLast`/`saveStickyLast` (Task 2); existing `apiRef`, `pageId`, `BG_ELEMENT_ID`.
- Produces:
  - `DrawingToolbar` new props: `stickyOpacity?: number` (default 100), `bgPositionRef?: React.RefObject<{ x, y, width, height } | null>`.
  - `StickyPicker({ current, onPick, onPatternChange, onClose, anchorRect, anchorEl })` — renders via `createPortal` into `document.body` a `<div class="vw-tb-pop" role="dialog" aria-label="메모지 고르기">` positioned `position: fixed; top: anchorRect.bottom + 6px; left: 50%; transform: translateX(-50%)`; four `.vw-tb-pop-row`s (head `TYPE_LABEL[type]`, six `<button class="vw-tb-pop-cell" data-sticky="<type>:<friend>" aria-label="<TYPE_LABEL> · <FRIEND_LABEL>">` each containing `<img src={stickyDataUrl({ type, friend, pattern: current.pattern })} alt="">` 40px), then one `.vw-tb-pop-row.vw-tb-pop-pattern` with three `<button data-sticky-pattern="<pattern>" aria-pressed>` (icon + `PATTERN_LABEL`). The cell equal to `current` carries `aria-current="true"`. `onPick({ type, friend, pattern })` on cell click; `onPatternChange(pattern)` on pattern click (does not close). Closes on `Escape` and on `pointerdown` outside the popover and outside the anchor button (`onClose`).
  - Toolbar: `<button data-tb="sticky" aria-haspopup="dialog" aria-expanded={pickerOpen} title="메모지 — 누르면 고르기, 길게 누르면 마지막 메모지 바로 붙이기" aria-label="메모지" className={btnCls(pickerOpen)}><StickyNote /></button>`.
  - `insertSticky(spec)` (internal): builds the file + element and inserts it.

- [ ] **Step 1: Write the failing toolbar tests**

Add to the mock `api` in `DrawingToolbar.test.js` `beforeEach`: `onChange: vi.fn(() => () => {})`; declare `let elements` next to `appState`, reset it to `[]` in `beforeEach`, make `getSceneElements: () => elements`, and make the `updateScene` mock assign `elements = next.elements` whenever `elements` is passed. jsdom has no `PointerEvent`: dispatch `new Event('pointerdown', { bubbles: true })` / `'pointerup'` (React's `onPointerDown` listens by event type). Stub `requestAnimationFrame` with `vi.useFakeTimers()` + `vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(cb, 0))` inside the new describe.

```js
describe('DrawingToolbar — 메모지', () => {
  // reuse render/btn/click/api from the outer scope; elements = [] mutable
  const openPicker = () => { click(btn('sticky')); return document.querySelector('.vw-tb-pop'); };
  const flush = () => act(() => { vi.runOnlyPendingTimers(); });

  it('버튼은 image_reload 뒤·image_add 앞, 팝오버는 4줄×6칸 + 무늬 3칸, 기본 선택은 모서리 탭·동글·민무늬', () => {
    render();
    const names = [...mount.querySelectorAll('[data-tb]')].map((el) => el.dataset.tb);
    expect(names).toEqual([...TOOLBAR_ORDER]);
    const pop = openPicker();
    expect(pop).not.toBeNull();
    expect(btn('sticky').getAttribute('aria-expanded')).toBe('true');
    expect(pop.querySelectorAll('[data-sticky]')).toHaveLength(24);
    expect(pop.querySelectorAll('[data-sticky-pattern]')).toHaveLength(3);
    expect(pop.querySelector('[aria-current="true"]').dataset.sticky).toBe('tab:circle');
    expect(pop.querySelector('[data-sticky-pattern="plain"]').getAttribute('aria-pressed')).toBe('true');
    expect(pop.textContent).not.toMatch(/[A-Z]{3,}/);
  });

  it('칸을 누르면 다음 프레임에 addFiles + 잠긴 image 요소가 배경 바로 뒤에 들어가고 팝오버가 닫히며 도구는 그대로', () => {
    elements = [{ id: '__bg_image__', type: 'image' }, { id: 'fd1', type: 'freedraw' }];
    render();
    click(btn('freedraw'));
    const pop = openPicker();
    click(pop.querySelector('[data-sticky="face:star"]'));
    expect(api.addFiles).not.toHaveBeenCalled();          // 같은 틱에는 아무것도 안 함
    flush();
    expect(api.addFiles).toHaveBeenCalledWith([expect.objectContaining({ id: 'stickyf_v1_face_star_plain', mimeType: 'image/svg+xml' })]);
    const next = api.updateScene.mock.calls.at(-1)[0].elements;
    expect(next.map((e) => e.id.replace(/^sticky_.*/, 'sticky'))).toEqual(['__bg_image__', 'sticky', 'fd1']);
    expect(next[1]).toMatchObject({ locked: true, opacity: 100, customData: { sticky: { v: 1, type: 'face', friend: 'star', pattern: 'plain' } } });
    expect(document.querySelector('.vw-tb-pop')).toBeNull();
    expect(api.setActiveTool).toHaveBeenLastCalledWith({ type: 'freedraw' });
    expect(JSON.parse(localStorage.getItem('mc_sticky_last'))).toEqual({ type: 'face', friend: 'star', pattern: 'plain' });
  });

  it('배경이 없으면 맨 앞에 들어가고, 종이 너비의 36% (없으면 260) 로 화면 가운데에 놓인다', () => {
    elements = [{ id: 'fd1', type: 'freedraw' }];
    appState = { ...appState, scrollX: 0, scrollY: 0 };
    render({ bgPositionRef: { current: { x: 0, y: 0, width: 1000, height: 1400 } } });
    click(openPicker().querySelector('[data-sticky="tab:circle"]'));
    flush();
    const next = api.updateScene.mock.calls.at(-1)[0].elements;
    expect(next[0].id.startsWith('sticky_')).toBe(true);
    expect(next[0].width).toBeCloseTo(360);
    render({ bgPositionRef: { current: null } });
    click(openPicker().querySelector('[data-sticky="tab:circle"]'));
    flush();
    expect(api.updateScene.mock.calls.at(-1)[0].elements[0].width).toBe(260);
  });

  it('같은 자리에 연달아 붙이면 24 씩 비켜 놓는다', () => {
    render();
    click(openPicker().querySelector('[data-sticky="tab:circle"]')); flush();
    const a = api.updateScene.mock.calls.at(-1)[0].elements.at(-1);
    click(openPicker().querySelector('[data-sticky="tab:circle"]')); flush();
    const b = api.updateScene.mock.calls.at(-1)[0].elements.at(-1);
    expect([b.x - a.x, b.y - a.y]).toEqual([24, 24]);
  });

  it('stickyOpacity=70 이면 요소 opacity 70', () => {
    render({ stickyOpacity: 70 });
    click(openPicker().querySelector('[data-sticky="mark:cloud"]')); flush();
    expect(api.updateScene.mock.calls.at(-1)[0].elements.at(-1).opacity).toBe(70);
  });

  it('무늬 칸은 선택을 바꾸되 팝오버를 닫지 않고, 미리보기 그림이 그 무늬로 바뀐다', () => {
    render();
    const pop = openPicker();
    click(pop.querySelector('[data-sticky-pattern="grid"]'));
    expect(document.querySelector('.vw-tb-pop')).not.toBeNull();
    expect(pop.querySelector('[data-sticky-pattern="grid"]').getAttribute('aria-pressed')).toBe('true');
    expect(pop.querySelector('[data-sticky="tab:circle"] img').src).toContain(encodeURIComponent('data-pattern="grid"'));
  });

  it('길게 누르면(500ms) 팝오버 없이 마지막 메모지를 바로 붙인다; 짧게 누르면 팝오버', () => {
    localStorage.setItem('mc_sticky_last', JSON.stringify({ type: 'cut', friend: 'heart', pattern: 'ruled' }));
    render();
    act(() => { btn('sticky').dispatchEvent(new Event('pointerdown', { bubbles: true })); });
    act(() => { vi.advanceTimersByTime(500); });
    act(() => { btn('sticky').dispatchEvent(new Event('pointerup', { bubbles: true })); });
    flush();
    expect(document.querySelector('.vw-tb-pop')).toBeNull();
    expect(api.updateScene.mock.calls.at(-1)[0].elements.at(-1).customData.sticky).toEqual({ v: 1, type: 'cut', friend: 'heart', pattern: 'ruled' });
    act(() => { btn('sticky').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });   // 더블탭도 같다
    flush();
    expect(document.querySelector('.vw-tb-pop')).toBeNull();
    expect(api.updateScene.mock.calls.at(-1)[0].elements.filter((e) => e.id.startsWith('sticky_'))).toHaveLength(2);
  });

  it('페이지가 바뀌거나 Escape·바깥 pointerdown 이면 팝오버가 닫힌다', () => {
    render();
    openPicker();
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(document.querySelector('.vw-tb-pop')).toBeNull();
    openPicker();
    render({ pageId: 'p2' });
    expect(document.querySelector('.vw-tb-pop')).toBeNull();
    openPicker();
    act(() => { document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })); });
    expect(document.querySelector('.vw-tb-pop')).toBeNull();
  });

  it('api 가 없으면 버튼이 비활성', () => {
    render({ apiRef: { current: null } });
    expect(btn('sticky').disabled).toBe(true);
  });

  it('전체 지우기는 메모지도 지운다 (배경만 남김)', () => {
    elements = [{ id: '__bg_image__', type: 'image' }, { id: 'sticky_a', type: 'image', customData: { sticky: {} } }, { id: 'fd1' }];
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render();
    click(btn('clear'));
    expect(api.updateScene.mock.calls.at(-1)[0].elements.map((e) => e.id)).toEqual(['__bg_image__']);
  });
});
```

`StickyPicker.test.js` (small): renders with `current = { type: 'tab', friend: 'circle', pattern: 'plain' }` and `anchorRect = { bottom: 100 }`; asserts the popover `style.top === '106px'`, row heads equal `['모서리 탭', '얼굴 메모지', '워터마크', '다이컷']`, every cell has a non-empty `aria-label`, and clicking a cell calls `onPick` with `{ type, friend, pattern: 'plain' }`.

- [ ] **Step 2: Run to verify failure**

Run: `npm test -w @mathchois/client -- src/components/study/DrawingToolbar.test.js src/components/study/StickyPicker.test.js`
Expected: FAIL — no `[data-tb="sticky"]`, `StickyPicker` module missing.

- [ ] **Step 3: Implement `StickyPicker.jsx`**

Per the Interfaces block. Use `useEffect` for the `keydown`(Escape) and `pointerdown`(outside) document listeners; the outside check ignores events whose target is inside the popover or inside `anchorEl` (pass `anchorEl` along with `anchorRect`). Icons for patterns: `Minus` (민무늬 → a plain square outline from lucide `Square`), `AlignJustify` (줄), `Grid3x3` (모눈).

- [ ] **Step 4: Implement toolbar changes in `DrawingToolbar.jsx`**

- Imports: `StickyNote` from lucide; `StickyPicker`; `buildStickyElement, stickyFile, isStickySpec` from `../../lib/stickyPads`; `loadStickyLast, saveStickyLast` from toolPrefs.
- State: `pickerOpen`, `stickySpec` (init `loadStickyLast()`), refs `stickyBtnRef`, `lastStickyPosRef` (`{ x, y }`), `longPressRef`.
- `const insertSticky = (spec) => { … }`: compute `width = bgPositionRef?.current?.width ? bgPositionRef.current.width * 0.36 : 260`; center from `getAppState()` and the canvas size exactly as `handleImageFileChange` does; if `lastStickyPosRef.current` equals the computed `{x, y}`, add 24 to both; `saveStickyLast(spec)`; `setStickySpec(spec)`; `setPickerOpen(false)`; then `requestAnimationFrame(() => { api.addFiles([stickyFile(spec)]); const els = api.getSceneElements(); const i = els.findIndex((e) => e.id === BG_ELEMENT_ID) + 1; api.updateScene({ elements: [...els.slice(0, i), el, ...els.slice(i)] }); })`.
- Button handlers: `onPointerDown` starts a 500 ms timer that calls `insertSticky(stickySpec)` and marks `longPressRef.current = true`; `onPointerUp`/`onPointerLeave` clears it; `onClick` ignores the click when `longPressRef.current` was set (reset it), otherwise toggles `pickerOpen` and closes `shapeMenuOpen`/`paletteOpen`; `onDoubleClick` closes the picker and calls `insertSticky(stickySpec)` (the two preceding clicks opened and closed it, so the net effect is one quick insert).
- `useEffect(() => setPickerOpen(false), [pageId])`.
- `disabled={!apiRef.current}` on the button.
- Render `{pickerOpen && <StickyPicker current={stickySpec} anchorEl={stickyBtnRef.current} anchorRect={stickyBtnRef.current.getBoundingClientRect()} onPick={insertSticky} onPatternChange={(pattern) => setStickySpec((s) => ({ ...s, pattern }))} onClose={() => setPickerOpen(false)} />}`.
- `handleClear` already keeps only the bg element — leave it; the test only pins the behavior.

- [ ] **Step 5: Add CSS to `viewer.css`**

`.vw-tb-pop { position: fixed; z-index: 60; background: #fff; border: 1px solid var(--vw-line); border-radius: 8px; box-shadow: 0 6px 18px rgba(28,43,74,.14); padding: 8px 10px; max-height: calc(100vh - 120px); overflow-y: auto; }`
`.vw-tb-pop-row { display: flex; align-items: center; gap: 4px; }` `.vw-tb-pop-head { width: 64px; font-size: 12px; color: var(--vw-soft); flex-shrink: 0; }`
`.vw-tb-pop-cell { width: 44px; height: 44px; display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; border: 2px solid transparent; }` `.vw-tb-pop-cell img { width: 40px; height: 40px; object-fit: contain; }` `.vw-tb-pop-cell[aria-current="true"] { border-color: var(--vw-ink); }`
`.vw-tb-pop-pattern { border-top: 1px solid var(--vw-line); margin-top: 6px; padding-top: 6px; }` `.vw-tb-pop-pattern button { height: 36px; padding: 0 10px; border-radius: 8px; font-size: 12px; display: inline-flex; gap: 6px; align-items: center; color: var(--vw-soft); }` `.vw-tb-pop-pattern button[aria-pressed="true"] { background: var(--vw-ink); color: #fff; }` plus `@media (hover: hover)` hover tint like `.vw-tb-mini button:hover`.
In the existing `@media (max-width: 640px)` block: `.vw-tb-pop { left: 8px !important; right: 8px; transform: none !important; }`.

- [ ] **Step 6: Run to verify pass**

Run: `npm test -w @mathchois/client -- src/components/study/DrawingToolbar.test.js src/components/study/StickyPicker.test.js`
Expected: PASS (including the first order test from Task 2).

- [ ] **Step 7: Commit**

```bash
git add packages/client/src/components/study/StickyPicker.jsx packages/client/src/components/study/StickyPicker.test.js packages/client/src/components/study/DrawingToolbar.jsx packages/client/src/components/study/DrawingToolbar.test.js packages/client/src/components/study/viewer.css
git commit -m "feat(sticky): 메모지 button, picker popover and locked pad insertion in the drawing toolbar"
```

---

### Task 4: Image-move mode handles pads (unlock, relock, delete)

**Files:**
- Modify: `packages/client/src/components/study/DrawingToolbar.jsx` (`disableImageMove` line 275, `handleToggleImageMove` line 395, `image_move` button line 595, the `imageMoveMode &&` block line 604)
- Test: `packages/client/src/components/study/DrawingToolbar.test.js`

**Interfaces:**
- Consumes: `isOwnSticky` (Task 1); `api.onChange(cb) → unsubscribe` (Excalidraw 0.18 imperative API).
- Produces: `data-tb="sticky_delete"` button (only while image-move is on and a pad is selected); image-move tooltips renamed.

- [ ] **Step 1: Write the failing tests**

```js
describe('DrawingToolbar — 이미지·메모지 이동', () => {
  const own = { id: 'sticky_1', type: 'image', locked: true, customData: { sticky: { v: 1 } } };
  const student = { id: '__sn_sticky_2', type: 'image', locked: true, customData: { sticky: { v: 1 } } };
  const bg = { id: '__bg_image__', type: 'image', locked: true };

  it('이름이 이미지·메모지 이동이고, 켜면 배경과 내 메모지만 잠금이 풀리고 끄면 다시 잠긴다', () => {
    elements = [bg, own, student, { id: 'fd1', locked: false }];
    render();
    expect(btn('image_move').title).toMatch(/^이미지·메모지 이동/);
    click(btn('image_move'));
    let next = api.updateScene.mock.calls.at(-1)[0].elements;
    expect(next.map((e) => [e.id, e.locked])).toEqual([['__bg_image__', false], ['sticky_1', false], ['__sn_sticky_2', true], ['fd1', false]]);
    click(btn('image_move'));
    next = api.updateScene.mock.calls.at(-1)[0].elements;
    expect(next.map((e) => [e.id, e.locked])).toEqual([['__bg_image__', true], ['sticky_1', true], ['__sn_sticky_2', true], ['fd1', false]]);
  });

  it('다른 도구로 나가도 메모지가 다시 잠긴다', () => {
    elements = [bg, own];
    render();
    click(btn('image_move'));
    click(btn('eraser'));
    expect(api.updateScene.mock.calls.at(-1)[0].elements.find((e) => e.id === 'sticky_1').locked).toBe(true);
  });

  it('이동 모드에서 메모지를 선택하면 [메모지 삭제] 가 나타나고 누르면 isDeleted, 선택이 없으면 사라진다', () => {
    elements = [bg, own, { id: 'img_1', type: 'image', locked: false }];
    render();
    click(btn('image_move'));
    expect(api.onChange).toHaveBeenCalledTimes(1);
    const cb = api.onChange.mock.calls[0][0];
    expect(btn('sticky_delete')).toBeNull();
    act(() => { cb(elements, { ...appState, selectedElementIds: { img_1: true } }); });
    expect(btn('sticky_delete')).toBeNull();
    act(() => { cb(elements, { ...appState, selectedElementIds: { sticky_1: true, img_1: true } }); });
    expect(btn('sticky_delete')).not.toBeNull();
    click(btn('sticky_delete'));
    const next = api.updateScene.mock.calls.at(-1)[0].elements;
    expect(next.find((e) => e.id === 'sticky_1').isDeleted).toBe(true);
    expect(next.find((e) => e.id === 'img_1').isDeleted).toBeFalsy();
    expect(btn('sticky_delete')).toBeNull();
  });

  it('이동 모드를 끄면 onChange 구독이 해제되고 팝오버도 닫혀 있다', () => {
    const unsub = vi.fn();
    api.onChange = vi.fn(() => unsub);
    render();
    click(btn('sticky'));                       // 팝오버 열림
    click(btn('image_move'));
    expect(document.querySelector('.vw-tb-pop')).toBeNull();
    click(btn('image_move'));
    expect(unsub).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -w @mathchois/client -- src/components/study/DrawingToolbar.test.js -t "이미지·메모지 이동"`
Expected: FAIL — title still "이미지 이동 —…", `__sn_`/`sticky_1` lock states unchanged, no `sticky_delete`.

- [ ] **Step 3: Implement**

- `const movable = (el) => el.id === BG_ELEMENT_ID || isOwnSticky(el);` used by both `disableImageMove` (`locked: true`) and `handleToggleImageMove` (`locked: !next`).
- State `stickySelected` (boolean) + `moveUnsubRef`. In `handleToggleImageMove`, when turning on: `setPickerOpen(false)`; `moveUnsubRef.current = api.onChange?.((els, st) => { const sel = st.selectedElementIds || {}; setStickySelected(els.some((e) => sel[e.id] && !e.isDeleted && isOwnSticky(e))); })`. When turning off (and in `disableImageMove`): call and clear `moveUnsubRef.current`, `setStickySelected(false)`. Also clear on unmount.
- `handleDeleteSticky`: `const sel = api.getAppState().selectedElementIds || {}; api.updateScene({ elements: api.getSceneElements().map((e) => sel[e.id] && isOwnSticky(e) ? { ...e, isDeleted: true } : e), appState: { selectedElementIds: {} } }); setStickySelected(false);`
- Button inside the `imageMoveMode && (…)` fragment, after the H mini group: `{stickySelected && <button data-tb="sticky_delete" onClick={handleDeleteSticky} title="메모지 삭제" aria-label="메모지 삭제" className="vw-tb-btn vw-tb-btn--danger"><Trash2 /></button>}`.
- Titles: on → `'이동 완료 (잠금)'`, off → `'이미지·메모지 이동 — 배경 이미지와 메모지를 드래그로 옮기고 크기 조절'`; `aria-label="이미지·메모지 이동"`.
- Update the `TOOLBAR_ORDER` doc comment in `toolPrefs.js` to say `sticky_delete` is conditional like W/H and not in the array.

- [ ] **Step 4: Run to verify pass**

Run: `npm test -w @mathchois/client -- src/components/study/DrawingToolbar.test.js`
Expected: PASS (whole file).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/study/DrawingToolbar.jsx packages/client/src/components/study/DrawingToolbar.test.js packages/client/src/lib/toolPrefs.js
git commit -m "feat(sticky): image-move mode unlocks, relocks and deletes own pads"
```

---

### Task 5: Viewers — exclusions, paper ref, comment opacity

**Files:**
- Modify: `packages/client/src/pages/Study/StudyViewer.jsx:471-472` and both `<DrawingToolbar` (lines ~1121, ~1132)
- Modify: `packages/client/src/pages/Study/TeacherStudyViewer.jsx:116-117` and both `<DrawingToolbar` (~580, ~593)
- Modify: `packages/client/src/pages/Study/CoachingViewer.jsx:71,82` and `<DrawingToolbar` (~526)
- Modify: `packages/client/src/pages/Assignment/AssignmentStudyViewer.jsx` (its `useLasso`/`useScribbleErase` lines and `<DrawingToolbar` ~932)
- Modify: `packages/client/src/pages/Monitor/StudentWorkViewer.jsx:237-238` and both `<DrawingToolbar` (~724, ~735)
- Modify: `packages/client/src/pages/Assignment/AssignmentWorkViewer.jsx:113-114` and `<DrawingToolbar` (~718)
- Test: `packages/client/src/lib/lasso.test.js`, `packages/client/src/lib/scribbleDetect.test.js` (create)

**Interfaces:**
- Consumes: `STICKY_ID_PREFIX` (Task 1); `DrawingToolbar` props `stickyOpacity`, `bgPositionRef` (Task 3).
- Produces: nothing new; wiring only.

- [ ] **Step 1: Write the failing pure tests**

In `lasso.test.js` (existing exclusion test at line 40-50): add `fd('sticky_p', 10, 10, [[0, 0], [5, 5]])` to `els` and pass `excludePrefixes: ['__tn_', 'sticky_']`; the expectation stays `{ ok: true }`.

Create `scribbleDetect.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { scribbleDeletionIds } from './scribbleDetect';
// build a scribble freedraw over [0,0]-[40,40] and two overlapping elements: 'ink' (freedraw) and 'sticky_1' (image)
it('문지르기 삭제 대상에서 sticky_ 접두사는 빠진다', () => {
  const ids = scribbleDeletionIds(elements, scribble, { excludePrefixes: ['sticky_'], excludeIds: ['__bg_image__'] });
  expect(ids.has('ink')).toBe(true);
  expect(ids.has('sticky_1')).toBe(false);
});
```
(Read `scribbleDetect.js` for the overlap rule — bounding-box intersection — and build the fixtures to satisfy it; keep the file under 40 lines.)

- [ ] **Step 2: Run to verify failure**

Run: `npm test -w @mathchois/client -- src/lib/lasso.test.js src/lib/scribbleDetect.test.js`
Expected: `lasso.test.js` FAILS only if the prefix is not passed (it passes once the test passes `'sticky_'` — this step mostly pins behavior; `scribbleDetect.test.js` should PASS immediately since the function already honors prefixes). If both pass, proceed — the wiring below is what the browser check verifies.

- [ ] **Step 3: Wire the six viewers**

In each viewer: import `STICKY_ID_PREFIX` from `'../../lib/stickyPads'`; add it to the `excludePrefixes` arrays of both `useLasso` and `useScribbleErase` (CoachingViewer and TeacherStudyViewer currently pass `[]` / nothing → pass `[STICKY_ID_PREFIX]`; keep existing `TEACHER_NOTE_PREFIX` / `STUDENT_NOTE_PREFIX` entries). Hoist the array to a module constant per file (e.g. `const EXCLUDE_PREFIXES = [TEACHER_NOTE_PREFIX, STICKY_ID_PREFIX];`) so `useLasso`'s join-key memo stays stable.
On every `<DrawingToolbar …>`: add `bgPositionRef={bgPositionRef}` (each viewer has one; confirm the name with grep — StudyViewer line 64). In `StudentWorkViewer` and `AssignmentWorkViewer` additionally `stickyOpacity={70}`.

- [ ] **Step 4: Run the client suite and lint**

Run: `npm test -w @mathchois/client` → Expected: all files PASS.
Run: `cd /home/user/MathChois && npm run lint` → Expected: 0 errors (pre-existing exhaustive-deps warnings allowed).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/pages packages/client/src/lib/lasso.test.js packages/client/src/lib/scribbleDetect.test.js
git commit -m "feat(sticky): viewers exclude pads from lasso/scribble, pass paper rect, comment viewers use 70% pads"
```

---

### Task 6: Browser check, docs, build

**Files:**
- Modify: `.claude/PROJECT_MAP.md` (study/ components line: add `StickyPicker`; lib line: add `stickyPads.js`; toolbar order note)
- Modify: `docs/superpowers/specs/2026-11-01-sticky-pads-design.md` (status line → 구현 완료 + commit range; note that `paperWidth` became `bgPositionRef` and insertion uses the app's snapshot undo instead of `captureUpdate`)
- Modify: `docs/superpowers/specs/2026-10-30-drawing-toolbar-reorg-highlighter-design.md` (toolbar diagram: add `[메모지]` before `[이미지 삽입]`)

- [ ] **Step 1: Run the app and click through**

Start local Postgres + `npm run dev` as in the previous session (`packages/server/.env`, seeded accounts `test.student@chois.test` / `Test1234!`). With Playwright (`createRequire(import.meta.url)('playwright')`, headless Chromium), in the student study viewer of the seeded chapter:
1. Open the 메모지 picker, pick 얼굴 메모지·별 → pad appears centered, behind existing strokes.
2. Draw a stroke across it with the pen, then erase with the eraser tool across both → stroke gone, pad stays.
3. Toggle 이미지·메모지 이동, drag the pad 100px, resize from a corner (aspect kept), select it → [메모지 삭제] visible; turn the mode off → pad locked again (pen passes).
4. Reload the page → pad persists with its SVG.
5. Log in as the teacher, open the student's work viewer → pad visible, locked; add a teacher pad → opacity 70.
6. Export the page as PDF via the header button → pad present in the PDF (open the PDF's first page as an image with pdf.js in the browser or check the file size grew).
Capture `scratchpad/sticky/qa-*.png` at 1180px and 390px (picker open on phone width) and send the two most informative to the user. Fix anything that deviates from the spec before continuing.

- [ ] **Step 2: Build**

Run: `cd /home/user/MathChois && npm run build -w @mathchois/client`
Expected: build completes with no errors.

- [ ] **Step 3: Update docs**

As listed in Files. Keep the PROJECT_MAP line style (Korean, one line per module).

- [ ] **Step 4: Commit and push**

```bash
git add .claude/PROJECT_MAP.md docs/superpowers/specs/2026-11-01-sticky-pads-design.md docs/superpowers/specs/2026-10-30-drawing-toolbar-reorg-highlighter-design.md
git commit -m "docs(sticky): project map and spec status for the 메모지 feature"
git push -u origin claude/friendly-hopper-ug1yjn
```
