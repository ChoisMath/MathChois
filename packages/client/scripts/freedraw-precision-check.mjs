#!/usr/bin/env node
/*
 * 저장된 필기(excalidraw_data)의 freedraw 요소가 Excalidraw 의 TO_FIXED_PRECISION 정규식에 걸리는지 진단한다
 * (vite/excalidrawPenTweak.js 의 두 번째 치환이 왜 필요한지 실제 데이터로 확인하는 용도).
 *
 * 사용법:
 *   node scripts/freedraw-precision-check.mjs <json 파일>
 *
 * json 파일은 다음 중 하나:
 *   - psql 로 뽑은 행 배열: [{ "excalidraw_data": { "elements": [...] } }, ...]  (키는 excalidrawData 도 허용)
 *   - excalidraw_data 하나: { "elements": [...] }
 *   - 요소 배열: [ { "type": "freedraw", ... }, ... ]
 *
 * 예) psql "$DATABASE_URL" -At -c "select json_agg(t) from (select excalidraw_data from teacher_notes
 *        where page_id = '<page uuid>' order by updated_at desc limit 1) t" > notes.json
 *
 * 각 freedraw 요소를 Excalidraw 와 같은 옵션(size = strokeWidth×10, thinning 0, smoothing .12, streamline .16)으로
 * 외곽선 → SVG path 문자열로 만들고, 지수 표기(e-7 등) 좌표가 몇 개인지와 기존 정규식이 그 좌표를 얼마나 튀게 하는지 센다.
 */
import fs from 'node:fs';
import { getFreedrawOutline } from '../src/lib/wetInkStroke.js';

const OLD_RE = /(\s?[A-Z]?,?-?[0-9]*\.[0-9]{0,2})(([0-9]|e|-)*)/g;
const PF = { thinning: 0, smoothing: 0.12, streamline: 0.16, easing: (t) => t, start: { taper: 0, cap: true }, end: { taper: 0, cap: true } };

function med(p, q) { return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; }
function svgPath(points) {
  if (!points.length) return '';
  const max = points.length - 1;
  return points.reduce((acc, point, i, arr) => {
    if (i === max) acc.push(point, med(point, arr[0]), 'L', arr[0], 'Z'); else acc.push(point, med(point, arr[i + 1]));
    return acc;
  }, ['M', points[0], 'Q']).join(' ');
}

function collectElements(data) {
  if (Array.isArray(data)) {
    if (data.length && data[0]?.type) return data;
    return data.flatMap((row) => collectElements(row?.excalidraw_data ?? row?.excalidrawData ?? row));
  }
  if (data?.elements) return data.elements;
  return [];
}

const file = process.argv[2];
if (!file) { console.error('사용법: node scripts/freedraw-precision-check.mjs <json 파일>'); process.exit(1); }
const elements = collectElements(JSON.parse(fs.readFileSync(file, 'utf8')));
const strokes = elements.filter((el) => el?.type === 'freedraw' && !el.isDeleted && Array.isArray(el.points) && el.points.length);
if (!strokes.length) { console.error('freedraw 요소가 없습니다.'); process.exit(1); }

let affected = 0, mangledTotal = 0, worst = 0;
const rows = [];
for (const el of strokes) {
  const outline = getFreedrawOutline(el.points.map(([x, y]) => [x, y]), { ...PF, size: el.strokeWidth * 10, simulatePressure: true, last: !!el.lastCommittedPoint });
  const raw = svgPath(outline);
  const exp = raw.match(/-?[0-9]+\.[0-9]+e-[0-9]+/g) || [];
  if (!exp.length) continue;
  affected += 1; mangledTotal += exp.length;
  const jump = Math.max(...exp.map((v) => Math.abs(parseFloat(v.replace(OLD_RE, '$1')))));
  worst = Math.max(worst, jump);
  rows.push({ id: el.id, strokeWidth: el.strokeWidth, points: el.points.length, mangled: exp.length, maxJump: +jump.toFixed(2), sample: exp[0] });
}
console.table(rows);
console.log(`freedraw ${strokes.length}개 중 ${affected}개(${(100 * affected / strokes.length).toFixed(1)}%)에 지수 표기 좌표 ${mangledTotal}개. 기존 정규식의 최대 좌표 튐: ${worst.toFixed(2)} scene 단위`);
