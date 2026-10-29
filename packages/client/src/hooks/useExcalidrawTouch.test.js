// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { useExcalidrawTouch } from './useExcalidrawTouch';
import { setInputMode } from '../lib/inputMode';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function Harness({ api, containerEl }) {
  const excalidrawAPIRef = useRef(api);
  const containerRef = useRef(containerEl);
  const screenLockedRef = useRef(false);
  useExcalidrawTouch({ excalidrawAPIRef, containerRef, screenLockedRef });
  return null;
}

const touch = (type, init) => new PointerEvent(type, {
  pointerType: 'touch', button: 0, bubbles: true, cancelable: true, ...init,
});

describe('useExcalidrawTouch — 손가락 모드 핀치 진입', () => {
  let container, canvas, root, mount, api, elements;

  beforeEach(() => {
    vi.useFakeTimers();
    setInputMode('finger');
    container = document.createElement('div');
    const exc = document.createElement('div');
    exc.className = 'excalidraw';
    canvas = document.createElement('canvas');
    exc.appendChild(canvas);
    container.appendChild(exc);
    document.body.appendChild(container);
    elements = [];
    api = {
      getAppState: () => ({ activeTool: { type: 'freedraw' }, zoom: { value: 1 }, scrollX: 0, scrollY: 0 }),
      getSceneElements: () => elements,
      updateScene: vi.fn(),
    };
    mount = document.createElement('div');
    document.body.appendChild(mount);
    root = createRoot(mount);
    act(() => { root.render(createElement(Harness, { api, containerEl: container })); });
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    mount.remove();
    container.remove();
    vi.useRealTimers();
  });

  it('두 번째 손가락이 닿으면 첫 손가락의 마지막 위치로 pointerup 을 합성한다 (0,0 이 아님)', () => {
    const ups = [];
    const onUp = (e) => ups.push({ pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY });
    window.addEventListener('pointerup', onUp); // Excalidraw 와 같은 window 버블 리스너
    try {
      canvas.dispatchEvent(touch('pointerdown', { pointerId: 1, clientX: 100, clientY: 200 }));
      canvas.dispatchEvent(touch('pointermove', { pointerId: 1, clientX: 120, clientY: 210 }));
      canvas.dispatchEvent(touch('pointerdown', { pointerId: 2, clientX: 300, clientY: 400 }));
    } finally {
      window.removeEventListener('pointerup', onUp);
    }
    expect(ups).toEqual([{ pointerId: 1, clientX: 120, clientY: 210 }]);
  });

  it('핀치로 끊긴 첫 손가락 획은 히스토리 오염 없이 제거된다', () => {
    canvas.dispatchEvent(touch('pointerdown', { pointerId: 1, clientX: 100, clientY: 200 }));
    // Excalidraw 가 첫 손가락으로 만든 freedraw (생성 시각 = 다운 이후)
    elements = [
      { id: 'bg', type: 'image', updated: 0 },
      { id: 'old', type: 'freedraw', updated: Date.now() - 5000 },
      { id: 'leak', type: 'freedraw', updated: Date.now() },
    ];
    canvas.dispatchEvent(touch('pointerdown', { pointerId: 2, clientX: 300, clientY: 400 }));
    expect(api.updateScene).not.toHaveBeenCalled(); // 커밋 settle 전 동기 삭제 금지
    vi.advanceTimersByTime(100);
    expect(api.updateScene).toHaveBeenCalledTimes(1);
    const { elements: next, commitToHistory } = api.updateScene.mock.calls[0][0];
    expect(commitToHistory).toBe(false);
    expect(next.find((el) => el.id === 'leak').isDeleted).toBe(true);
    expect(next.find((el) => el.id === 'old').isDeleted).toBeUndefined();
  });

  it('스타일러스 모드에서는 손가락 획이 없으므로 핀치 진입이 아무 요소도 지우지 않는다', () => {
    setInputMode('stylus');
    canvas.dispatchEvent(touch('pointerdown', { pointerId: 1, clientX: 100, clientY: 200 }));
    elements = [{ id: 'pen', type: 'freedraw', updated: Date.now() }]; // 펜(웻잉크) 커밋 획
    canvas.dispatchEvent(touch('pointerdown', { pointerId: 2, clientX: 300, clientY: 400 }));
    vi.advanceTimersByTime(200);
    const deleted = api.updateScene.mock.calls.some((c) => c[0].elements?.some((el) => el.id === 'pen' && el.isDeleted));
    expect(deleted).toBe(false);
  });
});
