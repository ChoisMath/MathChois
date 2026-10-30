import { describe, it, expect } from 'vitest';
import { pointInPolygon, lassoSelection, selectionScreenBounds, selectionPad, isTapPath, TAP_MAX_PX, SELECTION_PAD_PX, HANDLE_SIZE_PX } from './lasso';

const square = [[0, 0], [100, 0], [100, 100], [0, 100]];
const fd = (id, x, y, pts, extra = {}) => ({ id, type: 'freedraw', x, y, points: pts, width: 10, height: 10, isDeleted: false, locked: false, groupIds: [], ...extra });
const box = (id, type, x, y, w, h, extra = {}) => ({ id, type, x, y, width: w, height: h, isDeleted: false, locked: false, groupIds: [], ...extra });

describe('pointInPolygon', () => {
  it('안/밖/오목 다각형', () => {
    expect(pointInPolygon([50, 50], square)).toBe(true);
    expect(pointInPolygon([150, 50], square)).toBe(false);
    const concave = [[0, 0], [100, 0], [100, 100], [50, 50], [0, 100]]; // 아래가 파인 모양
    expect(pointInPolygon([50, 80], concave)).toBe(false);
    expect(pointInPolygon([20, 20], concave)).toBe(true);
  });
  it('점이 3개 미만이면 false', () => {
    expect(pointInPolygon([0, 0], [[0, 0], [1, 1]])).toBe(false);
  });
});

describe('lassoSelection', () => {
  it('펜/형광펜/선은 점의 절반 이상이 안에 있을 때 선택', () => {
    const inside = fd('a', 10, 10, [[0, 0], [10, 10], [20, 20], [30, 30]]);
    const half = fd('b', 90, 50, [[0, 0], [5, 0], [15, 0], [25, 0]]);        // 2/4 안 (x=90,95 안 / 105,115 밖)
    const mostlyOut = fd('c', 95, 50, [[0, 0], [10, 0], [20, 0], [30, 0]]);  // 1/4 안
    const line = { ...box('d', 'line', 10, 10, 50, 50), points: [[0, 0], [50, 50]] };
    const r = lassoSelection([inside, half, mostlyOut, line], square);
    expect(Object.keys(r.selectedElementIds).sort()).toEqual(['a', 'b', 'd']);
  });

  it('이미지·글자·도형은 bbox 중심이 안에 있을 때 선택', () => {
    const img = box('img', 'image', 60, 60, 80, 80);     // 중심 (100,100) → 경계 → 밖 취급 가능; 명확히 안쪽으로
    const img2 = box('img2', 'image', 20, 20, 40, 40);   // 중심 (40,40) 안
    const txt = box('t', 'text', 90, 90, 40, 20);        // 중심 (110,100) 밖
    const r = lassoSelection([img, img2, txt], square);
    expect(r.selectedElementIds).toEqual({ img2: true });
  });

  it('삭제됨·잠김·배경·제외 접두사·제외 id 는 선택하지 않는다', () => {
    const els = [
      fd('__bg_image__', 10, 10, [[0, 0], [5, 5]]),
      fd('del', 10, 10, [[0, 0], [5, 5]], { isDeleted: true }),
      fd('lock', 10, 10, [[0, 0], [5, 5]], { locked: true }),
      fd('__tn_x', 10, 10, [[0, 0], [5, 5]]),
      fd('skip', 10, 10, [[0, 0], [5, 5]]),
      fd('ok', 10, 10, [[0, 0], [5, 5]]),
    ];
    const r = lassoSelection(els, square, { excludePrefixes: ['__tn_'], excludeIds: ['skip'] });
    expect(r.selectedElementIds).toEqual({ ok: true });
  });

  it('그룹: 한 요소가 잡히면 같은 그룹 전체가 잡히고 selectedGroupIds 에 든다 (도형 보정 채우기)', () => {
    const stroke = fd('s', 10, 10, [[0, 0], [20, 0], [20, 20], [0, 20]], { groupIds: ['g1'] });
    const fill = { ...box('f', 'line', 200, 200, 10, 10), points: [[0, 0], [10, 0], [10, 10]], groupIds: ['g1'], customData: { shapeFill: true } };
    const other = fd('o', 200, 200, [[0, 0], [5, 5]]);
    const r = lassoSelection([stroke, fill, other], square);
    expect(r.selectedElementIds).toEqual({ s: true, f: true });
    expect(r.selectedGroupIds).toEqual({ g1: true });
  });

  it('아무것도 없으면 빈 객체', () => {
    expect(lassoSelection([fd('a', 500, 500, [[0, 0], [1, 1]])], square)).toEqual({ selectedElementIds: {}, selectedGroupIds: {} });
  });
});

describe('selectionScreenBounds / isTapPath', () => {
  it('선택 요소들의 화면 bbox (zoom·scroll 반영, 여백 포함)', () => {
    const app = { zoom: { value: 2 }, scrollX: 10, scrollY: 20 };
    const els = [box('a', 'image', 0, 0, 10, 10), box('b', 'rectangle', 30, 30, 10, 10), box('c', 'image', 100, 100, 10, 10)];
    const b = selectionScreenBounds(els, { a: true, b: true }, app);
    // screen = (scene + scroll) * zoom → a: (20,40)-(40,60), b: (80,100)-(100,120)
    expect(b).toEqual({ left: 20 - SELECTION_PAD_PX, top: 40 - SELECTION_PAD_PX, right: 100 + SELECTION_PAD_PX, bottom: 120 + SELECTION_PAD_PX });
    expect(selectionScreenBounds(els, {}, app)).toBeNull();
  });
  it('freedraw 는 점 범위로 bbox', () => {
    const app = { zoom: { value: 1 }, scrollX: 0, scrollY: 0 };
    const el = fd('a', 10, 10, [[0, 0], [-5, 30], [40, 2]]);
    expect(selectionScreenBounds([el], { a: true }, app)).toEqual({ left: 5 - SELECTION_PAD_PX, top: 10 - SELECTION_PAD_PX, right: 50 + SELECTION_PAD_PX, bottom: 40 + SELECTION_PAD_PX });
  });
  it('selectionPad 는 Excalidraw 핸들 기하를 덮는다: 핸들 바깥 끝 + 2px, 위쪽은 회전 핸들까지', () => {
    // 핸들 바깥 끝 = 여백 4 − (p−4)/2 + p  →  mouse 10, pen 14, touch 20 (+2 허용)
    expect(selectionPad('mouse')).toEqual({ side: 12, top: 28 });
    expect(selectionPad('pen')).toEqual({ side: 16, top: 32 });
    expect(selectionPad('touch')).toEqual({ side: 22, top: 38 });
    expect(selectionPad(undefined)).toEqual(selectionPad('mouse'));
    expect(HANDLE_SIZE_PX).toEqual({ mouse: 8, pen: 16, touch: 28 });
    expect(SELECTION_PAD_PX).toBe(12);
  });

  it('객체 pad 를 주면 위쪽만 top 만큼 넓어진다 (펜으로 모서리/회전 핸들을 누르면 통과)', () => {
    const app = { zoom: { value: 1 }, scrollX: 0, scrollY: 0 };
    const el = box('a', 'image', 100, 100, 50, 50);
    const b = selectionScreenBounds([el], { a: true }, app, selectionPad('pen'));
    expect(b).toEqual({ left: 84, top: 68, right: 166, bottom: 166 });
    // 오른쪽 아래 모서리 핸들 중심 (150+4−6+8 = 156, 156) 과 회전 핸들 중심 (125, 100−4−16+6−16+8 = 78) 이 안에 든다
    const inside = (x, y) => x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;
    expect(inside(156, 156)).toBe(true);
    expect(inside(125, 78)).toBe(true);
    expect(inside(125, 60)).toBe(false);
  });

  it('이동 거리가 TAP_MAX_PX 미만이거나 점이 3개 미만이면 탭', () => {
    expect(TAP_MAX_PX).toBe(6);
    expect(isTapPath([[0, 0], [2, 2], [3, 1]])).toBe(true);
    expect(isTapPath([[0, 0], [10, 0]])).toBe(true);
    expect(isTapPath([[0, 0], [10, 0], [10, 10]])).toBe(false);
  });
});
