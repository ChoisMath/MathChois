/**
 * 모둠 보드(칩 드래그)의 dnd-kit 보조 — 키보드 이동과 놓을 곳 판정.
 *
 * - 키보드: 화살표 한 번에 그 방향의 가장 가까운 방(또는 트레이)으로 칩을 옮긴다(25px 씩이 아니라 방 단위).
 * - 포인터: 포인터가 들어 있는 방만 인정한다. 방 밖에서 놓으면 아무 일도 없다(취소).
 *   포인터 좌표가 없는 키보드 이동은 가장 가까운 방.
 */
import { closestCorners, pointerWithin, getFirstCollision } from '@dnd-kit/core';

const DIRECTIONS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
const INSET = 12; // 방 안쪽으로 들어가게 하는 여백(헤더 아래)

/** 방이 칩의 그 방향에 통째로 있는가(겹치는 방 — 지금 들어 있는 방 — 은 어느 방향도 아니다) */
function isToward(code, rect, from) {
  switch (code) {
    case 'ArrowDown': return rect.top >= from.bottom;
    case 'ArrowUp': return rect.bottom <= from.top;
    case 'ArrowLeft': return rect.right <= from.left;
    case 'ArrowRight': return rect.left >= from.right;
    default: return false;
  }
}

/** KeyboardSensor 의 coordinateGetter */
export function deskKeyboardCoordinates(event, { active, context }) {
  if (!DIRECTIONS.includes(event.code)) return undefined;
  event.preventDefault();
  const { collisionRect, droppableRects, droppableContainers, over } = context;
  if (!collisionRect) return undefined;

  const candidates = droppableContainers.getEnabled().filter((c) => {
    if (over && c.id === over.id) return false; // 지금 있는 방은 제외
    const rect = droppableRects.get(c.id);
    return rect ? isToward(event.code, rect, collisionRect) : false;
  });
  if (candidates.length === 0) return undefined;

  const collisions = closestCorners({
    active: { id: active }, collisionRect, droppableRects,
    droppableContainers: candidates, pointerCoordinates: null,
  });
  const targetId = getFirstCollision(collisions, 'id');
  const target = targetId != null ? droppableRects.get(targetId) : null;
  if (!target) return undefined;
  return { x: target.left + INSET, y: target.top + INSET * 3 };
}

/** DndContext 의 collisionDetection */
export function deskCollision(args) {
  if (args.pointerCoordinates) return pointerWithin(args);
  return closestCorners(args);
}
