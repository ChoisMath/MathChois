import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { getFreedrawOutline, getFreedrawOutlineNormalized, FREEDRAW_NORMALIZED_SIZE } from './wetInkStroke.js';

/* Galaxy Note25 Ultra(S Pen, zoom≈10, strokeWidth 0.05 하한)에서 "ㅆ"의 짧은 한 획 — scene 단위로 0.8×0.2 크기. */
const tick = JSON.parse(readFileSync(new URL('./__fixtures__/freedraw-android-tick.json', import.meta.url), 'utf8'));
const PF = { thinning: 0, smoothing: 0.12, streamline: 0.16, easing: (t) => t, start: { taper: 0, cap: true }, end: { taper: 0, cap: true }, last: true, simulatePressure: true };
const zoom = 10;
const size = tick.strokeWidth * 10; // 0.5 scene units = 5 screen px

/* 기준: wet-ink 미리보기와 같이 화면 px 에서 계산한 외곽선을 scene 단위로 되돌린 것 */
const screenRef = getFreedrawOutline(tick.points.map(([x, y]) => [x * zoom, y * zoom]), { ...PF, size: size * zoom })
  .map(([x, y]) => [x / zoom, y / zoom]);

/* 외곽선 두 개의 모양 차이: 한쪽의 각 점에서 다른 쪽까지의 최소 거리 중 최댓값 (양방향 중 큰 쪽). */
function shapeDeviation(a, b) {
  const oneWay = (p, q) => Math.max(...p.map((u) => Math.min(...q.map((v) => Math.hypot(u[0] - v[0], u[1] - v[1])))));
  return Math.max(oneWay(a, b), oneWay(b, a));
}

describe('getFreedrawOutlineNormalized', () => {
  it('reproduces the bug: raw scene-unit outline of a tiny stroke deviates by more than the stroke width', () => {
    const raw = getFreedrawOutline(tick.points, { ...PF, size });
    expect(shapeDeviation(raw, screenRef)).toBeGreaterThan(size);
  });

  it('stays close to the screen-pixel outline for a tiny high-zoom stroke', () => {
    const out = getFreedrawOutlineNormalized(tick.points, { ...PF, size });
    expect(shapeDeviation(out, screenRef)).toBeLessThan(size * 0.4);
  });

  it('is scale invariant: the same stroke at any unit scale gives the same shape', () => {
    const a = getFreedrawOutlineNormalized(tick.points, { ...PF, size });
    const b = getFreedrawOutlineNormalized(tick.points.map(([x, y]) => [x * 37, y * 37]), { ...PF, size: size * 37 });
    expect(b.length).toBe(a.length);
    expect(b[5][0] / 37).toBeCloseTo(a[5][0], 3);
    expect(FREEDRAW_NORMALIZED_SIZE).toBeGreaterThan(3); // perfect-freehand 의 3단위 끝 생략이 획 두께보다 작아야 한다
  });
});
