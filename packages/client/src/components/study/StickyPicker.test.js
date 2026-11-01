// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import StickyPicker from './StickyPicker';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('StickyPicker', () => {
  let root, mount, onPick, onPatternChange, onClose;
  const current = { type: 'tab', friend: 'circle', pattern: 'plain' };
  const pop = () => document.querySelector('.vw-tb-pop');

  beforeEach(() => {
    onPick = vi.fn(); onPatternChange = vi.fn(); onClose = vi.fn();
    mount = document.createElement('div');
    document.body.appendChild(mount);
    root = createRoot(mount);
    act(() => {
      root.render(createElement(StickyPicker, { current, anchorRect: { bottom: 100 }, anchorEl: mount, onPick, onPatternChange, onClose }));
    });
  });
  afterEach(() => { act(() => { root.unmount(); }); mount.remove(); });

  it('도구바 아래 6px 에 붙고, 유형 네 줄 머리글과 칸마다 이름표가 있다', () => {
    expect(pop().style.top).toBe('106px');
    expect([...pop().querySelectorAll('.vw-tb-pop-head')].map((h) => h.textContent)).toEqual(['모서리 탭', '얼굴 메모지', '워터마크', '다이컷']);
    for (const cell of pop().querySelectorAll('[data-sticky]')) expect(cell.getAttribute('aria-label')).toMatch(/\S · \S/);
    expect(pop().getAttribute('role')).toBe('dialog');
  });

  it('칸을 누르면 현재 무늬와 함께 onPick, 무늬 칸은 onPatternChange', () => {
    act(() => { pop().querySelector('[data-sticky="cut:heart"]').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onPick).toHaveBeenCalledWith({ type: 'cut', friend: 'heart', pattern: 'plain' });
    act(() => { pop().querySelector('[data-sticky-pattern="ruled"]').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onPatternChange).toHaveBeenCalledWith('ruled');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('바깥을 누르면 닫히고 그 pointerdown 은 캔버스까지 가지 않는다 (점이 찍히지 않게); 안쪽 누름은 통과한다', () => {
    const outside = vi.fn();
    document.body.addEventListener('pointerdown', outside);
    act(() => { document.body.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true })); });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(outside).not.toHaveBeenCalled();
    document.body.removeEventListener('pointerdown', outside);
    const inside = vi.fn();
    pop().addEventListener('pointerdown', inside);
    act(() => { pop().querySelector('[data-sticky="tab:circle"]').dispatchEvent(new Event('pointerdown', { bubbles: true })); });
    expect(inside).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
