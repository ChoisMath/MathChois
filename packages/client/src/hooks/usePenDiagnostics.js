import { useEffect, useRef, useState } from 'react';

const MAX = 40;

/**
 * 컨테이너의 pointer 이벤트를 캡처 단계에서 관찰만 한다(차단/소비 안 함).
 * 콘솔 없는 실기기에서 포인터 흐름·coalesced 개수·dt 를 화면으로 확인하기 위함.
 *
 * @param {{ containerRef: React.RefObject, enabled: boolean }} opts
 */
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
