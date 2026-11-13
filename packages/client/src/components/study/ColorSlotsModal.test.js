// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import ColorSlotsModal from './ColorSlotsModal';
import { DEFAULT_COLOR_SLOTS, PRESET_COLORS } from '../../lib/toolPrefs';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('ColorSlotsModal', () => {
  let root, mount, props;
  const render = (over = {}) => {
    props = { slots: ['#111111', '#222222', '#333333', '#444444', '#555555'], currentColor: '#333333',
      onApply: vi.fn(), onSlotsChange: vi.fn(), onClose: vi.fn(), ...over };
    act(() => { root.render(createElement(ColorSlotsModal, { key: props.currentColor + (window.EyeDropper ? 'e' : ''), ...props })); });
  };
  const q = (sel) => document.querySelector(sel);
  const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  const typeHex = (v) => act(() => {
    const el = q('[data-testid="color-slots-hex"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });

  beforeEach(() => { mount = document.createElement('div'); document.body.appendChild(mount); root = createRoot(mount); });
  afterEach(() => { act(() => { root.unmount(); }); mount.remove(); });

  it('처음 선택 칸은 현재 색과 같은 칸, 없으면 1번', () => {
    render();
    expect(q('[data-slot="2"]').getAttribute('aria-pressed')).toBe('true');
    render({ currentColor: '#abcdef' });
    expect(q('[data-slot="0"]').getAttribute('aria-pressed')).toBe('true');
  });

  it('칸을 누르면 그 색을 적용하고, 격자 색을 누르면 선택 칸을 바꾸고 적용한다', () => {
    render();
    click(q('[data-slot="4"]'));
    expect(props.onApply).toHaveBeenLastCalledWith('#555555');
    expect(PRESET_COLORS.length).toBeGreaterThanOrEqual(16);
    click(q(`[data-preset="${PRESET_COLORS[3]}"]`));
    expect(props.onSlotsChange).toHaveBeenLastCalledWith(['#111111', '#222222', '#333333', '#444444', PRESET_COLORS[3]]);
    expect(props.onApply).toHaveBeenLastCalledWith(PRESET_COLORS[3]);
  });

  it('HEX 입력은 #rrggbb 가 완성될 때만 적용한다', () => {
    render();
    typeHex('#12');
    expect(props.onSlotsChange).not.toHaveBeenCalled();
    typeHex('#12AB34');
    expect(props.onSlotsChange).toHaveBeenLastCalledWith(['#111111', '#222222', '#12ab34', '#444444', '#555555']);
    expect(props.onApply).toHaveBeenLastCalledWith('#12ab34');
  });

  it('기본값으로: 5칸을 기본값으로 되돌리고 선택 칸의 기본색을 적용한다', () => {
    render();
    click(q('[data-testid="color-slots-reset"]'));
    expect(props.onSlotsChange).toHaveBeenLastCalledWith([...DEFAULT_COLOR_SLOTS]);
    expect(props.onApply).toHaveBeenLastCalledWith(DEFAULT_COLOR_SLOTS[2]);
  });

  it('스포이드는 EyeDropper 가 없으면 비활성, 있으면 결과를 선택 칸에 넣는다', async () => {
    render();
    expect(q('[data-testid="color-slots-eyedropper"]').disabled).toBe(true);
    window.EyeDropper = class { open() { return Promise.resolve({ sRGBHex: '#A1B2C3' }); } };
    render();
    expect(q('[data-testid="color-slots-eyedropper"]').disabled).toBe(false);
    await act(async () => { q('[data-testid="color-slots-eyedropper"]').click(); await Promise.resolve(); });
    expect(props.onSlotsChange).toHaveBeenLastCalledWith(['#111111', '#222222', '#a1b2c3', '#444444', '#555555']);
    delete window.EyeDropper;
  });

  it('Esc · 배경 클릭 · 닫기 버튼으로 닫힌다', () => {
    render();
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(props.onClose).toHaveBeenCalledTimes(1);
    click(q('[data-testid="color-slots-backdrop"]'));
    expect(props.onClose).toHaveBeenCalledTimes(2);
    click(q('[data-testid="color-slots-close"]'));
    expect(props.onClose).toHaveBeenCalledTimes(3);
  });
});
