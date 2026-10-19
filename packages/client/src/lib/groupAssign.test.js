import { describe, it, expect } from 'vitest';
import { distributeEvenly, moveStudent, unassignedStudents, findGroupKeyOf, groupKey } from './groupAssign';

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
