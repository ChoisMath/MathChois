// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getInputMode, setInputMode, subscribeInputMode, shouldBlockTouchDraw,
} from './inputMode';

describe('inputMode store', () => {
  beforeEach(() => {
    localStorage.clear();
    setInputMode('stylus');
  });

  it('기본값은 stylus', () => {
    localStorage.clear();
    expect(getInputMode()).toBe('stylus');
  });

  it('setInputMode/getInputMode 왕복 + localStorage 반영', () => {
    setInputMode('finger');
    expect(getInputMode()).toBe('finger');
    expect(localStorage.getItem('mc_input_mode')).toBe('finger');
  });

  it('무효한 값은 무시', () => {
    setInputMode('finger');
    setInputMode('garbage');
    expect(getInputMode()).toBe('finger');
  });

  it('subscribeInputMode 콜백 호출 및 해제', () => {
    const fn = vi.fn();
    const unsub = subscribeInputMode(fn);
    setInputMode('finger');
    expect(fn).toHaveBeenCalledWith('finger');
    unsub();
    setInputMode('stylus');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('shouldBlockTouchDraw', () => {
  it('stylus + freedraw + 1손가락 → 차단', () => {
    expect(shouldBlockTouchDraw('stylus', 'freedraw', 1)).toBe(true);
  });
  it('stylus + freedraw + 2손가락 → 허용(줌)', () => {
    expect(shouldBlockTouchDraw('stylus', 'freedraw', 2)).toBe(false);
  });
  it('stylus + selection + 1손가락 → 허용', () => {
    expect(shouldBlockTouchDraw('stylus', 'selection', 1)).toBe(false);
  });
  it('stylus + eraser + 1손가락 → 허용', () => {
    expect(shouldBlockTouchDraw('stylus', 'eraser', 1)).toBe(false);
  });
  it('finger + freedraw + 1손가락 → 허용', () => {
    expect(shouldBlockTouchDraw('finger', 'freedraw', 1)).toBe(false);
  });
  it('stylus + 도형 도구들 + 1손가락 → 차단', () => {
    for (const t of ['rectangle', 'ellipse', 'triangle', 'line']) {
      expect(shouldBlockTouchDraw('stylus', t, 1)).toBe(true);
    }
  });
});
