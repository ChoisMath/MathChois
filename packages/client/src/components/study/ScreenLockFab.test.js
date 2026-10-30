// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import ScreenLockFab from './ScreenLockFab';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('ScreenLockFab', () => {
  it('잠김 상태에 따라 라벨이 바뀌고 클릭하면 onToggle', () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const root = createRoot(mount);
    const onToggle = vi.fn();
    act(() => { root.render(createElement(ScreenLockFab, { locked: false, onToggle })); });
    const b = mount.querySelector('button');
    expect(b.getAttribute('aria-label')).toMatch(/^화면 고정/);
    expect(b.getAttribute('aria-pressed')).toBe('false');
    act(() => { b.click(); });
    expect(onToggle).toHaveBeenCalledTimes(1);
    act(() => { root.render(createElement(ScreenLockFab, { locked: true, onToggle })); });
    expect(mount.querySelector('button').getAttribute('aria-label')).toBe('화면 고정 해제');
    expect(mount.querySelector('button').getAttribute('aria-pressed')).toBe('true');
    act(() => { root.unmount(); }); mount.remove();
  });
});
