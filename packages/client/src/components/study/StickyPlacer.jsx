import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './viewer.css';
import { stickyDataUrl } from '../../lib/stickyPads';

/** 펜은 이만큼 한 자리에서 꾹 눌러야 확정 (ms) */
export const PEN_HOLD_MS = 400;
/** 펜이 누른 채 이보다 멀리 움직이면 꾹 누르기가 풀린다 (px) */
export const PEN_HOLD_SLOP = 8;

/**
 * 메모지 자리 정하기 — 고른 메모지의 50% 그림자가 포인터를 따라다니고, 사용자가 누르는 자리에 확정된다.
 * 도구바 아래(`topInset`)부터 캔버스를 덮는 투명 덮개(document.body 포털)라 따라다니는 동안 펜이 획을 긋지 않고,
 * 도구바·상단 바는 그대로 눌린다(다른 도구·메모지 단추로 취소). 안내 띠의 [취소] 단추도 취소.
 * - 마우스·손가락: 누르는 순간 `onCommit({ clientX, clientY })` 뒤 바로 `onDone()`
 * - 펜(stylus): 한 자리에서 PEN_HOLD_MS 꾹 누르면 `onCommit`. 짧은 탭·PEN_HOLD_SLOP 넘는 이동은 무시하고 계속 따라다닌다.
 *   확정 뒤에도 펜을 뗄 때까지 덮개를 남겨 둔다(그림자·안내는 숨김) — 남은 누름이 아래 레이어(PDF 층)로 내려가
 *   브라우저 길게 누르기(선택·콜아웃)를 일으키지 않게. 떼면 `onDone()`.
 * - 덮개 안에서는 user-select 없음, contextmenu·selectstart 차단 (길게 누르기 → 페이지 전체 선택 방지).
 * - Escape: `onCancel`
 * 설계: docs/superpowers/specs/2026-11-01-sticky-pads-design.md (자리 정하기 추가분)
 *
 * @param {{ spec: { type, friend, pattern }, ghostSize: { w: number, h: number }, topInset?: number,
 *           onCommit: ({ clientX, clientY }) => void, onDone: () => void, onCancel: () => void }} props
 */
export default function StickyPlacer({ spec, ghostSize, topInset = 0, onCommit, onDone, onCancel }) {
  const [pos, setPos] = useState(() => ({ x: window.innerWidth / 2, y: window.innerHeight / 2 }));
  const [lingering, setLingering] = useState(false); // 펜 확정 뒤 펜을 뗄 때까지
  const holdRef = useRef({ timer: null, x: 0, y: 0 });

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    const onSelectStart = (e) => e.preventDefault();
    document.addEventListener('keydown', onKey);
    document.addEventListener('selectstart', onSelectStart);
    const hold = holdRef.current;
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('selectstart', onSelectStart);
      clearTimeout(hold.timer);
    };
  }, [onCancel]);

  const clearHold = () => { clearTimeout(holdRef.current.timer); holdRef.current.timer = null; };

  const onPointerMove = (e) => {
    if (lingering) return;
    setPos({ x: e.clientX, y: e.clientY });
    const h = holdRef.current;
    if (h.timer && Math.hypot(e.clientX - h.x, e.clientY - h.y) > PEN_HOLD_SLOP) clearHold();
  };
  const onPointerDown = (e) => {
    if (lingering || e.button > 0) return;
    e.preventDefault();
    setPos({ x: e.clientX, y: e.clientY });
    if (e.pointerType === 'pen') {
      clearHold();
      const { clientX, clientY } = e;
      holdRef.current.x = clientX; holdRef.current.y = clientY;
      holdRef.current.timer = setTimeout(() => {
        holdRef.current.timer = null;
        setLingering(true);
        onCommit({ clientX, clientY });
      }, PEN_HOLD_MS);
      return;
    }
    onCommit({ clientX: e.clientX, clientY: e.clientY });
    onDone();
  };
  const onPointerEnd = () => {
    clearHold();
    if (lingering) onDone();
  };

  const { w, h } = ghostSize;
  const guard = { userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' };
  return createPortal(
    <div data-sticky-placer role="presentation" className="vw-sticky-placer"
      style={{ top: `${Math.round(topInset)}px`, ...guard }}
      onPointerMove={onPointerMove} onPointerDown={onPointerDown} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}
      onContextMenu={(e) => e.preventDefault()} onDragStart={(e) => e.preventDefault()}>
      {!lingering && (
        <>
          <img src={stickyDataUrl(spec)} alt="" draggable={false} className="vw-sticky-ghost"
            style={{ left: `${pos.x - w / 2}px`, top: `${pos.y - h / 2}px`, width: `${w}px`, height: `${h}px`, opacity: 0.5, ...guard }} />
          <div className="vw-sticky-hint" style={{ top: `${Math.round(topInset) + 12}px`, ...guard }}>
            <span>누르는 자리에 붙습니다 · 펜은 꾹 누르기</span>
            <button type="button" className="vw-sticky-cancel" onPointerDown={(e) => e.stopPropagation()} onClick={onCancel}>취소</button>
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}
