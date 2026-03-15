import { useCallback, useEffect, useRef } from 'react';

/**
 * Excalidraw 터치/제스처 제어 훅
 *
 * - 팜 리젝션: 큰 터치 반경(>25px) 무시
 * - Safari gesture 이벤트 차단: iPad 화면 점프 방지
 * - freedraw 모드: 2손가락 커스텀 pinch-zoom + pan (Excalidraw가 터치를 그리기로 소비하므로)
 * - 비 freedraw 모드: Excalidraw 네이티브 zoom/pan 유지
 * - screenLocked=true: 모든 줌/팬 차단
 * - baseStrokeWidthRef: 줌-독립 펜 두께 (핀치줌 시 자동 보정)
 *
 * @param {{ excalidrawAPIRef: React.RefObject, containerRef: React.RefObject, screenLockedRef: React.RefObject, baseStrokeWidthRef?: React.RefObject }} opts
 */
export function useExcalidrawTouch({ excalidrawAPIRef, containerRef, screenLockedRef, baseStrokeWidthRef }) {
  const isTouchingRef        = useRef(false);
  const activeTouchesRef     = useRef(0);
  const pinchStateRef        = useRef(null); // { startDist, startZoom, lastCenterX, lastCenterY }
  const touchPointerIdsRef   = useRef(new Set()); // pointer ID 기반 즉시 추적
  const isSyntheticUpRef     = useRef(false); // synthetic pointerup 디스패치 시 자체 핸들러 무시용
  const penLastTimeRef       = useRef(0);      // 마지막 스타일러스 이벤트 시각 (0=미감지)
  const drawModeWarmupRef    = useRef(0);      // 드로우 모드 전환 warmup 시각

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    /* ── 헬퍼: 현재 활성 도구 확인 ── */
    const getActiveTool = () =>
      excalidrawAPIRef.current?.getAppState()?.activeTool?.type;

    /* ── 1. 컨테이너에 touch-action: none 설정 ── */
    container.style.touchAction = 'none';

    /* ── 2. Safari gesture 이벤트 방지 ── */
    const preventGesture = (e) => {
      e.preventDefault();
    };

    container.addEventListener('gesturestart',  preventGesture, { passive: false });
    container.addEventListener('gesturechange', preventGesture, { passive: false });
    container.addEventListener('gestureend',    preventGesture, { passive: false });

    /* ── 3. 팜 리젝션 + freedraw 2손가락 차단 (pointer 이벤트) ── */
    const handlePointerDown = (e) => {
      const isExcalidraw = e.target.closest('.excalidraw');
      if (!isExcalidraw) return;

      // 스타일러스(펜) 이벤트 시각 갱신
      if (e.pointerType === 'pen') {
        penLastTimeRef.current = Date.now();
      }

      // pointer ID 기반 즉시 추적 (touchstart보다 먼저 발생)
      if (e.pointerType === 'touch') {
        touchPointerIdsRef.current.add(e.pointerId);
      }

      // 펜 우선 팜 리젝션: 최근 500ms 내 펜 사용 시 단일 touch 차단
      // (2손가락 핀치줌은 아래 로직에서 별도 처리되므로 통과시킴)
      if (e.pointerType === 'touch' && penLastTimeRef.current > 0
          && Date.now() - penLastTimeRef.current < 500) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // 드로우 모드 warmup: 모드 전환 후 300ms 내 touch 차단
      if (e.pointerType === 'touch' && drawModeWarmupRef.current > 0
          && Date.now() - drawModeWarmupRef.current < 300) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // 팜 리젝션 (크기 기반 — 비 스타일러스 기기용)
      if (e.pointerType === 'touch' && (e.width > 25 || e.height > 25)) {
        e.preventDefault();
        if (screenLockedRef.current) e.stopPropagation();
      }

      // 화면 고정 모드: 2핑거 이상 → Excalidraw에 전달 차단
      if (screenLockedRef.current && e.pointerType === 'touch' && touchPointerIdsRef.current.size >= 2) {
        e.stopPropagation();
        return;
      }

      // freedraw + 2번째 손가락 도착: pointer event 즉시 차단 + 진행 중 획 종료
      if (!screenLockedRef.current && e.pointerType === 'touch' && touchPointerIdsRef.current.size >= 2) {
        const tool = getActiveTool();
        if (tool === 'freedraw') {
          e.stopPropagation();
          e.preventDefault();

          // 1번째 손가락에 대한 synthetic pointerup → 진행 중 freedraw 획 종료
          const firstPointerId = [...touchPointerIdsRef.current].find(id => id !== e.pointerId);
          if (firstPointerId !== undefined) {
            const canvas = container.querySelector('.excalidraw canvas');
            if (canvas) {
              const syntheticUp = new PointerEvent('pointerup', {
                pointerId: firstPointerId,
                pointerType: 'touch',
                bubbles: true,
                cancelable: true,
              });
              // 자체 handlePointerUp이 pointer ID를 제거하지 않도록 플래그 설정
              isSyntheticUpRef.current = true;
              canvas.dispatchEvent(syntheticUp);
              isSyntheticUpRef.current = false;
            }
          }
        }
      }
    };

    const handlePointerMove = (e) => {
      const isExcalidraw = e.target.closest('.excalidraw');
      if (!isExcalidraw) return;
      // 펜 pointermove: 실제 터치(pressure > 0)일 때만 시각 갱신 (호버 제외)
      if (e.pointerType === 'pen' && e.pressure > 0) {
        penLastTimeRef.current = Date.now();
      }
      if (e.pointerType === 'touch') {
        // 펜 우선 팜 리젝션 (시간 기반)
        if (penLastTimeRef.current > 0 && Date.now() - penLastTimeRef.current < 500) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        // 드로우 모드 warmup
        if (drawModeWarmupRef.current > 0 && Date.now() - drawModeWarmupRef.current < 300) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        // 팜 리젝션 (크기 기반)
        if (e.width > 25 || e.height > 25) {
          e.preventDefault();
          if (screenLockedRef.current) e.stopPropagation();
          return;
        }

        // 화면 고정 모드: 2핑거 이상 → Excalidraw에 전달 차단
        if (screenLockedRef.current && touchPointerIdsRef.current.size >= 2) {
          e.stopPropagation();
          return;
        }

        // freedraw + 2손가락: pointer event 차단
        if (!screenLockedRef.current && touchPointerIdsRef.current.size >= 2) {
          const tool = getActiveTool();
          if (tool === 'freedraw') {
            e.stopPropagation();
            e.preventDefault();
          }
        }
      }
    };

    /* ── pointer 해제 추적 ── */
    const handlePointerUp = (e) => {
      if (isSyntheticUpRef.current) return; // synthetic pointerup은 pointer ID 유지
      if (e.pointerType === 'touch') {
        touchPointerIdsRef.current.delete(e.pointerId);
      }
    };

    /* ── 4. 터치 이벤트 (팜 리젝션 + freedraw pinch-zoom/pan) ── */
    const handleTouchStart = (e) => {
      activeTouchesRef.current = e.touches.length;
      isTouchingRef.current = true;
      const isExcalidraw = e.target.closest('.excalidraw');
      if (!isExcalidraw) return;

      // 펜 우선 팜 리젝션 (시간 기반, 단일 터치만 — 2손가락 핀치줌 허용)
      if (penLastTimeRef.current > 0 && Date.now() - penLastTimeRef.current < 500
          && e.touches.length < 2) {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        return;
      }
      // 드로우 모드 warmup (단일 터치만)
      if (drawModeWarmupRef.current > 0 && Date.now() - drawModeWarmupRef.current < 300
          && e.touches.length < 2) {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        return;
      }

      // 팜 리젝션 (크기 기반, 단일 터치에만 적용 — 2손가락 이상은 핀치줌으로 처리)
      if (e.touches.length < 2) {
        let isPalm = false;
        for (let i = 0; i < e.touches.length; i++) {
          if (e.touches[i].radiusX > 25 || e.touches[i].radiusY > 25) {
            isPalm = true; break;
          }
        }
        if (isPalm) {
          if (e.cancelable) e.preventDefault();
          if (screenLockedRef.current) e.stopPropagation();
          return;
        }
      }

      // 화면 고정 모드: 2핑거 이상 차단
      if (screenLockedRef.current && e.touches.length >= 2) {
        e.stopPropagation();
        if (e.cancelable) e.preventDefault();
        return;
      }

      // freedraw + 2손가락: pinch 상태 초기화
      if (!screenLockedRef.current && e.touches.length >= 2) {
        const tool = getActiveTool();
        if (tool === 'freedraw') {
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
      }
    };

    const handleTouchMove = (e) => {
      activeTouchesRef.current = e.touches.length;
      const isExcalidraw = e.target.closest('.excalidraw');
      if (!isExcalidraw) return;

      // 펜 우선 팜 리젝션 (시간 기반, 단일 터치만 — 2손가락 핀치줌 허용)
      if (penLastTimeRef.current > 0 && Date.now() - penLastTimeRef.current < 500
          && e.touches.length < 2) {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        return;
      }
      // 드로우 모드 warmup (단일 터치만)
      if (drawModeWarmupRef.current > 0 && Date.now() - drawModeWarmupRef.current < 300
          && e.touches.length < 2) {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        return;
      }

      // 팜 리젝션 (크기 기반, 단일 터치에만 적용)
      if (e.touches.length < 2) {
        let isPalm = false;
        for (let i = 0; i < e.touches.length; i++) {
          if (e.touches[i].radiusX > 25 || e.touches[i].radiusY > 25) {
            isPalm = true; break;
          }
        }
        if (isPalm) {
          if (e.cancelable) e.preventDefault();
          if (screenLockedRef.current) e.stopPropagation();
          return;
        }
      }

      // 화면 고정 모드: 2핑거 이상 차단
      if (screenLockedRef.current && e.touches.length >= 2) {
        e.stopPropagation();
        if (e.cancelable) e.preventDefault();
        return;
      }

      // freedraw + 2손가락: 커스텀 pinch-zoom + pan
      if (!screenLockedRef.current && e.touches.length >= 2 && pinchStateRef.current) {
        const tool = getActiveTool();
        if (tool === 'freedraw') {
          e.stopPropagation();
          if (e.cancelable) e.preventDefault();

          const t0 = e.touches[0], t1 = e.touches[1];
          const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
          const cx = (t0.clientX + t1.clientX) / 2;
          const cy = (t0.clientY + t1.clientY) / 2;
          const ps = pinchStateRef.current;

          // zoom: 초기 거리 대비 현재 거리 비율
          const zoomFactor = dist / ps.startDist;
          const newZoom = Math.min(Math.max(ps.startZoom * zoomFactor, 0.1), 10);

          // pan: 중심점 이동량
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
            // 줌-독립 펜 두께: 핀치줌 시 자동 보정
            if (baseStrokeWidthRef?.current) {
              appStateUpdate.currentItemStrokeWidth = baseStrokeWidthRef.current / newZoom;
            }
            excApi.updateScene({ appState: appStateUpdate, commitToHistory: false });
          }
        }
      }
    };

    const handleTouchEnd = (e) => {
      activeTouchesRef.current = e.touches.length;
      if (e.touches.length === 0) isTouchingRef.current = false;
      if (e.touches.length < 2) pinchStateRef.current = null;
    };

    /* ── 5. 이벤트 등록 (컨테이너 캡처 단계) ── */
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const triggerPalmRejectionWarmup = useCallback(() => {
    drawModeWarmupRef.current = Date.now();
  }, []);

  return { isTouchingRef, triggerPalmRejectionWarmup };
}
