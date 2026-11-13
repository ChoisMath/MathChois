import { describe, it, expect } from 'vitest';
import { createRequestGate } from './requestGate';

describe('createRequestGate', () => {
  it('마지막에 시작한 요청만 최신이다(늦게 도착한 이전 응답은 버린다)', () => {
    const gate = createRequestGate();
    const a = gate.next();
    const b = gate.next();
    expect(gate.isLatest(a)).toBe(false);
    expect(gate.isLatest(b)).toBe(true);
  });
  it('요청이 하나면 그것이 최신', () => {
    const gate = createRequestGate();
    expect(gate.isLatest(gate.next())).toBe(true);
  });
});
