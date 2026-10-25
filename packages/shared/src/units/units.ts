/**
 * 단원 — 학급의 챕터·영상을 교사가 묶어 재생목록처럼 보여 주는 단위. 서버·클라이언트가 같은 규칙을 쓴다.
 */

/** 주소(?unit=)에서 "미분류"를 가리키는 값 */
export const UNASSIGNED = 'none';

export const UNIT_TITLE_MAX = 100;
export const UNIT_DESCRIPTION_MAX = 500;

export type UnitTab = 'chapters' | 'videos';

/** 단원 목록 화면에서 개수를 보여 줄 때 필요한 최소 모양 */
interface UnitCounts {
  chapterCount: number;
  videoCount: number;
}

/**
 * 항목을 단원별로 묶는다. 모든 단원 id 가 (빈 배열이라도) 키로 있고, unitId 가 없거나
 * 알 수 없는 단원이면 unassigned 로 간다. 입력 순서를 유지한다.
 */
export function groupByUnit<T extends { unitId?: string | null }>(
  units: readonly { id: string }[],
  items: readonly T[],
): { byUnit: Map<string, T[]>; unassigned: T[] } {
  const byUnit = new Map<string, T[]>();
  for (const unit of units) byUnit.set(unit.id, []);
  const unassigned: T[] = [];
  for (const item of items) {
    const bucket = item.unitId ? byUnit.get(item.unitId) : undefined;
    if (bucket) bucket.push(item);
    else unassigned.push(item);
  }
  return { byUnit, unassigned };
}

export function unitCountForTab(unit: UnitCounts, tab: UnitTab): number {
  return tab === 'chapters' ? unit.chapterCount : unit.videoCount;
}

/**
 * 목록에 보일 단원 (position 오름차순). 교사는 전부, 학생은 숨김 단원과
 * 현재 탭에 항목이 없는 단원(counts 가 0 이거나 없음)을 뺀다.
 */
export function visibleUnits<U extends { id: string; isHidden: boolean; position: number }>(
  units: readonly U[],
  counts: ReadonlyMap<string, number>,
  isTeacher: boolean,
): U[] {
  return units
    .filter((u) => isTeacher || (!u.isHidden && (counts.get(u.id) ?? 0) > 0))
    .sort((a, b) => a.position - b.position);
}

/** 주소의 unit 값을 검증한다: 보이는 단원 id 이거나 (미분류가 있을 때) 'none' 이면 그대로, 아니면 null */
export function resolveUnitParam(
  param: string | null,
  visibleUnitIds: readonly string[],
  hasUnassigned: boolean,
): string | null {
  if (!param) return null;
  if (param === UNASSIGNED) return hasUnassigned ? UNASSIGNED : null;
  return visibleUnitIds.includes(param) ? param : null;
}
