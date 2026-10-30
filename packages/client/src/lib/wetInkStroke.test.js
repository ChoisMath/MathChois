import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { getFreedrawOutline, getFreedrawOutlineNormalized, FREEDRAW_NORMALIZED_SIZE, makeFreedrawElement, makeShapeFillElement, SHAPE_FILL_OPACITY } from './wetInkStroke.js';

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

describe('getFreedrawOutlineNormalized — 미세 역행 점 (아이패드 핀홀)', () => {
  it('프레임 경계마다 size 보다 짧게 물러나는 점이 있어도 외곽선 폭이 균일하다', () => {
    const size = 1.2;
    const clean = []; const dirty = [];
    for (let d = 0; d <= 400; d += 4) {
      clean.push([d, 0, .5]); dirty.push([d, 0, .5]);
      if (d % 16 === 0 && d > 0) dirty.push([d - 0.8, 0, .5]);
    }
    const opts = { ...PF, size };
    const outClean = getFreedrawOutlineNormalized(clean, opts);
    const outDirty = getFreedrawOutlineNormalized(dirty, opts);
    // 외곽선의 |y| 최대값: 역행 점이 부채꼴(반지름 size/2)을 만들면 x 방향으로도 튀고 폭이 들쭉날쭉해진다
    const widthProfile = (o) => o.filter((p) => p[0] > 20 && p[0] < 380).map((p) => Math.abs(p[1]));
    const maxClean = Math.max(...widthProfile(outClean));
    const maxDirty = Math.max(...widthProfile(outDirty));
    const minDirty = Math.min(...widthProfile(outDirty));
    expect(maxDirty).toBeLessThanOrEqual(maxClean + 0.05);
    expect(minDirty).toBeGreaterThanOrEqual(size / 2 - 0.05);
    expect(outDirty.length).toBe(outClean.length);
  });
});

describe('makeShapeFillElement — 도형 보정 채우기', () => {
  it('선 색으로 반투명하게 채운 닫힌 line 요소, 점은 첫 점 기준 상대좌표, 같은 그룹', () => {
    const pts = [[100, 100], [300, 100], [300, 220], [100, 220], [100, 100]].map(([x, y]) => ({ x, y }));
    const el = makeShapeFillElement(pts, { strokeColor: '#ff0000', groupId: 'g1' });
    expect(el.type).toBe('line');
    expect(el.backgroundColor).toBe('#ff0000');
    expect(el.strokeColor).toBe('transparent');
    expect(el.fillStyle).toBe('solid');
    expect(el.opacity).toBe(SHAPE_FILL_OPACITY);
    expect(SHAPE_FILL_OPACITY).toBe(15);
    expect(el.groupIds).toEqual(['g1']);
    expect(el.customData).toEqual({ shapeFill: true });
    expect([el.x, el.y, el.width, el.height]).toEqual([100, 100, 200, 120]);
    expect(el.points[0]).toEqual([0, 0]);
    expect(el.points[el.points.length - 1]).toEqual([0, 0]); // 닫힌 경로 → polygon 으로 채워짐
    expect(el.id.startsWith('wf_')).toBe(true);
  });
  it('makeFreedrawElement 는 groupIds 를 받는다', () => {
    const el = makeFreedrawElement([{ x: 0, y: 0 }, { x: 10, y: 0 }], [0.5, 0.5], { strokeColor: '#000', strokeWidth: 1, simulatePressure: true, groupIds: ['g2'] });
    expect(el.groupIds).toEqual(['g2']);
  });
});
