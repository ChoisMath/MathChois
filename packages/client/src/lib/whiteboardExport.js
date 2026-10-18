/**
 * 화이트보드 발표 영역·내보내기 범위 (순수 로직 + 안내선 요소)
 */
import { BOARD_W, BOARD_H } from './whiteboardTemplates';

export const PRESENT_W = BOARD_W;
export const PRESENT_H = BOARD_H;
export const GUIDE_ELEMENT_ID = '__wb_guide__';
const BOUNDS_PAD = 40;

export function isGuideElement(el) {
  return !!el && (el.id === GUIDE_ELEMENT_ID || el.customData?.guide === true);
}

/** 전송·저장·내보내기 대상 요소 (안내선 제외) */
export function withoutGuide(elements) {
  return (elements || []).filter((el) => !isGuideElement(el));
}

/**
 * 발표 영역(3200×1800) 안내선 — 잠금·선택 불가, 로컬에만 존재하고 서버로 보내지 않는다.
 * 완전한 Excalidraw 요소 형태로 만든다.
 */
export function createGuideElement() {
  return {
    type: 'rectangle',
    id: GUIDE_ELEMENT_ID,
    x: 0, y: 0, width: PRESENT_W, height: PRESENT_H,
    angle: 0,
    strokeColor: '#94a3b8',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 2,
    strokeStyle: 'dashed',
    roughness: 0,
    opacity: 60,
    groupIds: [],
    frameId: null,
    index: 'Zz',          // 다른 요소보다 뒤(가장 아래)에 오도록 — reconcile 이 유효성 재검사
    roundness: null,
    isDeleted: false,
    locked: true,
    link: null,
    version: 1,
    versionNonce: 1,
    updated: 1,
    seed: 1,
    boundElements: null,
    customData: { guide: true },
  };
}

/**
 * 요소 범위: 요소가 없거나 모두 발표 영역 안이면 발표 영역, 밖으로 나가면 합집합(+여백).
 * 반환 { x, y, w, h }.
 */
export function getExportBounds(elements) {
  const els = withoutGuide(elements).filter((el) => !el.isDeleted);
  const area = { x: 0, y: 0, w: PRESENT_W, h: PRESENT_H };
  if (els.length === 0) return area;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of els) {
    const x1 = el.x, y1 = el.y;
    const x2 = el.x + (el.width ?? 0), y2 = el.y + (el.height ?? 0);
    minX = Math.min(minX, x1, x2); minY = Math.min(minY, y1, y2);
    maxX = Math.max(maxX, x1, x2); maxY = Math.max(maxY, y1, y2);
  }
  if (minX >= 0 && minY >= 0 && maxX <= PRESENT_W && maxY <= PRESENT_H) return area;
  const x = Math.min(0, minX - BOUNDS_PAD);
  const y = Math.min(0, minY - BOUNDS_PAD);
  const right = Math.max(PRESENT_W, maxX + BOUNDS_PAD);
  const bottom = Math.max(PRESENT_H, maxY + BOUNDS_PAD);
  return { x, y, w: right - x, h: bottom - y };
}

/** 뷰포트 중앙의 장면 좌표 (템플릿 삽입 위치용) */
export function viewportCenterScene(appState) {
  const zoom = appState?.zoom?.value ?? 1;
  const w = appState?.width ?? 0, h = appState?.height ?? 0;
  return {
    x: -(appState?.scrollX ?? 0) + w / 2 / zoom,
    y: -(appState?.scrollY ?? 0) + h / 2 / zoom,
  };
}

/** 타일 크기 계산 (exportToCanvas getDimensions 용) */
export function fitDimensions(width, height, maxW, maxH) {
  const scale = Math.min(maxW / width, maxH / height, 1);
  return { width: width * scale, height: height * scale, scale };
}
