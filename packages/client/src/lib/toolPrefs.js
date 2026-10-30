/**
 * 필기 도구바 기억값 (5개 필기 뷰어 + AI 코칭 공용, localStorage).
 *
 * - 색상 바로가기 5칸: `mc_color_slots` (HEX 배열). 기본값 검정·빨강·파랑·초록·주황. 모달에서만 편집.
 * - 펜:    색 `mc_tool_color`(기본 검정),  두께 `mc_stroke_width`(lib/penWidth.js 범위).
 * - 형광펜: 색 `mc_hl_color`(기본 노랑),    두께 `mc_hl_width`(0.4~3, 기본 1.2 = 화면 12px). 획은 투명도 40% 의 freedraw.
 *
 * 두께 값은 "화면에서 보이는 두께"(펜 두께 규칙과 같음, 화면 px = 값×10). 저장값이 깨졋거나 범위 밖이면 기본값.
 * 스펙: docs/superpowers/specs/2026-10-30-drawing-toolbar-reorg-highlighter-design.md
 */
import { PEN_WIDTH_MIN, PEN_WIDTH_MAX, PEN_WIDTH_STEP, PEN_WIDTH_DEFAULT } from './penWidth';

export const COLOR_SLOT_COUNT = 5;
export const DEFAULT_COLOR_SLOTS = Object.freeze(['#000000', '#e03131', '#1971c2', '#2f9e44', '#f08c00']);
const SLOTS_KEY = 'mc_color_slots';

export const HL_OPACITY = 40;
export const HL_COLOR_DEFAULT = '#ffd43b';
export const HL_WIDTH_MIN = 0.4;
export const HL_WIDTH_MAX = 3;
export const HL_WIDTH_STEP = 0.1;
export const HL_WIDTH_DEFAULT = 1.2;

export const PEN_COLOR_DEFAULT = '#000000';

/** 상단 도구바 요소 순서 (components/study/DrawingToolbar.jsx 의 data-tb). 테스트가 이 순서를 검증한다. */
export const TOOLBAR_ORDER = Object.freeze([
  'undo', 'redo',
  'freedraw', 'highlighter', 'finger', 'laser_pointer',
  'slot-0', 'slot-1', 'slot-2', 'slot-3', 'slot-4', 'palette',
  'width',
  'eraser', 'image_move', 'image_reload', 'image_add',
  'line', 'text', 'shapes', 'selection',
  'clear', 'settings',
]);

/** 색상 모달의 자주 쓰는 색 격자 (Excalidraw 팔레트 + 형광펜용 파스텔 4색) */
export const PRESET_COLORS = Object.freeze([
  '#000000', '#868e96', '#ffffff', '#e03131', '#c2255c', '#9c36b5', '#6741d9', '#3b5bdb',
  '#1971c2', '#0c8599', '#099268', '#2f9e44', '#66a80f', '#f08c00', '#e8590c', '#a0522d',
  '#ffd43b', '#8ce99a', '#74c0fc', '#faa2c1',
]);

const KEYS = {
  freedraw:    { color: 'mc_tool_color', width: 'mc_stroke_width' },
  highlighter: { color: 'mc_hl_color',   width: 'mc_hl_width' },
};
const COLOR_DEFAULTS = { freedraw: PEN_COLOR_DEFAULT, highlighter: HL_COLOR_DEFAULT };
const RANGES = {
  freedraw:    { min: PEN_WIDTH_MIN, max: PEN_WIDTH_MAX, step: PEN_WIDTH_STEP },
  highlighter: { min: HL_WIDTH_MIN,  max: HL_WIDTH_MAX,  step: HL_WIDTH_STEP },
};
const WIDTH_DEFAULTS = { freedraw: PEN_WIDTH_DEFAULT, highlighter: HL_WIDTH_DEFAULT };

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** `#rrggbb` 형식인지 (대소문자 무관) */
export function isHexColor(s) {
  return typeof s === 'string' && HEX_RE.test(s);
}

/** 공백 제거·`#` 보충·소문자. 유효하지 않으면 null */
export function normalizeHex(s) {
  if (typeof s !== 'string') return null;
  let t = s.trim();
  if (!t.startsWith('#')) t = '#' + t;
  return isHexColor(t) ? t.toLowerCase() : null;
}

function read(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key, value) {
  try { localStorage.setItem(key, value); } catch { /* localStorage 불가 무시 */ }
}

/** 색상 바로가기 5칸. 저장값이 없거나 깨졌으면 기본값(복사본). */
export function loadColorSlots() {
  try {
    const parsed = JSON.parse(read(SLOTS_KEY) || 'null');
    if (Array.isArray(parsed) && parsed.length === COLOR_SLOT_COUNT && parsed.every(isHexColor)) {
      return parsed.map((c) => c.toLowerCase());
    }
  } catch { /* 깨진 JSON */ }
  return [...DEFAULT_COLOR_SLOTS];
}

/** 5칸을 저장. 정규화된 배열을 돌려주고, 하나라도 유효하지 않으면 저장하지 않고 null. */
export function saveColorSlots(slots) {
  if (!Array.isArray(slots) || slots.length !== COLOR_SLOT_COUNT) return null;
  const next = slots.map(normalizeHex);
  if (next.some((c) => c === null)) return null;
  write(SLOTS_KEY, JSON.stringify(next));
  return next;
}

/** 도구별 마지막 색 (`freedraw` | `highlighter`) */
export function loadToolColor(tool) {
  const v = read(KEYS[tool]?.color);
  return isHexColor(v) ? v : COLOR_DEFAULTS[tool] ?? PEN_COLOR_DEFAULT;
}
export function saveToolColor(tool, hex) {
  const key = KEYS[tool]?.color;
  if (key && isHexColor(hex)) write(key, hex);
}

/** 도구별 슬라이더 범위 */
export function widthRange(tool) {
  return { ...(RANGES[tool] ?? RANGES.freedraw) };
}

/** 도구별 마지막 두께. 숫자가 아니거나 범위 밖이면 기본값. */
export function loadToolWidth(tool) {
  const { min, max } = widthRange(tool);
  const v = parseFloat(read(KEYS[tool]?.width) ?? '');
  if (!Number.isFinite(v) || v < min || v > max) return WIDTH_DEFAULTS[tool] ?? PEN_WIDTH_DEFAULT;
  return v;
}
export function saveToolWidth(tool, w) {
  const key = KEYS[tool]?.width;
  if (key && Number.isFinite(w)) write(key, String(w));
}
