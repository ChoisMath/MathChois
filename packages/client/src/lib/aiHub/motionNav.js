import { MOTION_GROUPS } from '@mathchois/shared';

/** 목록에서 id 의 이웃 — 없는 id 는 null, 첫/끝 항목은 prev/next 가 null. */
export function neighbors(items, id) {
  const list = items ?? [];
  const index = list.findIndex((m) => m.id === id);
  if (index < 0) return null;
  return { item: list[index], prev: list[index - 1] ?? null, next: list[index + 1] ?? null, index };
}

/**
 * 분류 거르기. present = 목록에 실제로 있는 분류(카탈로그 MOTION_GROUPS 순서),
 * group = 유효한 요청 분류(없거나 present 에 없으면 null), shown = 거른 목록(group 이 null 이면 items 그대로).
 */
export function groupFilter(items, g) {
  const list = items ?? [];
  const present = MOTION_GROUPS.filter((name) => list.some((m) => m.group === name));
  const group = g && present.includes(g) ? g : null;
  return { present, group, shown: group ? list.filter((m) => m.group === group) : list };
}
