# 입력 모드 분리 (스타일러스 ↔ 손가락) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 5개 필기창의 손바닥-연결선(phantom line)을 입력 모드 분리(스타일러스 전용/손가락 허용)로 결정적으로 차단하고, 사용하지 않는 영역삭제(가위) 기능을 제거한다.

**Architecture:** localStorage 기반 입력 모드 스토어(`lib/inputMode.js`)를 신설하고, `useExcalidrawTouch.js`의 누적 휴리스틱(크기 팜리젝션·pen-session-lock·pending-discard·warmup)을 순수 판정 함수 `shouldBlockTouchDraw()` 하나로 대체한다. 툴바는 스토어를 직접 구독해 손가락 토글 버튼을 노출하므로 5개 뷰어 호출부는 변경하지 않는다(훅 반환 시그니처 유지).

**Tech Stack:** React 19, Vite 7, Excalidraw 0.18, lucide-react, Vitest (node 환경), localStorage.

---

## File Structure

- **Create** `packages/client/src/lib/inputMode.js` — 입력 모드 스토어 + `shouldBlockTouchDraw` 순수 함수.
- **Create** `packages/client/src/lib/inputMode.test.js` — 스토어·판정 함수 단위 테스트.
- **Modify** `packages/client/src/hooks/useExcalidrawTouch.js` — 휴리스틱 제거, 모드 규칙 + 비파괴 백스톱으로 재작성. 반환 시그니처 유지.
- **Modify** `packages/client/src/components/study/DrawingToolbar.jsx` — 가위(영역삭제) 제거, 손가락 토글 버튼 추가.
- **변경 없음** 5개 뷰어 — 훅 반환 시그니처 유지로 호출부 그대로.

---

## Task 1: 입력 모드 스토어 + 판정 함수

**Files:**
- Create: `packages/client/src/lib/inputMode.js`
- Test: `packages/client/src/lib/inputMode.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/client/src/lib/inputMode.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getInputMode, setInputMode, subscribeInputMode, shouldBlockTouchDraw,
} from './inputMode';

describe('inputMode store', () => {
  beforeEach(() => {
    localStorage.clear();
    setInputMode('stylus');
  });

  it('기본값은 stylus', () => {
    localStorage.clear();
    // 재import 없이도 setInputMode 초기화 후 stylus 유지
    expect(getInputMode()).toBe('stylus');
  });

  it('setInputMode/getInputMode 왕복 + localStorage 반영', () => {
    setInputMode('finger');
    expect(getInputMode()).toBe('finger');
    expect(localStorage.getItem('mc_input_mode')).toBe('finger');
  });

  it('subscribeInputMode 콜백 호출 및 해제', () => {
    const fn = vi.fn();
    const unsub = subscribeInputMode(fn);
    setInputMode('finger');
    expect(fn).toHaveBeenCalledWith('finger');
    unsub();
    setInputMode('stylus');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('shouldBlockTouchDraw', () => {
  it('stylus + freedraw + 1손가락 → 차단', () => {
    expect(shouldBlockTouchDraw('stylus', 'freedraw', 1)).toBe(true);
  });
  it('stylus + freedraw + 2손가락 → 허용(줌)', () => {
    expect(shouldBlockTouchDraw('stylus', 'freedraw', 2)).toBe(false);
  });
  it('stylus + selection + 1손가락 → 허용', () => {
    expect(shouldBlockTouchDraw('stylus', 'selection', 1)).toBe(false);
  });
  it('stylus + eraser + 1손가락 → 허용', () => {
    expect(shouldBlockTouchDraw('stylus', 'eraser', 1)).toBe(false);
  });
  it('finger + freedraw + 1손가락 → 허용', () => {
    expect(shouldBlockTouchDraw('finger', 'freedraw', 1)).toBe(false);
  });
  it('stylus + 도형 도구들 + 1손가락 → 차단', () => {
    for (const t of ['rectangle', 'ellipse', 'triangle', 'line']) {
      expect(shouldBlockTouchDraw('stylus', t, 1)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm run test -w @mathchois/client -- inputMode`
Expected: FAIL — `inputMode` 모듈/함수 미정의.

> 참고: Vitest 기본 환경이 `node`라 `localStorage`가 없다. Step 3 구현은 `localStorage` 미존재 시 메모리 폴백을 포함해 테스트와 런타임 모두 동작하게 한다.

- [ ] **Step 3: 최소 구현**

`packages/client/src/lib/inputMode.js`:

```js
const KEY = 'mc_input_mode';
const VALID = new Set(['stylus', 'finger']);
const DRAW_TOOLS = new Set(['freedraw', 'line', 'rectangle', 'ellipse', 'triangle']);

function load() {
  try {
    const v = localStorage.getItem(KEY);
    return VALID.has(v) ? v : 'stylus';
  } catch { /* localStorage 불가 */ return 'stylus'; }
}

let mode = load();
const listeners = new Set();

export function getInputMode() { return mode; }

export function setInputMode(next) {
  if (!VALID.has(next)) return;
  mode = next;
  try { localStorage.setItem(KEY, next); } catch { /* localStorage 불가 무시 */ }
  listeners.forEach((fn) => fn(mode));
}

export function subscribeInputMode(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 스타일러스 모드에서 단일 손가락 그리기 입력을 차단해야 하는지. */
export function shouldBlockTouchDraw(currentMode, tool, touchCount) {
  return currentMode === 'stylus' && touchCount < 2 && DRAW_TOOLS.has(tool);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm run test -w @mathchois/client -- inputMode`
Expected: PASS (9 tests).

- [ ] **Step 5: 커밋**

```bash
git add packages/client/src/lib/inputMode.js packages/client/src/lib/inputMode.test.js
git commit -m "feat(client): input-mode store + shouldBlockTouchDraw (tested)"
```

---

## Task 2: useExcalidrawTouch 재작성 (휴리스틱 → 모드 규칙)

**Files:**
- Modify: `packages/client/src/hooks/useExcalidrawTouch.js` (전체 재작성)

훅 반환값 `{ isTouchingRef, triggerPalmRejectionWarmup, barrelEraserRef }`와 인자 `{ excalidrawAPIRef, containerRef, screenLockedRef, baseStrokeWidthRef }`는 그대로 유지(5개 뷰어 무변경). `triggerPalmRejectionWarmup`은 no-op로 보존한다.

- [ ] **Step 1: import / ref 정리**

파일 상단 import를 다음으로 교체:

```js
import { useCallback, useEffect, useRef } from 'react';
import { getInputMode, shouldBlockTouchDraw } from '../lib/inputMode';
import { BG_ELEMENT_ID } from '../lib/excalidrawUtils';
```

(`createPendingDiscard`, `getToggles` import 제거.)

훅 본문 상단 ref 선언을 다음으로 교체(제거: `pinch` 외 팜/펜 관련 ref 다수, 추가: 백스톱 ref):

```js
  const isTouchingRef        = useRef(false);
  const pinchStateRef        = useRef(null); // { startDist, startZoom, lastCenterX, lastCenterY }
  const touchPointerIdsRef   = useRef(new Set());
  const isSyntheticUpRef     = useRef(false);
  const barrelEraserRef      = useRef(false);  // S Pen 배럴버튼 지우개 활성 중
  const prevToolRef          = useRef('freedraw');
  const discardTouchIdRef    = useRef(null);   // 백스톱: 차단했으나 새 나갈 수 있는 터치 pointerId
  const discardArmTimeRef    = useRef(0);      // 백스톱 무장 시각
```

- [ ] **Step 2: useEffect 본문 — 차단/백스톱 로직으로 재작성**

`useEffect(() => { ... }, [])` 내부를 아래로 교체. (gesture/contextmenu/2손가락 핀치/screenLocked/배럴버튼은 유지, 팜·펜 휴리스틱은 제거, 모드 규칙·백스톱은 신규.)

```js
    const container = containerRef.current;
    if (!container) return;

    const getActiveTool = () =>
      excalidrawAPIRef.current?.getAppState()?.activeTool?.type;

    container.style.touchAction = 'none';

    const preventGesture = (e) => { e.preventDefault(); };
    container.addEventListener('gesturestart',  preventGesture, { passive: false });
    container.addEventListener('gesturechange', preventGesture, { passive: false });
    container.addEventListener('gestureend',    preventGesture, { passive: false });

    const handleContextMenu = (e) => {
      if (e.target.closest('.excalidraw')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    container.addEventListener('contextmenu', handleContextMenu, { capture: true });

    // 백스톱: 차단한 터치가 그래도 freedraw 를 시작했다면 그 획을 히스토리 오염 없이 제거
    const discardLeakedStroke = () => {
      const api = excalidrawAPIRef.current;
      if (!api) return;
      const armTime = discardArmTimeRef.current;
      const els = api.getSceneElements();
      let newest = null;
      for (const el of els) {
        if (el.type !== 'freedraw' || el.isDeleted || el.id === BG_ELEMENT_ID) continue;
        if ((el.updated || 0) < armTime) continue;
        if (!newest || (el.updated || 0) >= (newest.updated || 0)) newest = el;
      }
      if (newest) {
        api.updateScene({
          elements: els.map((el) => (el.id === newest.id ? { ...el, isDeleted: true } : el)),
          commitToHistory: false,
        });
      }
    };

    const handlePointerDown = (e) => {
      if (!e.target.closest('.excalidraw')) return;

      // S Pen 배럴버튼 등 비주버튼 → 그리기 전달 차단(스크롤 방지)
      if (e.pointerType === 'pen' && e.button !== 0) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (e.pointerType === 'touch') {
        touchPointerIdsRef.current.add(e.pointerId);
        const count = touchPointerIdsRef.current.size;

        // 결정적 모드 규칙: 스타일러스 모드에서 1손가락 그리기 차단
        if (shouldBlockTouchDraw(getInputMode(), getActiveTool(), count)) {
          e.preventDefault();
          e.stopPropagation();
          discardTouchIdRef.current = e.pointerId;
          discardArmTimeRef.current = Date.now();
          return;
        }

        // 화면 고정: 2손가락 이상 Excalidraw 전달 차단
        if (screenLockedRef.current && count >= 2) {
          e.stopPropagation();
          return;
        }

        // freedraw + 2번째 손가락: 진행 중 획 종료(커스텀 핀치 진입)
        if (!screenLockedRef.current && count >= 2 && getActiveTool() === 'freedraw') {
          e.stopPropagation();
          e.preventDefault();
          const firstPointerId = [...touchPointerIdsRef.current].find((id) => id !== e.pointerId);
          if (firstPointerId !== undefined) {
            const canvas = container.querySelector('.excalidraw canvas');
            if (canvas) {
              isSyntheticUpRef.current = true;
              canvas.dispatchEvent(new PointerEvent('pointerup', {
                pointerId: firstPointerId, pointerType: 'touch', bubbles: true, cancelable: true,
              }));
              isSyntheticUpRef.current = false;
            }
          }
        }
      }
    };

    const handlePointerMove = (e) => {
      if (!e.target.closest('.excalidraw')) return;
      if (e.pointerType !== 'touch') return;
      const count = touchPointerIdsRef.current.size;

      if (shouldBlockTouchDraw(getInputMode(), getActiveTool(), count)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (screenLockedRef.current && count >= 2) {
        e.stopPropagation();
        return;
      }
    };

    const handlePointerUp = (e) => {
      if (isSyntheticUpRef.current) return;
      if (e.pointerType === 'pen' && barrelEraserRef.current) {
        barrelEraserRef.current = false;
        excalidrawAPIRef.current?.setActiveTool({ type: prevToolRef.current });
      }
      if (e.pointerType === 'touch') {
        if (discardTouchIdRef.current === e.pointerId) {
          discardTouchIdRef.current = null;
          discardLeakedStroke();
        }
        touchPointerIdsRef.current.delete(e.pointerId);
      }
    };

    const handleTouchStart = (e) => {
      isTouchingRef.current = true;
      if (!e.target.closest('.excalidraw')) return;

      if (shouldBlockTouchDraw(getInputMode(), getActiveTool(), e.touches.length)) {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (screenLockedRef.current && e.touches.length >= 2) {
        e.stopPropagation();
        if (e.cancelable) e.preventDefault();
        return;
      }
      if (!screenLockedRef.current && e.touches.length >= 2 && getActiveTool() === 'freedraw') {
        const t0 = e.touches[0], t1 = e.touches[1];
        const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
        const cx = (t0.clientX + t1.clientX) / 2;
        const cy = (t0.clientY + t1.clientY) / 2;
        const appState = excalidrawAPIRef.current?.getAppState();
        pinchStateRef.current = {
          startDist: dist,
          startZoom: appState?.zoom?.value || 1,
          lastCenterX: cx,
          lastCenterY: cy,
        };
        e.stopPropagation();
        if (e.cancelable) e.preventDefault();
      }
    };

    const handleTouchMove = (e) => {
      if (!e.target.closest('.excalidraw')) return;

      if (shouldBlockTouchDraw(getInputMode(), getActiveTool(), e.touches.length)) {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (screenLockedRef.current && e.touches.length >= 2) {
        e.stopPropagation();
        if (e.cancelable) e.preventDefault();
        return;
      }
      if (!screenLockedRef.current && e.touches.length >= 2 && pinchStateRef.current
          && getActiveTool() === 'freedraw') {
        e.stopPropagation();
        if (e.cancelable) e.preventDefault();
        const t0 = e.touches[0], t1 = e.touches[1];
        const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
        const cx = (t0.clientX + t1.clientX) / 2;
        const cy = (t0.clientY + t1.clientY) / 2;
        const ps = pinchStateRef.current;
        const newZoom = Math.min(Math.max(ps.startZoom * (dist / ps.startDist), 0.1), 10);
        const panDeltaX = cx - ps.lastCenterX;
        const panDeltaY = cy - ps.lastCenterY;
        ps.lastCenterX = cx;
        ps.lastCenterY = cy;
        const excApi = excalidrawAPIRef.current;
        if (excApi) {
          const appState = excApi.getAppState();
          const appStateUpdate = {
            zoom: { value: newZoom },
            scrollX: appState.scrollX + panDeltaX / newZoom,
            scrollY: appState.scrollY + panDeltaY / newZoom,
          };
          if (baseStrokeWidthRef?.current) {
            appStateUpdate.currentItemStrokeWidth = Math.max(baseStrokeWidthRef.current / newZoom, 0.05);
          }
          excApi.updateScene({ appState: appStateUpdate, commitToHistory: false });
        }
      }
    };

    const handleTouchEnd = (e) => {
      if (e.touches.length === 0) isTouchingRef.current = false;
      if (e.touches.length < 2) pinchStateRef.current = null;
    };

    container.addEventListener('pointerdown',   handlePointerDown,  { capture: true, passive: false });
    container.addEventListener('pointermove',   handlePointerMove,  { capture: true, passive: false });
    container.addEventListener('pointerup',     handlePointerUp,    { capture: true, passive: true });
    container.addEventListener('pointercancel', handlePointerUp,    { capture: true, passive: true });
    container.addEventListener('touchstart',    handleTouchStart,   { capture: true, passive: false });
    container.addEventListener('touchmove',     handleTouchMove,    { capture: true, passive: false });
    container.addEventListener('touchend',      handleTouchEnd,     { capture: true, passive: true });
    container.addEventListener('touchcancel',   handleTouchEnd,     { capture: true, passive: true });

    return () => {
      container.style.touchAction = '';
      container.removeEventListener('contextmenu',   handleContextMenu, { capture: true });
      container.removeEventListener('gesturestart',  preventGesture);
      container.removeEventListener('gesturechange', preventGesture);
      container.removeEventListener('gestureend',    preventGesture);
      container.removeEventListener('pointerdown',   handlePointerDown, { capture: true });
      container.removeEventListener('pointermove',   handlePointerMove, { capture: true });
      container.removeEventListener('pointerup',     handlePointerUp,   { capture: true });
      container.removeEventListener('pointercancel', handlePointerUp,   { capture: true });
      container.removeEventListener('touchstart',    handleTouchStart,  { capture: true });
      container.removeEventListener('touchmove',     handleTouchMove,   { capture: true });
      container.removeEventListener('touchend',      handleTouchEnd,    { capture: true });
      container.removeEventListener('touchcancel',   handleTouchEnd,    { capture: true });
    };
```

> 주: S Pen 배럴버튼으로 지우개를 토글하는 기존 동작은 `e.button !== 0` 분기에서 전달만 차단한다. 배럴버튼→지우개 전환 자체가 별도 코드(예: 뷰어/다른 핸들러)에서 `barrelEraserRef`/`prevToolRef`를 세팅하던 구조가 아니면, 본 재작성은 "배럴버튼 입력이 그리기로 새지 않게" 하는 현행 효과를 유지한다. 추가 전환 로직은 본 작업 범위 밖.

- [ ] **Step 3: 반환부 유지(no-op warmup)**

useEffect 뒤 반환 코드를 다음으로 교체:

```js
  const triggerPalmRejectionWarmup = useCallback(() => {}, []);

  return { isTouchingRef, triggerPalmRejectionWarmup, barrelEraserRef };
}
```

- [ ] **Step 4: 빌드/린트 확인**

Run: `npm run lint -w @mathchois/client`
Expected: 신규/수정 파일에 새 에러 없음(기존 타 파일 에러는 무관).

Run: `npm run build`
Expected: shared → client → server 빌드 성공.

- [ ] **Step 5: 커밋**

```bash
git add packages/client/src/hooks/useExcalidrawTouch.js
git commit -m "feat(client): replace palm-rejection heuristics with deterministic input-mode gate"
```

---

## Task 3: DrawingToolbar — 가위 제거 + 손가락 토글 추가

**Files:**
- Modify: `packages/client/src/components/study/DrawingToolbar.jsx`

- [ ] **Step 1: import 갱신**

lucide import에서 `Scissors` 제거, `Pointer` 추가. 상단 store import 추가:

```js
import {
  MousePointer, Pen, Type, Square, Circle, Triangle,
  Eraser, Minus, Trash2, Pipette, Plus,
  SlidersHorizontal, Hand, Shapes, ChevronDown, ImagePlus, Dot,
  Lock, Unlock, RefreshCw, Undo2, Redo2, Pointer,
} from 'lucide-react';
import { getInputMode, setInputMode, subscribeInputMode } from '../../lib/inputMode';
```

- [ ] **Step 2: 입력 모드 상태 + 토글 핸들러 추가**

컴포넌트 상단 상태 선언부(`const [imageMoveMode, ...]` 부근)에 추가:

```js
  const [inputMode, setInputModeState] = useState(() => getInputMode());
  useEffect(() => subscribeInputMode(setInputModeState), []);
```

`handleToggleImageMove` 함수 정의 근처에 추가:

```js
  const handleToggleInputMode = () => {
    setInputMode(inputMode === 'stylus' ? 'finger' : 'stylus');
  };
```

- [ ] **Step 3: `applyTool` / `applyColor`에서 `eraser_area` 제거**

`applyTool` 내부의 다음 분기를 삭제:

```js
    } else if (type === 'eraser_area') {
      api?.setActiveTool({ type: 'selection' });
```

→ 삭제 후 해당 else-if 묶음은 `laser_pointer`와 기본(`else`)만 남긴다:

```js
    if (type === 'laser_pointer') {
      api?.setActiveTool({ type: 'selection' });
    } else {
      api?.setActiveTool({ type });
    }
```

`applyColor` 내부 조건에서 `'eraser_area'` 제거:

```js
    if (['eraser', 'selection', 'image_move'].includes(activeTool)) {
```

- [ ] **Step 4: `handleDeleteSelected` 함수 삭제**

`handleDeleteSelected` 함수 전체(정의 블록)를 제거한다.

- [ ] **Step 5: 가위 버튼 + 동반 휴지통 버튼 JSX 제거**

다음 두 블록을 삭제:

```jsx
      {/* 영역 삭제 */}
      <button onClick={() => applyTool('eraser_area')} title="영역 삭제 — 드래그 선택 후 삭제"
        className={`p-1.5 rounded-md transition-colors cursor-pointer ${
          activeTool === 'eraser_area' ? 'bg-orange-100 text-orange-600' : 'text-gray-600 hover:bg-gray-100'
        }`}>
        <Scissors className="h-4 w-4" />
      </button>

      {activeTool === 'eraser_area' && (
        <button onClick={handleDeleteSelected} title="선택 삭제"
          className="p-1.5 rounded-md bg-orange-500 text-white hover:bg-orange-600 cursor-pointer flex-shrink-0 flex items-center justify-center">
          <Trash2 className="h-4 w-4" />
        </button>
      )}
```

- [ ] **Step 6: 손가락 모드 토글 버튼 추가**

지우개(획 단위) 버튼 바로 다음(삭제한 가위 버튼 자리)에 추가:

```jsx
      {/* 손가락 필기 모드 토글 */}
      <button onClick={handleToggleInputMode}
        title={inputMode === 'finger'
          ? '손가락 필기 끄기 (현재: 손가락 허용)'
          : '손가락 필기 켜기 (현재: 스타일러스 전용)'}
        className={`p-1.5 rounded-md transition-colors cursor-pointer flex-shrink-0 ${
          inputMode === 'finger' ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:bg-gray-100'
        }`}>
        <Pointer className="h-4 w-4" />
      </button>
```

- [ ] **Step 7: 린트/빌드 확인**

Run: `npm run lint -w @mathchois/client`
Expected: `Scissors`/`handleDeleteSelected` 미사용 에러 없음(모두 제거됨), 신규 에러 없음.

Run: `npm run build`
Expected: 빌드 성공.

- [ ] **Step 8: 커밋**

```bash
git add packages/client/src/components/study/DrawingToolbar.jsx
git commit -m "feat(client): finger-mode toggle button; remove area-erase (scissors)"
```

---

## Task 4: 전체 검증 + 푸시

**Files:** 없음(검증 전용)

- [ ] **Step 1: 전체 테스트**

Run: `npm run test -w @mathchois/client`
Expected: 기존 테스트 + inputMode 테스트 모두 PASS.

- [ ] **Step 2: 전체 빌드**

Run: `npm run build`
Expected: 성공.

- [ ] **Step 3: 푸시**

```bash
git push
```

- [ ] **Step 4: 기기 검증 체크리스트(Railway 배포 후, 수동)**

- 스타일러스 모드(기본): 손바닥 먼저 + 펜 급하강 → 연결선 0, 펜 필기 정상.
- 두 손가락 → 확대/축소·이동 동작(양쪽 모드).
- 손가락 모드 토글 → 한 손가락 필기 동작.
- 다시 스타일러스 토글 → 한 손가락 필기 차단.
- 새로고침/다른 필기창 이동 후 모드 유지(localStorage).
- 가위(영역삭제) 버튼이 사라졌는지 확인.

---

## Self-Review 결과

- **Spec coverage:** §1 스토어→Task1, §2 판정함수→Task1, §3 훅 재작성→Task2, §4 툴바(가위제거+토글)→Task3, §5 테스트→Task1, §6 기기검증→Task4. 누락 없음.
- **Placeholder scan:** TBD/TODO/추후구현 없음. 모든 코드 스텝에 실제 코드 포함.
- **Type consistency:** `getInputMode/setInputMode/subscribeInputMode/shouldBlockTouchDraw` 시그니처가 Task1 정의와 Task2·Task3 사용처에서 일치. 훅 반환 `{ isTouchingRef, triggerPalmRejectionWarmup, barrelEraserRef }`가 기존 뷰어 호출부와 일치.
