/**
 * Chaikin corner-cutting smoothing.
 * iterations 만큼 모서리를 깎아 폴리곤(부채꼴) 곡선을 매끄럽게 만든다.
 * 시작/끝 점은 보존한다.
 *
 * @param {number[][]} points  [[x,y], ...]
 * @param {number} iterations
 * @returns {number[][]}
 */
export function chaikinSmooth(points, iterations = 1) {
  if (!Array.isArray(points) || points.length <= 2) return points;
  let pts = points;
  for (let it = 0; it < iterations; it++) {
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[i + 1];
      out.push([x0 * 0.75 + x1 * 0.25, y0 * 0.75 + y1 * 0.25]);
      out.push([x0 * 0.25 + x1 * 0.75, y0 * 0.25 + y1 * 0.75]);
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

/**
 * 획 완료 후 points 를 매끄럽게. 이미 처리됐거나 너무 짧으면 원본 그대로 반환(멱등).
 *
 * @param {number[][]} points
 * @param {{ alreadySmoothed?: boolean, iterations?: number }} opts
 * @returns {number[][]}
 */
export function resampleStrokePoints(points, opts = {}) {
  const { alreadySmoothed = false, iterations = 1 } = opts;
  if (alreadySmoothed) return points;
  if (!Array.isArray(points) || points.length <= 2) return points;
  return chaikinSmooth(points, iterations);
}
