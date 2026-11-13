# 영상 플레이어 터치 = 조작 창 열기/닫기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 터치 한 번은 재생/정지 대신 조작 창(가운데 재생·이동 버튼 + 아래 재생 바)을 열고 닫으며, 창은 3초 뒤 저절로 사라지고, 꾹 누르기 알약은 위쪽에 설명 없이 뜬다.

**Architecture:** 판단 규칙(탭 → 열기/닫기/이동, 자동 숨김 여부)은 `lib/videoPlayer.js` 순수 함수로 두고 Vitest 로 검증한다. `VideoPlayer.jsx` 는 기존 `controlsVisible`·`revealControls` 타이머를 그대로 쓰고, 마지막 입력이 터치인지(`inputMode`)를 기억해 가운데 버튼 묶음과 숨김 시간을 정한다.

**Tech Stack:** React 19, Tailwind 4, lucide-react, Vitest, Playwright(e2e 스모크, `hasTouch` 문맥), ffmpeg(테스트 영상 생성).

**Spec:** `docs/superpowers/specs/2026-11-13-video-tap-controls-design.md`

## Global Constraints

- 터치 = `pointerType` 가 `touch` 또는 `pen`. 마우스 동작(클릭 즉시 재생/정지, 올리면 재생 바, 재생 중일 때만 2.5초 뒤 숨김)은 바꾸지 않는다.
- 두 번 터치 판정 `DOUBLE_TAP_MS = 350`(기존 값). 터치 모드 숨김 `TOUCH_HIDE_MS = 3000`, 마우스 모드 숨김 `MOUSE_HIDE_MS = 2500`(기존 값).
- 이동 버튼은 `settings.seekStep`(기본 10) 을 쓴다. 가운데 버튼의 `aria-label`: `재생`/`일시정지`, `${seekStep}초 뒤로`, `${seekStep}초 앞으로` — 기존 아래 바 버튼과 같은 문구.
- 꾹 누르기 알약: `⏩ 2배속`(FastForward 아이콘 + `{HOLD_RATE}배속`), `⏪ 되감기 · {시간}` — 설명 줄 없음, 화면 위쪽 가운데.
- 끌기·꾹 누르기·키보드·설정 동작은 바꾸지 않는다.

## Review Focus

1. **창을 닫으려고 터치한 직후 브라우저가 보내는 호환 mouse 이벤트(mousemove/mouseleave)** → 창이 다시 열리면 안 된다. (Task 2: 컨테이너 표시를 `pointerType === 'mouse'` 일 때만; 스모크 "다시 터치 → 닫힘 유지")
2. **터치로 정지한 뒤**(가운데 일시정지 버튼) → 3초 뒤 창이 사라져야 한다(`onPause` 가 창을 붙잡지 않음). (Task 2 스모크)
3. **꾹 누르기·끌기를 끝낸 손가락 떼기** → 탭으로 처리되어 창이 닫히거나 열리면 안 된다(기존 `finishGesture` 가 먼저). (Task 2 스모크: 꾹 누르기 뒤 창 상태 확인은 생략하고, 알약 위치·설명 없음만 확인 — 동작 자체는 기존 코드)
4. **정지 상태 + 창 닫힘에서 위쪽 제목 띠** → 꾹 누르기 알약과 겹치지 않아야 한다(제스처 중 제목 띠 숨김). (Task 2)
5. **마우스로 같은 화면을 보다가 터치로 바꾼 기기(터치 노트북)** → 마지막 입력 기준으로 동작이 바뀐다. (Task 1 테스트 `shouldAutoHide` 두 모드)

---

## File Structure

| 파일 | 책임 |
|---|---|
| `packages/client/src/lib/videoPlayer.js` (수정) | `DOUBLE_TAP_MS`, `TOUCH_HIDE_MS`, `MOUSE_HIDE_MS`, `touchTapAction`, `shouldAutoHide` |
| `packages/client/src/lib/videoPlayer.test.js` (수정) | 위 함수 테스트 |
| `packages/client/src/components/videos/VideoPlayer.jsx` (수정) | 입력 모드, 터치 탭 처리, 가운데 버튼 묶음, 숨김 규칙, 꾹 누르기 알약 위치 |
| `packages/server/scripts/video-tap-e2e-setup.ts` (신규) | ffmpeg 로 짧은 WebM + 교사(허용 목록)·학급·영상 배정 시드 |
| `packages/client/e2e/video-tap.smoke.mjs` (신규) | 터치 스모크 |
| `.claude/PROJECT_MAP.md` | VideoPlayer 설명 한 줄 |

---

### Task 1: 탭·숨김 판단 순수 함수

**Files:** Modify `packages/client/src/lib/videoPlayer.js`, Test `packages/client/src/lib/videoPlayer.test.js`

**Interfaces — Produces:**
- `DOUBLE_TAP_MS = 350`, `TOUCH_HIDE_MS = 3000`, `MOUSE_HIDE_MS = 2500`
- `touchTapAction({ now: number, lastTapAt: number, controlsVisible: boolean }): 'seek' | 'show' | 'hide'` — `now - lastTapAt < DOUBLE_TAP_MS` 이면 `'seek'`, 아니면 보이면 `'hide'`, 안 보이면 `'show'`.
- `shouldAutoHide({ inputMode: 'touch' | 'mouse', paused: boolean }): boolean` — 터치면 항상 true, 마우스면 `!paused`.
- `pointerInputMode(pointerType: string): 'touch' | 'mouse'` — `'mouse'` 만 mouse, 나머지(touch·pen·빈 값) touch.

- [ ] **Step 1: 실패하는 테스트** — `describe('touch tap controls')`:
  - `touchTapAction({ now: 1000, lastTapAt: 0, controlsVisible: false })` → `'show'`; `controlsVisible: true` → `'hide'`
  - `touchTapAction({ now: 1300, lastTapAt: 1000, controlsVisible: true })` → `'seek'`; `now: 1350` → `'show'`/`'hide'`(경계는 350 미만만 seek)
  - `shouldAutoHide({ inputMode: 'touch', paused: true })` → true; `{ 'mouse', paused: true }` → false; `{ 'mouse', paused: false }` → true
  - `pointerInputMode('pen')` → `'touch'`, `('mouse')` → `'mouse'`, `('')` → `'touch'`
- [ ] **Step 2: 실패 확인** — `cd packages/client && npx vitest run src/lib/videoPlayer.test.js` → FAIL(`touchTapAction is not a function`)
- [ ] **Step 3: 구현** — 위 시그니처 그대로.
- [ ] **Step 4: 통과** — 같은 명령 → PASS
- [ ] **Step 5: 커밋** — `feat(videos): 터치 탭·자동 숨김 판단 함수`

---

### Task 2: VideoPlayer 동작 + 터치 스모크 + 문서

**Files:** Modify `VideoPlayer.jsx`, `.claude/PROJECT_MAP.md`; Create `packages/server/scripts/video-tap-e2e-setup.ts`, `packages/client/e2e/video-tap.smoke.mjs`

**Interfaces — Consumes:** Task 1 전부.

- [ ] **Step 1: 시드** — `video-tap-e2e-setup.ts`(형식은 `scripts/unit-transfer-e2e-setup.ts`: 접두어 `VT E2E `, 교사 `vt.teacher@chois.test` + 허용 목록 표식 행, `--cleanup`). `ffmpeg -f lavfi -i testsrc=duration=30:size=640x360:rate=25 -c:v libvpx -b:v 300k -an` 로 `${VOLUME_PATH}/videos/vt-e2e/clip.webm` 생성(없을 때만), `videos.videoUrl = '/api/files/videos/vt-e2e/clip.webm'`, 학급 1개 + `classroom_videos` 1행. 출력 `{ classroomId, cvId, email, password }`.
- [ ] **Step 2: 스모크(실패) 작성** — `video-tap.smoke.mjs`: `browser.newContext({ hasTouch: true, viewport: 1280×800 })`, 교사로 `/teacher/classrooms/:cid/videos/:cvId`. 영상 `loadedmetadata` 대기 후 `video.play()`(evaluate)로 재생, 창이 숨을 때까지(최대 5초) 대기. 탭은 `page.touchscreen.tap(영상 중앙 좌표)`. 확인:
  1. 탭 → 가운데 `button[aria-label="일시정지"]` 가 2개(가운데+아래) 보이고 `video.paused === false`
  2. 400ms 뒤 다시 탭 → 아래 바 opacity 0(창 닫힘), 600ms 더 기다려도 닫힘 유지, 재생 중
  3. 탭 → 가운데 일시정지 버튼 탭 → `paused === true`, 3.5초 뒤 창 닫힘
  4. 창 닫힌 상태에서 영상 오른쪽 1/4 지점 두 번 탭(150ms 간격) → `currentTime` 이 약 +10초(±1.5)
  5. 오른쪽 1/4 지점 꾹 누르기(CDP `Input.dispatchTouchEvent` start → 900ms → end): 누르는 동안 `2배속` 알약의 `getBoundingClientRect().top` 이 영상 높이의 25% 안, 화면에 `누르고 있는 동안` 문구 없음
  6. 콘솔 오류 0
  실행 → 1번에서 FAIL(지금은 탭이 재생/정지).
- [ ] **Step 3: 구현** (`VideoPlayer.jsx`):
  - `inputModeRef`(+ 렌더용 `touchMode` state): 컨테이너 `onPointerDownCapture` 에서 `pointerInputMode(e.pointerType)`.
  - `revealControls`: 지연 `inputModeRef.current === 'touch' ? TOUCH_HIDE_MS : MOUSE_HIDE_MS`, 타이머 끝에 `shouldAutoHide({ inputMode, paused: v.paused })` 이면 숨김. `hideControls()` = 타이머 지우고 숨김.
  - 컨테이너: `onTouchStart` 제거, `onMouseMove` → `onPointerMove` 에서 `pointerType === 'mouse'` 일 때만 `revealControls`, `onMouseLeave` → `onPointerLeave` 에서 mouse 일 때만.
  - `onPause`/`onEnded`: `setControlsVisible(true)` 대신 `revealControls()`.
  - `onVideoPointerUp` 터치 분기: `touchTapAction` — `'seek'` 은 기존 이동(`seekBy`), `'show'` 는 `revealControls()`, `'hide'` 는 `hideControls()`; 지연 `togglePlay` 타이머 제거. 마우스 분기 그대로.
  - 가운데 묶음: `touchMode && controlsVisible && !gesture && !error` 일 때 `absolute inset-0 flex items-center justify-center gap-8 pointer-events-none`, 버튼은 `pointer-events-auto` 둥근 `bg-black/50` — 뒤로(SkipBack + 초) · 재생/일시정지(크게, h-8) · 앞으로. 아래 바 버튼과 같은 핸들러.
  - 꾹 누르기 알약: 컨테이너를 `absolute inset-x-0 top-4 flex justify-center`, 설명 `<span>` 삭제. 제목 띠 조건에 `!gesture` 추가.
- [ ] **Step 4: 검증** — `cd packages/client && npx vitest run`(PASS) · `npm run lint`(오류 0) · 시드 후 `node e2e/video-tap.smoke.mjs <json>`(all passed) · 스크린샷(창 열림, 꾹 누르기) 확인.
- [ ] **Step 5: 문서** — `PROJECT_MAP.md` 의 videos/ `VideoPlayer` 설명에 "터치 탭 = 조작 창 열기/닫기(가운데 재생·이동 버튼, 3초 뒤 숨김), 두 번 탭 = 이동, 꾹 누르기 알약은 위쪽" 한 줄.
- [ ] **Step 6: 커밋** — `feat(videos): 터치하면 조작 창을 열고 닫기, 꾹 누르기 표시를 위쪽으로`
