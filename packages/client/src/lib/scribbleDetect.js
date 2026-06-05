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
