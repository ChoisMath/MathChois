# 펜 입력 품질 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 5개 필기 뷰어에서 ①사전 선(팜 획) 제거, ②확대 시 곡선 각짐 개선, ③undo/redo 활성화.

**Architecture:** 공유 훅/유틸에 한 번 구현하고 5개 뷰어에 배선한다. 콘솔이 없는 실기기 (Railway 배포 iPad/Galaxy) 검증을 위해 온디바이스 진단 오버레이 + 런타임 토글을 먼저 만든다. 기기 의존/스파이크 게이트가 붙는 단계는 별도 표시한다.

**Tech Stack:** React 19, Vite 7, `@excalidraw/excalidraw` 0.18, perfect-freehand(Excalidraw 내장), Pointer Events, Vitest(신규 추가).

**Spec:** `docs/superpowers/specs/2026-06-02-pen-input-quality-design.md`

**대상 뷰어 (5):** `StudyViewer.jsx`, `TeacherStudyViewer.jsx`, `StudentWorkViewer.jsx`, `AssignmentStudyViewer.jsx`, `AssignmentWorkViewer.jsx` (모두 `packages/client/src/...`)

**검증 표기:** 🖥️=데스크톱/단위테스트로 검증 가능, 📱=Railway 배포 후 사용자 실기기 검증 필요, 🔬=스파이크로 메커니즘 확정.

---

## File Structure

- Create `packages/client/vitest.config.js` — 단위테스트 러너.
- Create `packages/client/src/lib/penToggles.js` — 런타임 실험 토글 store(localStorage + 구독).
- Create `packages/client/src/lib/freedrawResample.js` — 순수 리샘플링/스무딩 함수.
- Create `packages/client/src/lib/freedrawResample.test.js` — 위 함수 단위테스트.
- Create `packages/client/src/hooks/usePenDiagnostics.js` — 포인터 이벤트 링버퍼/상태 수집 훅.
- Create `packages/client/src/components/study/PenDiagnosticsOverlay.jsx` — 온디바이스 오버레이 + 토글 UI.
- Create `packages/client/src/hooks/useFreedrawSmoothing.js` — 획 완료 감지 → 리샘플링 적용(②B), coalesced 주입(②A, 🔬).
- Create `packages/client/src/lib/excalidrawHistory.js` — undo/redo 트리거 + 히스토리 격리 헬퍼(③).
- Create `packages/client/src/lib/excalidrawHistory.test.js` — pending-discard 상태머신 단위테스트(①B).
- Modify `packages/client/src/hooks/useExcalidrawTouch.js` — 결정적 터치 차단 강화(①A) + pending-discard(①B), Ctrl+Z 디스패치 제거.
- Modify `packages/client/src/components/study/DrawingToolbar.jsx` — undo/redo 버튼(③).
- Modify 5개 뷰어 — 오버레이 마운트 + `useFreedrawSmoothing` 배선 + 히스토리 격리 적용.

---

## Phase 0 — 단위테스트 러너 + 진단 인프라 (🖥️)

### Task 0.1: Vitest 도입

**Files:**
- Modify: `packages/client/package.json`
- Create: `packages/client/vitest.config.js`

- [ ] **Step 1: devDependency 설치**

Run: `npm i -D vitest@^2 -w @mathchois/client`
Expected: `@mathchois/client` 에 vitest 추가.

- [ ] **Step 2: test 스크립트 추가**

`packages/client/package.json` 의 `scripts` 에 추가:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: vitest 설정 생성**

`packages/client/vitest.config.js`:

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
});
```

- [ ] **Step 4: 동작 확인용 임시 테스트 → 실행 → 삭제**

Run: `npm run test -w @mathchois/client`
Expected: "No test files found" 또는 0 passed (러너 정상 기동).

- [ ] **Step 5: Commit**

```bash
git add packages/client/package.json packages/client/vitest.config.js package-lock.json
git commit -m "chore(client): add vitest for unit tests"
```

---

### Task 0.2: 런타임 실험 토글 store

**Files:**
- Create: `packages/client/src/lib/penToggles.js`

런타임에 펜 파이프라인 거동을 바꾸는 토글(재배포 없이 실기기 실측). localStorage 영속 + 변경 구독.

- [ ] **Step 1: 구현**

`packages/client/src/lib/penToggles.js`:

```js
const KEY = 'mc_pen_toggles';
const DEFAULTS = {
  coalesced: false,      // ②A 라이브 고주파 주입
  resample: false,       // ②B 획 완료 후 리샘플링
  pendingDiscardMs: 150, // ①B 터치 획 보류 창
  diagnostics: false,    // 진단 오버레이 표시
};

function load() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { ...DEFAULTS }; }
}

let state = load();
const listeners = new Set();

export function getToggles() { return state; }
export function setToggle(key, value) {
  state = { ...state, [key]: value };
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  listeners.forEach((fn) => fn(state));
}
export function subscribeToggles(fn) { listeners.add(fn); return () => listeners.delete(fn); }
```

- [ ] **Step 2: Commit**

```bash
git add packages/client/src/lib/penToggles.js
git commit -m "feat(client): add runtime pen experiment toggle store"
```

---

### Task 0.3: 진단 수집 훅 + 오버레이

**Files:**
- Create: `packages/client/src/hooks/usePenDiagnostics.js`
- Create: `packages/client/src/components/study/PenDiagnosticsOverlay.jsx`

콘솔 없는 실기기에서 포인터 이벤트 흐름·차단 여부를 화면으로 확인 + 텍스트 덤프.

- [ ] **Step 1: 수집 훅 구현**

`packages/client/src/hooks/usePenDiagnostics.js`:

```js
import { useEffect, useRef, useState } from 'react';

const MAX = 40;

/** 컨테이너의 pointer 이벤트를 캡처 단계에서 관찰만 한다(차단/소비 안 함). */
export function usePenDiagnostics({ containerRef, enabled }) {
  const bufRef = useRef([]);
  const [, force] = useState(0);
  const lastTsRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const el = containerRef.current;
    if (!el) return;
    const onEvt = (e) => {
      if (!e.target.closest?.('.excalidraw')) return;
      const now = e.timeStamp;
      const dt = lastTsRef.current ? Math.round(now - lastTsRef.current) : 0;
      lastTsRef.current = now;
      let coalesced = 1;
      try { coalesced = e.getCoalescedEvents?.().length || 1; } catch {}
      const rec = {
        t: e.type, pt: e.pointerType, id: e.pointerId, btn: e.button,
        w: Math.round(e.width || 0), h: Math.round(e.height || 0),
        coalesced, dt,
      };
      const buf = bufRef.current;
      buf.push(rec);
      if (buf.length > MAX) buf.shift();
      force((n) => n + 1);
    };
    const opts = { capture: true, passive: true };
    el.addEventListener('pointerdown', onEvt, opts);
    el.addEventListener('pointermove', onEvt, opts);
    el.addEventListener('pointerup', onEvt, opts);
    return () => {
      el.removeEventListener('pointerdown', onEvt, opts);
      el.removeEventListener('pointermove', onEvt, opts);
      el.removeEventListener('pointerup', onEvt, opts);
    };
  }, [containerRef, enabled]);

  return { events: bufRef.current };
}
```

> 주의: 이 훅은 **passive 관찰자**이며 `useExcalidrawTouch` 의 차단 로직과 독립이다. 차단 여부 표시는 Task 1.x 에서 `useExcalidrawTouch` 가 `penToggles` 를 통해 마지막 차단 사유를 노출하면 합류시킨다.

- [ ] **Step 2: 오버레이 컴포넌트 구현**

`packages/client/src/components/study/PenDiagnosticsOverlay.jsx`:

```jsx
import { useState, useEffect } from 'react';
import { getToggles, setToggle, subscribeToggles } from '../../lib/penToggles';
import { usePenDiagnostics } from '../../hooks/usePenDiagnostics';

export default function PenDiagnosticsOverlay({ containerRef }) {
  const [toggles, setToggles] = useState(getToggles());
  useEffect(() => subscribeToggles(setToggles), []);
  const { events } = usePenDiagnostics({ containerRef, enabled: toggles.diagnostics });

  if (!toggles.diagnostics) return null;

  const dump = events.map((e) =>
    `${e.t} ${e.pt}#${e.id} b${e.btn} ${e.w}x${e.h} c${e.coalesced} dt${e.dt}`
  ).join('\n');

  return (
    <div className="fixed bottom-1 left-1 z-[60] max-w-[60vw] bg-black/80 text-green-300 text-[10px] leading-tight p-1 rounded font-mono whitespace-pre overflow-auto max-h-[40vh]"
         style={{ pointerEvents: 'auto' }}>
      <div className="flex flex-wrap gap-2 text-white mb-1">
        <label><input type="checkbox" checked={toggles.coalesced}
          onChange={(e) => setToggle('coalesced', e.target.checked)} /> coalesced</label>
        <label><input type="checkbox" checked={toggles.resample}
          onChange={(e) => setToggle('resample', e.target.checked)} /> resample</label>
        <label>pendingMs
          <input type="number" className="w-12 text-black ml-1" value={toggles.pendingDiscardMs}
            onChange={(e) => setToggle('pendingDiscardMs', parseInt(e.target.value) || 0)} /></label>
      </div>
      <div onClick={(ev) => { try { navigator.clipboard?.writeText(dump); } catch {} ; ev.stopPropagation(); }}>
        {dump || '(이벤트 대기...)'}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 한 뷰어(StudyViewer)에 우선 마운트 + 활성화 진입점**

`StudyViewer.jsx` 의 Excalidraw 컨테이너(`containerRef` 가 가리키는 div) 내부에 추가:

```jsx
<PenDiagnosticsOverlay containerRef={containerRef} />
```

`?penlog=1` 진입 시 토글 켜기 — `StudyViewer` 마운트 useEffect 에 1회:

```js
useEffect(() => {
  if (new URLSearchParams(location.search).get('penlog') === '1') setToggle('diagnostics', true);
}, []);
```

(`setToggle` 를 `penToggles` 에서 import)

- [ ] **Step 4: 빌드 확인**

Run: `npm run build -w @mathchois/client`
Expected: 빌드 성공(타입/구문 오류 없음).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/hooks/usePenDiagnostics.js packages/client/src/components/study/PenDiagnosticsOverlay.jsx packages/client/src/pages/Study/StudyViewer.jsx
git commit -m "feat(client): on-device pen diagnostics overlay + runtime toggles"
```

- [ ] **Step 6 (📱): 배포 후 사용자 검증**

Railway 배포 → iPad/Galaxy에서 `?penlog=1` 로 오버레이 표시 확인, 포인터 이벤트가 흐르는지 회신.

---

## Phase 1 — 사전 선 제거 ①

### Task 1.1: pending-discard 상태머신 (순수 로직, 🖥️ TDD)

**Files:**
- Create: `packages/client/src/lib/excalidrawHistory.js` (상태머신 부분)
- Test: `packages/client/src/lib/excalidrawHistory.test.js`

터치로 시작된 freedraw 획을 짧은 창 동안 보류했다가, 그 안에 펜이 오면 폐기 판정.

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/client/src/lib/excalidrawHistory.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createPendingDiscard } from './excalidrawHistory';

describe('pending-discard 상태머신', () => {
  it('터치 시작 후 창 안에 펜이 오면 폐기 대상', () => {
    const m = createPendingDiscard({ windowMs: 150 });
    m.onStrokeStart({ pointerType: 'touch', id: 1, time: 1000 });
    expect(m.shouldDiscardOnPen({ time: 1100 })).toBe(true);
  });

  it('창 밖이면 폐기 안 함', () => {
    const m = createPendingDiscard({ windowMs: 150 });
    m.onStrokeStart({ pointerType: 'touch', id: 1, time: 1000 });
    expect(m.shouldDiscardOnPen({ time: 1200 })).toBe(false);
  });

  it('펜으로 시작한 획은 폐기 안 함', () => {
    const m = createPendingDiscard({ windowMs: 150 });
    m.onStrokeStart({ pointerType: 'pen', id: 1, time: 1000 });
    expect(m.shouldDiscardOnPen({ time: 1050 })).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm run test -w @mathchois/client`
Expected: FAIL — `createPendingDiscard` 미정의.

- [ ] **Step 3: 최소 구현**

`packages/client/src/lib/excalidrawHistory.js` (상태머신 부분):

```js
export function createPendingDiscard({ windowMs = 150 } = {}) {
  let pending = null; // { id, time } — 터치로 시작된 미확정 획
  return {
    onStrokeStart({ pointerType, id, time }) {
      pending = pointerType === 'touch' ? { id, time } : null;
    },
    shouldDiscardOnPen({ time }) {
      if (!pending) return false;
      return time - pending.time <= windowMs;
    },
    clear() { pending = null; },
    get pendingId() { return pending?.id ?? null; },
  };
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test -w @mathchois/client`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/lib/excalidrawHistory.js packages/client/src/lib/excalidrawHistory.test.js
git commit -m "feat(client): pending-discard state machine for palm stroke (tested)"
```

---

### Task 1.2: ①A 결정적 차단 강화 (📱 진단 게이트)

**Files:**
- Modify: `packages/client/src/hooks/useExcalidrawTouch.js`

- [ ] **Step 1 (📱): 누수 경로 특정**

Phase 0 오버레이로 "손-먼저·빠른 드롭" 시 어떤 이벤트가 통과하는지 사용자와 함께 확인. 가설: (a) `penEverDetected` 가 아직 false인 최초 세션, (b) 이벤트가 캡처 핸들러보다 먼저 canvas 도달. 회신 결과로 정확한 분기 확정.

- [ ] **Step 2: 차단 강화 구현**

진단 결과에 따라 다음 중 하나(또는 조합)을 적용:
- `penEverDetected` 와 무관하게, **호버(penNearby) 또는 penActive 가 한 번이라도 잡힌 디바이스**에서는 freedraw 단일 터치를 항상 차단(이미 부분 구현됨 — 사각지대만 보강).
- 차단 시 마지막 사유를 `penToggles`/ref 로 노출해 오버레이에 "blocked: reason" 표시.

> 정확한 코드는 Step 1 진단 결과로 확정한다(스펙의 🔬 항목).

- [ ] **Step 3 (📱): 재검증**

Railway 배포 → iPad/Galaxy에서 빠른 손-먼저 드롭 반복 → 사전 선이 사라졌는지, 펜 획 지연 없는지 회신.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/hooks/useExcalidrawTouch.js
git commit -m "fix(client): harden deterministic touch block for palm rejection"
```

---

### Task 1.3: ①B pending-discard 배선 + Ctrl+Z 제거

**Files:**
- Modify: `packages/client/src/hooks/useExcalidrawTouch.js`

- [ ] **Step 1: `createPendingDiscard` 연결**

`useExcalidrawTouch` 에서 freedraw 획 시작 시 `onStrokeStart({pointerType, id, time})` 호출, 펜 `pointerdown` 시 `shouldDiscardOnPen` 이 true면 해당 element 를 `isDeleted` 마킹으로 제거(히스토리 커밋 없음). 창(ms)은 `getToggles().pendingDiscardMs` 사용.

- [ ] **Step 2: 기존 Ctrl+Z 소급취소 제거**

`useExcalidrawTouch.js:96-99` 의 `document.dispatchEvent(new KeyboardEvent('keydown', {key:'z', ctrlKey:true ...}))` 및 합성 pointerup 기반 소급취소 블록 제거(pending-discard 로 대체). `suspectTouchRef` 관련 잔여 정리.

- [ ] **Step 3 (📱): 검증 + undo 스택 청결 확인**

배포 후: 팜 발생 케이스에서 undo를 눌렀을 때 팜 흔적이 아니라 사용자 마지막 획이 취소되는지 확인(③과 연계).

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/hooks/useExcalidrawTouch.js
git commit -m "feat(client): replace Ctrl+Z palm undo with pre-commit pending-discard"
```

---

## Phase 2 — undo/redo ③

### Task 2.1: undo/redo 트리거 + 히스토리 격리 헬퍼

**Files:**
- Modify: `packages/client/src/lib/excalidrawHistory.js`

- [ ] **Step 1: 트리거 헬퍼 구현**

기존 팜 코드가 `document` 에 Ctrl+Z 를 디스패치해 undo 가 동작함을 근거로, 동일 메커니즘 사용:

```js
export function triggerUndo() {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true, bubbles: true, cancelable: true }));
}
export function triggerRedo() {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }));
}
```

- [ ] **Step 2 (🔬): 히스토리 격리 방식 확정**

배경(`__bg_image__`)·교사 코멘트·기존 노트 삽입이 undo로 제거되지 않아야 함. 현재 뷰어들이 이들을 `updateScene` 로 삽입하는 지점들을 점검해, Excalidraw 0.18 에서 undo 대상이 되지 않도록 삽입 방식을 통일(초기 로드는 `initialData` 또는 비-캡처 업데이트). 0.18 의 history 캡처 동작은 데스크톱 빌드로 즉시 확인.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/lib/excalidrawHistory.js
git commit -m "feat(client): undo/redo triggers + history isolation helpers"
```

---

### Task 2.2: 툴바 undo/redo 버튼

**Files:**
- Modify: `packages/client/src/components/study/DrawingToolbar.jsx`

- [ ] **Step 1: 버튼 추가**

`lucide-react` 에서 `Undo2`, `Redo2` import. 기본 도구 그룹 근처에 추가(터치 타겟 ≥ 44px → `p-2.5` 또는 `min-h-11 min-w-11`):

```jsx
import { Undo2, Redo2 } from 'lucide-react';
import { triggerUndo, triggerRedo } from '../../lib/excalidrawHistory';
// ...
<button onClick={triggerUndo} title="실행 취소 (Ctrl+Z)"
  className="p-1.5 min-h-11 min-w-11 flex items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 cursor-pointer flex-shrink-0">
  <Undo2 className="h-4 w-4" />
</button>
<button onClick={triggerRedo} title="다시 실행 (Ctrl+Shift+Z)"
  className="p-1.5 min-h-11 min-w-11 flex items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 cursor-pointer flex-shrink-0">
  <Redo2 className="h-4 w-4" />
</button>
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build -w @mathchois/client`
Expected: 성공.

- [ ] **Step 3 (🖥️): 데스크톱 검증**

`npm run dev` → 브라우저에서 획 그리고 버튼/Ctrl+Z·Ctrl+Shift+Z 로 undo/redo 동작, 배경/기존 필기 보존 확인.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/components/study/DrawingToolbar.jsx
git commit -m "feat(client): add undo/redo buttons to drawing toolbar"
```

---

## Phase 3 — 필기감 ②

### Task 3.1: ②B 리샘플링 순수 함수 (🖥️ TDD)

**Files:**
- Create: `packages/client/src/lib/freedrawResample.js`
- Test: `packages/client/src/lib/freedrawResample.test.js`

Chaikin corner-cutting 으로 freedraw `points` 를 촘촘·매끄럽게. 멱등 처리 마커 포함.

- [ ] **Step 1: 실패 테스트 작성**

`packages/client/src/lib/freedrawResample.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { chaikinSmooth, resampleStrokePoints } from './freedrawResample';

describe('chaikinSmooth', () => {
  it('점 개수를 늘리고 원본 끝점 근처를 보존한다', () => {
    const pts = [[0,0],[10,0],[10,10]];
    const out = chaikinSmooth(pts, 1);
    expect(out.length).toBeGreaterThan(pts.length);
    expect(out[0][0]).toBeCloseTo(0, 1);
    expect(out[0][1]).toBeCloseTo(0, 1);
  });

  it('2점 이하는 그대로 반환', () => {
    expect(chaikinSmooth([[0,0]], 1)).toEqual([[0,0]]);
  });
});

describe('resampleStrokePoints', () => {
  it('이미 매끄러운(밀도 높은) 입력은 재처리하지 않는다(멱등)', () => {
    const dense = Array.from({ length: 50 }, (_, i) => [i, Math.sin(i / 5)]);
    const out = resampleStrokePoints(dense, { alreadySmoothed: true });
    expect(out).toBe(dense);
  });

  it('각진 입력은 점이 늘어난다', () => {
    const pts = [[0,0],[10,0],[10,10],[0,10]];
    const out = resampleStrokePoints(pts);
    expect(out.length).toBeGreaterThan(pts.length);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm run test -w @mathchois/client`
Expected: FAIL — 함수 미정의.

- [ ] **Step 3: 구현**

`packages/client/src/lib/freedrawResample.js`:

```js
/** Chaikin corner-cutting smoothing. iterations 만큼 모서리를 깎아 매끄럽게. */
export function chaikinSmooth(points, iterations = 1) {
  if (!Array.isArray(points) || points.length <= 2) return points;
  let pts = points;
  for (let it = 0; it < iterations; it++) {
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[i + 1];
      out.push([x0 * 0.75 + x1 * 0.25, y0 * 0.75 + y1 * 0.25]);
      out.push([x0 * 0.25 + x1 * 0.75, y0 * 0.25 + y1 * 0.75]);
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

/**
 * 획 완료 후 points 를 매끄럽게. 이미 처리됐거나 너무 짧으면 원본 반환(멱등).
 * @param {number[][]} points
 * @param {{ alreadySmoothed?: boolean, iterations?: number }} opts
 */
export function resampleStrokePoints(points, opts = {}) {
  const { alreadySmoothed = false, iterations = 1 } = opts;
  if (alreadySmoothed) return points;
  if (!Array.isArray(points) || points.length <= 2) return points;
  return chaikinSmooth(points, iterations);
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test -w @mathchois/client`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/lib/freedrawResample.js packages/client/src/lib/freedrawResample.test.js
git commit -m "feat(client): freedraw Chaikin resampling pure fns (tested)"
```

---

### Task 3.2: ②B useFreedrawSmoothing 훅 + 스크리블 호환

**Files:**
- Create: `packages/client/src/hooks/useFreedrawSmoothing.js`
- Modify: 5개 뷰어의 `onChange` 핸들러

- [ ] **Step 1: 훅 구현**

획 완료(`useScribbleErase` 와 동일한 "points 증가 멈춤" 감지)를 재사용해, **스크리블 판정이 끝난 뒤** 해당 freedraw 의 points 를 `resampleStrokePoints` 로 교체(`commitToHistory` 없이). `penToggles.resample` 가 true일 때만 동작. 처리한 element id 를 Set 에 기록해 멱등 보장. 배경(`__bg_image__`)·`excludePrefixes` 대상 제외.

```js
import { useCallback, useRef } from 'react';
import { resampleStrokePoints } from '../lib/freedrawResample';
import { getToggles } from '../lib/penToggles';

const BG_ELEMENT_ID = '__bg_image__';

export function useFreedrawSmoothing({ excalidrawAPIRef, excludePrefixes = [] }) {
  const lastIdRef = useRef(null);
  const lastLenRef = useRef(0);
  const timerRef = useRef(null);
  const doneRef = useRef(new Set());

  const checkForSmoothing = useCallback((elements, appState) => {
    if (!getToggles().resample) return;
    if (!appState || appState.activeTool?.type !== 'freedraw') return;
    const els = elements.filter((el) =>
      el.type === 'freedraw' && !el.isDeleted && el.id !== BG_ELEMENT_ID
      && !excludePrefixes.some((p) => el.id.startsWith(p)) && !doneRef.current.has(el.id));
    if (els.length === 0) return;
    const latest = els[els.length - 1];
    const len = latest.points?.length || 0;
    if (latest.id !== lastIdRef.current || len !== lastLenRef.current) {
      lastIdRef.current = latest.id;
      lastLenRef.current = len;
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const api = excalidrawAPIRef.current;
        if (!api) return;
        const cur = api.getSceneElements();
        const el = cur.find((e) => e.id === latest.id);
        if (!el || el.isDeleted || (el.points?.length || 0) < 3) return;
        doneRef.current.add(el.id);
        const smoothed = resampleStrokePoints(el.points);
        if (smoothed === el.points) return;
        api.updateScene({
          elements: cur.map((e) => e.id === el.id ? { ...e, points: smoothed } : e),
          commitToHistory: false,
        });
      }, 320); // 스크리블(300ms) 판정 이후
    }
  }, [excalidrawAPIRef, excludePrefixes]);

  return { checkForSmoothing };
}
```

- [ ] **Step 2: 단위테스트 — 리샘플 후 스크리블 패턴 여전히 감지**

`freedrawResample.test.js` 에 추가: 스크리블 모양 points 를 `resampleStrokePoints` 한 결과를 `isScribblePattern`(useScribbleErase 에서 export 필요 시 분리) 에 넣어도 true. (스크리블 판정이 리샘플 전에 일어나므로 회귀 위험은 낮지만 안전망.)

> 주의: `useScribbleErase` 의 `isScribblePattern` 을 `freedrawResample.js` 또는 별도 `scribbleDetect.js` 로 export 분리해 테스트 가능하게 한다. 분리 시 `useScribbleErase` 는 그 함수를 import 한다.

- [ ] **Step 3: 5개 뷰어 배선**

각 뷰어의 `useScribbleErase` 옆에 `useFreedrawSmoothing` 추가, `handleExcalidrawChange` 끝에서 `checkForSmoothing(elements, appState)` 호출. (StudyViewer 먼저, 나머지 4개 동일 패턴)

- [ ] **Step 4: 빌드 + 단위테스트**

Run: `npm run build -w @mathchois/client && npm run test -w @mathchois/client`
Expected: 성공.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/hooks/useFreedrawSmoothing.js packages/client/src/lib/freedrawResample.test.js packages/client/src/pages packages/client/src/hooks/useScribbleErase.js
git commit -m "feat(client): post-stroke freedraw smoothing wired into 5 viewers (toggle-gated)"
```

---

### Task 3.3: ②C coalesced 천장 측정 스파이크 (📱🔬 게이트)

**Files:**
- Modify: `packages/client/src/hooks/useFreedrawSmoothing.js` 또는 신규 실험 경로

- [ ] **Step 1 (📱): coalesced 토글 ON 측정**

진단 오버레이의 `coalesced` 토글로, `pointermove` 의 `getCoalescedEvents()` 개수와 주입 효과를 iPad/Galaxy에서 측정. 곡선/원의 부채꼴이 충분히 줄어드는지 사용자 회신.

- [ ] **Step 2 (🔬 게이트 판정)**

- 충분 → Task 3.4(②A 라이브 주입) 진행.
- 부족 → 작업② 라이브 부분 보류, ②B(리샘플링)만 유지, "엔진 교체 평가"를 별도 의사결정으로 사용자에게 보고.

- [ ] **Step 3: Commit (측정 메모/실험 코드)**

```bash
git add packages/client/src/hooks/useFreedrawSmoothing.js
git commit -m "chore(client): coalesced-events ceiling spike instrumentation"
```

---

### Task 3.4: ②A 라이브 고주파 주입 (📱🔬, 게이트 통과 시에만)

**Files:**
- Modify: `useExcalidrawTouch.js` 또는 `patch-package` 패치(스파이크 결정)

- [ ] **Step 1 (🔬): 주입 방식 확정**

Task 3.3 결과로 (1) 포인터 프리프로세서 보조점 합성 vs (2) `@excalidraw/excalidraw` `patch-package` 패치 중 유지보수 부담 낮은 쪽 선택.

- [ ] **Step 2: 구현 + (📱) 검증**

확정 방식으로 구현 → 배포 → iPad/Galaxy 라이브 필기감 회신.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(client): live high-frequency (coalesced) point injection for freedraw"
```

---

## Self-Review (작성자 점검)

- **스펙 커버리지:** 작업0(Task 0.2/0.3) · ①A(1.2) · ①B(1.1/1.3) · ②C(3.3) · ②A(3.4) · ②B(3.1/3.2) · ③(2.1/2.2) — 모두 태스크 존재.
- **회귀 금지 목록:** 스크리블(3.2 Step2), 줌-독립 두께(리샘플은 points만 교체로 영향 없음), 배경/`excludePrefixes` 제외(3.2), Ctrl+Z 제거→undo 정합(1.3/2.1).
- **타입 일관성:** `getToggles/setToggle/subscribeToggles`(penToggles), `createPendingDiscard`(history), `chaikinSmooth/resampleStrokePoints`(resample), `triggerUndo/triggerRedo`(history), `checkForSmoothing`(smoothing) — 명칭 일관.
- **순서 의존:** Phase0 → ① → ③ → ②. 진단 오버레이가 ①·② 검증의 전제.

## 미해결(스파이크/기기 게이트)

- 1.2: 누수 경로 특정(📱).
- 2.1 Step2: 0.18 history 격리 방식(🔬, 데스크톱 확인).
- 3.3/3.4: coalesced 천장 게이트 및 주입 방식(📱🔬).
