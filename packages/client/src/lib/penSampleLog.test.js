import { describe, it, expect, beforeEach } from 'vitest';
import { beginPenStroke, recordPenMove, endPenStroke, getPenStrokeSamples, resetPenStrokeSamples } from './penSampleLog';

const ev = (x, y, t) => ({ clientX: x, clientY: y, timeStamp: t, pressure: 0.5, getCoalescedEvents: () => [] });

describe('penSampleLog', () => {
  beforeEach(() => resetPenStrokeSamples());

  it('획마다 down·move(메인 좌표 + coalesced 원본)·종료 정보를 남기고 최근 3개만 유지한다', () => {
    for (let s = 0; s < 4; s++) {
      beginPenStroke(ev(s, 0, 100 + s), { zoom: 0.7 });
      recordPenMove(ev(10, 0, 110), [ev(4, 0, 104), ev(8, 0, 108), ev(10, 0, 110)], 3);
      recordPenMove(ev(20, 0, 120), [], 1);
      endPenStroke({ committedPoints: 4 });
    }
    const all = getPenStrokeSamples();
    expect(all.length).toBe(3);
    const last = all[2];
    expect(last.down).toEqual({ t: 103, x: 3, y: 0, p: 0.5 });
    expect(last.zoom).toBe(0.7);
    expect(last.hasCoalesced).toBe(true);
    expect(last.moves[0]).toEqual({ t: 110, x: 10, y: 0, c: [[4, 0, 104], [8, 0, 108], [10, 0, 110]], used: 3 });
    expect(last.moves[1].c).toEqual([]);
    expect(last.committedPoints).toBe(4);
  });

  it('시작 없이 move/end 가 와도 무시한다', () => {
    recordPenMove(ev(1, 1, 1), [], 1);
    endPenStroke();
    expect(getPenStrokeSamples()).toEqual([]);
  });
});
