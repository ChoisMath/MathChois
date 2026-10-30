// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import DrawingToolbar from './DrawingToolbar';
import { HL_OPACITY, HL_COLOR_DEFAULT, HL_WIDTH_DEFAULT, DEFAULT_COLOR_SLOTS, TOOLBAR_ORDER } from '../../lib/toolPrefs';
import { PEN_WIDTH_DEFAULT } from '../../lib/penWidth';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('DrawingToolbar — 순서 · 형광펜 · 색상 슬롯 · 두께', () => {
  let root, mount, api, appState, props;

  const render = (over = {}) => {
    props = {
      apiRef: { current: api }, pageId: 'p1', showPanel: false, onTogglePanel: vi.fn(),
      onBaseWidthChange: vi.fn(), onReloadImage: vi.fn(), onUndo: vi.fn(), onRedo: vi.fn(),
      onActiveToolChange: vi.fn(), ...over,
    };
    act(() => { root.render(createElement(DrawingToolbar, props)); });
  };
  const btn = (name) => mount.querySelector(`[data-tb="${name}"]`);
  const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  const lastAppState = () => appState; // updateScene 모의가 appState 를 누적 병합한 결과
  const slider = () => mount.querySelector('input[type="range"]');

  beforeEach(() => {
    localStorage.clear();
    appState = { zoom: { value: 1 }, currentItemStrokeColor: '#000000', currentItemStrokeWidth: 0.2, currentItemOpacity: 100 };
    api = {
      getAppState: () => appState,
      getSceneElements: () => [],
      updateScene: vi.fn(({ appState: next }) => { if (next) appState = { ...appState, ...next }; }),
      setActiveTool: vi.fn(),
      addFiles: vi.fn(),
    };
    mount = document.createElement('div');
    document.body.appendChild(mount);
    root = createRoot(mount);
  });
  afterEach(() => { act(() => { root.unmount(); }); mount.remove(); });

  it('버튼 순서: 되돌리기 → 펜·형광펜·손가락·포인터 → 색 5칸·팔레트 → (두께) → 지우개·이미지 → 직선·텍스트·도형·선택 → 전체지움 → 설정', () => {
    render();
    const names = [...mount.querySelectorAll('[data-tb]')].map((el) => el.dataset.tb);
    expect(names).toEqual([...TOOLBAR_ORDER]);
    expect(TOOLBAR_ORDER).toEqual([
      'undo', 'redo',
      'freedraw', 'highlighter', 'finger', 'laser_pointer',
      'slot-0', 'slot-1', 'slot-2', 'slot-3', 'slot-4', 'palette',
      'width',
      'eraser', 'image_move', 'image_reload', 'image_add',
      'line', 'text', 'shapes', 'lasso',
      'clear', 'settings',
    ]);
    expect(mount.querySelector('[title^="스포이드"]')).toBeNull();      // 스포이드·화면고정은 바에서 빠짐
    expect(mount.querySelector('[title^="화면 고정"]')).toBeNull();
  });

  it('HTML 모드에서는 이미지이동·이미지새로고침이 숨겨진다', () => {
    render({ htmlMode: true, onReloadImage: undefined });
    expect(btn('image_move')).toBeNull();
    expect(btn('image_reload')).toBeNull();
    expect(btn('image_add')).not.toBeNull();
  });

  it('페이지 진입 시 펜+검정, 색 5칸은 기본값', () => {
    render();
    expect(lastAppState().currentItemStrokeColor).toBe('#000000');
    expect(lastAppState().currentItemOpacity).toBe(100);
    expect(props.onActiveToolChange).toHaveBeenLastCalledWith('freedraw');
    const slots = [0, 1, 2, 3, 4].map((i) => btn(`slot-${i}`).title);
    expect(slots).toEqual([...DEFAULT_COLOR_SLOTS]);
  });

  it('형광펜: Excalidraw 는 freedraw + 투명도 40 + 노랑 + 형광펜 두께, 펜으로 돌아가면 100 + 검정 + 펜 두께', () => {
    render();
    click(btn('highlighter'));
    const hl = lastAppState();
    expect(hl.activeTool).toEqual({ type: 'freedraw', locked: false });
    expect(hl.currentItemOpacity).toBe(HL_OPACITY);
    expect(hl.currentItemStrokeColor).toBe(HL_COLOR_DEFAULT);
    expect(hl.currentItemStrokeWidth).toBeCloseTo(HL_WIDTH_DEFAULT, 5);
    expect(props.onBaseWidthChange).toHaveBeenLastCalledWith(HL_WIDTH_DEFAULT);
    expect(props.onActiveToolChange).toHaveBeenLastCalledWith('highlighter');
    expect(parseFloat(slider().value)).toBe(HL_WIDTH_DEFAULT);

    click(btn('freedraw'));
    const pen = lastAppState();
    expect(pen.currentItemOpacity).toBe(100);
    expect(pen.currentItemStrokeColor).toBe('#000000');
    expect(pen.currentItemStrokeWidth).toBeCloseTo(PEN_WIDTH_DEFAULT, 5);
    expect(props.onBaseWidthChange).toHaveBeenLastCalledWith(PEN_WIDTH_DEFAULT);
    expect(parseFloat(slider().value)).toBe(PEN_WIDTH_DEFAULT);
  });

  it('형광펜 뒤 직선 도구로 가면 투명도 100 과 펜 색으로 돌아간다', () => {
    render();
    click(btn('highlighter'));
    click(btn('line'));
    expect(lastAppState().currentItemOpacity).toBe(100);
    expect(lastAppState().currentItemStrokeColor).toBe('#000000');
    expect(lastAppState().activeTool).toEqual({ type: 'line', locked: true }); // 직선은 도형 도구처럼 잠금 유지
  });

  it('색 칸은 켜진 도구의 색만 바꾸고 각각 따로 기억한다', () => {
    render();
    click(btn('slot-1'));                                   // 펜 → 빨강
    expect(lastAppState().currentItemStrokeColor).toBe(DEFAULT_COLOR_SLOTS[1]);
    expect(localStorage.getItem('mc_tool_color')).toBe(DEFAULT_COLOR_SLOTS[1]);
    click(btn('highlighter'));
    expect(lastAppState().currentItemStrokeColor).toBe(HL_COLOR_DEFAULT);
    click(btn('slot-2'));                                   // 형광펜 → 파랑
    expect(lastAppState().currentItemStrokeColor).toBe(DEFAULT_COLOR_SLOTS[2]);
    expect(localStorage.getItem('mc_hl_color')).toBe(DEFAULT_COLOR_SLOTS[2]);
    expect(props.onActiveToolChange).toHaveBeenLastCalledWith('highlighter'); // 형광펜 유지
    click(btn('freedraw'));
    expect(lastAppState().currentItemStrokeColor).toBe(DEFAULT_COLOR_SLOTS[1]); // 펜 색 복구
  });

  it('올가미: Excalidraw 는 selection 도구, 논리 도구는 lasso', () => {
    render();
    click(btn('lasso'));
    expect(api.setActiveTool).toHaveBeenLastCalledWith({ type: 'selection' });
    expect(props.onActiveToolChange).toHaveBeenLastCalledWith('lasso');
  });

  it('지우개 중 색 칸을 누르면 펜으로 돌아간다 (기존 동작)', () => {
    render();
    click(btn('eraser'));
    expect(props.onActiveToolChange).toHaveBeenLastCalledWith('eraser');
    click(btn('slot-3'));
    expect(props.onActiveToolChange).toHaveBeenLastCalledWith('freedraw');
    expect(lastAppState().activeTool).toEqual({ type: 'freedraw', locked: false });
    expect(lastAppState().currentItemStrokeColor).toBe(DEFAULT_COLOR_SLOTS[3]);
  });

  it('두께 슬라이더는 켜진 도구의 두께를 저장한다', () => {
    render();
    const set = (v) => act(() => {
      const el = slider();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(el, String(v));
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    set(0.5);
    expect(localStorage.getItem('mc_stroke_width')).toBe('0.5');
    expect(props.onBaseWidthChange).toHaveBeenLastCalledWith(0.5);
    click(btn('highlighter'));
    expect(slider().min).toBe('0.4');
    set(2);
    expect(localStorage.getItem('mc_hl_width')).toBe('2');
    expect(localStorage.getItem('mc_stroke_width')).toBe('0.5');
    expect(props.onBaseWidthChange).toHaveBeenLastCalledWith(2);
    click(btn('freedraw'));
    expect(parseFloat(slider().value)).toBe(0.5);
  });

  it('팔레트 버튼은 색상 모달을 열고, 모달에서 바꾼 칸이 바로 반영된다', () => {
    render();
    expect(document.querySelector('[data-testid="color-slots-modal"]')).toBeNull();
    click(btn('palette'));
    const modal = document.querySelector('[data-testid="color-slots-modal"]');
    expect(modal).not.toBeNull();
    click(modal.querySelector('[data-slot="4"]'));                // 5번 칸 선택 → 주황 적용
    expect(lastAppState().currentItemStrokeColor).toBe(DEFAULT_COLOR_SLOTS[4]);
    click(modal.querySelector('[data-preset="#9c36b5"]'));        // 격자에서 보라 → 5번 칸이 보라
    expect(btn('slot-4').title).toBe('#9c36b5');
    expect(lastAppState().currentItemStrokeColor).toBe('#9c36b5');
    expect(JSON.parse(localStorage.getItem('mc_color_slots'))[4]).toBe('#9c36b5');
    click(modal.querySelector('[data-testid="color-slots-close"]'));
    expect(document.querySelector('[data-testid="color-slots-modal"]')).toBeNull();
  });
});
