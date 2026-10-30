/**
 * 올가미 선택 기하 (순수 함수). hooks/useLasso.js 가 쓴다.
 * 스펙: docs/superpowers/specs/2026-10-30-lasso-and-bg-fit-design.md
 */
import { BG_ELEMENT_ID } from './excalidrawUtils';

/** 이 거리(px) 미만으로 움직이면 탭 → 선택 해제만 */
export const TAP_MAX_PX = 6;
/**
 * Excalidraw 변형 핸들 기하(화면 px, 0.18.1 `transformHandleSizes`): 핸들 한 변 mouse 8 / pen 16 / touch 28,
 * 선택 상자 바깥 여백 4, 핸들 간격 2, 회전 핸들은 위 핸들보다 16 더 위. 핸들은 상자 밖에 놓이므로 그 영역을 누르면
 * 가로채지 않고 Excalidraw 에 넘겨야 크기 조절·회전이 된다.
 */
export const HANDLE_SIZE_PX = { mouse: 8, pen: 16, touch: 28 };
const HANDLE_MARGIN_PX = 4;
const HANDLE_SPACING_PX = 2;
const ROTATION_HANDLE_GAP_PX = 16;
const HANDLE_TOLERANCE_PX = 2;

/** 포인터 종류별 통과 여백 { side, top } (화면 px). top 은 회전 핸들까지 덮는다. */
export function selectionPad(pointerType) {
  const p = HANDLE_SIZE_PX[pointerType] ?? HANDLE_SIZE_PX.mouse;
  const w = (p - HANDLE_SPACING_PX * 2) / 2;            // 핸들이 상자 안쪽으로 겹치는 양
  const side = HANDLE_MARGIN_PX - w + p + HANDLE_TOLERANCE_PX;
  return { side, top: side + ROTATION_HANDLE_GAP_PX };
}
/** 기본 여백(마우스 기준) — 숫자 pad 를 넘기던 호출과의 호환 */
export const SELECTION_PAD_PX = selectionPad('mouse').side;
/** 점 요소(freedraw/line/arrow)가 선택되려면 안에 들어야 하는 점의 비율 */
export const INSIDE_RATIO = 0.5;

const POINT_TYPES = new Set(['freedraw', 'line', 'arrow']);

/** ray casting. poly: [[x,y], ...] (닫히지 않아도 됨) */
export function pointInPolygon([px, py], poly) {
  const n = poly.length;
  if (n < 3) return false;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const crosses = (yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** 요소의 scene 절대 좌표 점들 (점 요소) 또는 bbox 중심 (그 외) */
function samplePoints(el) {
  if (POINT_TYPES.has(el.type) && Array.isArray(el.points) && el.points.length) {
    return el.points.map(([x, y]) => [el.x + x, el.y + y]);
  }
  return [[el.x + (el.width || 0) / 2, el.y + (el.height || 0) / 2]];
}

function isCandidate(el, { excludeIds, excludePrefixes }) {
  if (!el || el.isDeleted || el.locked || el.id === BG_ELEMENT_ID) return false;
  if (excludeIds.includes(el.id)) return false;
  return !excludePrefixes.some((p) => el.id.startsWith(p));
}

/**
 * 올가미 다각형(scene 좌표) 안의 요소를 고른다.
 * @returns {{ selectedElementIds: Record<string, true>, selectedGroupIds: Record<string, true> }}
 */
export function lassoSelection(elements, polygon, { excludeIds = [], excludePrefixes = [] } = {}) {
  const selectedElementIds = {};
  const selectedGroupIds = {};
  if (!Array.isArray(polygon) || polygon.length < 3) return { selectedElementIds, selectedGroupIds };
  const opts = { excludeIds, excludePrefixes };
  for (const el of elements) {
    if (!isCandidate(el, opts)) continue;
    const pts = samplePoints(el);
    let inside = 0;
    for (const p of pts) if (pointInPolygon(p, polygon)) inside += 1;
    const hit = POINT_TYPES.has(el.type) ? inside / pts.length >= INSIDE_RATIO : inside > 0;
    if (!hit) continue;
    selectedElementIds[el.id] = true;
    const gid = el.groupIds?.[el.groupIds.length - 1];
    if (gid) selectedGroupIds[gid] = true;
  }
  // 그룹 보완: 잡힌 그룹의 나머지 요소도 함께 (도형 보정의 채우기+획)
  const gids = Object.keys(selectedGroupIds);
  if (gids.length) {
    for (const el of elements) {
      if (selectedElementIds[el.id] || !isCandidate(el, opts)) continue;
      if (el.groupIds?.some((g) => selectedGroupIds[g])) selectedElementIds[el.id] = true;
    }
  }
  return { selectedElementIds, selectedGroupIds };
}

/**
 * 선택 요소들의 화면 bbox (+여백). screen = (scene + scroll) × zoom. 선택이 없으면 null.
 * @param {number|{side:number, top:number}} pad  숫자면 사방 동일, 객체면 위쪽만 top(회전 핸들)
 */
export function selectionScreenBounds(elements, selectedElementIds, appState, pad = SELECTION_PAD_PX) {
  const padSide = typeof pad === 'number' ? pad : pad.side;
  const padTop = typeof pad === 'number' ? pad : pad.top;
  const zoom = appState?.zoom?.value || 1;
  const sx = appState?.scrollX || 0;
  const sy = appState?.scrollY || 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of elements) {
    if (!selectedElementIds?.[el.id] || el.isDeleted) continue;
    let pts;
    if (POINT_TYPES.has(el.type) && Array.isArray(el.points) && el.points.length) {
      pts = el.points.map(([x, y]) => [el.x + x, el.y + y]);
    } else {
      pts = [[el.x, el.y], [el.x + (el.width || 0), el.y + (el.height || 0)]];
    }
    for (const [x, y] of pts) {
      if (x < minX) minX = x; if (y < minY) minY = y;
      if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minX)) return null;
  return {
    left: (minX + sx) * zoom - padSide,
    top: (minY + sy) * zoom - padTop,
    right: (maxX + sx) * zoom + padSide,
    bottom: (maxY + sy) * zoom + padSide,
  };
}

/** 경로가 탭인지 (점 3개 미만 또는 시작점에서 TAP_MAX_PX 미만으로만 움직임) */
export function isTapPath(points) {
  if (!points || points.length < 3) return true;
  const [x0, y0] = points[0];
  let far = 0;
  for (const [x, y] of points) far = Math.max(far, Math.hypot(x - x0, y - y0));
  return far < TAP_MAX_PX;
}
