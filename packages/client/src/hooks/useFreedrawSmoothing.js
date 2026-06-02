import { useCallback, useRef } from 'react';
import { resampleStrokePoints } from '../lib/freedrawResample';
import { getToggles } from '../lib/penToggles';

const BG_ELEMENT_ID = '__bg_image__';

/**
 * ②B 획 완료 후 freedraw 리샘플링.
 *
 * useScribbleErase 와 동일한 "points 증가 멈춤" 방식으로 획 완료를 감지하되,
 * 스크리블 지우개(300ms)보다 늦은 320ms 후에 실행해 스크리블 삭제가 먼저 일어나도록 한다.
 * penToggles.resample 가 true 일 때만 동작. 처리한 id 를 기록해 멱등 보장.
 *
 * 사용법: onChange 핸들러 끝에서 checkForSmoothing(elements, appState) 호출.
 *
 * @param {{ excalidrawAPIRef: React.RefObject, excludePrefixes?: string[] }} opts
 */
export function useFreedrawSmoothing({ excalidrawAPIRef, excludePrefixes = [] }) {
  const lastIdRef = useRef(null);
  const lastLenRef = useRef(0);
  const timerRef = useRef(null);
  const doneRef = useRef(new Set());

  const checkForSmoothing = useCallback((elements, appState) => {
    if (!getToggles().resample) return;
    if (!appState || appState.activeTool?.type !== 'freedraw') return;

    const els = elements.filter(
      (el) => el.type === 'freedraw' && !el.isDeleted && el.id !== BG_ELEMENT_ID
        && !excludePrefixes.some((p) => el.id.startsWith(p)) && !doneRef.current.has(el.id)
    );
    if (els.length === 0) return;

    const latest = els[els.length - 1];
    const len = latest.points?.length || 0;

    if (latest.id !== lastIdRef.current || len !== lastLenRef.current) {
      lastIdRef.current = latest.id;
      lastLenRef.current = len;
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const api = excalidrawAPIRef.current;
        if (!api) return;
        const cur = api.getSceneElements();
        const el = cur.find((e) => e.id === latest.id);
        if (!el || el.isDeleted || (el.points?.length || 0) < 3) return;
        doneRef.current.add(el.id);
        const smoothed = resampleStrokePoints(el.points);
        if (smoothed === el.points) return;
        api.updateScene({
          elements: cur.map((e) => (e.id === el.id ? { ...e, points: smoothed } : e)),
          commitToHistory: false,
        });
      }, 320);
    }
  }, [excalidrawAPIRef, excludePrefixes]);

  return { checkForSmoothing };
}
