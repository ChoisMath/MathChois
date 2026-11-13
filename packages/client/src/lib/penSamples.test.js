import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { orderCoalesced, isMicroReversal, dropMicroReversals, isStaleSample, MICRO_REVERSAL_PX } from './penSamples';

const ev = (x, y, t) => ({ clientX: x, clientY: y, timeStamp: t });

describe('orderCoalesced — coalesced 이벤트 순서 보정', () => {
  it('timeStamp 오름차순으로 정렬한다 (안정 정렬)', () => {
    const evs = [ev(16, 0, 30), ev(4, 0, 10), ev(12, 0, 20), ev(8, 0, 20)];
    expect(orderCoalesced(evs, [0, 0]).map((e) => e.clientX)).toEqual([4, 12, 8, 16]);
  });
  it('이미 순서가 맞으면 그대로', () => {
    const evs = [ev(4, 0, 1), ev(8, 0, 2), ev(12, 0, 3)];
    expect(orderCoalesced(evs, [0, 0])).toEqual(evs);
  });
  it('timeStamp 가 모두 같으면 직전 점에서 먼 점이 먼저 오는 묶음을 뒤집는다', () => {
    const evs = [ev(16, 0, 5), ev(12, 0, 5), ev(8, 0, 5), ev(4, 0, 5)];
    expect(orderCoalesced(evs, [0, 0]).map((e) => e.clientX)).toEqual([4, 8, 12, 16]);
    const ok = [ev(4, 0, 5), ev(8, 0, 5), ev(12, 0, 5)];
    expect(orderCoalesced(ok, [0, 0]).map((e) => e.clientX)).toEqual([4, 8, 12]);
  });
  it('직전 점이 없거나 1개면 그대로', () => {
    expect(orderCoalesced([ev(16, 0, 5), ev(4, 0, 5)], null).map((e) => e.clientX)).toEqual([16, 4]);
    expect(orderCoalesced([ev(16, 0, 5)], [0, 0]).map((e) => e.clientX)).toEqual([16]);
    expect(orderCoalesced([], [0, 0])).toEqual([]);
  });
});

describe('isMicroReversal / dropMicroReversals — 미세 역행 점 제거', () => {
  it('기본 임계값은 화면 2.5px', () => expect(MICRO_REVERSAL_PX).toBe(2.5));

  it('진행 방향과 반대로 임계값보다 짧게 물러난 점은 역행', () => {
    const pts = [[0, 0], [10, 0]];
    expect(isMicroReversal(pts, [9.2, 0], 2.5)).toBe(true);
    expect(isMicroReversal(pts, [10.5, 0], 2.5)).toBe(false);   // 전진
    expect(isMicroReversal(pts, [6, 0], 2.5)).toBe(false);      // 4px 역행 = 진짜 되돌림
    expect(isMicroReversal(pts, [10, 2], 2.5)).toBe(false);     // 직각 이동
    expect(isMicroReversal([[0, 0]], [-1, 0], 2.5)).toBe(false); // 방향 정보 없음
  });

  it('dropMicroReversals: 프레임 경계마다 0.8px 물러나는 점을 걷어낸다', () => {
    const pts = [];
    for (let d = 0; d <= 160; d += 4) { pts.push([d, 0]); if (d % 16 === 0 && d > 0) pts.push([d - 0.8, 0]); }
    const out = dropMicroReversals(pts, 2.5);
    expect(out.length).toBe(41);
    for (let i = 1; i < out.length; i++) expect(out[i][0]).toBeGreaterThan(out[i - 1][0]);
  });

  it('dropMicroReversals: ㅅ 꼭짓점 같은 진짜 되돌림은 보존한다', () => {
    const pts = [[0, 0], [10, 10], [20, 20], [30, 30], [20, 24], [10, 28], [0, 32]];
    expect(dropMicroReversals(pts, 2.5)).toEqual(pts);
  });

  it('dropMicroReversals: 점 2개 이하·임계값 0 은 그대로', () => {
    expect(dropMicroReversals([[0, 0], [-1, 0]], 2.5)).toEqual([[0, 0], [-1, 0]]);
    expect(dropMicroReversals([[0, 0], [10, 0], [9, 0]], 0)).toEqual([[0, 0], [10, 0], [9, 0]]);
  });

  it('dropMicroReversals: 세 번째 요소(압력)를 보존한다', () => {
    expect(dropMicroReversals([[0, 0, .3], [10, 0, .4], [9.5, 0, .5], [20, 0, .6]], 2.5))
      .toEqual([[0, 0, .3], [10, 0, .4], [20, 0, .6]]);
  });
});

describe('isStaleSample — 같은 pointermove 가 두 번 전달될 때 (iPad Chrome/WebKit 실측)', () => {
  it('timeStamp 가 되돌아가거나, 같은 시각에 같은 좌표면 stale', () => {
    const last = { t: 100, x: 10, y: 20 };
    expect(isStaleSample(last, { timeStamp: 96, clientX: 8, clientY: 19 })).toBe(true);   // 과거 샘플 재전달
    expect(isStaleSample(last, { timeStamp: 100, clientX: 10, clientY: 20 })).toBe(true); // 완전 중복
    expect(isStaleSample(last, { timeStamp: 100, clientX: 11, clientY: 20 })).toBe(false); // 같은 ms 다른 점
    expect(isStaleSample(last, { timeStamp: 104, clientX: 10, clientY: 20 })).toBe(false); // 멈춰 있음(정상)
    expect(isStaleSample(null, { timeStamp: 1, clientX: 0, clientY: 0 })).toBe(false);
  });

  it('실측 픽스처: 중복 이벤트를 걸러내면 역행이 0이 되고, 걸러내지 않으면 획마다 수십 개', () => {
    const strokes = JSON.parse(readFileSync(new URL('./__fixtures__/pen-samples-ipad-chrome.json', import.meta.url), 'utf8'));
    const build = (s, dedupe) => {
      const pts = [[s.down.x, s.down.y]];
      let last = null;
      for (const m of s.moves) {
        const raw = m.c.map(([x, y, t]) => ({ clientX: x, clientY: y, timeStamp: t }));
        for (const ev of orderCoalesced(raw, pts[pts.length - 1])) {
          if (dedupe) { if (isStaleSample(last, ev)) continue; last = { t: ev.timeStamp, x: ev.clientX, y: ev.clientY }; }
          const p = [ev.clientX, ev.clientY];
          if (isMicroReversal(pts, p, MICRO_REVERSAL_PX)) continue;
          pts.push(p);
        }
      }
      return pts;
    };
    const backSteps = (pts) => {
      let n = 0;
      for (let i = 2; i < pts.length; i++) {
        const [p, q, d] = [pts[i], pts[i - 1], pts[i - 2]];
        if ((p[0] - q[0]) * (q[0] - d[0]) + (p[1] - q[1]) * (q[1] - d[1]) < 0) n += 1;
      }
      return n;
    };
    let dupMoves = 0;
    for (const s of strokes) for (let i = 1; i < s.moves.length; i++) if (s.moves[i].t === s.moves[i - 1].t) dupMoves += 1;
    expect(dupMoves).toBeGreaterThan(200);
    for (const s of strokes) {
      expect(backSteps(build(s, false))).toBeGreaterThan(50);
      expect(backSteps(build(s, true))).toBe(0);
      expect(build(s, true).length).toBeLessThan(build(s, false).length * 0.7);
    }
  });
});
