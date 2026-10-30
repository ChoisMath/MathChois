/**
 * 배경 이미지 화면 맞춤 (5개 필기 뷰어 공용).
 *
 * 노트에 저장된 bgPosition 은 처음 연 기기의 화면 크기로 계산된 scene 절대 px 라, 다른 기기에서 줌 1 로 그대로 쓰면
 * 작게(또는 크게) 보인다. 필기 좌표가 배경에 맞물려 있으므로 저장값은 건드리지 않고 **뷰포트(줌·스크롤)를 배경에 맞춘다**.
 * 스펙: docs/superpowers/specs/2026-10-30-lasso-and-bg-fit-design.md
 */

/** 화면 여백(px). excalidrawUtils.calculateBgPosition 의 BG_MARGIN 과 같은 값 */
export const BG_FIT_MARGIN = 20;
/** 저장 비율과 이미지 비율의 허용 오차 (2%) */
export const BG_ASPECT_TOL = 0.02;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 30;

/**
 * 저장된 배경 크기의 비율이 이미지 원본 비율과 BG_ASPECT_TOL 넘게 다르면 폭·x·y 는 두고 높이만 이미지 비율로 바로잡는다.
 * @param {{x:number,y:number,width:number,height:number}|null} saved
 * @param {number} imageW  @param {number} imageH  이미지 원본 px
 */
export function fixBgAspect(saved, imageW, imageH, tol = BG_ASPECT_TOL) {
  if (!saved || !(imageW > 0) || !(imageH > 0) || !(saved.width > 0) || !(saved.height > 0)) return saved;
  const want = imageH / imageW;
  const have = saved.height / saved.width;
  if (Math.abs(have - want) / want <= tol) return saved;
  return { ...saved, height: saved.width * want };
}

/**
 * 배경 요소가 컨테이너에 꽉 차도록(가로 중앙, 위 여백 BG_FIT_MARGIN) 줌·스크롤을 계산한다.
 * Excalidraw 좌표: screen = (scene + scroll) × zoom.
 * @returns {{zoom:number, scrollX:number, scrollY:number}|null}
 */
export function fitViewportToBg({ containerWidth, containerHeight, bg }) {
  if (!bg || !(containerWidth > 0) || !(containerHeight > 0) || !(bg.width > 0) || !(bg.height > 0)) return null;
  const availW = containerWidth - BG_FIT_MARGIN * 2;
  const availH = containerHeight - BG_FIT_MARGIN;
  const raw = Math.min(availW / bg.width, availH / bg.height);
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, raw));
  const scrollX = (containerWidth / zoom - bg.width) / 2 - bg.x;
  const scrollY = BG_FIT_MARGIN / zoom - bg.y;
  return { zoom, scrollX, scrollY };
}

/**
 * 뷰어 마운트/새로고침 공용: 저장값(비율 보정)·없으면 계산값을 고르고 뷰포트와 진단 정보를 함께 돌려준다.
 * @returns {{ bg: {x,y,width,height}, source: 'saved'|'computed', viewport: {zoom,scrollX,scrollY}|null, diag: object }}
 */
export function resolveBgLayout({ saved, imageW, imageH, containerWidth, containerHeight }) {
  const usable = saved && saved.width > 10 && saved.height > 10;
  let bg, source, aspectFixed = false;
  if (usable) {
    const fixed = fixBgAspect(saved, imageW, imageH);
    aspectFixed = fixed !== saved;
    bg = { x: fixed.x, y: fixed.y, width: fixed.width, height: fixed.height };
    source = 'saved';
  } else {
    const availW = containerWidth - BG_FIT_MARGIN * 2;
    const availH = containerHeight - BG_FIT_MARGIN;
    const scale = Math.min(availW / imageW, availH / imageH);
    bg = { x: BG_FIT_MARGIN, y: BG_FIT_MARGIN, width: imageW * scale, height: imageH * scale };
    source = 'computed';
  }
  const viewport = fitViewportToBg({ containerWidth, containerHeight, bg });
  return {
    bg, source, viewport,
    diag: {
      source, aspectFixed,
      saved: usable ? { ...saved } : null,
      applied: { ...bg },
      natural: { w: imageW, h: imageH },
      container: { width: containerWidth, height: containerHeight },
      zoom: viewport?.zoom,
    },
  };
}

/** updateScene 에 넣을 appState 조각 (viewport 가 없으면 빈 객체) */
export function bgViewportAppState(viewport) {
  if (!viewport) return {};
  return { zoom: { value: viewport.zoom }, scrollX: viewport.scrollX, scrollY: viewport.scrollY };
}
