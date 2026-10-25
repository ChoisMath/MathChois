import { describe, it, expect } from 'vitest';
import {
  UNASSIGNED, groupByUnit, unitCountForTab, visibleUnits, resolveUnitParam,
} from '@mathchois/shared';

const U = (id, position, isHidden = false) => ({ id, position, isHidden });
describe('groupByUnit', () => {
  it('단원별로 묶고 unitId 없음/모르는 단원은 미분류', () => {
    const { byUnit, unassigned } = groupByUnit([{ id: 'u1' }, { id: 'u2' }],
      [{ id: 'a', unitId: 'u1' }, { id: 'b', unitId: null }, { id: 'c', unitId: 'gone' }, { id: 'd' }]);
    expect(byUnit.get('u1').map((x) => x.id)).toEqual(['a']);
    expect(byUnit.get('u2')).toEqual([]);
    expect(unassigned.map((x) => x.id)).toEqual(['b', 'c', 'd']);
  });
});
describe('visibleUnits', () => {
  const units = [U('u2', 1), U('u1', 0), U('h', 2, true), U('empty', 3)];
  const counts = new Map([['u1', 2], ['u2', 1], ['h', 5]]);
  it('교사: 전부 position 순', () => {
    expect(visibleUnits(units, counts, true).map((u) => u.id)).toEqual(['u1', 'u2', 'h', 'empty']);
  });
  it('학생: 숨김·0개 제외', () => {
    expect(visibleUnits(units, counts, false).map((u) => u.id)).toEqual(['u1', 'u2']);
  });
});
describe('unitCountForTab', () => {
  it('탭별 개수', () => {
    expect(unitCountForTab({ chapterCount: 3, videoCount: 1 }, 'chapters')).toBe(3);
    expect(unitCountForTab({ chapterCount: 3, videoCount: 1 }, 'videos')).toBe(1);
  });
});
describe('resolveUnitParam', () => {
  it('보이는 단원 id 는 그대로', () => expect(resolveUnitParam('u1', ['u1'], false)).toBe('u1'));
  it('없거나 보이지 않는 단원은 null', () => expect(resolveUnitParam('h', ['u1'], true)).toBeNull());
  it("'none' 은 미분류가 있을 때만", () => {
    expect(resolveUnitParam(UNASSIGNED, ['u1'], true)).toBe(UNASSIGNED);
    expect(resolveUnitParam(UNASSIGNED, ['u1'], false)).toBeNull();
  });
  it('null/빈 값은 null', () => {
    expect(resolveUnitParam(null, ['u1'], true)).toBeNull();
    expect(resolveUnitParam('', ['u1'], true)).toBeNull();
  });
  it('학생 영상 탭: 챕터만 있는 단원은 visible 에 없으므로 null (Review Focus 4)', () => {
    const units = [U('x', 0)];
    const videoCounts = new Map([['x', 0]]);
    const ids = visibleUnits(units, videoCounts, false).map((u) => u.id);
    expect(resolveUnitParam('x', ids, false)).toBeNull();
  });
});
