/**
 * ①B 보류-폐기 상태머신.
 * 터치로 시작된 freedraw 획을 짧은 창 동안 미확정으로 잡아두고,
 * 그 안에 펜 pointerdown 이 오면 해당 획을 commit 전에 폐기할지 판정한다.
 *
 * @param {{ windowMs?: number }} opts
 */
export function createPendingDiscard({ windowMs = 150 } = {}) {
  let pending = null; // { id, time }

  return {
    onStrokeStart({ pointerType, id, time }) {
      pending = pointerType === 'touch' ? { id, time } : null;
    },
    shouldDiscardOnPen({ time }) {
      if (!pending) return false;
      return time - pending.time <= windowMs;
    },
    clear() { pending = null; },
    get pendingId() { return pending?.id ?? null; },
  };
}

/**
 * ③ undo/redo 트리거.
 * 기존 팜 코드가 document 에 Ctrl+Z 를 디스패치해 undo 가 동작함을 근거로 동일 방식 사용.
 * 화면 버튼(태블릿)·키보드(데스크톱) 양쪽에서 호출된다.
 */
export function triggerUndo() {
  document.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'z', code: 'KeyZ', ctrlKey: true, bubbles: true, cancelable: true,
  }));
}

export function triggerRedo() {
  document.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'z', code: 'KeyZ', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true,
  }));
}
