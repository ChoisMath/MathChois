import { describe, it, expect } from 'vitest';
import { distributeEvenly, moveStudent, unassignedStudents, findGroupKeyOf, groupKey, resizeGroups, canResizeNow } from './groupAssign';

const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };

describe('distributeEvenly', () => {
  it('count ≤ 0 이면 빈 배열', () => {
    expect(distributeEvenly(['a', 'b'], 0)).toEqual([]);
    expect(distributeEvenly(['a', 'b'], -1)).toEqual([]);
  });

  it('크기 차이가 1 이하로 균등 배분한다', () => {
    const ids = Array.from({ length: 11 }, (_, i) => `s${i}`);
    const groups = distributeEvenly(ids, 4, seq([0.1, 0.5, 0.9]));
    expect(groups).toHaveLength(4);
    const sizes = groups.map((g) => g.studentIds.length);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    expect(groups.flatMap((g) => g.studentIds).sort()).toEqual([...ids].sort());
    expect(groups.map((g) => g.name)).toEqual(['1모둠', '2모둠', '3모둠', '4모둠']);
    expect(groups.map((g) => g.position)).toEqual([0, 1, 2, 3]);
  });

  it('인원이 모둠 수보다 적으면 빈 모둠을 허용한다', () => {
    const groups = distributeEvenly(['a'], 3, () => 0);
    expect(groups.filter((g) => g.studentIds.length === 0)).toHaveLength(2);
  });

  it('rng 가 같으면 결과가 결정적이다', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const r1 = distributeEvenly(ids, 2, seq([0.3, 0.7, 0.2]));
    const r2 = distributeEvenly(ids, 2, seq([0.3, 0.7, 0.2]));
    expect(r1).toEqual(r2);
  });
});

describe('moveStudent', () => {
  const groups = [
    { id: 'g1', name: '1모둠', position: 0, studentIds: ['a', 'b'] },
    { id: 'g2', name: '2모둠', position: 1, studentIds: ['c'] },
  ];

  it('다른 모둠에서 제거하고 대상 모둠에 추가한다', () => {
    const next = moveStudent(groups, 'a', 'g2');
    expect(next[0].studentIds).toEqual(['b']);
    expect(next[1].studentIds).toEqual(['c', 'a']);
  });

  it('null 이면 미배정이 된다', () => {
    const next = moveStudent(groups, 'c', null);
    expect(next[1].studentIds).toEqual([]);
    expect(findGroupKeyOf(next, 'c')).toBeNull();
  });

  it('id 가 없는 모둠은 position 으로 식별한다', () => {
    const g = [{ name: 'x', position: 0, studentIds: [] }, { name: 'y', position: 1, studentIds: [] }];
    const next = moveStudent(g, 'a', groupKey(g[1]));
    expect(next[1].studentIds).toEqual(['a']);
  });

  it('이미 그 모둠에 있으면 같은 배열을 돌려준다(순서도 그대로, dirty 아님)', () => {
    const groups = [{ name: 'A', position: 0, studentIds: ['x', 'y'] }, { name: 'B', position: 1, studentIds: [] }];
    expect(moveStudent(groups, 'x', 'pos:0')).toBe(groups);
    expect(moveStudent(groups, 'x', 'pos:0')[0].studentIds).toEqual(['x', 'y']);
  });
  it('미배정 학생을 미배정으로 옮겨도 같은 배열', () => {
    const groups = [{ name: 'A', position: 0, studentIds: ['x'] }];
    expect(moveStudent(groups, 'z', null)).toBe(groups);
  });
  it('원본을 변경하지 않는다', () => {
    moveStudent(groups, 'a', 'g2');
    expect(groups[0].studentIds).toEqual(['a', 'b']);
  });
});

describe('unassignedStudents', () => {
  it('어느 모둠에도 없는 학생만 반환한다', () => {
    const members = [{ studentId: 'a' }, { studentId: 'b' }, { studentId: 'z' }];
    const groups = [{ id: 'g', name: '1', position: 0, studentIds: ['a'] }];
    expect(unassignedStudents(members, groups).map((m) => m.studentId)).toEqual(['b', 'z']);
  });
});

describe('resizeGroups', () => {
  const g = (n, ids = []) => ({ name: `${n}모둠`, position: n - 1, studentIds: ids });
  it('늘리면 빈 모둠을 뒤에 추가한다', () => {
    const r = resizeGroups([g(1, ['a'])], 3);
    expect(r.map((x) => x.name)).toEqual(['1모둠', '2모둠', '3모둠']);
    expect(r[2]).toEqual({ name: '3모둠', position: 2, studentIds: [] });
  });
  it('줄이면 뒤 모둠을 잘라내고 그 학생은 미배정이 된다', () => {
    const r = resizeGroups([g(1, ['a']), g(2, ['b']), g(3, ['c'])], 1);
    expect(r).toHaveLength(1);
    expect(unassignedStudents([{ studentId: 'a' }, { studentId: 'b' }, { studentId: 'c' }], r).map((m) => m.studentId)).toEqual(['b', 'c']);
  });
  it('1~30 으로 제한하고 같은 수면 같은 배열을 돌려준다', () => {
    const base = [g(1), g(2)];
    expect(resizeGroups(base, 0)).toHaveLength(1);
    expect(resizeGroups(base, 99)).toHaveLength(30);
    expect(resizeGroups(base, 2)).toBe(base);
  });
  it('id 가 있는 모둠은 id 를 유지한다', () => {
    const r = resizeGroups([{ id: 'x', name: 'A', position: 0, studentIds: [] }], 2);
    expect(r[0].id).toBe('x');
  });
});

describe('canResizeNow', () => {
  const g = (n, ids = [], id) => ({ id, name: `${n}모둠`, position: n - 1, studentIds: ids });
  it('늘리기는 언제나 바로', () => {
    expect(canResizeNow([g(1, ['a'])], 5)).toBe(true);
  });
  it('잘릴 방이 모두 비어 있고 id 도 없으면 바로', () => {
    expect(canResizeNow([g(1, ['a']), g(2), g(3)], 1)).toBe(true);
  });
  it('잘릴 방에 학생이 있거나 저장된 방(id)이면 입력을 마칠 때까지 미룬다', () => {
    expect(canResizeNow([g(1, ['a']), g(2, ['b'])], 1)).toBe(false);
    expect(canResizeNow([g(1), g(2, [], 'saved')], 1)).toBe(false);
  });
});
