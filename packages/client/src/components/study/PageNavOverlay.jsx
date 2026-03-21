import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useRef, useCallback } from 'react';

/**
 * 페이지 이동 오버레이 — 화면 양쪽 가장자리에 반투명 이전/다음 버튼
 *
 * tap 전용: pointerdown→pointerup 이동 거리 <10px일 때만 반응 (필기/드래그는 통과)
 */
export default function PageNavOverlay({ onPrev, onNext, hasPrev, hasNext }) {
  const startRef = useRef(null);

  const handlePointerDown = useCallback((e) => {
    startRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const createPointerUp = useCallback((cb) => (e) => {
    if (!startRef.current) return;
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    startRef.current = null;
    if (Math.hypot(dx, dy) < 10) cb();
  }, []);

  return (
    <>
      {hasPrev && (
        <div
          onPointerDown={handlePointerDown}
          onPointerUp={createPointerUp(onPrev)}
          className="absolute left-0 top-1/4 h-1/2 w-10 z-30 flex items-center justify-center
            opacity-15 hover:opacity-50 active:opacity-50 transition-opacity cursor-pointer select-none"
          aria-label="이전 페이지"
        >
          <ChevronLeft className="h-6 w-6 text-gray-600" />
        </div>
      )}
      {hasNext && (
        <div
          onPointerDown={handlePointerDown}
          onPointerUp={createPointerUp(onNext)}
          className="absolute right-0 top-1/4 h-1/2 w-10 z-30 flex items-center justify-center
            opacity-15 hover:opacity-50 active:opacity-50 transition-opacity cursor-pointer select-none"
          aria-label="다음 페이지"
        >
          <ChevronRight className="h-6 w-6 text-gray-600" />
        </div>
      )}
    </>
  );
}
