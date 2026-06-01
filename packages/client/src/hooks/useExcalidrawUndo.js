import { useCallback, useEffect, useRef, useState } from 'react';
import { createHistoryStack } from '../lib/excalidrawHistory';

/* 요소 추가/삭제/수정 감지용 서명 */
function signature(elements) {
  let s = elements.length + '|';
  for (const e of elements) s += e.id + '.' + (e.version || 0) + ',';
  return s;
}

/**
 * ③ 자체 undo/redo. Excalidraw 0.18 이 undo/redo API·키보드를 노출/처리하지 않으므로
 * 씬 스냅샷 스택으로 구현한다.
 *
 * - recordHistory(elements): onChange 끝에서 호출(350ms debounce 후 확정 상태 기록).
 *   초기 로드 스냅샷이 기준선이 되어 undo 가 배경/기존 노트 이전으로 가지 않는다.
 * - undo()/redo(): 스냅샷을 updateScene 으로 복원(히스토리 커밋 없음).
 * - Ctrl+Z / Ctrl+Shift+Z(또는 Ctrl+Y) 키보드 바인딩 포함.
 *
 * @param {{ excalidrawAPIRef: React.RefObject }} opts
 */
export function useExcalidrawUndo({ excalidrawAPIRef }) {
  const stackRef = useRef(null);
  if (stackRef.current === null) stackRef.current = createHistoryStack();
  const lastSigRef = useRef(null);
  const initedRef = useRef(false);
  const restoringRef = useRef(false);
  const timerRef = useRef(null);
  const [hist, setHist] = useState({ canUndo: false, canRedo: false });

  const syncState = useCallback(() => {
    const st = stackRef.current;
    setHist({ canUndo: st.canUndo, canRedo: st.canRedo });
  }, []);

  const recordHistory = useCallback((elements) => {
    if (restoringRef.current || !elements) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const api = excalidrawAPIRef.current;
      const els = api ? api.getSceneElements() : elements;
      const sig = signature(els);
      if (!initedRef.current) {
        initedRef.current = true;
        lastSigRef.current = sig;
        stackRef.current.init(els.slice());
        syncState();
        return;
      }
      if (sig === lastSigRef.current) return;
      lastSigRef.current = sig;
      stackRef.current.commit(els.slice());
      syncState();
    }, 350);
  }, [excalidrawAPIRef, syncState]);

  const restore = useCallback((snapshot) => {
    const api = excalidrawAPIRef.current;
    if (!snapshot || !api) return;
    restoringRef.current = true;
    lastSigRef.current = signature(snapshot);
    api.updateScene({ elements: snapshot, commitToHistory: false });
    syncState();
    setTimeout(() => { restoringRef.current = false; }, 80);
  }, [excalidrawAPIRef, syncState]);

  const undo = useCallback(() => { restore(stackRef.current.undo()); }, [restore]);
  const redo = useCallback(() => { restore(stackRef.current.redo()); }, [restore]);

  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const z = e.key === 'z' || e.key === 'Z';
      const y = e.key === 'y' || e.key === 'Y';
      if (z && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((z && e.shiftKey) || y) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [undo, redo]);

  return { recordHistory, undo, redo, canUndo: hist.canUndo, canRedo: hist.canRedo };
}
