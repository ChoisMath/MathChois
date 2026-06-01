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
    shouldDiscardOnPen({ time, windowMs: override } = {}) {
      if (!pending) return false;
      const win = override ?? windowMs;
      return time - pending.time <= win;
    },
    clear() { pending = null; },
    get pendingId() { return pending?.id ?? null; },
  };
}

/**
 * ③ 자체 undo/redo 히스토리 스택.
 *
 * Excalidraw 0.18 ImperativeAPI 는 undo/redo 메서드를 노출하지 않고(`history: { clear }` 뿐),
 * 키보드 이벤트 디스패치도 이 임베드에서 동작하지 않으므로 씬 스냅샷 기반 자체 스택을 둔다.
 *
 * - init(baseline): 초기 로드(배경+기존 노트) 스냅샷으로 기준선 설정. undo 가 기준선 이전으로 못 감.
 * - commit(snapshot): 새 확정 상태 기록(redo 스택 비움).
 * - undo()/redo(): 복원할 스냅샷 반환(없으면 null).
 */
export function createHistoryStack() {
  let present = null;
  const undoStack = [];
  const redoStack = [];

  return {
    init(snapshot) {
      present = snapshot;
      undoStack.length = 0;
      redoStack.length = 0;
    },
    commit(snapshot) {
      if (present !== null) undoStack.push(present);
      present = snapshot;
      redoStack.length = 0;
    },
    undo() {
      if (undoStack.length === 0) return null;
      redoStack.push(present);
      present = undoStack.pop();
      return present;
    },
    redo() {
      if (redoStack.length === 0) return null;
      undoStack.push(present);
      present = redoStack.pop();
      return present;
    },
    get present() { return present; },
    get canUndo() { return undoStack.length > 0; },
    get canRedo() { return redoStack.length > 0; },
  };
}
