/**
 * 펜 두께 규칙 (5개 필기 뷰어 + 코칭 뷰어 + 핀치줌 공용).
 *
 * 슬라이더 값(base, localStorage mc_stroke_width)은 "화면에서 보이는 두께"다. Excalidraw 의 strokeWidth 는
 * scene 단위라 zoom 으로 나눠 넣어야 핀치줌을 해도 화면 두께가 같다 (size = strokeWidth×10 → 화면 px = base×10).
 *
 * 하한 MIN_SCENE_STROKE_WIDTH: Excalidraw 가 path 좌표를 소수점 2자리(0.01 scene)로 자르므로 반지름(strokeWidth×5)이
 * 그보다 충분히 커야 가장자리가 울퉁불퉁해지지 않는다. 예전 하한 0.05 는 perfect-freehand 의 고배율 붕괴를
 * 피하려던 값인데(폰 zoom 10 에서 가장 얇은 펜이 5px 로 굵어짐), 외곽선 size 정규화(lib/wetInkStroke.js)로
 * 그 문제가 사라져 0.01 까지 내린다.
 */
export const PEN_WIDTH_MIN = 0.05;
export const PEN_WIDTH_MAX = 2;
export const PEN_WIDTH_STEP = 0.05;
export const PEN_WIDTH_DEFAULT = 0.2;
export const MIN_SCENE_STROKE_WIDTH = 0.01;

/**
 * @param {number} base  슬라이더 두께(화면 기준)
 * @param {number} zoom  Excalidraw zoom
 * @returns {number} Excalidraw currentItemStrokeWidth
 */
export function sceneStrokeWidth(base, zoom) {
  return Math.max(base / (zoom || 1), MIN_SCENE_STROKE_WIDTH);
}
