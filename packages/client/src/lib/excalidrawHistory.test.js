import { describe, it, expect } from 'vitest';
import { createPendingDiscard } from './excalidrawHistory';

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
