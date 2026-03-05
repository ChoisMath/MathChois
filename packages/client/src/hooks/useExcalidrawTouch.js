import { useEffect, useRef } from 'react';

/**
 * Excalidraw 터치/제스처 제어 훅
 *
 * - 비펜 도구: 핀치줌 + 상하좌우 팬 허용 (Excalidraw 자체 처리)
 * - 펜(freedraw) 도구: 줌/수평이동 차단, 2핑거 세로 스크롤만 허용
 * - 팜 리젝션: 큰 터치 반경(>25px) 무시
 * - Safari gesture 이벤트 차단: iPad 화면 점프 방지
 *
 * @param {{ excalidrawAPIRef: React.RefObject, containerRef: React.RefObject, activeToolRef: React.RefObject }} opts
 * @returns {{ isTouchingRef: React.RefObject, lastZoomRef: React.RefObject, lastScrollXRef: React.RefObject }}
 */
export function useExcalidrawTouch({ excalidrawAPIRef, containerRef, activeToolRef }) {
  const isTouchingRef       = useRef(false);
  const lastZoomRef         = useRef(1);
  const lastScrollXRef      = useRef(0);
  const activeTouchesRef    = useRef(0);
  const lastTouchCenterYRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    /* ── 1. 컨테이너에 touch-action: none 설정 ── */
    container.style.touchAction = 'none';

    /* ── 2. Safari gesture 이벤트 방지 ── */
    const preventGesture = (e) => {
      e.preventDefault();
    };

    container.addEventListener('gesturestart',  preventGesture, { passive: false });
    container.addEventListener('gesturechange', preventGesture, { passive: false });
    container.addEventListener('gestureend',    preventGesture, { passive: false });

    /* ── 3. 팜 리젝션 (pointer 이벤트) ── */
    const handlePointerDown = (e) => {
      const isExcalidraw = e.target.closest('.excalidraw');
      if (!isExcalidraw) return;
      if (e.pointerType === 'touch' && (e.width > 25 || e.height > 25)) {
        e.preventDefault();
        // freedraw 모드에서만 stopPropagation — 비펜 모드에서는 Excalidraw에 이벤트 전달
        if (activeToolRef.current === 'freedraw') {
          e.stopPropagation();
        }
      }
    };

    const handlePointerMove = (e) => {
      const isExcalidraw = e.target.closest('.excalidraw');
      if (!isExcalidraw) return;
      if (e.pointerType === 'touch') {
        if (e.width > 25 || e.height > 25) {
          e.preventDefault();
          if (activeToolRef.current === 'freedraw') {
            e.stopPropagation();
          }
          return;
        }
        // freedraw 모드 2핑거: Excalidraw 내부 핀치줌/팬 차단
        if (activeTouchesRef.current >= 2 && activeToolRef.current === 'freedraw') {
          e.stopPropagation();
        }
      }
    };

    /* ── 4. 터치 이벤트 (팜 리젝션 + freedraw 2핑거 하이재킹) ── */
    const handleTouchStart = (e) => {
      activeTouchesRef.current = e.touches.length;
      isTouchingRef.current = true;
      const isExcalidraw = e.target.closest('.excalidraw');
      if (!isExcalidraw) return;

      // 팜 리젝션
      let isPalm = false;
      for (let i = 0; i < e.touches.length; i++) {
        if (e.touches[i].radiusX > 25 || e.touches[i].radiusY > 25) {
          isPalm = true; break;
        }
      }
      if (isPalm) {
        if (e.cancelable) e.preventDefault();
        if (activeToolRef.current === 'freedraw') {
          e.stopPropagation();
        }
        return;
      }

      // freedraw 2핑거 시작: 세로 스크롤 하이재킹 준비
      if (activeToolRef.current === 'freedraw' && e.touches.length === 2) {
        lastTouchCenterYRef.current = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      } else {
        lastTouchCenterYRef.current = null;
      }
    };

    const handleTouchMove = (e) => {
      activeTouchesRef.current = e.touches.length;
      const isExcalidraw = e.target.closest('.excalidraw');
      if (!isExcalidraw) return;

      // 팜 리젝션
      let isPalm = false;
      for (let i = 0; i < e.touches.length; i++) {
        if (e.touches[i].radiusX > 25 || e.touches[i].radiusY > 25) {
          isPalm = true; break;
        }
      }
      if (isPalm) {
        if (e.cancelable) e.preventDefault();
        if (activeToolRef.current === 'freedraw') {
          e.stopPropagation();
        }
        return;
      }

      // freedraw 모드 2핑거 패닝 하이재킹 (수직 스크롤만 허용)
      if (activeToolRef.current === 'freedraw' && e.touches.length === 2) {
        e.stopPropagation();
        if (e.cancelable) e.preventDefault();

        const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        if (lastTouchCenterYRef.current !== null) {
          const deltaY = centerY - lastTouchCenterYRef.current;
          const excApi = excalidrawAPIRef.current;
          if (excApi) {
            const appState = excApi.getAppState();
            excApi.updateScene({
              appState: { scrollY: appState.scrollY + (deltaY / appState.zoom.value) }
            });
          }
        }
        lastTouchCenterYRef.current = centerY;
      }
    };

    const handleTouchEnd = (e) => {
      activeTouchesRef.current = e.touches.length;
      if (e.touches.length === 0) isTouchingRef.current = false;
      if (e.touches.length < 2) lastTouchCenterYRef.current = null;
    };

    /* ── 5. 이벤트 등록 (컨테이너 캡처 단계) ── */
    container.addEventListener('pointerdown',  handlePointerDown,  { capture: true, passive: false });
    container.addEventListener('pointermove',  handlePointerMove,  { capture: true, passive: false });
    container.addEventListener('touchstart',   handleTouchStart,   { capture: true, passive: false });
    container.addEventListener('touchmove',    handleTouchMove,    { capture: true, passive: false });
    container.addEventListener('touchend',     handleTouchEnd,     { capture: true, passive: true });
    container.addEventListener('touchcancel',  handleTouchEnd,     { capture: true, passive: true });

    return () => {
      container.style.touchAction = '';
      container.removeEventListener('gesturestart',  preventGesture);
      container.removeEventListener('gesturechange', preventGesture);
      container.removeEventListener('gestureend',    preventGesture);
      container.removeEventListener('pointerdown',   handlePointerDown, { capture: true });
      container.removeEventListener('pointermove',   handlePointerMove, { capture: true });
      container.removeEventListener('touchstart',    handleTouchStart,  { capture: true });
      container.removeEventListener('touchmove',     handleTouchMove,   { capture: true });
      container.removeEventListener('touchend',      handleTouchEnd,    { capture: true });
      container.removeEventListener('touchcancel',   handleTouchEnd,    { capture: true });
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { isTouchingRef, lastZoomRef, lastScrollXRef };
}
