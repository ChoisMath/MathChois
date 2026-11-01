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
      onActiveToolChange: vi.fn(), sidebarOpen: false, onToggleSidebar: vi.fn(), ...over,
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

  it('버튼 순서: 페이지 목록 → 되돌리기 → 펜·형광펜·손가락·포인터 → 색 5칸·팔레트 → (두께) → 지우개·이미지 → 직선·텍스트·도형·선택 → 전체지움 → 설정', () => {
    render();
    const names = [...mount.querySelectorAll('[data-tb]')].map((el) => el.dataset.tb);
    expect(names).toEqual([...TOOLBAR_ORDER]);
    expect(TOOLBAR_ORDER).toEqual([
      'pages',
      'undo', 'redo',
      'freedraw', 'highlighter', 'finger', 'laser_pointer',
      'slot-0', 'slot-1', 'slot-2', 'slot-3', 'slot-4', 'palette',
      'width',
      'eraser', 'image_move', 'image_reload', 'sticky', 'image_add',
      'line', 'text', 'shapes', 'lasso',
      'clear', 'settings',
    ]);
    expect(mount.querySelector('[title^="스포이드"]')).toBeNull();      // 스포이드·화면고정은 바에서 빠짐
    expect(mount.querySelector('[title^="화면 고정"]')).toBeNull();
  });

  it('페이지 목록 버튼: 열림 상태를 aria-pressed 로 보이고 누르면 onToggleSidebar, 핸들러가 없으면 버튼도 없다', () => {
    render({ sidebarOpen: true });
    const pages = btn('pages');
    expect(pages.getAttribute('aria-pressed')).toBe('true');
    expect(pages.title).toBe('페이지 목록 숨기기');
    expect(pages.classList.contains('is-on')).toBe(true);
    click(pages);
    expect(props.onToggleSidebar).toHaveBeenCalledTimes(1);

    render({ sidebarOpen: false });
    expect(btn('pages').getAttribute('aria-pressed')).toBe('false');
    expect(btn('pages').title).toBe('페이지 목록 펼치기');

    render({ onToggleSidebar: undefined });
    expect(btn('pages')).toBeNull();
    expect([...mount.querySelectorAll('[data-tb]')].map((el) => el.dataset.tb)).toEqual(TOOLBAR_ORDER.filter((n) => n !== 'pages'));
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

describe('DrawingToolbar — 메모지', () => {
  let root, mount, api, appState, elements;

  const render = (over = {}) => {
    const props = {
      apiRef: { current: api }, pageId: 'p1', showPanel: false, onTogglePanel: vi.fn(),
      onBaseWidthChange: vi.fn(), onReloadImage: vi.fn(), onUndo: vi.fn(), onRedo: vi.fn(),
      onActiveToolChange: vi.fn(), sidebarOpen: false, onToggleSidebar: vi.fn(), ...over,
    };
    act(() => { root.render(createElement(DrawingToolbar, props)); });
  };
  const btn = (name) => mount.querySelector(`[data-tb="${name}"]`);
  const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  const openPicker = () => { click(btn('sticky')); return document.querySelector('.vw-tb-pop'); };
  const flush = () => act(() => { vi.runOnlyPendingTimers(); });
  const lastElements = () => api.updateScene.mock.calls.at(-1)[0].elements;

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(cb, 0));
    appState = { zoom: { value: 1 }, scrollX: 0, scrollY: 0, currentItemStrokeColor: '#000000', currentItemStrokeWidth: 0.2, currentItemOpacity: 100, selectedElementIds: {} };
    elements = [];
    api = {
      getAppState: () => appState,
      getSceneElements: () => elements,
      updateScene: vi.fn(({ appState: next, elements: els }) => {
        if (next) appState = { ...appState, ...next };
        if (els) elements = els;
      }),
      setActiveTool: vi.fn(),
      addFiles: vi.fn(),
      onChange: vi.fn(() => () => {}),
    };
    mount = document.createElement('div');
    document.body.appendChild(mount);
    root = createRoot(mount);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    mount.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('버튼은 image_reload 뒤·image_add 앞, 팝오버는 4줄×6칸 + 무늬 3칸, 기본 선택은 모서리 탭·동글·민무늬', () => {
    render();
    const names = [...mount.querySelectorAll('[data-tb]')].map((el) => el.dataset.tb);
    expect(names).toEqual([...TOOLBAR_ORDER]);
    const pop = openPicker();
    expect(pop).not.toBeNull();
    expect(btn('sticky').getAttribute('aria-expanded')).toBe('true');
    expect(pop.querySelectorAll('[data-sticky]')).toHaveLength(24);
    expect(pop.querySelectorAll('[data-sticky-pattern]')).toHaveLength(3);
    expect(pop.querySelector('[aria-current="true"]').dataset.sticky).toBe('tab:circle');
    expect(pop.querySelector('[data-sticky-pattern="plain"]').getAttribute('aria-pressed')).toBe('true');
    expect(pop.textContent).not.toMatch(/[A-Z]{3,}/);
  });

  it('칸을 누르면 다음 프레임에 addFiles + 잠긴 image 요소가 배경 바로 뒤에 들어가고 팝오버가 닫히며 도구는 그대로', () => {
    elements = [{ id: '__bg_image__', type: 'image' }, { id: 'fd1', type: 'freedraw' }];
    render();
    click(btn('freedraw'));
    const pop = openPicker();
    click(pop.querySelector('[data-sticky="face:star"]'));
    expect(api.addFiles).not.toHaveBeenCalled();          // 같은 틱에는 아무것도 안 함
    flush();
    expect(api.addFiles).toHaveBeenCalledWith([expect.objectContaining({ id: 'stickyf_v1_face_star_plain', mimeType: 'image/svg+xml' })]);
    const next = lastElements();
    expect(next.map((e) => e.id.replace(/^sticky_.*/, 'sticky'))).toEqual(['__bg_image__', 'sticky', 'fd1']);
    expect(next[1]).toMatchObject({ locked: true, opacity: 100, customData: { sticky: { v: 1, type: 'face', friend: 'star', pattern: 'plain' } } });
    expect(document.querySelector('.vw-tb-pop')).toBeNull();
    expect(btn('freedraw').classList.contains('is-on')).toBe(true);   // 도구는 그대로 펜
    expect(api.setActiveTool).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem('mc_sticky_last'))).toEqual({ type: 'face', friend: 'star', pattern: 'plain' });
  });

  it('배경이 없으면 맨 앞에 들어가고, 종이 너비의 36% (없으면 260) 로 놓인다', () => {
    elements = [{ id: 'fd1', type: 'freedraw' }];
    render({ bgPositionRef: { current: { x: 0, y: 0, width: 1000, height: 1400 } } });
    click(openPicker().querySelector('[data-sticky="tab:circle"]'));
    flush();
    let next = lastElements();
    expect(next[0].id.startsWith('sticky_')).toBe(true);
    expect(next[0].width).toBeCloseTo(360);
    render({ bgPositionRef: { current: null } });
    click(openPicker().querySelector('[data-sticky="tab:circle"]'));
    flush();
    next = lastElements();
    expect(next[0].width).toBe(260);
  });

  it('같은 자리에 연달아 붙이면 24 씩 비켜 놓는다', () => {
    render();
    click(openPicker().querySelector('[data-sticky="tab:circle"]')); flush();
    const a = lastElements()[0];                       // 배경이 없으면 맨 앞에 들어간다
    click(openPicker().querySelector('[data-sticky="tab:circle"]')); flush();
    const b = lastElements()[0];
    expect(b.id).not.toBe(a.id);
    expect([b.x - a.x, b.y - a.y]).toEqual([24, 24]);
  });

  it('stickyOpacity=70 이면 요소 opacity 70', () => {
    render({ stickyOpacity: 70 });
    click(openPicker().querySelector('[data-sticky="mark:cloud"]')); flush();
    expect(lastElements().at(-1).opacity).toBe(70);
  });

  it('무늬 칸은 선택을 바꾸되 팝오버를 닫지 않고, 미리보기 그림이 그 무늬로 바뀐다', () => {
    render();
    const pop = openPicker();
    click(pop.querySelector('[data-sticky-pattern="grid"]'));
    expect(document.querySelector('.vw-tb-pop')).not.toBeNull();
    expect(pop.querySelector('[data-sticky-pattern="grid"]').getAttribute('aria-pressed')).toBe('true');
    expect(pop.querySelector('[data-sticky="tab:circle"] img').src).toContain(encodeURIComponent('data-pattern="grid"'));
  });

  it('길게 누르면(500ms) 팝오버 없이 마지막 메모지를 바로 붙인다; 더블탭도 같다', () => {
    localStorage.setItem('mc_sticky_last', JSON.stringify({ type: 'cut', friend: 'heart', pattern: 'ruled' }));
    render();
    act(() => { btn('sticky').dispatchEvent(new Event('pointerdown', { bubbles: true })); });
    act(() => { vi.advanceTimersByTime(500); });
    act(() => { btn('sticky').dispatchEvent(new Event('pointerup', { bubbles: true })); });
    flush();
    expect(document.querySelector('.vw-tb-pop')).toBeNull();
    expect(lastElements().at(-1).customData.sticky).toEqual({ v: 1, type: 'cut', friend: 'heart', pattern: 'ruled' });
    act(() => { btn('sticky').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
    flush();
    expect(document.querySelector('.vw-tb-pop')).toBeNull();
    expect(lastElements().filter((e) => e.id.startsWith('sticky_'))).toHaveLength(2);
  });

  it('페이지가 바뀌거나 Escape·바깥 pointerdown 이면 팝오버가 닫힌다', () => {
    render();
    openPicker();
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(document.querySelector('.vw-tb-pop')).toBeNull();
    openPicker();
    render({ pageId: 'p2' });
    expect(document.querySelector('.vw-tb-pop')).toBeNull();
    openPicker();
    act(() => { document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })); });
    expect(document.querySelector('.vw-tb-pop')).toBeNull();
  });

  it('api 가 없으면 버튼이 비활성', () => {
    render({ apiRef: { current: null } });
    expect(btn('sticky').disabled).toBe(true);
  });

  it('전체 지우기는 메모지도 지운다 (배경만 남김)', () => {
    elements = [{ id: '__bg_image__', type: 'image' }, { id: 'sticky_a', type: 'image', customData: { sticky: {} } }, { id: 'fd1' }];
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render();
    click(btn('clear'));
    expect(lastElements().map((e) => e.id)).toEqual(['__bg_image__']);
  });
});
