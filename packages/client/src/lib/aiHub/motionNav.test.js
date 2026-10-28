import { it, expect, describe } from 'vitest';
import { MOTION_GROUPS } from '@mathchois/shared';
import { neighbors, groupFilter } from './motionNav';

const items = [
  { id: '01-pixel', group: '게임·만화' },
  { id: '02-comics', group: '게임·만화' },
  { id: '30-paper', group: '종이·공예' },
];

describe('neighbors', () => {
  it('가운데 항목은 앞뒤를 모두 돌려준다', () => {
    const n = neighbors(items, '02-comics');
    expect(n.index).toBe(1);
    expect(n.item).toBe(items[1]);
    expect(n.prev).toBe(items[0]);
    expect(n.next).toBe(items[2]);
  });
  it('첫 항목은 prev 가, 마지막 항목은 next 가 null', () => {
    expect(neighbors(items, '01-pixel')).toMatchObject({ index: 0, prev: null, next: items[1] });
    expect(neighbors(items, '30-paper')).toMatchObject({ index: 2, prev: items[1], next: null });
  });
  it('없는 id·빈 목록은 null', () => {
    expect(neighbors(items, 'nope')).toBeNull();
    expect(neighbors([], '01-pixel')).toBeNull();
    expect(neighbors(undefined, '01-pixel')).toBeNull();
  });
});

describe('groupFilter', () => {
  it('present 는 카탈로그 MOTION_GROUPS 순서를 지킨다(항목 순서와 무관)', () => {
    const reversed = [...items].reverse();
    const { present } = groupFilter(reversed, null);
    expect(present).toEqual(['게임·만화', '종이·공예']);
    expect(present).toEqual(MOTION_GROUPS.filter((g) => present.includes(g)));
  });
  it('요청한 분류만 shown 으로 거른다', () => {
    const r = groupFilter(items, '종이·공예');
    expect(r.shown).toEqual([items[2]]);
    expect(r.group).toBe('종이·공예');
  });
  it('없는 분류 요청은 전체로 되돌린다', () => {
    for (const g of ['한국', '없는분류', '', null, undefined]) {
      const r = groupFilter(items, g);
      expect(r.shown).toBe(items);
      expect(r.group).toBeNull();
    }
  });
});
