// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { useLasso } from './useLasso';
import { setInputMode } from '../lib/inputMode';

vi.mock('@excalidraw/excalidraw', () => ({
  viewportCoordsToSceneCoords: ({ clientX, clientY }, app) => ({
    x: clientX / app.zoom.value - app.scrollX,
    y: clientY / app.zoom.value - app.scrollY,
  }),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function Harness({ api, overlayEl, active }) {
  const excalidrawAPIRef = useRef(api);
  const overlayRef = useRef(overlayEl);
  const drawModeRef = useRef(true);
  const lassoActiveRef = useRef(active);
  useLasso({ excalidrawAPIRef, overlayRef, drawModeRef, lassoActiveRef, excludePrefixes: ['__tn_'] });
  return null;
}

const ev = (type, x, y, extra = {}) => new PointerEvent(type, {
  pointerType: 'pen', pointerId: 7, button: 0, clientX: x, clientY: y, bubbles: true, cancelable: true, ...extra,
});
const fd = (id, x, y, pts, extra = {}) => ({ id, type: 'freedraw', x, y, points: pts, width: 10, height: 10, isDeleted: false, locked: false, groupIds: [], ...extra });

describe('useLasso', () => {
  let container, canvas, overlay, root, mount, api, appState, elements;

  const mountWith = (active = true) => {
    act(() => { root.render(createElement(Harness, { api, overlayEl: overlay, active })); });
  };
  const drag = (path, type = {}) => {
    canvas.dispatchEvent(ev('pointerdown', path[0][0], path[0][1], type));
    for (const [x, y] of path.slice(1)) canvas.dispatchEvent(ev('pointermove', x, y, type));
    canvas.dispatchEvent(ev('pointerup', path[path.length - 1][0], path[path.length - 1][1], type));
  };
  const lastSel = () => {
    const calls = api.updateScene.mock.calls;
    return calls.length ? calls[calls.length - 1][0].appState : null;
  };

  beforeEach(() => {
    setInputMode('stylus');
    HTMLCanvasElement.prototype.getContext = () => null;
    container = document.createElement('div');
    const exc = document.createElement('div');
    exc.className = 'excalidraw';
    canvas = document.createElement('canvas');
    exc.appendChild(canvas);
    overlay = document.createElement('canvas');
    container.appendChild(exc);
    container.appendChild(overlay);
    document.body.appendChild(container);
    elements = [
      fd('a', 10, 10, [[0, 0], [10, 10], [20, 20]]),                   // (10..30) 안
      fd('b', 300, 300, [[0, 0], [10, 10]]),                            // 밖
      fd('__tn_t', 10, 10, [[0, 0], [10, 10]]),                         // 교사 코멘트 (제외)
    ];
    appState = { zoom: { value: 1 }, scrollX: 0, scrollY: 0, selectedElementIds: {}, selectedGroupIds: {} };
    api = {
      getAppState: () => appState,
      getSceneElements: () => elements,
      updateScene: vi.fn(({ appState: a }) => { if (a) appState = { ...appState, ...a }; }),
    };
    mount = document.createElement('div');
    document.body.appendChild(mount);
    root = createRoot(mount);
  });
  afterEach(() => { act(() => { root.unmount(); }); mount.remove(); container.remove(); });

  it('올가미로 둘러싼 요소만 선택 상태로 넘긴다 (제외 접두사 제외)', () => {
    mountWith(true);
    drag([[0, 0], [100, 0], [100, 100], [0, 100]]);
    expect(lastSel()).toEqual({ selectedElementIds: { a: true }, selectedGroupIds: {} });
  });

  it('탭(짧은 이동)은 선택 해제', () => {
    mountWith(true);
    appState.selectedElementIds = { a: true };
    drag([[200, 200], [202, 201], [203, 203]]);
    expect(lastSel()).toEqual({ selectedElementIds: {}, selectedGroupIds: {} });
  });

  it('선택 묶음 안을 누르면 가로채지 않는다 (Excalidraw 이동으로 넘김)', () => {
    mountWith(true);
    appState.selectedElementIds = { a: true };
    const down = ev('pointerdown', 15, 15);
    canvas.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(false);
    canvas.dispatchEvent(ev('pointermove', 50, 50));
    canvas.dispatchEvent(ev('pointerup', 50, 50));
    expect(api.updateScene).not.toHaveBeenCalled();
    // 밖을 누르면 새 올가미
    const down2 = ev('pointerdown', 200, 200);
    canvas.dispatchEvent(down2);
    expect(down2.defaultPrevented).toBe(true);
  });

  it('올가미 도구가 아니면 아무것도 하지 않는다', () => {
    mountWith(false);
    const down = ev('pointerdown', 0, 0);
    canvas.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(false);
    drag([[0, 0], [100, 0], [100, 100], [0, 100]]);
    expect(api.updateScene).not.toHaveBeenCalled();
  });

  it('손가락은 finger 모드에서만, 두 번째 손가락은 올가미 취소', () => {
    mountWith(true);
    const t1 = { pointerType: 'touch', pointerId: 11 };
    drag([[0, 0], [100, 0], [100, 100], [0, 100]], t1);        // stylus 모드: 무시
    expect(api.updateScene).not.toHaveBeenCalled();
    setInputMode('finger');
    drag([[0, 0], [100, 0], [100, 100], [0, 100]], t1);
    expect(lastSel().selectedElementIds).toEqual({ a: true });
    api.updateScene.mockClear();
    canvas.dispatchEvent(ev('pointerdown', 0, 0, t1));
    canvas.dispatchEvent(ev('pointermove', 100, 0, t1));
    canvas.dispatchEvent(ev('pointerdown', 50, 50, { pointerType: 'touch', pointerId: 12 })); // 핀치 시작 → 취소
    canvas.dispatchEvent(ev('pointermove', 100, 100, t1));
    canvas.dispatchEvent(ev('pointerup', 0, 100, t1));
    expect(api.updateScene).not.toHaveBeenCalled();
  });
});
