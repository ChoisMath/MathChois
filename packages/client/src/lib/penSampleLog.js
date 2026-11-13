/*
 * 펜 원시 샘플 기록기 — 기기에서 pointer 이벤트가 실제로 어떻게 들어오는지(메인 이벤트 좌표, coalesced 묶음의
 * 좌표·timeStamp·순서) 마지막 획 몇 개를 메모리에 남긴다. 콘솔이 없는 아이패드에서 PenDiagnosticsOverlay 의
 * [획 샘플 저장] 으로 JSON 을 내려받아 분석한다(2026-10-30 아이패드 가는 선 끊김 추적). 항상 켜져 있지만
 * 획당 수백 개 객체뿐이라 비용은 무시할 수 있다. 좌표는 화면 px.
 */
const KEEP_STROKES = 3;
const strokes = [];
let current = null;

export function beginPenStroke(e, meta = {}) {
  current = {
    startedAt: new Date().toISOString(),
    ua: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    dpr: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
    hasCoalesced: typeof e.getCoalescedEvents === 'function',
    down: { t: e.timeStamp, x: e.clientX, y: e.clientY, p: e.pressure },
    ...meta,
    moves: [],
  };
}

/**
 * @param {PointerEvent} e 메인 pointermove
 * @param {PointerEvent[]} raw getCoalescedEvents() 원본(순서 그대로)
 * @param {number} used 실제로 획에 넣은 점 수(정렬·필터 뒤)
 */
export function recordPenMove(e, raw, used) {
  if (!current) return;
  current.moves.push({
    t: e.timeStamp, x: e.clientX, y: e.clientY,
    c: raw.map((ev) => [ev.clientX, ev.clientY, ev.timeStamp]),
    used,
  });
}

export function endPenStroke(info = {}) {
  if (!current) return;
  Object.assign(current, info, { endedAt: new Date().toISOString() });
  strokes.push(current);
  while (strokes.length > KEEP_STROKES) strokes.shift();
  current = null;
}

/** 최근 획들(최신이 마지막) */
export function getPenStrokeSamples() { return strokes.slice(); }

/** 테스트용 초기화 */
export function resetPenStrokeSamples() { strokes.length = 0; current = null; }
