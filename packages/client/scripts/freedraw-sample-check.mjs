#!/usr/bin/env node
/*
 * 저장된 freedraw 요소의 점 순서를 진단한다 — 아이패드 Safari 가는 선 "점/끊김" 원인 추적용 (2026-10-30).
 *
 * 사용법: node scripts/freedraw-sample-check.mjs <notes.json> [--dump N]
 *   (notes.json 은 scripts/freedraw-precision-export.mjs 결과 또는 freedraw-precision-check.mjs 와 같은 형식)
 *
 * 획마다 센다:
 *   dup     — 바로 앞 6개 점 중 하나와 좌표가 완전히 같은 점(겹치는 coalesced 묶음이면 여기에 잡힌다)
 *   back    — 직전 진행 방향과 반대로 움직인 점(내적 < 0)과 그 길이 분포 (perfect-freehand 가 부채꼴을 그리는 지점)
 *   period  — 역행/중복이 나타나는 간격(점 개수)의 최빈값 → 프레임마다 반복되는지
 *   lateral — 연속 점의 좌우 흔들림(진행 방향에 수직 성분) 평균 — 좌표계 어긋남이면 커진다
 * --dump N 이면 역행이 가장 많은 획의 처음 N개 점과 스텝 벡터를 scene 단위로 찍는다.
 */
import fs from 'node:fs';

function collectElements(data) {
  if (Array.isArray(data)) {
    if (data.length && data[0]?.type) return data;
    return data.flatMap((row) => collectElements(row?.excalidraw_data ?? row?.excalidrawData ?? row));
  }
  if (data?.elements) return data.elements;
  return [];
}

const file = process.argv[2];
const dumpIdx = process.argv.indexOf('--dump');
const dumpN = dumpIdx > 0 ? parseInt(process.argv[dumpIdx + 1], 10) || 40 : 0;
if (!file) { console.error('사용법: node scripts/freedraw-sample-check.mjs <notes.json> [--dump N]'); process.exit(1); }
const elements = collectElements(JSON.parse(fs.readFileSync(file, 'utf8')));
const strokes = elements.filter((el) => el?.type === 'freedraw' && !el.isDeleted && Array.isArray(el.points) && el.points.length >= 3);
if (!strokes.length) { console.error('freedraw 요소가 없습니다.'); process.exit(1); }

const mode = (arr) => {
  if (!arr.length) return '-';
  const m = new Map(); for (const v of arr) m.set(v, (m.get(v) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
};

const rows = [];
let worst = null;
for (const el of strokes) {
  const pts = el.points;
  let dup = 0, back = 0, lateralSum = 0, lateralN = 0;
  const backLens = [], events = [];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    for (let k = Math.max(0, i - 6); k < i; k++) if (pts[k][0] === p[0] && pts[k][1] === p[1]) { dup += 1; events.push(i); break; }
    if (i >= 2) {
      const q = pts[i - 1], d = pts[i - 2];
      const vx = q[0] - d[0], vy = q[1] - d[1], sx = p[0] - q[0], sy = p[1] - q[1];
      const vl = Math.hypot(vx, vy), sl = Math.hypot(sx, sy);
      if (vl > 0 && sl > 0) {
        const dot = (vx * sx + vy * sy) / vl;
        if (dot < 0) { back += 1; backLens.push(+(sl * (el.strokeWidth ? 1 : 1)).toFixed(2)); events.push(i); }
        lateralSum += Math.abs((vx * sy - vy * sx) / vl); lateralN += 1;
      }
    }
  }
  const gaps = []; for (let i = 1; i < events.length; i++) gaps.push(events[i] - events[i - 1]);
  const row = {
    id: el.id.slice(0, 10), n: pts.length, w: el.strokeWidth, bbox: `${Math.round(el.width)}x${Math.round(el.height)}`,
    dup, back, backMed: backLens.length ? backLens.sort((a, b) => a - b)[Math.floor(backLens.length / 2)] : '-',
    backMax: backLens.length ? Math.max(...backLens) : '-',
    period: mode(gaps), lateral: lateralN ? +(lateralSum / lateralN).toFixed(3) : '-',
  };
  rows.push(row);
  if (!worst || back + dup > worst.score) worst = { score: back + dup, el };
}
rows.sort((a, b) => (b.back + b.dup) - (a.back + a.dup));
console.table(rows.slice(0, 25));
const tot = rows.reduce((s, r) => s + r.n, 0), backTot = rows.reduce((s, r) => s + r.back, 0), dupTot = rows.reduce((s, r) => s + r.dup, 0);
console.log(`freedraw ${rows.length}개, 점 ${tot}개: 역행 ${backTot}개(${(backTot / tot * 100).toFixed(1)}%), 중복 ${dupTot}개(${(dupTot / tot * 100).toFixed(1)}%)`);
if (dumpN && worst) {
  const pts = worst.el.points;
  console.log(`\n--- 역행/중복 최다 획 ${worst.el.id} (strokeWidth ${worst.el.strokeWidth}, 점 ${pts.length}개) 처음 ${dumpN}개: x, y, step(dx,dy) ---`);
  for (let i = 0; i < Math.min(dumpN, pts.length); i++) {
    const p = pts[i], q = i ? pts[i - 1] : p;
    console.log(`${String(i).padStart(3)}  ${p[0].toFixed(3).padStart(10)} ${p[1].toFixed(3).padStart(10)}   step ${(p[0] - q[0]).toFixed(3).padStart(8)} ${(p[1] - q[1]).toFixed(3).padStart(8)}`);
  }
}
