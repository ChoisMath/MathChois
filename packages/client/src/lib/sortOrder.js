/**
 * 목록 정렬 순서 — 학급 상세의 [챕터]·[영상] 탭에서 교사·학생 각자가 선택한다.
 *
 * - newest : 최신순      — createdAt 내림차순 (가장 최근 등록이 위)
 * - oldest : 등록순      — createdAt 오름차순 (먼저 등록한 것이 위)
 * - custom : 교사 지정순 — position 오름차순 (교사가 드래그로 배치한 순서, 기본값)
 *
 * createdAt 이 같거나 없으면(컬럼 도입 전 데이터) position 으로 보조 정렬해 순서가 흔들리지 않게 한다.
 */

export const SORT_ORDERS = [
  { value: 'newest', label: '최신순' },
  { value: 'oldest', label: '등록순' },
  { value: 'custom', label: '교사 지정순' },
];

export const DEFAULT_SORT_ORDER = 'custom';

const VALID = new Set(SORT_ORDERS.map((o) => o.value));

export function isSortOrder(v) {
  return VALID.has(v);
}

/** 드래그로 순서를 바꿀 수 있는 모드인지 (교사 지정순에서만) */
export function isManualOrder(order) {
  return order === 'custom';
}

function toTime(v) {
  if (v == null) return 0;
  const t = typeof v === 'number' ? v : new Date(v).getTime();
  return Number.isFinite(t) ? t : 0;
}

function byPosition(a, b) {
  return (a.position ?? 0) - (b.position ?? 0);
}

/**
 * items 를 order 에 따라 정렬한 새 배열을 돌려준다(원본 불변).
 * 항목은 { position, createdAt } 를 가진다고 가정한다.
 */
export function sortItems(items, order) {
  const list = [...(items ?? [])];
  switch (order) {
    case 'newest':
      return list.sort((a, b) => (toTime(b.createdAt) - toTime(a.createdAt)) || byPosition(a, b));
    case 'oldest':
      return list.sort((a, b) => (toTime(a.createdAt) - toTime(b.createdAt)) || byPosition(a, b));
    case 'custom':
    default:
      return list.sort((a, b) => byPosition(a, b) || (toTime(a.createdAt) - toTime(b.createdAt)));
  }
}

/** localStorage 키 — 사용자(교사·학생 개인)별, 목록 종류(chapters/videos)별로 저장 */
export function sortOrderStorageKey(kind, userId) {
  return `mc_sort_${kind}_${userId ?? 'anon'}`;
}

export function loadSortOrder(kind, userId) {
  try {
    const v = localStorage.getItem(sortOrderStorageKey(kind, userId));
    return isSortOrder(v) ? v : DEFAULT_SORT_ORDER;
  } catch {
    return DEFAULT_SORT_ORDER;
  }
}

export function saveSortOrder(kind, userId, order) {
  if (!isSortOrder(order)) return;
  try {
    localStorage.setItem(sortOrderStorageKey(kind, userId), order);
  } catch { /* 사생활 보호 모드 등 — 저장 실패는 무시 */ }
}
