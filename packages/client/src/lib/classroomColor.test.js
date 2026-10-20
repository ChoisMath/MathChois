import { describe, it, expect } from 'vitest';
import {
  classroomColor, assignClassroomColors, CLASSROOM_COLORS,
  COLOR_STYLES, resolveClassroomColor, colorVars,
} from './classroomColor.js';

const room = (i, day) => ({
  id: `c0a8f${i}d2-4b1e-4c3a-9e7f-1a2b3c4d5e${String(i).padStart(2, '0')}`,
  createdAt: `2026-03-${String(day).padStart(2, '0')}T09:00:00Z`,
});

describe('classroomColor', () => {
  it('같은 학급 id 는 항상 같은 색, 여섯 색 중 하나', () => {
    const id = '3f2c9a10-5b7e-4c1d-9a2f-7e6d5c4b3a21';
    expect(classroomColor(id)).toBe(classroomColor(id));
    expect(CLASSROOM_COLORS).toContain(classroomColor(id));
  });

  it('id 가 없으면 첫 번째 색', () => {
    expect(classroomColor(undefined)).toBe(CLASSROOM_COLORS[0]);
  });
});

describe('assignClassroomColors', () => {
  it('학급이 6개 이하면 모두 다른 색', () => {
    const rooms = [1, 2, 3, 4, 5, 6].map((i) => room(i, i));
    const colors = assignClassroomColors(rooms);
    expect(new Set(rooms.map((r) => colors.get(r.id))).size).toBe(6);
  });

  it('7개 이상이면 여섯 색을 다 쓴 뒤에야 겹친다', () => {
    const rooms = Array.from({ length: 13 }, (_, i) => room(i, i + 1));
    const colors = assignClassroomColors(rooms);
    const counts = {};
    for (const r of rooms) counts[colors.get(r.id)] = (counts[colors.get(r.id)] || 0) + 1;
    expect(Object.keys(counts)).toHaveLength(6);
    expect(Math.max(...Object.values(counts)) - Math.min(...Object.values(counts))).toBeLessThanOrEqual(1);
  });

  it('새 학급을 만들어도 기존 학급의 색은 그대로', () => {
    const before = [1, 2, 3].map((i) => room(i, i));
    const after = [...before, room(4, 10)];
    const a = assignClassroomColors(before);
    const b = assignClassroomColors(after);
    for (const r of before) expect(b.get(r.id)).toBe(a.get(r.id));
  });

  it('목록 순서(최신순 등)와 관계없이 같은 결과', () => {
    const rooms = [1, 2, 3, 4, 5].map((i) => room(i, i));
    const a = assignClassroomColors(rooms);
    const b = assignClassroomColors([...rooms].reverse());
    for (const r of rooms) expect(b.get(r.id)).toBe(a.get(r.id));
  });

  it('첫 학급은 자기 고유 색을 그대로 쓴다', () => {
    const r = room(1, 1);
    expect(assignClassroomColors([r]).get(r.id)).toBe(classroomColor(r.id));
  });
});

describe('resolveClassroomColor', () => {
  it('유효한 저장 색이 있으면 그 색', () => {
    expect(resolveClassroomColor({ id: 'x', color: 'sage' })).toBe('sage');
  });

  it('저장 색이 없으면 자동 배정 Map 의 색', () => {
    expect(resolveClassroomColor({ id: 'x', color: null }, new Map([['x', 'sky']]))).toBe('sky');
    expect(resolveClassroomColor({ id: 'x' }, new Map([['x', 'rose']]))).toBe('rose');
  });

  it('알 수 없는 색("red")은 무시하고 자동 색, Map 도 없으면 고유 색', () => {
    expect(resolveClassroomColor({ id: 'x', color: 'red' }, new Map([['x', 'sky']]))).toBe('sky');
    expect(resolveClassroomColor({ id: 'x', color: 'red' })).toBe(classroomColor('x'));
  });
});

describe('COLOR_STYLES / colorVars', () => {
  it('키가 CLASSROOM_COLORS 와 같은 순서', () => {
    expect(Object.keys(COLOR_STYLES)).toEqual(CLASSROOM_COLORS);
  });

  it('colorVars 는 인라인 style 용 CSS 변수를 돌려준다', () => {
    expect(colorVars('rose')['--nb-cover']).toBe('#ee8ab1');
    expect(colorVars('rose')).toEqual({ '--nb-cover': '#ee8ab1', '--nb-tint': '#fbe1ec', '--nb-deep': '#932a56' });
  });

  it('여섯 색 모두 cover/tint/deep/label 을 가진다', () => {
    for (const c of CLASSROOM_COLORS) {
      expect(COLOR_STYLES[c]).toEqual({
        cover: expect.stringMatching(/^#[0-9a-f]{6}$/),
        tint: expect.stringMatching(/^#[0-9a-f]{6}$/),
        deep: expect.stringMatching(/^#[0-9a-f]{6}$/),
        label: expect.any(String),
      });
    }
  });
});
