import { useState, useEffect } from 'react';
import { getToggles, setToggle, subscribeToggles } from '../../lib/penToggles';
import { usePenDiagnostics } from '../../hooks/usePenDiagnostics';

/**
 * 온디바이스 펜 진단 오버레이. `?penlog=1` 또는 토글로 활성화.
 * 포인터 이벤트 링버퍼 + 런타임 실험 토글(coalesced/resample/pendingMs).
 */
export default function PenDiagnosticsOverlay({ containerRef }) {
  const [toggles, setToggles] = useState(getToggles());
  useEffect(() => subscribeToggles(setToggles), []);
  const { events } = usePenDiagnostics({ containerRef, enabled: toggles.diagnostics });

  if (!toggles.diagnostics) return null;

  const dump = events.map((e) =>
    `${e.t} ${e.pt}#${e.id} b${e.btn} ${e.w}x${e.h} c${e.coalesced} dt${e.dt}`
  ).join('\n');

  return (
    <div
      className="fixed bottom-1 left-1 z-[60] max-w-[60vw] bg-black/80 text-green-300 text-[10px] leading-tight p-1 rounded font-mono whitespace-pre overflow-auto max-h-[40vh]"
      style={{ pointerEvents: 'auto' }}
    >
      <div className="flex flex-wrap gap-2 text-white mb-1">
        <label><input type="checkbox" checked={toggles.coalesced}
          onChange={(e) => setToggle('coalesced', e.target.checked)} /> coalesced</label>
        <label><input type="checkbox" checked={toggles.resample}
          onChange={(e) => setToggle('resample', e.target.checked)} /> resample</label>
        <label>pendingMs
          <input type="number" className="w-12 text-black ml-1" value={toggles.pendingDiscardMs}
            onChange={(e) => setToggle('pendingDiscardMs', parseInt(e.target.value, 10) || 0)} /></label>
        <button className="underline" onClick={() => setToggle('diagnostics', false)}>닫기</button>
      </div>
      <div onClick={(ev) => { try { navigator.clipboard?.writeText(dump); } catch {} ev.stopPropagation(); }}>
        {dump || '(이벤트 대기...)'}
      </div>
    </div>
  );
}
