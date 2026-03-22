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
  if (!points || points.length < 15) return false;

  // 1. 방향 전환(reversal) 횟수 — 연속 벡터 간 각도 변화 >100°
  let reversals = 0;
  const step = 2; // 2포인트 간격으로 벡터 계산 (노이즈 감소)
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
    if (angle > Math.PI * 0.55) reversals++; // >99°
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

  // 방향 전환 3회+ AND 밀도(경로/대각선비) 높음
  return reversals >= 3 && density > 3;
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

      // Excalidraw가 스트로크를 커밋한 후 분석
      requestAnimationFrame(() => {
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
        if (!recent.points || recent.points.length < 15) return;

        if (!isScribblePattern(recent.points)) return;

        // 스크리블 바운딩 박스 계산
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

        if (deleteIds.size <= 1) {
          // 스크리블만 있고 겹치는 스트로크 없으면 스크리블만 삭제
        }

        // 스크리블 + 겹치는 스트로크 삭제
        api.updateScene({
          elements: elements.map((el) =>
            deleteIds.has(el.id) ? { ...el, isDeleted: true } : el
          ),
          commitToHistory: true,
        });
      });
    };

    // 버블 단계에서 감지 (Excalidraw가 먼저 처리한 후)
    container.addEventListener('pointerup', handlePointerUp, { capture: false });
    return () => container.removeEventListener('pointerup', handlePointerUp, { capture: false });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
