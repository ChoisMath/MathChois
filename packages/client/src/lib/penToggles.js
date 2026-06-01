const KEY = 'mc_pen_toggles';
const DEFAULTS = {
  coalesced: false,      // ②A 라이브 고주파 주입
  resample: false,       // ②B 획 완료 후 리샘플링
  pendingDiscardMs: 150, // ①B 터치 획 보류 창
  diagnostics: false,    // 진단 오버레이 표시
};

function load() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { /* 파싱 실패 시 기본값 */ return { ...DEFAULTS }; }
}

let state = load();
const listeners = new Set();

export function getToggles() { return state; }

export function setToggle(key, value) {
  state = { ...state, [key]: value };
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* localStorage 불가 무시 */ }
  listeners.forEach((fn) => fn(state));
}

export function subscribeToggles(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
