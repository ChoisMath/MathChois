import { calculateBgPosition } from './excalidrawUtils';

/**
 * PDF 레이어 좌표·렌더 계획 순수 함수. Excalidraw 규칙: screen = (scene + scroll) * zoom.
 * @typedef {{ scrollX: number, scrollY: number, zoom: number }} View
 * @typedef {{ x: number, y: number, width: number, height: number }} Rect  scene 좌표
 * @typedef {{ left: number, top: number, width: number, height: number }} Box  CSS px
 * @typedef {{ css: Box, canvasWidth: number, canvasHeight: number, scale: number, offsetX: number, offsetY: number }} Plan
 */

export const VIEWPORT_SETTLE_MS = 120;
export const MAX_DPR = 3;

const VIEW_EPSILON = 1e-6;

/** @returns {View} */
export function viewFromAppState(appState) {
  return { scrollX: appState.scrollX, scrollY: appState.scrollY, zoom: appState.zoom.value };
}

/** @param {View | null} a @param {View} b */
export function sameView(a, b) {
  if (!a) return false;
  return (
    Math.abs(a.scrollX - b.scrollX) <= VIEW_EPSILON &&
    Math.abs(a.scrollY - b.scrollY) <= VIEW_EPSILON &&
    Math.abs(a.zoom - b.zoom) <= VIEW_EPSILON
  );
}

/** @param {Rect} rect @param {View} view @returns {Box} */
export function sceneToScreen(rect, view) {
  return {
    left: (rect.x + view.scrollX) * view.zoom,
    top: (rect.y + view.scrollY) * view.zoom,
    width: rect.width * view.zoom,
    height: rect.height * view.zoom,
  };
}

/**
 * 종이(화면 좌표)와 컨테이너의 교집합. 너비·높이가 1px 미만이면 null.
 * @param {Box} paper @param {{ width: number, height: number }} container @returns {Box | null}
 */
export function visibleClip(paper, container) {
  const left = Math.max(paper.left, 0);
  const top = Math.max(paper.top, 0);
  const right = Math.min(paper.left + paper.width, container.width);
  const bottom = Math.min(paper.top + paper.height, container.height);
  const width = right - left;
  const height = bottom - top;
  if (width < 1 || height < 1) return null;
  return { left, top, width, height };
}

export function clampDpr(dpr) {
  return Math.min(dpr || 1, MAX_DPR);
}

/**
 * 보이는 영역(clip)만 zoom * 종이배율 * dpr 로 렌더하는 계획.
 * offsetX/offsetY 는 clip 이 종이 좌상단에서 떨어진 만큼의 음수 이동(디바이스 px).
 * @returns {Plan | null}
 */
export function renderPlan({ paper, view, container, pageSize, dpr }) {
  const paperScreen = sceneToScreen(paper, view);
  const css = visibleClip(paperScreen, container);
  if (!css) return null;
  const d = clampDpr(dpr);
  return {
    css,
    canvasWidth: Math.round(css.width * d),
    canvasHeight: Math.round(css.height * d),
    scale: view.zoom * (paper.width / pageSize.width) * d,
    offsetX: (paperScreen.left - css.left) * d,
    offsetY: (paperScreen.top - css.top) * d,
  };
}

/**
 * 렌더 당시 clip 의 scene 원점을 현재 view 로 다시 투영한 비트맵 배치.
 * @param {{ css: Box, view: View }} rendered @param {View} current
 * @returns {{ left: number, top: number, scale: number }}
 */
export function placeBitmap(rendered, current) {
  const { css, view } = rendered;
  return {
    left: (css.left / view.zoom - view.scrollX + current.scrollX) * current.zoom,
    top: (css.top / view.zoom - view.scrollY + current.scrollY) * current.zoom,
    scale: current.zoom / view.zoom,
  };
}

/**
 * 저장된 bgPosition 이 유효하면 그대로, 아니면 컨테이너에 맞춰 배치.
 * @returns {Rect}
 */
export function paperRectForPage(pageSize, container, savedBg) {
  if (savedBg && savedBg.width > 10 && savedBg.height > 10) return savedBg;
  return calculateBgPosition(container.width, container.height, pageSize.width, pageSize.height);
}
