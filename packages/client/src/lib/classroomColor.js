/**
 * 학급 색 — 클래스룸 목록의 공책 표지 색.
 *
 * 지금은 자동 배정한다(assignClassroomColors). 교사가 직접 고르는 기능은 사이드바·상단 바
 * 리디자인(2단계)에서 DB 칸과 함께 추가할 예정.
 * 실제 색 값은 components/classrooms/classrooms.css 의 `.nb-<색>` 에 있다.
 */

export const CLASSROOM_COLORS = ['coral', 'mustard', 'sage', 'sky', 'lavender', 'rose'];

/** FNV-1a 32bit — 짧은 문자열을 고르게 섞는다 */
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // murmur3 fmix32 — 끝자리만 다른 id 들도 색이 고르게 갈리도록 비트를 한 번 더 섞는다
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export function classroomColor(id) {
  if (!id) return CLASSROOM_COLORS[0];
  return CLASSROOM_COLORS[hash(String(id)) % CLASSROOM_COLORS.length];
}

const time = (v) => {
  const t = v ? new Date(v).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
};

/**
 * 목록 전체에 색을 정한다 → Map(id → 색).
 * 만든 순서(createdAt, 같으면 id)대로 각 학급의 고유 색(classroomColor)을 쓰되, 그 색을 이미 더 많이 썼으면
 * 고유 색부터 순서대로 돌며 가장 적게 쓴 색으로 넘긴다. 그래서 6개까지는 모두 다른 색이고,
 * 새 학급이 생겨도 앞서 만든 학급의 색은 바뀌지 않는다(학급이 지워지면 그 뒤 학급 색이 바뀔 수 있다).
 */
export function assignClassroomColors(classrooms) {
  const ordered = [...(classrooms || [])].sort(
    (a, b) => time(a.createdAt) - time(b.createdAt) || String(a.id).localeCompare(String(b.id)),
  );
  const used = Object.fromEntries(CLASSROOM_COLORS.map((c) => [c, 0]));
  const result = new Map();
  for (const room of ordered) {
    const least = Math.min(...Object.values(used));
    const start = CLASSROOM_COLORS.indexOf(classroomColor(room.id));
    let color = CLASSROOM_COLORS[start];
    for (let k = 0; k < CLASSROOM_COLORS.length; k += 1) {
      const candidate = CLASSROOM_COLORS[(start + k) % CLASSROOM_COLORS.length];
      if (used[candidate] === least) { color = candidate; break; }
    }
    used[color] += 1;
    result.set(room.id, color);
  }
  return result;
}
