import { describe, it, expect } from 'vitest';
import { createPendingDiscard, createHistoryStack } from './excalidrawHistory';

describe('pending-discard 상태머신', () => {
  it('터치 시작 후 창 안에 펜이 오면 폐기 대상', () => {
    const m = createPendingDiscard({ windowMs: 150 });
    m.onStrokeStart({ pointerType: 'touch', id: 1, time: 1000 });
    expect(m.shouldDiscardOnPen({ time: 1100 })).toBe(true);
  });

  it('창 밖이면 폐기 안 함', () => {
    const m = createPendingDiscard({ windowMs: 150 });
    m.onStrokeStart({ pointerType: 'touch', id: 1, time: 1000 });
    expect(m.shouldDiscardOnPen({ time: 1200 })).toBe(false);
  });

  it('펜으로 시작한 획은 폐기 안 함', () => {
    const m = createPendingDiscard({ windowMs: 150 });
    m.onStrokeStart({ pointerType: 'pen', id: 1, time: 1000 });
    expect(m.shouldDiscardOnPen({ time: 1050 })).toBe(false);
  });

  it('clear 후에는 폐기 안 함, pendingId 노출', () => {
    const m = createPendingDiscard({ windowMs: 150 });
    m.onStrokeStart({ pointerType: 'touch', id: 7, time: 1000 });
    expect(m.pendingId).toBe(7);
    m.clear();
    expect(m.pendingId).toBe(null);
    expect(m.shouldDiscardOnPen({ time: 1010 })).toBe(false);
  });
});

describe('createHistoryStack', () => {
  it('init 직후엔 undo/redo 불가', () => {
    const h = createHistoryStack();
    h.init(['base']);
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
    expect(h.present).toEqual(['base']);
  });

  it('commit 후 undo 하면 직전 상태로 복귀', () => {
    const h = createHistoryStack();
    h.init(['base']);
    h.commit(['base', 'a']);
    expect(h.canUndo).toBe(true);
    expect(h.undo()).toEqual(['base']);
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(true);
  });

  it('undo 후 redo 복원', () => {
    const h = createHistoryStack();
    h.init(['base']);
    h.commit(['base', 'a']);
    h.undo();
    expect(h.redo()).toEqual(['base', 'a']);
    expect(h.canRedo).toBe(false);
  });

  it('기준선 이전으로는 undo 불가(배경/기존 노트 보호)', () => {
    const h = createHistoryStack();
    h.init(['base']);
    h.commit(['base', 'a']);
    h.undo();
    expect(h.undo()).toBe(null);
    expect(h.present).toEqual(['base']);
  });

  it('새 commit 은 redo 스택을 비운다', () => {
    const h = createHistoryStack();
    h.init(['base']);
    h.commit(['base', 'a']);
    h.undo();
    expect(h.canRedo).toBe(true);
    h.commit(['base', 'b']);
    expect(h.canRedo).toBe(false);
  });
});
