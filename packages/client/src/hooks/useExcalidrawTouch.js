import { useCallback, useEffect, useRef } from 'react';
import { getInputMode, shouldBlockTouchDraw } from '../lib/inputMode';
import { BG_ELEMENT_ID } from '../lib/excalidrawUtils';

/**
 * Excalidraw 터치/제스처 제어 훅
 *
 * 입력 모드(스타일러스/손가락)로 그리기 입력을 결정적으로 게이트한다.
 * - 스타일러스 모드: 단일 손가락 + 그리기 도구 → 차단(손바닥 연결선 원천 차단)
 * - 두 손가락: 커스텀 핀치줌 + 팬 (freedraw)
 * - screenLocked=true: 2손가락 이상 줌/팬 차단
 * - S Pen 배럴버튼: 그리기 전달 차단
 * - baseStrokeWidthRef: 줌-독립 펜 두께 (핀치줌 시 자동 보정)
 *
 * 차단 리스너는 window 캡처에 부착한다. React 19 는 이벤트를 앱 루트(#root)에 위임하는데
 * #root 가 container 의 상위라, container 캡처는 React 가 Excalidraw 핸들러를 디스패치한 뒤에야
 * 실행되어 stopPropagation 이 늦는다. window 캡처는 #root 보다 먼저 실행되어 실제로 차단된다.
 * 또한 window 리스너는 container 마운트 여부와 무관하게 즉시 부착해야 한다 — 뷰어가 로딩 중
 * 스피너만 렌더하는 동안 마운트되면 containerRef.current 가 null 이라, 과거처럼 container 기준으로
 * 부착하면 영영 등록되지 않는다. container 의존 설정만 rAF 로 container 마운트까지 기다린다.
 *
 * @param {{ excalidrawAPIRef: React.RefObject, containerRef: React.RefObject, screenLockedRef: React.RefObject, baseStrokeWidthRef?: React.RefObject }} opts
 */
export function useExcalidrawTouch({ excalidrawAPIRef, containerRef, screenLockedRef, baseStrokeWidthRef }) {
  const isTouchingRef        = useRef(false);
  const pinchStateRef        = useRef(null); // { startDist, startZoom, lastCenterX, lastCenterY }
  const touchPointerIdsRef   = useRef(new Set());
  const isSyntheticUpRef     = useRef(false);
  const barrelEraserRef      = useRef(false);  // S Pen 배럴버튼 지우개 활성 중
  const prevToolRef          = useRef('freedraw');
  const discardTouchIdRef    = useRef(null);   // 백스톱: 차단했으나 샐 수 있는 터치 pointerId
  const discardArmTimeRef    = useRef(0);      // 백스톱 무장 시각

  useEffect(() => {
    const getActiveTool = () =>
      excalidrawAPIRef.current?.getAppState()?.activeTool?.type;

    const preventGesture = (e) => { e.preventDefault(); };

    const handleContextMenu = (e) => {
      if (e.target.closest?.('.excalidraw')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    // 백스톱: 차단한 터치가 그래도 freedraw 를 시작했다면 그 획을 히스토리 오염 없이 제거.
    // Excalidraw 의 stroke 커밋은 React 배치 렌더 이후에 settle 되므로(삼각형 변환 코드와 동일),
    // pointerup 시점에 동기 삭제하면 커밋에 덮인다 → 호출부에서 setTimeout 으로 지연 실행한다.
    const discardLeakedStroke = (armTime) => {
      const api = excalidrawAPIRef.current;
      if (!api) return;
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
      if (!e.target.closest?.('.excalidraw')) return;

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
            const canvas = containerRef.current?.querySelector('.excalidraw canvas');
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
      if (!e.target.closest?.('.excalidraw')) return;
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
      // 핀치 진행 중 freedraw 로 새지 않도록 pointermove 전파 차단 (커스텀 핀치는 touchmove 가 처리)
      if (!screenLockedRef.current && count >= 2 && getActiveTool() === 'freedraw') {
        e.stopPropagation();
        e.preventDefault();
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
          const armTime = discardArmTimeRef.current;
          setTimeout(() => discardLeakedStroke(armTime), 80);
        }
        touchPointerIdsRef.current.delete(e.pointerId);
      }
    };

    const handleTouchStart = (e) => {
      isTouchingRef.current = true;
      if (!e.target.closest?.('.excalidraw')) return;

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
      if (!e.target.closest?.('.excalidraw')) return;

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

    // window 캡처 리스너 — container 마운트 여부와 무관하게 즉시 부착
    window.addEventListener('pointerdown',   handlePointerDown,  { capture: true, passive: false });
    window.addEventListener('pointermove',   handlePointerMove,  { capture: true, passive: false });
    window.addEventListener('pointerup',     handlePointerUp,    { capture: true, passive: true });
    window.addEventListener('pointercancel', handlePointerUp,    { capture: true, passive: true });
    window.addEventListener('touchstart',    handleTouchStart,   { capture: true, passive: false });
    window.addEventListener('touchmove',     handleTouchMove,    { capture: true, passive: false });
    window.addEventListener('touchend',      handleTouchEnd,     { capture: true, passive: true });
    window.addEventListener('touchcancel',   handleTouchEnd,     { capture: true, passive: true });

    // container 의존 설정 — 뷰어가 로딩 스피너를 먼저 렌더하므로 container 가 마운트될 때까지 rAF 로 대기
    let rafId = 0;
    let boundContainer = null;
    const setupContainer = () => {
      const container = containerRef.current;
      if (!container) { rafId = requestAnimationFrame(setupContainer); return; }
      boundContainer = container;
      container.style.touchAction = 'none';
      container.addEventListener('gesturestart',  preventGesture, { passive: false });
      container.addEventListener('gesturechange', preventGesture, { passive: false });
      container.addEventListener('gestureend',    preventGesture, { passive: false });
      container.addEventListener('contextmenu',   handleContextMenu, { capture: true });
    };
    setupContainer();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('pointerdown',   handlePointerDown, { capture: true });
      window.removeEventListener('pointermove',   handlePointerMove, { capture: true });
      window.removeEventListener('pointerup',     handlePointerUp,   { capture: true });
      window.removeEventListener('pointercancel', handlePointerUp,   { capture: true });
      window.removeEventListener('touchstart',    handleTouchStart,  { capture: true });
      window.removeEventListener('touchmove',     handleTouchMove,   { capture: true });
      window.removeEventListener('touchend',      handleTouchEnd,    { capture: true });
      window.removeEventListener('touchcancel',   handleTouchEnd,    { capture: true });
      if (boundContainer) {
        boundContainer.style.touchAction = '';
        boundContainer.removeEventListener('contextmenu',   handleContextMenu, { capture: true });
        boundContainer.removeEventListener('gesturestart',  preventGesture);
        boundContainer.removeEventListener('gesturechange', preventGesture);
        boundContainer.removeEventListener('gestureend',    preventGesture);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const triggerPalmRejectionWarmup = useCallback(() => {}, []);

  return { isTouchingRef, triggerPalmRejectionWarmup, barrelEraserRef };
}
