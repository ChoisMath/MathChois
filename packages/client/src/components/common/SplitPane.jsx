import { useCallback, useRef, useState } from 'react';
import { GripHorizontal, GripVertical } from 'lucide-react';
import { RATIO_MIN, RATIO_MAX, ratioFromPointer, stepRatio } from '../../lib/splitLayout';

const HANDLE_PX = 12;

/**
 * 두 패널을 좌/우(horizontal) 또는 위/아래(vertical) 로 나누는 분할 컨테이너.
 *
 * - `ratio` 는 첫 패널(children[0]) 비율. 손잡이를 드래그/키보드(←→ 또는 ↑↓, 2% 단위)로 바꾸면 `onRatioChange(next)`.
 * - 드래그 중에는 화면 전체에 투명 오버레이를 깔아 `<video>`·Excalidraw·HTML 도구 iframe 이 pointermove 를 먹지 않게 한다
 *   (별도 origin iframe 위에서는 pointermove 가 부모로 오지 않으므로 필수).
 * - 두 패널은 `min-w-0 min-h-0 overflow-hidden` 이라 내부 콘텐츠(Excalidraw 등)가 자기 컨테이너 크기에 맞춰진다.
 * - `reverse` 는 시각 순서만 바꾼다(CSS `order`). children 의 DOM 순서는 유지되므로 `<video>` 가 리마운트되지 않는다
 *   (좌우 바꾸기 중 재생이 끊기지 않음). `ratio` 는 항상 **시각적으로 첫 번째** 패널의 비율.
 */
export default function SplitPane({
  orientation = 'horizontal', ratio, onRatioChange, min = RATIO_MIN, max = RATIO_MAX,
  reverse = false, handleLabel = '분할 비율 조정', className = '', children,
}) {
  const rootRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const vertical = orientation === 'vertical';
  const [first, second] = Array.isArray(children) ? children : [children, null];

  const updateFromPointer = useCallback((e) => {
    const root = rootRef.current;
    if (!root) return;
    onRatioChange?.(ratioFromPointer(root.getBoundingClientRect(), e.clientX, e.clientY, orientation, min, max));
  }, [onRatioChange, orientation, min, max]);

  const onPointerDown = useCallback((e) => {
    if (e.button != null && e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 일부 브라우저 */ }
    setDragging(true);
  }, []);

  const onPointerMove = useCallback((e) => {
    if (!dragging) return;
    e.preventDefault();
    updateFromPointer(e);
  }, [dragging, updateFromPointer]);

  const endDrag = useCallback((e) => {
    if (!dragging) return;
    setDragging(false);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* 이미 해제 */ }
  }, [dragging]);

  const onKeyDown = useCallback((e) => {
    const dec = vertical ? 'ArrowUp' : 'ArrowLeft';
    const inc = vertical ? 'ArrowDown' : 'ArrowRight';
    if (e.key !== dec && e.key !== inc) return;
    e.preventDefault();
    onRatioChange?.(stepRatio(ratio, e.key === inc ? 1 : -1, min, max));
  }, [vertical, ratio, onRatioChange, min, max]);

  const template = `minmax(0, ${ratio}fr) ${HANDLE_PX}px minmax(0, ${1 - ratio}fr)`;
  const cursor = vertical ? 'cursor-row-resize' : 'cursor-col-resize';

  return (
    <div
      ref={rootRef}
      className={`relative h-full w-full min-h-0 min-w-0 ${className}`}
      style={{ display: 'grid', [vertical ? 'gridTemplateRows' : 'gridTemplateColumns']: template }}
    >
      <div className="min-w-0 min-h-0 overflow-hidden" style={{ order: reverse ? 3 : 1 }}>{first}</div>

      <div
        role="separator"
        aria-label={handleLabel}
        aria-orientation={vertical ? 'horizontal' : 'vertical'}
        aria-valuemin={Math.round(min * 100)}
        aria-valuemax={Math.round(max * 100)}
        aria-valuenow={Math.round(ratio * 100)}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        className={`flex items-center justify-center select-none touch-none outline-none transition-colors
          ${dragging ? 'bg-blue-400' : 'bg-gray-300 hover:bg-blue-300 focus-visible:bg-blue-300'} ${cursor}`}
        style={{ order: 2 }}
        title={handleLabel}
      >
        {vertical
          ? <GripHorizontal className="h-4 w-4 text-gray-600 pointer-events-none" />
          : <GripVertical className="h-4 w-4 text-gray-600 pointer-events-none" />}
      </div>

      <div className="min-w-0 min-h-0 overflow-hidden" style={{ order: reverse ? 1 : 3 }}>{second}</div>

      {dragging && <div className={`fixed inset-0 z-[70] ${cursor}`} aria-hidden="true" />}
    </div>
  );
}
