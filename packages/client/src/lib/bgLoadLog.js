/**
 * 배경 이미지 로드 진단 기록 (PenDiagnosticsOverlay 「배경 이미지」 줄).
 * 뷰어가 마운트/새로고침 때 recordBgLoad 로 남기고 오버레이가 subscribe 로 읽는다.
 */
let last = null;
const listeners = new Set();

/**
 * @param {{ pageId?: string, source: 'saved'|'computed', saved?: object|null, applied: {x:number,y:number,width:number,height:number},
 *           natural: {w:number,h:number}, container: {width:number,height:number}, zoom?: number, aspectFixed?: boolean }} info
 */
export function recordBgLoad(info) {
  last = { ...info, at: Date.now() };
  listeners.forEach((fn) => fn(last));
}
export function getBgLoad() { return last; }
export function subscribeBgLoad(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** 오버레이 표시용 한 줄 요약 */
export function formatBgLoad(info) {
  if (!info) return '배경 이미지: (기록 없음)';
  const r = (v) => Math.round(v);
  const aspectPct = info.saved && info.natural?.w
    ? Math.round(Math.abs(info.saved.height / info.saved.width - info.natural.h / info.natural.w) / (info.natural.h / info.natural.w) * 1000) / 10
    : null;
  return [
    `배경 이미지: ${info.source === 'saved' ? '저장값' : '계산'}`,
    info.saved ? `저장 ${r(info.saved.width)}x${r(info.saved.height)}` : null,
    `적용 ${r(info.applied.width)}x${r(info.applied.height)} @(${r(info.applied.x)},${r(info.applied.y)})`,
    `원본 ${info.natural.w}x${info.natural.h}`,
    aspectPct !== null ? `비율차 ${aspectPct}%${info.aspectFixed ? '(보정)' : ''}` : null,
    `컨테이너 ${r(info.container.width)}x${r(info.container.height)}`,
    info.zoom ? `줌 ${Math.round(info.zoom * 1000) / 1000}` : null,
  ].filter(Boolean).join(' · ');
}
