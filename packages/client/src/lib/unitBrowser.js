import { UNASSIGNED, groupByUnit, visibleUnits, resolveUnitParam } from '@mathchois/shared';

/**
 * 단원 브라우저(components/units/UnitBrowser.jsx)가 그릴 화면을 정한다. 판단 규칙은 shared 함수에 있고
 * 여기서는 그것들을 순서대로 엮는다.
 *
 * - `flat`: 단원이 없다 → 기존 격자 그대로. 학생은 이 탭에 보일 단원이 하나도 없을 때도 flat
 *   (그때 항목은 전부 미분류이므로 "기타 자료" 카드 한 장을 한 번 더 누르게 하지 않는다).
 * - `grid`: 단원 목록 화면.
 * - `unit`: 한 단원(또는 미분류, unitId=null) 안 화면.
 *
 * 개수(counts)는 지금 탭의 항목으로 센다 — 카드 개수와 단원 안 화면이 늘 일치한다.
 *
 * 학생은 알 수 없는 단원(숨겨졌거나 지워진 단원 — 학생의 단원 목록에는 숨긴 단원이 오지 않는다)에
 * 속한 항목을 아예 뺀다. 항목 목록이 단원 목록보다 늦게 새로 읽히는 동안 방금 숨긴 단원의 항목이
 * "기타 자료"나 평면 목록에 보이지 않게 한다. 지운 단원의 항목은 다음에 읽을 때 unitId=null 로 온다.
 * 교사는 모든 단원을 보므로 알 수 없는 단원의 항목을 그대로 미분류로 둔다(groupByUnit 규칙).
 */
export function resolveUnitView({ units, items: allItems, isTeacher, unitParam }) {
  const items = isTeacher ? allItems : dropUnknownUnitItems(units, allItems);
  if (units.length === 0) return { mode: 'flat', items };
  const { byUnit, unassigned } = groupByUnit(units, items);
  const counts = new Map();
  for (const [id, list] of byUnit) counts.set(id, list.length);
  const shown = visibleUnits(units, counts, isTeacher);
  if (!isTeacher && shown.length === 0) return { mode: 'flat', items };

  const current = resolveUnitParam(unitParam ?? null, shown.map((u) => u.id), unassigned.length > 0);
  const base = { shown, byUnit, unassigned, counts };
  if (current == null) return { mode: 'grid', ...base };
  if (current === UNASSIGNED) return { mode: 'unit', ...base, unitId: null, unit: null, items: unassigned };
  return {
    mode: 'unit', ...base,
    unitId: current,
    unit: shown.find((u) => u.id === current),
    items: byUnit.get(current) ?? [],
  };
}

/** 학생용: unitId 가 있는데 보이는(숨기지 않은) 단원 목록에 없는 항목을 뺀다 */
function dropUnknownUnitItems(units, items) {
  const known = new Set(units.filter((u) => !u.isHidden).map((u) => u.id));
  return items.filter((item) => !item.unitId || known.has(item.unitId));
}

/** 드래그로 바꾼 순서(ids)를 서버 응답 전까지 화면에 먼저 반영한다 — position 을 새 순서로 덮어쓴 사본 */
export function applyUnitOrder(units, ids) {
  if (!ids) return units;
  const pos = new Map(ids.map((id, i) => [id, i]));
  return units.map((u) => (pos.has(u.id) ? { ...u, position: pos.get(u.id) } : u));
}

/** 항목 중 그림이 있는 첫 항목의 그림(단원 카드 표지). 없으면 null */
export function firstCover(items, coverOfItem) {
  if (!coverOfItem) return null;
  for (const item of items) {
    const cover = coverOfItem(item);
    if (cover) return cover;
  }
  return null;
}
