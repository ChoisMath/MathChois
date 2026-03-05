import { useEffect, useRef } from 'react';

/**
 * Excalidraw 터치/제스처 제어 훅
 *
 * - 팜 리젝션: 큰 터치 반경(>25px) 무시
 * - Safari gesture 이벤트 차단: iPad 화면 점프 방지
 * - screenLocked=false: 모든 도구에서 핀치줌/팬 자유 (Excalidraw 자체 처리)
 * - screenLocked=true: 2핑거 이상 터치 차단 → 필기만 가능
 *
 * @param {{ excalidrawAPIRef: React.RefObject, containerRef: React.RefObject, screenLockedRef: React.RefObject }} opts
 */
export function useExcalidrawTouch({ excalidrawAPIRef, containerRef, screenLockedRef }) {
  const isTouchingRef    = useRef(false);
  const activeTouchesRef = useRef(0);

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
        e.stopPropagation();
      }
      // 화면 고정 모드: 2핑거 이상 → Excalidraw에 전달 차단
      if (screenLockedRef.current && e.pointerType === 'touch' && activeTouchesRef.current >= 2) {
        e.stopPropagation();
      }
    };

    const handlePointerMove = (e) => {
      const isExcalidraw = e.target.closest('.excalidraw');
      if (!isExcalidraw) return;
      if (e.pointerType === 'touch') {
        if (e.width > 25 || e.height > 25) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        // 화면 고정 모드: 2핑거 이상 → Excalidraw에 전달 차단
        if (screenLockedRef.current && activeTouchesRef.current >= 2) {
          e.stopPropagation();
        }
      }
    };

    /* ── 4. 터치 이벤트 (팜 리젝션 + 화면 고정) ── */
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
        e.stopPropagation();
        return;
      }

      // 화면 고정 모드: 2핑거 이상 차단
      if (screenLockedRef.current && e.touches.length >= 2) {
        e.stopPropagation();
        if (e.cancelable) e.preventDefault();
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
        e.stopPropagation();
        return;
      }

      // 화면 고정 모드: 2핑거 이상 차단
      if (screenLockedRef.current && e.touches.length >= 2) {
        e.stopPropagation();
        if (e.cancelable) e.preventDefault();
      }
    };

    const handleTouchEnd = (e) => {
      activeTouchesRef.current = e.touches.length;
      if (e.touches.length === 0) isTouchingRef.current = false;
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

  return { isTouchingRef };
}
