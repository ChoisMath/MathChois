/*
 * 펜 샘플(pointer 이벤트 점) 정리 — 아이패드 Safari 핀홀 대책 (2026-10-30).
 *
 * perfect-freehand 는 연속 방향 벡터의 내적이 음수이면(되돌림) 그 점에 둥근 부채꼴 캡을 그린다. 입력 점이
 * 진행 방향과 반대로 아주 조금(1px 미만~수 px) 물러나기만 해도 똑같이 처리되어, 가는 획에서는 그 부채꼴이
 * 획 폭을 넘는 흰 구멍·끊김으로 보인다(갤럭시는 멀쩡, 아이패드 Safari 의 긴 가는 선에서 프레임마다 점 모양 끊김).
 * iPad Safari 는 getCoalescedEvents() 의 샘플 순서가 뒤섞여 올 수 있다는 보고가 있다(WebKit standards-positions #374
 * 코멘트, 2025-09). 두 겹으로 막는다:
 *  1. orderCoalesced — 묶음 안의 샘플을 timeStamp 로 정렬하고, timeStamp 가 전부 같으면 기하로 뒤집힘을 판정.
 *  2. isMicroReversal / dropMicroReversals — 진행 방향과 반대로 임계값보다 짧게 물러난 점은 버린다
 *     (ㅅ 꼭짓점 같은 진짜 되돌림은 임계값보다 길게 되돌아가므로 보존).
 */

/** useWetInk 입력(화면 px) 임계값 */
export const MICRO_REVERSAL_PX = 2.5;

const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;

/**
 * coalesced 이벤트 묶음을 시간 순으로. timeStamp 가 서로 다르면 안정 정렬, 전부 같으면(또는 없으면)
 * 직전 점에서 첫 샘플이 마지막 샘플보다 멀 때 묶음이 뒤집힌 것으로 보고 뒤집는다.
 * @param {PointerEvent[]} evs
 * @param {number[]|null} lastPoint 직전에 기록된 [clientX, clientY]
 */
export function orderCoalesced(evs, lastPoint) {
  if (!evs || evs.length < 2) return evs || [];
  const ts = evs.map((e) => e.timeStamp);
  const allSame = ts.every((t) => t === ts[0]);
  if (!allSame) {
    const sorted = ts.every((t, i) => i === 0 || t >= ts[i - 1]);
    if (sorted) return evs;
    return evs.map((e, i) => [e, i]).sort((a, b) => (a[0].timeStamp - b[0].timeStamp) || (a[1] - b[1])).map((x) => x[0]);
  }
  if (!lastPoint) return evs;
  const first = [evs[0].clientX, evs[0].clientY];
  const last = [evs[evs.length - 1].clientX, evs[evs.length - 1].clientY];
  return d2(first, lastPoint) > d2(last, lastPoint) ? evs.slice().reverse() : evs;
}

/**
 * 새 점 p 가 직전 두 점이 만드는 진행 방향과 반대이면서 임계값보다 짧게 움직였는지.
 * @param {number[][]} pts 지금까지의 점 (마지막 2개 사용)
 * @param {number[]} p
 * @param {number} minPx
 */
export function isMicroReversal(pts, p, minPx) {
  const n = pts.length;
  if (n < 2 || !(minPx > 0)) return false;
  const q = pts[n - 1], d = pts[n - 2];
  const sx = p[0] - q[0], sy = p[1] - q[1];
  return sx * (q[0] - d[0]) + sy * (q[1] - d[1]) < 0 && sx * sx + sy * sy < minPx * minPx;
}

/** 배열 전체에 isMicroReversal 적용 (3번째 요소 등 추가 값 보존) */
export function dropMicroReversals(points, minPx) {
  if (!(minPx > 0) || points.length < 3) return points;
  const out = [];
  for (const p of points) {
    if (!isMicroReversal(out, p, minPx)) out.push(p);
  }
  return out;
}
