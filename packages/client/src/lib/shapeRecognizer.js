/*
 * 펜 멈춤 → 도형 자동 보정 인식기 (순수 함수, DOM/Excalidraw 의존 없음).
 * 설계: docs/superpowers/specs/2026-10-29-pen-shape-snap-design.md
 *
 * 입력·출력 모두 화면 px `[x, y]` 배열. 손글씨 획을 선분 / 원·타원 / 삼각형 / 사각형 중 하나로 판정하고,
 * 성공하면 반듯한 도형을 3px 간격의 촘촘한 점으로 돌려준다(perfect-freehand 의 streamline/smoothing 이
 * 드문 꼭짓점을 둥글리기 때문). 닫힌 도형은 마지막 점 = 첫 점. 판정되지 않으면 null.
 */

/* ── 멈춤·취소 (훅이 사용) ── */
export const HOLD_MS = 500;          // 멈춤 판정 시간
export const HOLD_RADIUS_PX = 4;     // 이 반경 안의 움직임은 "멈춤"
export const CANCEL_MOVE_PX = 20;    // 닫힌 도형 확정 뒤 이만큼 더 움직이면 보정 취소

/* ── 선분 ── */
export const MIN_LINE_PX = 40;
const LINE_DEV_RATIO = 0.04;         // 현(弦) 길이 대비 허용 편차
const LINE_DEV_MIN_PX = 3;
const ANGLE_SNAP_DEG = 3;            // 수평·수직 스냅

/* ── 닫힌 도형 공통 ── */
const CLOSE_RATIO = 0.15;            // 닫힘 틈 ≤ 대각선 × 15%
const CLOSE_MIN_PX = 25;
const CLOSE_PORTION = 0.25;          // 닫힘 틈: 끝점↔획의 처음 25% (또는 시작점↔마지막 25%) 중 최소 거리 — 지나쳐 겹친 끝 허용
const MIN_SIDE_PX = 30;              // 바운딩박스 짧은 변
const MIN_CLOSED_LEN_PX = 100;       // 총 길이

/* ── 다각형 ── */
const RDP_RATIO = 0.05;              // ε = 대각선 × 5%
const RECT_AXIS_DEG = 12;            // 네 변이 축에서 이 안이면 축 정렬 직사각형
const MIN_EDGE_PX = 15;
const COLLINEAR_DEG = 15;            // 꺾임이 이보다 작으면 꼭짓점 아님
const POLY_FIT_RATIO = 0.06;         // 다각형 평균 오차 ≤ 대각선 × 6%

/* ── 타원 ── */
const ELLIPSE_MEAN = 0.12;
const ELLIPSE_MAX = 0.30;
const CIRCLE_RATIO_MIN = 0.85;
const CIRCLE_RATIO_MAX = 1.18;

export const OUT_SPACING_PX = 3;     // 결과 점 간격
const RESAMPLE_PX = 2;               // 판정 전 리샘플 간격
const MIN_ELLIPSE_POINTS = 64;

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const isFinitePoint = (p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]);

/** 점 p 에서 선분 ab 까지의 거리 */
function distToSegment(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  if (!l2) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return dist(p, [a[0] + dx * t, a[1] + dy * t]);
}

/** 일정 간격으로 리샘플 (중복점 제거 포함). 첫 점·마지막 점은 보존. */
function resample(points, spacing) {
  const out = [points[0]];
  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    let a = out[out.length - 1];
    const b = points[i];
    let d = dist(a, b);
    if (d === 0) continue;
    while (carry + d >= spacing) {
      const t = (spacing - carry) / d;
      const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      out.push(p);
      a = p; d = dist(a, b); carry = 0;
    }
    carry += d;
  }
  const last = points[points.length - 1];
  if (dist(out[out.length - 1], last) > 1e-9) out.push(last);
  return out;
}

function bbox(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x; if (y < minY) minY = y;
    if (x > maxX) maxX = x; if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY, diag: Math.hypot(maxX - minX, maxY - minY) };
}

/** 닫힘 틈: 끝점에서 획의 처음 25% 까지, 시작점에서 마지막 25% 까지의 최소 거리 (지나쳐 겹친 끝을 허용) */
function closeGap(points) {
  const n = points.length, k = Math.max(1, Math.floor(n * CLOSE_PORTION));
  const start = points[0], end = points[n - 1];
  let gap = Infinity;
  for (let i = 0; i < k; i++) gap = Math.min(gap, dist(end, points[i]));
  for (let i = n - k; i < n; i++) gap = Math.min(gap, dist(start, points[i]));
  return gap;
}

function pathLength(points) {
  let s = 0;
  for (let i = 1; i < points.length; i++) s += dist(points[i - 1], points[i]);
  return s;
}

/** Ramer–Douglas–Peucker (열린 폴리라인) */
function rdp(points, eps) {
  if (points.length < 3) return points.slice();
  const a = points[0], b = points[points.length - 1];
  let maxD = -1, idx = -1;
  for (let i = 1; i < points.length - 1; i++) {
    const d = distToSegment(points[i], a, b);
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD <= eps) return [a, b];
  const left = rdp(points.slice(0, idx + 1), eps);
  const right = rdp(points.slice(idx), eps);
  return left.slice(0, -1).concat(right);
}

/** 두 변 사이의 꺾임 각(도). 0 = 일직선 */
function turnDeg(prev, v, next) {
  const a1 = Math.atan2(v[1] - prev[1], v[0] - prev[0]);
  const a2 = Math.atan2(next[1] - v[1], next[0] - v[0]);
  let d = Math.abs(a2 - a1) * 180 / Math.PI;
  if (d > 180) d = 360 - d;
  return d;
}

/**
 * RDP 꼭짓점 → 닫힌 다각형 꼭짓점. 시작 변을 지나쳐 겹친 끝, 거의 일직선인 꼭짓점, 너무 짧은 변을 정리한다.
 */
function closedVertices(verts, eps) {
  let v = verts.slice();
  // 닫기: 끝이 시작점 근처이거나 시작 변 위에 겹치면 끝 제거, 시작이 마지막 변 위에 겹치면 시작 제거
  const closeEps = Math.max(eps * 2, 10);
  while (v.length > 3 && (dist(v[v.length - 1], v[0]) <= closeEps || distToSegment(v[v.length - 1], v[0], v[1]) <= eps)) v.pop();
  while (v.length > 3 && distToSegment(v[0], v[v.length - 1], v[v.length - 2]) <= eps) v.shift();
  // 일직선 꼭짓점·짧은 변 정리 (안정될 때까지)
  let changed = true;
  while (changed && v.length > 3) {
    changed = false;
    for (let i = 0; i < v.length; i++) {
      const prev = v[(i - 1 + v.length) % v.length], next = v[(i + 1) % v.length];
      if (turnDeg(prev, v[i], next) < COLLINEAR_DEG) { v.splice(i, 1); changed = true; break; }
    }
    if (changed) continue;
    for (let i = 0; i < v.length; i++) {
      const next = v[(i + 1) % v.length];
      if (dist(v[i], next) < MIN_EDGE_PX) {
        const mid = [(v[i][0] + next[0]) / 2, (v[i][1] + next[1]) / 2];
        v.splice(i, 1);
        v[i % v.length] = mid;
        changed = true; break;
      }
    }
  }
  return v;
}

/** 점들이 닫힌 다각형 변에서 떨어진 평균 거리 */
function polygonError(points, verts) {
  let s = 0;
  for (const p of points) {
    let m = Infinity;
    for (let i = 0; i < verts.length; i++) m = Math.min(m, distToSegment(p, verts[i], verts[(i + 1) % verts.length]));
    s += m;
  }
  return s / points.length;
}

/** 타원 적합: 바운딩박스 중심·반지름 기준 반경 오차. { mean, max, errPx } */
function ellipseFit(points, b) {
  const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2, a = b.w / 2, bb = b.h / 2;
  let sum = 0, max = 0;
  for (const [x, y] of points) {
    const e = Math.abs(Math.hypot((x - cx) / a, (y - cy) / bb) - 1);
    sum += e; if (e > max) max = e;
  }
  const mean = sum / points.length;
  return { mean, max, errPx: mean * Math.min(a, bb) };
}

/** 선분 시작·끝 → 수평/수직 3° 이내면 스냅한 끝점 */
export function snapLineEnd(start, end) {
  const dx = end[0] - start[0], dy = end[1] - start[1];
  if (!dx && !dy) return [end[0], end[1]];
  const deg = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI);          // 0..180
  const offH = Math.min(deg, 180 - deg);                               // 수평에서의 각
  const offV = Math.abs(90 - deg);                                     // 수직에서의 각
  if (offH <= ANGLE_SNAP_DEG) return [end[0], start[1]];
  if (offV <= ANGLE_SNAP_DEG) return [start[0], end[1]];
  return [end[0], end[1]];
}

/** 두 점 사이를 OUT_SPACING_PX 간격으로 (끝점 포함, 시작점 제외) */
function densifyEdge(a, b, out) {
  const n = Math.max(1, Math.ceil(dist(a, b) / OUT_SPACING_PX));
  for (let i = 1; i <= n; i++) out.push([a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]);
}

/** 선분 결과 점 */
export function linePoints(start, end) {
  const out = [[start[0], start[1]]];
  densifyEdge(start, end, out);
  return out;
}

function polygonPoints(verts) {
  const out = [[verts[0][0], verts[0][1]]];
  for (let i = 0; i < verts.length; i++) densifyEdge(verts[i], verts[(i + 1) % verts.length], out);
  out[out.length - 1] = [out[0][0], out[0][1]]; // 폐곡선: 마지막 점 = 첫 점 (부동소수 오차 제거)
  return out;
}

function ellipsePoints(cx, cy, a, b, startAngle) {
  const circ = Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
  const n = Math.max(MIN_ELLIPSE_POINTS, Math.ceil(circ / OUT_SPACING_PX));
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = startAngle + Math.PI * 2 * i / n;
    out.push([cx + a * Math.cos(t), cy + b * Math.sin(t)]);
  }
  out.push([out[0][0], out[0][1]]);
  return out;
}

/**
 * @param {number[][]} rawPoints 화면 px [x, y]
 * @returns {null | { kind: 'line'|'rect'|'triangle'|'ellipse'|'circle', points: number[][] }}
 */
export function recognizeShape(rawPoints) {
  if (!Array.isArray(rawPoints) || rawPoints.length < 2 || !rawPoints.every(isFinitePoint)) return null;
  const pts = resample(rawPoints, RESAMPLE_PX);
  if (pts.length < 2) return null;
  const start = pts[0], end = pts[pts.length - 1];
  const b = bbox(rawPoints); // 출력 도형(직사각형·타원)은 실제로 그린 범위에 맞춘다
  if (!(b.diag > 0)) return null;

  /* 1. 선분 */
  const chord = dist(start, end);
  if (chord >= MIN_LINE_PX) {
    let maxDev = 0;
    for (const p of pts) maxDev = Math.max(maxDev, distToSegment(p, start, end));
    if (maxDev <= Math.max(chord * LINE_DEV_RATIO, LINE_DEV_MIN_PX)) {
      return { kind: 'line', points: linePoints(start, snapLineEnd(start, end)) };
    }
  }

  /* 2. 닫힌 도형 공통 조건 */
  if (closeGap(pts) > Math.max(b.diag * CLOSE_RATIO, CLOSE_MIN_PX)) return null;
  if (Math.min(b.w, b.h) < MIN_SIDE_PX) return null;
  if (pathLength(pts) < MIN_CLOSED_LEN_PX) return null;

  /* 3. 다각형 후보 (삼각형·사각형) */
  const eps = b.diag * RDP_RATIO;
  const verts = closedVertices(rdp(pts, eps), eps);
  let poly = null;
  if (verts.length === 3 || verts.length === 4) {
    const err = polygonError(pts, verts);
    if (err <= b.diag * POLY_FIT_RATIO) poly = { verts, err };
  }

  /* 4. 타원 후보 */
  const ef = ellipseFit(pts, b);
  const ellipseOk = ef.mean <= ELLIPSE_MEAN && ef.max <= ELLIPSE_MAX;

  if (poly && (!ellipseOk || poly.err <= ef.errPx)) {
    if (verts.length === 3) return { kind: 'triangle', points: polygonPoints(verts) };
    const axisAligned = verts.every((v, i) => {
      const n = verts[(i + 1) % 4];
      const deg = Math.abs(Math.atan2(n[1] - v[1], n[0] - v[0]) * 180 / Math.PI) % 90;
      return Math.min(deg, 90 - deg) <= RECT_AXIS_DEG;
    });
    const rectVerts = axisAligned
      ? [[b.minX, b.minY], [b.maxX, b.minY], [b.maxX, b.maxY], [b.minX, b.maxY]]
      : verts;
    return { kind: 'rect', points: polygonPoints(rectVerts) };
  }
  if (ellipseOk) {
    const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
    let a = b.w / 2, bb = b.h / 2;
    const ratio = a / bb;
    const isCircle = ratio >= CIRCLE_RATIO_MIN && ratio <= CIRCLE_RATIO_MAX;
    if (isCircle) { const r = (a + bb) / 2; a = r; bb = r; }
    const startAngle = Math.atan2((start[1] - cy) / bb, (start[0] - cx) / a);
    return { kind: isCircle ? 'circle' : 'ellipse', points: ellipsePoints(cx, cy, a, bb, startAngle) };
  }
  return null;
}
