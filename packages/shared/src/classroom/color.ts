/**
 * 학급 색 — 클래스룸 목록·사이드바의 공책 표지 색. 서버(부팅 채움·생성 기본값)와 클라이언트가 같은 규칙을 쓴다.
 *
 * 실제 색 값은 client 의 lib/classroomColor.js 의 `COLOR_STYLES` 에 있고, `colorVars` 가 인라인 CSS 변수로 적용한다.
 */

export const CLASSROOM_COLORS = ['coral', 'mustard', 'sage', 'sky', 'lavender', 'rose'] as const;

export type ClassroomColor = (typeof CLASSROOM_COLORS)[number];

export function isClassroomColor(v: unknown): v is ClassroomColor {
  return typeof v === 'string' && (CLASSROOM_COLORS as readonly string[]).includes(v);
}

/** FNV-1a 32bit — 짧은 문자열을 고르게 섞는다 */
function hash(str: string): number {
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

/** 학급 id 에서 정해지는 고유 색 (id 가 없으면 coral) */
export function classroomColor(id: string | null | undefined): ClassroomColor {
  if (!id) return CLASSROOM_COLORS[0];
  return CLASSROOM_COLORS[hash(String(id)) % CLASSROOM_COLORS.length];
}

export interface ColorableClassroom {
  id: string;
  createdAt?: string | Date | null;
  /** 저장된 색. 비었거나 알 수 없는 값이면 자동 배정 */
  color?: string | null;
}

const time = (v: string | Date | null | undefined): number => {
  const t = v ? new Date(v).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
};

/**
 * 목록 전체에 색을 정한다 → Map(id → 색).
 * 1) 유효한 저장 색을 먼저 확정하고 사용 수에 더한다.
 * 2) 나머지는 만든 순서(createdAt, 같으면 id)대로 각 학급의 고유 색(classroomColor)을 쓰되, 그 색을 이미 더 많이 썼으면
 *    고유 색부터 순서대로 돌며 가장 적게 쓴 색으로 넘긴다. 그래서 6개까지는 모두 다른 색이고,
 *    새 학급이 생겨도 앞서 만든 학급의 색은 바뀌지 않는다(학급이 지워지면 그 뒤 학급 색이 바뀔 수 있다).
 */
export function assignClassroomColors(
  rooms: readonly ColorableClassroom[] | null | undefined,
): Map<string, ClassroomColor> {
  const list = rooms || [];
  const used = Object.fromEntries(CLASSROOM_COLORS.map((c) => [c, 0])) as Record<ClassroomColor, number>;
  const result = new Map<string, ClassroomColor>();

  const pending: ColorableClassroom[] = [];
  for (const room of list) {
    if (isClassroomColor(room.color)) {
      result.set(room.id, room.color);
      used[room.color] += 1;
    } else {
      pending.push(room);
    }
  }

  pending.sort(
    (a, b) => time(a.createdAt) - time(b.createdAt) || String(a.id).localeCompare(String(b.id)),
  );
  for (const room of pending) {
    const least = Math.min(...Object.values(used));
    const start = CLASSROOM_COLORS.indexOf(classroomColor(room.id));
    let color: ClassroomColor = CLASSROOM_COLORS[start];
    for (let k = 0; k < CLASSROOM_COLORS.length; k += 1) {
      const candidate = CLASSROOM_COLORS[(start + k) % CLASSROOM_COLORS.length];
      if (used[candidate] === least) { color = candidate; break; }
    }
    used[color] += 1;
    result.set(room.id, color);
  }
  return result;
}

/** 새 학급에 줄 색 — 지금 가장 적게 쓰인 색(같으면 CLASSROOM_COLORS 순서상 앞) */
export function pickLeastUsedColor(rooms: readonly ColorableClassroom[] | null | undefined): ClassroomColor {
  const used = Object.fromEntries(CLASSROOM_COLORS.map((c) => [c, 0])) as Record<ClassroomColor, number>;
  for (const color of assignClassroomColors(rooms).values()) used[color] += 1;
  const least = Math.min(...Object.values(used));
  return CLASSROOM_COLORS.find((c) => used[c] === least) ?? CLASSROOM_COLORS[0];
}
