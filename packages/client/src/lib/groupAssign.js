/**
 * 모둠 배정 순수 로직 (학급 기본 모둠 / 페이지별 배정 공용)
 *
 * groups: { id?, name, position, studentIds: string[] }[]
 */

/** 결정적 테스트를 위해 rng 를 주입할 수 있는 Fisher-Yates 셔플 */
export function shuffle(items, rng = Math.random) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * 학생 id 목록을 count 개 모둠으로 균등 배분한다 (크기 차이 ≤ 1).
 * count ≤ 0 → []. 인원이 모자라면 빈 모둠도 만든다.
 */
export function distributeEvenly(studentIds, count, rng = Math.random) {
  const n = Math.floor(Number(count) || 0);
  if (n <= 0) return [];
  const shuffled = shuffle(studentIds, rng);
  const groups = Array.from({ length: n }, (_, i) => ({
    name: `${i + 1}모둠`,
    position: i,
    studentIds: [],
  }));
  shuffled.forEach((sid, i) => { groups[i % n].studentIds.push(sid); });
  return groups;
}

/**
 * 학생을 targetGroupId(인덱스 기반 key 또는 id) 로 옮긴다. null 이면 미배정.
 * 그룹 식별은 `groupKey(g)` 로 한다 (id 가 없으면 position).
 */
export function groupKey(g) {
  return g.id ?? `pos:${g.position}`;
}

export function moveStudent(groups, studentId, targetKey) {
  return groups.map((g) => {
    const without = g.studentIds.filter((s) => s !== studentId);
    if (targetKey != null && groupKey(g) === targetKey) {
      return { ...g, studentIds: [...without, studentId] };
    }
    return without.length === g.studentIds.length ? g : { ...g, studentIds: without };
  });
}

/** 어느 모둠에도 없는 학생 */
export function unassignedStudents(members, groups) {
  const assigned = new Set(groups.flatMap((g) => g.studentIds));
  return members.filter((m) => !assigned.has(m.studentId));
}

/** 학생이 속한 모둠 key (없으면 null) */
export function findGroupKeyOf(groups, studentId) {
  const g = groups.find((x) => x.studentIds.includes(studentId));
  return g ? groupKey(g) : null;
}

/** 모둠 수 범위(모둠 보드의 "모둠 수" 입력과 같다) */
export const GROUP_COUNT_MIN = 1;
export const GROUP_COUNT_MAX = 30;

/**
 * 모둠 수를 count 로 맞춘다. 늘리면 빈 모둠을 뒤에 더하고, 줄이면 뒤에서부터 잘라낸다
 * (잘린 모둠의 학생은 어느 모둠에도 없게 되어 미배정이 된다). 같은 수면 같은 배열을 돌려준다.
 */
export function resizeGroups(groups, count) {
  const n = Math.max(GROUP_COUNT_MIN, Math.min(GROUP_COUNT_MAX, Math.floor(Number(count) || 0)));
  if (n === groups.length) return groups;
  if (n < groups.length) {
    return groups.slice(0, n).map((g, i) => (g.position === i ? g : { ...g, position: i }));
  }
  const added = Array.from({ length: n - groups.length }, (_, k) => {
    const i = groups.length + k;
    return { name: `${i + 1}모둠`, position: i, studentIds: [] };
  });
  return [...groups, ...added];
}
