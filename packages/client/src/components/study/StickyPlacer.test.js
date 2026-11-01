// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import StickyPlacer from './StickyPlacer';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('StickyPlacer — 메모지 그림자 따라다니기', () => {
  let root, mount, onCommit, onCancel;
  const spec = { type: 'tab', friend: 'circle', pattern: 'plain' };
  const ov = () => document.querySelector('[data-sticky-placer]');
  const img = () => ov().querySelector('img');
  const ptr = (type, x, y, pointerType = 'mouse') => {
    const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
    Object.defineProperty(e, 'pointerType', { value: pointerType });
    return e;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    onCommit = vi.fn(); onCancel = vi.fn();
    mount = document.createElement('div');
    document.body.appendChild(mount);
    root = createRoot(mount);
    act(() => { root.render(createElement(StickyPlacer, { spec, ghostSize: { w: 120, h: 150 }, onCommit, onCancel })); });
  });
  afterEach(() => { act(() => { root.unmount(); }); mount.remove(); vi.useRealTimers(); });

  it('처음엔 화면 가운데에, 포인터가 움직이면 그 아래에 50% 그림자를 둔다 (크기는 ghostSize)', () => {
    expect(img().style.opacity).toBe('0.5');
    expect(parseFloat(img().style.width)).toBe(120);
    expect(parseFloat(img().style.height)).toBe(150);
    expect(parseFloat(img().style.left) + 60).toBeCloseTo(window.innerWidth / 2);
    act(() => { ov().dispatchEvent(ptr('pointermove', 400, 300)); });
    expect(parseFloat(img().style.left)).toBeCloseTo(340);
    expect(parseFloat(img().style.top)).toBeCloseTo(225);
  });

  it('마우스·손가락은 누르는 순간 확정', () => {
    act(() => { ov().dispatchEvent(ptr('pointerdown', 50, 60, 'touch')); });
    expect(onCommit).toHaveBeenCalledWith({ clientX: 50, clientY: 60 });
  });

  it('펜은 400ms 꾹 눌러야 확정; 짧은 탭·8px 넘는 이동은 무시', () => {
    act(() => { ov().dispatchEvent(ptr('pointerdown', 50, 60, 'pen')); });
    act(() => { vi.advanceTimersByTime(399); });
    expect(onCommit).not.toHaveBeenCalled();
    act(() => { ov().dispatchEvent(ptr('pointerup', 50, 60, 'pen')); });
    act(() => { vi.advanceTimersByTime(100); });
    expect(onCommit).not.toHaveBeenCalled();
    act(() => { ov().dispatchEvent(ptr('pointerdown', 50, 60, 'pen')); });
    act(() => { ov().dispatchEvent(ptr('pointermove', 70, 60, 'pen')); });
    act(() => { vi.advanceTimersByTime(500); });
    expect(onCommit).not.toHaveBeenCalled();
    act(() => { ov().dispatchEvent(ptr('pointerup', 70, 60, 'pen')); });
    act(() => { ov().dispatchEvent(ptr('pointerdown', 80, 90, 'pen')); });
    act(() => { vi.advanceTimersByTime(400); });
    expect(onCommit).toHaveBeenCalledWith({ clientX: 80, clientY: 90 });
  });

  it('Escape 는 취소', () => {
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
  });
});
