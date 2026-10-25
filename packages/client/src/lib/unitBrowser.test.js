import { describe, it, expect } from 'vitest';
import { UNASSIGNED } from '@mathchois/shared';
import { resolveUnitView, applyUnitOrder, firstCover } from './unitBrowser';

const U = (id, position, isHidden = false) => ({ id, position, isHidden, title: id });
const units = [U('u2', 1), U('u1', 0), U('empty', 2)];
const items = [
  { id: 'a', unitId: 'u1' }, { id: 'b', unitId: 'u1' }, { id: 'c', unitId: 'u2' }, { id: 'd', unitId: null },
];

describe('resolveUnitView', () => {
  it('단원 0개 → flat, 항목 그대로', () => {
    const v = resolveUnitView({ units: [], items, isTeacher: true, unitParam: 'u1' });
    expect(v.mode).toBe('flat');
    expect(v.items).toBe(items);
  });

  it('주소 값 없음 → 단원 목록(position 순)', () => {
    const v = resolveUnitView({ units, items, isTeacher: true, unitParam: null });
    expect(v.mode).toBe('grid');
    expect(v.shown.map((u) => u.id)).toEqual(['u1', 'u2', 'empty']);
    expect(v.counts.get('u1')).toBe(2);
    expect(v.unassigned.map((x) => x.id)).toEqual(['d']);
  });

  it('단원 안 → 그 단원 항목만', () => {
    const v = resolveUnitView({ units, items, isTeacher: false, unitParam: 'u1' });
    expect(v).toMatchObject({ mode: 'unit', unitId: 'u1' });
    expect(v.unit.id).toBe('u1');
    expect(v.items.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('미분류 안 → unitId null, 미분류 항목', () => {
    const v = resolveUnitView({ units, items, isTeacher: false, unitParam: UNASSIGNED });
    expect(v).toMatchObject({ mode: 'unit', unitId: null, unit: null });
    expect(v.items.map((x) => x.id)).toEqual(['d']);
  });

  it('교사: 빈 단원 안 화면에 머문다(항목 0개)', () => {
    const v = resolveUnitView({ units, items, isTeacher: true, unitParam: 'empty' });
    expect(v).toMatchObject({ mode: 'unit', unitId: 'empty' });
    expect(v.items).toEqual([]);
  });

  it('학생: 빈 단원·숨긴 단원·없는 단원 주소 → 단원 목록', () => {
    const withHidden = [...units, U('h', 3, true)];
    const its = [...items, { id: 'e', unitId: 'h' }];
    for (const unitParam of ['empty', 'h', 'gone']) {
      expect(resolveUnitView({ units: withHidden, items: its, isTeacher: false, unitParam }).mode).toBe('grid');
    }
  });

  it('미분류가 없는데 none → 단원 목록', () => {
    const v = resolveUnitView({ units, items: items.slice(0, 3), isTeacher: true, unitParam: UNASSIGNED });
    expect(v.mode).toBe('grid');
  });

  it('학생: 이 탭에 보일 단원이 없으면 flat', () => {
    const v = resolveUnitView({ units, items: [{ id: 'd', unitId: null }], isTeacher: false, unitParam: 'u1' });
    expect(v.mode).toBe('flat');
    expect(v.items.map((x) => x.id)).toEqual(['d']);
  });
});

describe('applyUnitOrder', () => {
  it('ids 순서대로 position 을 덮어쓴다(원본 유지)', () => {
    const out = applyUnitOrder(units, ['empty', 'u1', 'u2']);
    expect(out.map((u) => [u.id, u.position])).toEqual([['u2', 2], ['u1', 1], ['empty', 0]]);
    expect(units[0].position).toBe(1);
  });
  it('ids 없으면 그대로', () => {
    expect(applyUnitOrder(units, null)).toBe(units);
  });
});

describe('firstCover', () => {
  it('그림이 있는 첫 항목', () => {
    const cover = (x) => x.img ?? null;
    expect(firstCover([{ id: 1 }, { id: 2, img: 'b.png' }, { id: 3, img: 'c.png' }], cover)).toBe('b.png');
    expect(firstCover([{ id: 1 }], cover)).toBeNull();
    expect(firstCover([{ id: 1, img: 'x' }], undefined)).toBeNull();
  });
});
