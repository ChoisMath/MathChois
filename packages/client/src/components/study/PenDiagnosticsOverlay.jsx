import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { getToggles, setToggle, subscribeToggles } from '../../lib/penToggles';
import { usePenDiagnostics } from '../../hooks/usePenDiagnostics';
import { getPenStrokeSamples } from '../../lib/penSampleLog';
import { getBgLoad, subscribeBgLoad, formatBgLoad } from '../../lib/bgLoadLog';

/** 최근 펜 획의 원시 샘플(메인/coalesced 좌표·timeStamp)을 JSON 파일로 내려받는다 (iPad: 파일 앱에 저장) */
function downloadPenSamples() {
  const data = getPenStrokeSamples();
  if (!data.length) { alert('기록된 펜 획이 없습니다. 펜으로 한 획 그은 뒤 다시 누르세요.'); return; }
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `pen-samples-${Date.now()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * 온디바이스 펜 진단 오버레이. `?penlog=1` 또는 토글로 활성화.
 * 포인터 이벤트 링버퍼 + 런타임 실험 토글(coalesced/resample/pendingMs).
 */
export default function PenDiagnosticsOverlay({ containerRef }) {
  const [toggles, setToggles] = useState(getToggles());
  useEffect(() => subscribeToggles(setToggles), []);
  const [bgLoad, setBgLoad] = useState(getBgLoad());
  useEffect(() => subscribeBgLoad(setBgLoad), []);
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
        <button type="button" className="px-1.5 py-0.5 rounded bg-green-700 text-white" onClick={downloadPenSamples}>
          획 샘플 저장
        </button>
        <button type="button" title="닫기" aria-label="닫기" className="inline-flex items-center" onClick={() => setToggle('diagnostics', false)}>
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="text-amber-200 mb-1">{formatBgLoad(bgLoad)}</div>
      <div onClick={(ev) => { try { navigator.clipboard?.writeText(dump); } catch { /* clipboard 불가 무시 */ } ev.stopPropagation(); }}>
        {dump || '(이벤트 대기...)'}
      </div>
    </div>
  );
}
