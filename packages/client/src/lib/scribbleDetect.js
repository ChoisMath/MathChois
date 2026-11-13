/**
 * 스크리블(문지르기) 패턴 감지 — freedraw points 기반.
 * 방향 전환(reversal) 횟수와 경로 밀도로 판정한다.
 * useScribbleErase 와 단위테스트가 공유하기 위해 순수 함수로 분리.
 *
 * @param {number[][]} points  [[x,y], ...] (element-local 좌표)
 * @returns {boolean}
 */
export function isScribblePattern(points) {
  if (!points || points.length < 8) return false;

  // 1. 방향 전환(reversal) 횟수 — 연속 벡터 간 각도 변화 >100°
  let reversals = 0;
  const step = Math.max(2, Math.floor(points.length / 20)); // 적응적 스텝
  for (let i = step * 2; i < points.length; i += step) {
    const prevDx = points[i - step][0] - points[i - step * 2][0];
    const prevDy = points[i - step][1] - points[i - step * 2][1];
    const currDx = points[i][0] - points[i - step][0];
    const currDy = points[i][1] - points[i - step][1];
    const prevLen = Math.hypot(prevDx, prevDy);
    const currLen = Math.hypot(currDx, currDy);
    if (prevLen < 0.5 || currLen < 0.5) continue;
    const dot = prevDx * currDx + prevDy * currDy;
    const cross = prevDx * currDy - prevDy * currDx;
    const angle = Math.abs(Math.atan2(cross, dot));
    if (angle > Math.PI * 0.6) reversals++; // >108°
  }

  // 2. 밀도 검사: 경로 길이 / 바운딩박스 대각선
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let pathLen = 0;
  for (let i = 0; i < points.length; i++) {
    const [x, y] = points[i];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (i > 0) pathLen += Math.hypot(x - points[i - 1][0], y - points[i - 1][1]);
  }
  const bboxDiag = Math.hypot(maxX - minX, maxY - minY);
  const density = bboxDiag > 1 ? pathLen / bboxDiag : 0;

  return reversals >= 6 && density > 3.5;
}

/* ── 바운딩 박스 겹침 ── */
function bboxOverlap(b, el) {
  return !(b.maxX < el.x || el.x + el.width < b.minX || b.maxY < el.y || el.y + el.height < b.minY);
}

/**
 * 문지르기 획(finalEl)이 지울 요소 id 집합. 문지르기 자신 + 바운딩 박스가 겹치는 freedraw, 그리고 지워지는 획과
 * 같은 그룹인 도형 보정 채우기(customData.shapeFill — lib/wetInkStroke.js makeShapeFillElement)까지 포함한다.
 * @param {object[]} elements 씬 요소 전체
 * @param {object} finalEl 문지르기 freedraw
 * @param {{ excludePrefixes?: string[], excludeIds?: string[] }} opts
 */
export function scribbleDeletionIds(elements, finalEl, { excludePrefixes = [], excludeIds = [] } = {}) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [px, py] of finalEl.points) {
    const ax = finalEl.x + px, ay = finalEl.y + py;
    if (ax < minX) minX = ax; if (ay < minY) minY = ay;
    if (ax > maxX) maxX = ax; if (ay > maxY) maxY = ay;
  }
  const excluded = (el) => excludeIds.includes(el.id) || excludePrefixes.some((p) => el.id.startsWith(p));
  const ids = new Set([finalEl.id]);
  const groups = new Set();
  for (const el of elements) {
    if (el.isDeleted || el.id === finalEl.id || el.type !== 'freedraw' || excluded(el)) continue;
    if (bboxOverlap({ minX, minY, maxX, maxY }, el)) {
      ids.add(el.id);
      for (const g of el.groupIds || []) groups.add(g);
    }
  }
  if (groups.size) {
    for (const el of elements) {
      if (el.isDeleted || ids.has(el.id) || !el.customData?.shapeFill || excluded(el)) continue;
      if ((el.groupIds || []).some((g) => groups.has(g))) ids.add(el.id);
    }
  }
  return ids;
}
