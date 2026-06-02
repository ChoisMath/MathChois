const KEY = 'mc_input_mode';
const VALID = new Set(['stylus', 'finger']);
const DRAW_TOOLS = new Set(['freedraw', 'line', 'rectangle', 'ellipse', 'triangle']);

function load() {
  try {
    const v = localStorage.getItem(KEY);
    return VALID.has(v) ? v : 'stylus';
  } catch { /* localStorage 불가 */ return 'stylus'; }
}

let mode = load();
const listeners = new Set();

export function getInputMode() { return mode; }

export function setInputMode(next) {
  if (!VALID.has(next)) return;
  mode = next;
  try { localStorage.setItem(KEY, next); } catch { /* localStorage 불가 무시 */ }
  listeners.forEach((fn) => fn(mode));
}

export function subscribeInputMode(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 스타일러스 모드에서 단일 손가락 그리기 입력을 차단해야 하는지. */
export function shouldBlockTouchDraw(currentMode, tool, touchCount) {
  return currentMode === 'stylus' && touchCount < 2 && DRAW_TOOLS.has(tool);
}
