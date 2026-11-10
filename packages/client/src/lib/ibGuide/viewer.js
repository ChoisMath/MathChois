import { IA_DOCS } from '@mathchois/shared';

/**
 * IA 예시 쪽 보기 화면의 순수 계산 — 확대 단계, 불러올 쪽, 문서 탭, 탭을 옮길 때의 쪽, 앞뒤 예시.
 */

// 화면 폭에 맞춘 크기를 100 으로 본 백분율
export const ZOOM_STEPS = [50, 75, 100, 125, 150, 200];

/** dir +1 → 지금보다 큰 다음 단계, -1 → 작은 다음 단계. 끝에서는 그대로. 단계 밖의 값(110)도 가까운 단계로 옮긴다. */
export function stepZoom(current, dir) {
  if (dir > 0) return ZOOM_STEPS.find((z) => z > current) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
  return [...ZOOM_STEPS].reverse().find((z) => z < current) ?? ZOOM_STEPS[0];
}

/** 보이는 쪽(1부터) 앞뒤로 around 쪽까지 — 정렬·중복 없음, [1, total] 안. 보이는 쪽이 없으면 빈 배열. */
export function pagesToLoad(visible, total, around = 2) {
  if (!visible.length || total < 1) return [];
  const lo = Math.max(1, Math.min(...visible) - around);
  const hi = Math.min(total, Math.max(...visible) + around);
  const out = [];
  for (let n = lo; n <= hi; n++) out.push(n);
  return out;
}

/** IA_DOCS 순서 그대로, 쪽이 있는 문서만 */
export function availableDocs(example) {
  return IA_DOCS.filter((d) => (example?.docs?.[d]?.pages ?? 0) > 0);
}

/** 요청한 문서가 있으면 그것, 없으면 첫 문서, 하나도 없으면 null */
export function resolveDoc(example, requested) {
  const docs = availableDocs(example);
  if (docs.includes(requested)) return requested;
  return docs[0] ?? null;
}

const clamp = (n, max) => Math.min(Math.max(1, n), Math.max(1, max ?? 1));

/**
 * 탭을 옮긴 뒤 보여 줄 쪽. 학생 보고서 ↔ 주석본은 쪽이 서로 맞으므로 같은 쪽(대상 쪽수로 자름),
 * 채점 코멘트는 쪽이 따로 놀아서 그 문서에서 마지막으로 보던 쪽(없으면 1)으로 간다.
 */
export function carryPage({ from, to, page, counts, remembered }) {
  if (from === to) return clamp(page, counts[to]);
  if (to === 'comments' || from === 'comments') return clamp(remembered[to] ?? 1, counts[to]);
  return clamp(page, counts[to]);
}

/** `no` 순서로 앞뒤 예시 id. 목록에 없는 id 면 둘 다 null. */
export function neighbours(examples, exId) {
  const sorted = [...examples].sort((a, b) => a.no - b.no);
  const i = sorted.findIndex((e) => e.id === exId);
  if (i < 0) return { prev: null, next: null };
  return { prev: sorted[i - 1]?.id ?? null, next: sorted[i + 1]?.id ?? null };
}
