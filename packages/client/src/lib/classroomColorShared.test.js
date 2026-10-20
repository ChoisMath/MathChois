import { describe, it, expect } from 'vitest';
import {
  CLASSROOM_COLORS, isClassroomColor, classroomColor, assignClassroomColors, pickLeastUsedColor,
} from '@mathchois/shared';

// 골든 값: 1단계 구현(client/src/lib/classroomColor.js)으로 미리 계산해 둔 결과.
// id = `c0a8f${i}d2-4b1e-4c3a-9e7f-1a2b3c4d5e${ii}` (i = 0..12, ii = i 를 두 자리 0 채움), createdAt = 2026-03-01 + i 일.
const goldenRoom = (i) => ({
  id: `c0a8f${i}d2-4b1e-4c3a-9e7f-1a2b3c4d5e${String(i).padStart(2, '0')}`,
  createdAt: new Date(Date.UTC(2026, 2, 1 + i)).toISOString(),
});
const GOLDEN_ASSIGNED = [
  'rose', 'coral', 'mustard', 'sage', 'sky', 'lavender', 'lavender',
  'mustard', 'sky', 'rose', 'coral', 'sage', 'sky',
];
const GOLDEN_OWN_COLOR = [
  ['c0a8f0d2-4b1e-4c3a-9e7f-1a2b3c4d5e00', 'rose'],
  ['c0a8f3d2-4b1e-4c3a-9e7f-1a2b3c4d5e03', 'sage'],
  ['c0a8f4d2-4b1e-4c3a-9e7f-1a2b3c4d5e04', 'sky'],
  ['c0a8f6d2-4b1e-4c3a-9e7f-1a2b3c4d5e06', 'lavender'],
  ['c0a8f7d2-4b1e-4c3a-9e7f-1a2b3c4d5e07', 'mustard'],
  ['c0a8f10d2-4b1e-4c3a-9e7f-1a2b3c4d5e10', 'sky'],
];

const room = (id, color, day = 1) => ({ id, color, createdAt: `2026-04-${String(day).padStart(2, '0')}T09:00:00Z` });

describe('CLASSROOM_COLORS / isClassroomColor', () => {
  it('여섯 색, 순서 고정', () => {
    expect(CLASSROOM_COLORS).toEqual(['coral', 'mustard', 'sage', 'sky', 'lavender', 'rose']);
  });
  it('여섯 색만 true', () => {
    expect(isClassroomColor('rose')).toBe(true);
    expect(isClassroomColor('red')).toBe(false);
    expect(isClassroomColor(null)).toBe(false);
    expect(isClassroomColor(3)).toBe(false);
  });
});

describe('classroomColor', () => {
  it('id 가 없으면 coral', () => {
    expect(classroomColor(undefined)).toBe('coral');
    expect(classroomColor(null)).toBe('coral');
    expect(classroomColor('')).toBe('coral');
  });
  it('1단계 구현과 같은 고유 색(골든)', () => {
    for (const [id, color] of GOLDEN_OWN_COLOR) expect(classroomColor(id)).toBe(color);
  });
});

describe('assignClassroomColors — 저장 색 없음', () => {
  it('1~6번 학급은 모두 다른 색', () => {
    const colors = assignClassroomColors([0, 1, 2, 3, 4, 5].map(goldenRoom));
    expect(new Set([...colors.values()]).size).toBe(6);
  });
  it('13개 학급: 1단계 구현과 같은 결과(골든)', () => {
    const rooms = Array.from({ length: 13 }, (_, i) => goldenRoom(i));
    const colors = assignClassroomColors(rooms);
    expect(rooms.map((r) => colors.get(r.id))).toEqual(GOLDEN_ASSIGNED);
  });
  it('새 학급을 추가해도 기존 학급 색은 그대로', () => {
    const before = [0, 1, 2].map(goldenRoom);
    const a = assignClassroomColors(before);
    const b = assignClassroomColors([...before, goldenRoom(3)]);
    for (const r of before) expect(b.get(r.id)).toBe(a.get(r.id));
  });
  it('입력 순서와 관계없이 같은 결과', () => {
    const rooms = [0, 1, 2, 3, 4].map(goldenRoom);
    const a = assignClassroomColors(rooms);
    const b = assignClassroomColors([...rooms].reverse());
    for (const r of rooms) expect(b.get(r.id)).toBe(a.get(r.id));
  });
  it('빈 목록·null 은 빈 Map', () => {
    expect(assignClassroomColors([]).size).toBe(0);
    expect(assignClassroomColors(null).size).toBe(0);
  });
});

describe('assignClassroomColors — 저장 색', () => {
  it('저장 색이 우선이고 나머지는 그 색을 피해 모두 다른 색', () => {
    const rooms = [
      room('a', 'sky', 1), room('b', null, 2), room('c', null, 3),
      room('d', undefined, 4), room('e', null, 5), room('f', null, 6),
    ];
    const colors = assignClassroomColors(rooms);
    expect(colors.get('a')).toBe('sky');
    expect(new Set([...colors.values()]).size).toBe(6);
    for (const id of ['b', 'c', 'd', 'e', 'f']) expect(colors.get(id)).not.toBe('sky');
  });
  it('저장 색은 만든 순서가 뒤여도 먼저 확정된다', () => {
    const rooms = [room('first', null, 1), room('late', 'coral', 9)];
    expect(assignClassroomColors(rooms).get('late')).toBe('coral');
    expect(assignClassroomColors(rooms).get('first')).not.toBe('coral');
  });
  it('알 수 없는 저장 색은 빈 값처럼 자동 배정', () => {
    const colors = assignClassroomColors([room('a', 'red')]);
    expect(CLASSROOM_COLORS).toContain(colors.get('a'));
    expect(colors.get('a')).toBe(classroomColor('a'));
  });
  it('같은 색을 저장한 학급이 둘이어도 그대로 유지', () => {
    const colors = assignClassroomColors([room('a', 'rose', 1), room('b', 'rose', 2)]);
    expect(colors.get('a')).toBe('rose');
    expect(colors.get('b')).toBe('rose');
  });
});

describe('pickLeastUsedColor', () => {
  it('학급이 없으면 coral', () => {
    expect(pickLeastUsedColor([])).toBe('coral');
  });
  it('coral·mustard 사용 중이면 sage', () => {
    expect(pickLeastUsedColor([room('a', 'coral'), room('b', 'mustard')])).toBe('sage');
  });
  it('여섯 색 모두 1번 + coral 2번이면 mustard', () => {
    const rooms = [...CLASSROOM_COLORS, 'coral'].map((c, i) => room(`r${i}`, c, i + 1));
    expect(pickLeastUsedColor(rooms)).toBe('mustard');
  });
  it('저장 색 없는 학급은 자동 배정된 색으로 센다', () => {
    const rooms = [0, 1, 2, 3, 4].map(goldenRoom);
    const used = new Set(assignClassroomColors(rooms).values());
    const picked = pickLeastUsedColor(rooms);
    expect(used.has(picked)).toBe(false);
  });
});
