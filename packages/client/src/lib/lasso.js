/**
 * 올가미 선택 기하 (순수 함수). hooks/useLasso.js 가 쓴다.
 * 스펙: docs/superpowers/specs/2026-10-30-lasso-and-bg-fit-design.md
 */
import { BG_ELEMENT_ID } from './excalidrawUtils';

/** 이 거리(px) 미만으로 움직이면 탭 → 선택 해제만 */
export const TAP_MAX_PX = 6;
/** 선택 묶음 bbox 바깥 여백(px): 이 안을 누르면 Excalidraw 이동/크기 조절로 넘긴다 */
export const SELECTION_PAD_PX = 8;
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

/** 선택 요소들의 화면 bbox (+여백). screen = (scene + scroll) × zoom. 선택이 없으면 null */
export function selectionScreenBounds(elements, selectedElementIds, appState, pad = SELECTION_PAD_PX) {
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
    left: (minX + sx) * zoom - pad,
    top: (minY + sy) * zoom - pad,
    right: (maxX + sx) * zoom + pad,
    bottom: (maxY + sy) * zoom + pad,
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
