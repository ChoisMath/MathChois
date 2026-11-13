import { describe, it, expect } from 'vitest';
import {
  recognizeShape, snapLineEnd,
  HOLD_MS, HOLD_RADIUS_PX, CANCEL_MOVE_PX, MIN_LINE_PX, OUT_SPACING_PX,
} from './shapeRecognizer';

/* ── 합성 획 생성기 (결정적 지터) ── */
let seed = 1;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
const jitter = (pts, amp) => { seed = 7; return pts.map(([x, y]) => [x + rnd() * 2 * amp, y + rnd() * 2 * amp]); };

const seg = (a, b, step = 2) => {
  const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
  const out = [];
  for (let i = 0; i < n; i++) out.push([a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]);
  return out;
};
const polyline = (verts, step = 2) => {
  const out = [];
  for (let i = 0; i < verts.length - 1; i++) out.push(...seg(verts[i], verts[i + 1], step));
  out.push(verts[verts.length - 1]);
  return out;
};
const ellipsePts = (cx, cy, a, b, { from = 0, to = Math.PI * 2, n = 150 } = {}) => {
  const out = [];
  for (let i = 0; i <= n; i++) { const t = from + (to - from) * i / n; out.push([cx + a * Math.cos(t), cy + b * Math.sin(t)]); }
  return out;
};
const rotate = (pts, deg, cx, cy) => {
  const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  return pts.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]);
};
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const bbox = (pts) => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
};
const maxSpacing = (pts) => Math.max(...pts.slice(1).map((p, i) => dist(p, pts[i])));
const distToSeg = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return dist(p, [a[0] + dx * t, a[1] + dy * t]);
};
/** 결과 점이 꼭짓점 목록이 이루는 닫힌 다각형 위에 있는지 (최대 오차) */
const maxDistToPolygon = (pts, verts) => Math.max(...pts.map((p) =>
  Math.min(...verts.map((v, i) => distToSeg(p, v, verts[(i + 1) % verts.length])))));

describe('shapeRecognizer 상수', () => {
  it('설계 기본값', () => {
    expect(HOLD_MS).toBe(500);
    expect(HOLD_RADIUS_PX).toBe(4);
    expect(CANCEL_MOVE_PX).toBe(20);
    expect(MIN_LINE_PX).toBe(40);
    expect(OUT_SPACING_PX).toBe(3);
  });
});

describe('recognizeShape — 입력 방어', () => {
  it('점이 2개 미만·NaN 이면 null', () => {
    expect(recognizeShape([])).toBeNull();
    expect(recognizeShape([[1, 1]])).toBeNull();
    expect(recognizeShape([[0, 0], [NaN, 3], [1, 1]])).toBeNull();
    expect(recognizeShape([[5, 5], [5, 5], [5, 5]])).toBeNull();
  });
});

describe('recognizeShape — 선분', () => {
  it('흔들린 200px 선분 → line, 시작점→끝점 직선, 3px 간격', () => {
    const raw = jitter(polyline([[100, 100], [280, 190]]), 3);
    const r = recognizeShape(raw);
    expect(r?.kind).toBe('line');
    expect(r.points[0]).toEqual(raw[0]);
    expect(r.points[r.points.length - 1]).toEqual(raw[raw.length - 1]);
    expect(maxDistToPolygon(r.points, [raw[0], raw[raw.length - 1]])).toBeLessThan(1e-6);
    expect(maxSpacing(r.points)).toBeLessThanOrEqual(OUT_SPACING_PX + 1e-6);
  });

  it('수평에서 1.5° 기운 선분은 수평으로 스냅', () => {
    const raw = polyline([[100, 100], [300, 100 + 200 * Math.tan(1.5 * Math.PI / 180)]]);
    const r = recognizeShape(raw);
    expect(r.kind).toBe('line');
    expect(r.points.every((p) => Math.abs(p[1] - 100) < 1e-9)).toBe(true);
    expect(r.points[r.points.length - 1][0]).toBeCloseTo(300, 6);
  });

  it('수직에서 2° 기운 선분은 수직으로 스냅', () => {
    const raw = polyline([[100, 100], [100 + 150 * Math.tan(2 * Math.PI / 180), 250]]);
    const r = recognizeShape(raw);
    expect(r.kind).toBe('line');
    expect(r.points.every((p) => Math.abs(p[0] - 100) < 1e-9)).toBe(true);
  });

  it('10° 기운 선분은 그대로 (스냅 안 함)', () => {
    const end = [100 + 200 * Math.cos(10 * Math.PI / 180), 100 + 200 * Math.sin(10 * Math.PI / 180)];
    const r = recognizeShape(polyline([[100, 100], end]));
    expect(r.kind).toBe('line');
    expect(r.points[r.points.length - 1][1]).toBeCloseTo(end[1], 6);
  });

  it('40px 미만 선분은 null', () => {
    expect(recognizeShape(polyline([[100, 100], [130, 100]]))).toBeNull();
  });

  it('ㄱ 모양(꺾인 획)은 null', () => {
    expect(recognizeShape(jitter(polyline([[100, 100], [180, 100], [180, 180]]), 1))).toBeNull();
  });

  it('snapLineEnd: 3° 이내면 수평/수직, 아니면 그대로', () => {
    expect(snapLineEnd([0, 0], [100, 2])).toEqual([100, 0]);
    expect(snapLineEnd([0, 0], [-3, 120])).toEqual([0, 120]);
    expect(snapLineEnd([0, 0], [100, 20])).toEqual([100, 20]);
    expect(snapLineEnd([0, 0], [0, 0])).toEqual([0, 0]);
  });
});

describe('recognizeShape — 사각형', () => {
  it('살짝 기울고 흔들린 축 정렬 직사각형 → rect, 바운딩박스 모서리', () => {
    const verts = [[100, 100], [300, 100], [300, 220], [100, 220], [104, 106]];
    const raw = jitter(rotate(polyline(verts), 2, 200, 160), 2);
    const r = recognizeShape(raw);
    expect(r?.kind).toBe('rect');
    const b = bbox(raw);
    const corners = [[b.minX, b.minY], [b.maxX, b.minY], [b.maxX, b.maxY], [b.minX, b.maxY]];
    expect(maxDistToPolygon(r.points, corners)).toBeLessThan(1e-6);
    expect(r.points[0]).toEqual(r.points[r.points.length - 1]); // 폐곡선
    expect(maxSpacing(r.points)).toBeLessThanOrEqual(OUT_SPACING_PX + 1e-6);
    for (const c of corners) expect(Math.min(...r.points.map((p) => dist(p, c)))).toBeLessThan(1e-6); // 꼭짓점 포함
  });

  it('30° 회전한 직사각형 → rect, 그린 꼭짓점 그대로', () => {
    const verts = [[100, 100], [300, 100], [300, 220], [100, 220], [100, 100]];
    const rv = rotate(verts, 30, 200, 160);
    const r = recognizeShape(jitter(polyline(rv), 1.5));
    expect(r?.kind).toBe('rect');
    expect(maxDistToPolygon(r.points, rv.slice(0, 4))).toBeLessThan(8);
    for (const c of rv.slice(0, 4)) expect(Math.min(...r.points.map((p) => dist(p, c)))).toBeLessThan(8);
  });

  it('끝이 시작 변을 지나쳐 겹쳐도 rect', () => {
    const verts = [[100, 100], [300, 100], [300, 220], [100, 220], [100, 96], [140, 98]]; // 시작 변 위로 되돌아 겹침
    const r = recognizeShape(jitter(polyline(verts), 1));
    expect(r?.kind).toBe('rect');
  });
});

describe('recognizeShape — 삼각형', () => {
  it('흔들린 삼각형 → triangle, 세 꼭짓점 근처', () => {
    const verts = [[200, 80], [320, 260], [80, 260], [204, 86]];
    const r = recognizeShape(jitter(polyline(verts), 2));
    expect(r?.kind).toBe('triangle');
    for (const c of verts.slice(0, 3)) expect(Math.min(...r.points.map((p) => dist(p, c)))).toBeLessThan(8);
    expect(maxDistToPolygon(r.points, verts.slice(0, 3))).toBeLessThan(8);
    expect(r.points[0]).toEqual(r.points[r.points.length - 1]);
  });
});

describe('recognizeShape — 원·타원', () => {
  it('흔들린 원(r=80) → circle, 중심에서 등거리', () => {
    const raw = jitter(ellipsePts(300, 300, 80, 80), 2.5);
    const r = recognizeShape(raw);
    expect(r?.kind).toBe('circle');
    const b = bbox(r.points);
    const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
    const radii = r.points.map((p) => dist(p, [cx, cy]));
    const rad = radii.reduce((s, v) => s + v, 0) / radii.length;
    expect(rad).toBeGreaterThan(76); expect(rad).toBeLessThan(84);
    expect(Math.max(...radii.map((v) => Math.abs(v - rad)))).toBeLessThan(0.01);
    expect(r.points[0]).toEqual(r.points[r.points.length - 1]);
    expect(maxSpacing(r.points)).toBeLessThanOrEqual(OUT_SPACING_PX + 1e-6);
  });

  it('타원(a=120, b=60) → ellipse, 타원 방정식 만족', () => {
    const r = recognizeShape(jitter(ellipsePts(300, 300, 120, 60), 2));
    expect(r?.kind).toBe('ellipse');
    const b = bbox(r.points);
    expect(b.w).toBeGreaterThan(230); expect(b.w).toBeLessThan(250);
    expect(b.h).toBeGreaterThan(110); expect(b.h).toBeLessThan(130);
    const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2, a = b.w / 2, bb = b.h / 2;
    for (const [x, y] of r.points) expect(Math.hypot((x - cx) / a, (y - cy) / bb)).toBeCloseTo(1, 3);
  });

  it('시작점이 위쪽이어도(시작 각도 무관) circle', () => {
    expect(recognizeShape(jitter(ellipsePts(300, 300, 60, 60, { from: -Math.PI / 2, to: Math.PI * 1.5 }), 2))?.kind).toBe('circle');
  });
});

describe('recognizeShape — 오인식 방지', () => {
  it('작은 원(r=12, 글자 ㅇ)은 null', () => {
    expect(recognizeShape(jitter(ellipsePts(100, 100, 12, 12), 1))).toBeNull();
  });
  it('반원(열린 곡선)은 null', () => {
    expect(recognizeShape(jitter(ellipsePts(300, 300, 80, 80, { from: 0, to: Math.PI }), 1))).toBeNull();
  });
  it('지그재그 글씨 획은 null', () => {
    const z = polyline([[100, 100], [140, 180], [180, 100], [220, 180], [260, 100], [300, 180]]);
    expect(recognizeShape(jitter(z, 1))).toBeNull();
  });
  it('ㅅ 모양은 null', () => {
    expect(recognizeShape(jitter(polyline([[100, 200], [160, 100], [220, 200]]), 1))).toBeNull();
  });
  it('닫혔지만 들쭉날쭉한 별 모양은 null', () => {
    const star = [];
    for (let i = 0; i <= 10; i++) { const t = -Math.PI / 2 + i * Math.PI / 5; const rr = i % 2 ? 40 : 100; star.push([300 + rr * Math.cos(t), 300 + rr * Math.sin(t)]); }
    expect(recognizeShape(jitter(polyline(star), 1))).toBeNull();
  });
});
