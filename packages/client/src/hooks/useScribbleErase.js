import { useEffect } from 'react';

/**
 * 문지르기 지우개 (Scribble-to-erase)
 *
 * freedraw 모드에서 빠른 왕복 움직임(scribble)을 감지하고,
 * 겹치는 기존 스트로크를 스트로크 단위로 삭제합니다.
 *
 * @param {{ excalidrawAPIRef: React.RefObject, containerRef: React.RefObject, enabledRef: React.RefObject }} opts
 */

const BG_ELEMENT_ID = '__bg_image__';

/* ── 스크리블 패턴 감지 ── */
function isScribblePattern(points) {
  if (!points || points.length < 8) return false;

  // 1. 방향 전환(reversal) 횟수 — 연속 벡터 간 각도 변화 >90°
  let reversals = 0;
  const step = 3; // 3포인트 간격으로 벡터 계산 (노이즈 내성 향상)
  for (let i = step * 2; i < points.length; i += step) {
    const prevDx = points[i - step][0] - points[i - step * 2][0];
    const prevDy = points[i - step][1] - points[i - step * 2][1];
    const currDx = points[i][0] - points[i - step][0];
    const currDy = points[i][1] - points[i - step][1];
    const prevLen = Math.hypot(prevDx, prevDy);
    const currLen = Math.hypot(currDx, currDy);
    if (prevLen < 0.5 || currLen < 0.5) continue; // 극소 이동 무시
    const dot = prevDx * currDx + prevDy * currDy;
    const cross = prevDx * currDy - prevDy * currDx;
    const angle = Math.abs(Math.atan2(cross, dot));
    if (angle > Math.PI * 0.5) reversals++; // >90°
  }

  // 2. 밀도 검사: 경로 길이 / 바운딩박스 대각선
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let pathLen = 0;
  for (let i = 0; i < points.length; i++) {
    const [x, y] = points[i];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (i > 0) {
      pathLen += Math.hypot(x - points[i - 1][0], y - points[i - 1][1]);
    }
  }
  const bboxDiag = Math.hypot(maxX - minX, maxY - minY);
  const density = bboxDiag > 1 ? pathLen / bboxDiag : 0;

  const result = reversals >= 2 && density > 2;
  if (result) {
    console.warn('[ScribbleErase] 스크리블 감지!', { reversals, density, pointsLen: points.length });
  }
  return result;
}

/* ── 바운딩 박스 겹침 검사 ── */
function bboxOverlap(a, b) {
  return !(a.maxX < b.x || b.x + b.w < a.minX || a.maxY < b.y || b.y + b.h < a.minY);
}

export function useScribbleErase({ excalidrawAPIRef, containerRef, enabledRef }) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handlePointerUp = (e) => {
      if (!enabledRef?.current) return;
      if (e.pointerType !== 'pen' && e.pointerType !== 'touch') return;

      // Excalidraw가 스트로크를 커밋할 시간을 확보 (rAF보다 안정적)
      setTimeout(() => {
        const api = excalidrawAPIRef.current;
        if (!api) return;
        const tool = api.getAppState()?.activeTool?.type;
        if (tool !== 'freedraw') return;

        const elements = api.getSceneElements();
        // 가장 최근 freedraw 요소 찾기
        const freedrawEls = elements.filter(
          (el) => el.type === 'freedraw' && !el.isDeleted && el.id !== BG_ELEMENT_ID
        );
        if (freedrawEls.length === 0) return;
        const recent = freedrawEls[freedrawEls.length - 1];
        if (!recent.points || recent.points.length < 8) return;

        if (!isScribblePattern(recent.points)) return;

        // 스크리블 바운딩 박스 계산 (절대 좌표)
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const [px, py] of recent.points) {
          const ax = recent.x + px, ay = recent.y + py;
          if (ax < minX) minX = ax;
          if (ay < minY) minY = ay;
          if (ax > maxX) maxX = ax;
          if (ay > maxY) maxY = ay;
        }
        const scribbleBBox = { minX, minY, maxX, maxY };

        // 겹치는 스트로크 찾기
        const deleteIds = new Set([recent.id]);
        for (const el of elements) {
          if (el.isDeleted || el.id === recent.id || el.id === BG_ELEMENT_ID) continue;
          if (el.type !== 'freedraw') continue;
          if (bboxOverlap(scribbleBBox, { x: el.x, y: el.y, w: el.width, h: el.height })) {
            deleteIds.add(el.id);
          }
        }

        console.warn('[ScribbleErase] 삭제 대상:', deleteIds.size, '개 스트로크');

        // 스크리블 + 겹치는 스트로크 삭제
        api.updateScene({
          elements: elements.map((el) =>
            deleteIds.has(el.id) ? { ...el, isDeleted: true } : el
          ),
          commitToHistory: true,
        });
      }, 150);
    };

    // 캡처 단계에서 감지
    container.addEventListener('pointerup', handlePointerUp, { capture: true, passive: true });
    return () => container.removeEventListener('pointerup', handlePointerUp, { capture: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
