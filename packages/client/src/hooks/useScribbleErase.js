import { useCallback, useRef } from 'react';
import { isScribblePattern } from '../lib/scribbleDetect';

/**
 * 문지르기 지우개 (Scribble-to-erase) — onChange 기반
 *
 * Excalidraw onChange 콜백에서 호출되는 checkForScribble 함수를 제공합니다.
 * freedraw 스트로크의 포인트가 300ms 동안 증가하지 않으면 완료로 판단하고,
 * 스크리블 패턴이면 겹치는 스트로크를 삭제합니다.
 *
 * 사용법: onChange 핸들러 끝에서 checkForScribble(elements, appState) 호출
 */

const BG_ELEMENT_ID = '__bg_image__';

/* ── 바운딩 박스 겹침 검사 ── */
function bboxOverlap(scribble, el) {
  return !(scribble.maxX < el.x || el.x + el.width < scribble.minX ||
           scribble.maxY < el.y || el.y + el.height < scribble.minY);
}

/**
 * @param {{ excalidrawAPIRef: React.RefObject, excludePrefixes?: string[] }} opts
 * @returns {{ checkForScribble: (elements, appState) => void }}
 */
export function useScribbleErase({ excalidrawAPIRef, excludePrefixes = [] }) {
  const lastElementIdRef = useRef(null);
  const lastPointsLenRef = useRef(0);
  const scribbleTimerRef = useRef(null);

  const checkForScribble = useCallback((elements, appState) => {
    if (!appState || appState.activeTool?.type !== 'freedraw') return;

    const freedrawEls = elements.filter(
      (el) => el.type === 'freedraw' && !el.isDeleted && el.id !== BG_ELEMENT_ID
              && !excludePrefixes.some((p) => el.id.startsWith(p))
    );
    if (freedrawEls.length === 0) return;

    const latest = freedrawEls[freedrawEls.length - 1];
    const currentLen = latest.points?.length || 0;

    // 포인트가 변화했으면 타이머 리셋 (아직 그리는 중)
    if (latest.id !== lastElementIdRef.current || currentLen !== lastPointsLenRef.current) {
      lastElementIdRef.current = latest.id;
      lastPointsLenRef.current = currentLen;

      clearTimeout(scribbleTimerRef.current);
      scribbleTimerRef.current = setTimeout(() => {
        // 300ms 동안 포인트 증가 없음 → 스트로크 완료
        const api = excalidrawAPIRef.current;
        if (!api) return;

        const finalElements = api.getSceneElements();
        const finalEl = finalElements.find((el) => el.id === latest.id);
        if (!finalEl || finalEl.isDeleted || !finalEl.points || finalEl.points.length < 12) return;

        if (!isScribblePattern(finalEl.points)) return;

        // 스크리블 바운딩 박스 (절대 좌표)
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const [px, py] of finalEl.points) {
          const ax = finalEl.x + px, ay = finalEl.y + py;
          if (ax < minX) minX = ax;
          if (ay < minY) minY = ay;
          if (ax > maxX) maxX = ax;
          if (ay > maxY) maxY = ay;
        }

        // 겹치는 스트로크 찾기
        const deleteIds = new Set([finalEl.id]);
        for (const el of finalElements) {
          if (el.isDeleted || el.id === finalEl.id || el.id === BG_ELEMENT_ID) continue;
          if (el.type !== 'freedraw') continue;
          if (excludePrefixes.some((p) => el.id.startsWith(p))) continue;
          if (bboxOverlap({ minX, minY, maxX, maxY }, el)) {
            deleteIds.add(el.id);
          }
        }

        // 삭제
        api.updateScene({
          elements: finalElements.map((el) =>
            deleteIds.has(el.id) ? { ...el, isDeleted: true } : el
          ),
          commitToHistory: true,
        });
      }, 300);
    }
  }, [excalidrawAPIRef, excludePrefixes]);

  return { checkForScribble };
}
