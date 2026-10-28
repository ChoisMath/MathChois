import { describe, it, expect } from 'vitest';
import { deskKeyboardCoordinates, deskCollision } from './groupBoardKeyboard';

/* 방 세 개가 한 줄: A(0~100) B(120~220) C(240~340), 트레이 T 는 그 위(-200~-100) */
const rect = (left, top, w = 100, h = 100) => ({ left, top, right: left + w, bottom: top + h, width: w, height: h });
const rects = new Map([['T', rect(0, -200, 340)], ['A', rect(0, 0)], ['B', rect(120, 0)], ['C', rect(240, 0)]]);
const containers = { getEnabled: () => [...rects.keys()].map((id) => ({ id, disabled: false })) };
const ctx = (overId) => ({
  active: { id: 's1' }, over: overId ? { id: overId } : null,
  collisionRect: rect(20, 40, 60, 24), // A 방 안에 있는 칩
  droppableRects: rects, droppableContainers: containers,
});
const key = (code) => ({ code, preventDefault() {} });

describe('deskKeyboardCoordinates', () => {
  it('→ 는 오른쪽 가장 가까운 방 안쪽 좌표를 돌려준다', () => {
    const c = deskKeyboardCoordinates(key('ArrowRight'), { active: 's1', currentCoordinates: { x: 20, y: 40 }, context: ctx('A') });
    expect(c.x).toBeGreaterThanOrEqual(120);
    expect(c.x).toBeLessThan(220);
  });
  it('↑ 는 지금 있는 방을 빼고 위쪽 방(트레이)으로 간다', () => {
    const c = deskKeyboardCoordinates(key('ArrowUp'), { active: 's1', currentCoordinates: { x: 20, y: 40 }, context: ctx('A') });
    expect(c.y).toBeLessThan(0);
  });
  it('그 방향에 방이 없으면 undefined', () => {
    expect(deskKeyboardCoordinates(key('ArrowLeft'), { active: 's1', currentCoordinates: { x: 20, y: 40 }, context: ctx('A') })).toBeUndefined();
  });
  it('화살표가 아니면 undefined', () => {
    expect(deskKeyboardCoordinates(key('Space'), { active: 's1', currentCoordinates: { x: 0, y: 0 }, context: ctx('A') })).toBeUndefined();
  });
});

describe('deskCollision', () => {
  const args = (pointer, collisionRect) => ({
    active: { id: 's1' }, collisionRect, droppableRects: rects,
    droppableContainers: containers.getEnabled(), pointerCoordinates: pointer,
  });
  it('포인터가 방 안에 있으면 그 방', () => {
    expect(deskCollision(args({ x: 150, y: 50 }, rect(140, 40, 60, 24)))[0].id).toBe('B');
  });
  it('포인터가 어느 방에도 없으면 빈 배열(놓으면 취소)', () => {
    expect(deskCollision(args({ x: 110, y: 50 }, rect(100, 40, 60, 24)))).toEqual([]);
  });
  it('포인터가 없으면(키보드) 가장 가까운 방', () => {
    expect(deskCollision(args(null, rect(250, 10, 60, 24)))[0].id).toBe('C');
  });
});
