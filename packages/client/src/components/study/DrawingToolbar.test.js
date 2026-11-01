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
      'freedraw', 'highlighter', 'finger', 'laser_pointer', 'sticky', 'image_move',
      'slot-0', 'slot-1', 'slot-2', 'slot-3', 'slot-4', 'palette',
      'width',
      'eraser', 'image_reload', 'image_add',
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
  const placer = () => document.querySelector('[data-sticky-placer]');
  const pick = (sel) => { click(openPicker().querySelector(sel)); return placer(); };
  const ptr = (type, x, y, extra = {}) => {
    const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, ...extra });
    Object.defineProperty(e, 'pointerType', { value: extra.pointerType ?? 'mouse' });
    return e;
  };
  const flush = () => act(() => { vi.runOnlyPendingTimers(); });
  /** 마우스·손가락: 누르는 자리에 확정 */
  const place = (x, y, pointerType = 'mouse') => { act(() => { placer().dispatchEvent(ptr('pointerdown', x, y, { pointerType })); }); flush(); };
  const lastElements = () => api.updateScene.mock.calls.at(-1)[0].elements;

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(cb, 0));
    appState = { zoom: { value: 1 }, scrollX: 0, scrollY: 0, offsetLeft: 0, offsetTop: 0, currentItemStrokeColor: '#000000', currentItemStrokeWidth: 0.2, currentItemOpacity: 100, selectedElementIds: {} };
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

  it('버튼은 레이저 포인터 뒤·이미지 이동 앞, 팝오버는 4줄×6칸 + 무늬 3칸, 기본 선택은 모서리 탭·동글·민무늬', () => {
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

  it('칸을 누르면 팝오버가 닫히고 반투명 그림자가 포인터를 따라다니며, 누르는 자리에 확정되면 배경 바로 뒤에 잠긴 요소가 들어가고 도구는 그대로', () => {
    elements = [{ id: '__bg_image__', type: 'image' }, { id: 'fd1', type: 'freedraw' }];
    render();
    click(btn('freedraw'));
    const ov = pick('[data-sticky="face:star"]');
    expect(document.querySelector('.vw-tb-pop')).toBeNull();
    expect(ov).not.toBeNull();
    expect(ov.querySelector('img').src).toContain('data:image/svg+xml');
    expect(api.addFiles).not.toHaveBeenCalled();
    expect(api.updateScene.mock.calls.some((c) => c[0].elements)).toBe(false);
    act(() => { ov.dispatchEvent(ptr('pointermove', 300, 200)); });
    const img = ov.querySelector('img');
    expect(parseFloat(img.style.left) + parseFloat(img.style.width) / 2).toBeCloseTo(300);
    expect(parseFloat(img.style.top) + parseFloat(img.style.height) / 2).toBeCloseTo(200);
    const callsBefore = api.updateScene.mock.calls.length;
    act(() => { ov.dispatchEvent(ptr('pointerdown', 300, 200)); });
    expect(api.addFiles).toHaveBeenCalledWith([expect.objectContaining({ id: 'stickyf_v1_face_star_plain', mimeType: 'image/svg+xml' })]);
    expect(api.updateScene.mock.calls.length).toBe(callsBefore);   // 요소는 다음 프레임에
    flush();
    const next = lastElements();
    expect(next.map((e) => e.id.replace(/^sticky_.*/, 'sticky'))).toEqual(['__bg_image__', 'sticky', 'fd1']);
    expect(next[1]).toMatchObject({ locked: true, opacity: 100, customData: { sticky: { v: 1, type: 'face', friend: 'star', pattern: 'plain' } } });
    expect(next[1].x + next[1].width / 2).toBeCloseTo(300);      // 확정 지점 = 그림자 중심 = 포인터
    expect(next[1].y + next[1].height / 2).toBeCloseTo(200);
    expect(placer()).toBeNull();
    expect(btn('freedraw').classList.contains('is-on')).toBe(true);
    expect(api.setActiveTool).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem('mc_sticky_last'))).toEqual({ type: 'face', friend: 'star', pattern: 'plain' });
  });

  it('확정 좌표는 줌·스크롤·캔버스 오프셋을 반영한다 (scene = (client − offset) / zoom − scroll)', () => {
    appState = { ...appState, zoom: { value: 2 }, scrollX: 50, scrollY: -20, offsetLeft: 10, offsetTop: 100 };
    render({ bgPositionRef: { current: { x: 0, y: 0, width: 1000, height: 1400 } } });
    const ov = pick('[data-sticky="tab:circle"]');
    const img = ov.querySelector('img');
    expect(parseFloat(img.style.width)).toBeCloseTo(360 * 2);     // 종이 36% × 줌
    place(410, 300);
    const el = lastElements()[0];
    expect(el.width).toBeCloseTo(360);
    expect(el.x + el.width / 2).toBeCloseTo((410 - 10) / 2 - 50);
    expect(el.y + el.height / 2).toBeCloseTo((300 - 100) / 2 + 20);
  });

  it('배경이 없으면 맨 앞에 들어가고, 종이가 없으면 너비 260', () => {
    elements = [{ id: 'fd1', type: 'freedraw' }];
    render({ bgPositionRef: { current: null } });
    pick('[data-sticky="tab:circle"]');
    place(100, 100);
    const next = lastElements();
    expect(next[0].id.startsWith('sticky_')).toBe(true);
    expect(next[0].width).toBe(260);
  });

  it('stickyOpacity=70 이면 요소 opacity 70', () => {
    render({ stickyOpacity: 70 });
    pick('[data-sticky="mark:cloud"]');
    place(120, 120);
    expect(lastElements().at(-1).opacity).toBe(70);
  });

  it('스타일러스는 한 자리에서 400ms 꾹 눌러야 확정 — 짧은 탭과 8px 넘는 움직임은 무시하고 계속 따라다닌다', () => {
    render();
    const ov = pick('[data-sticky="tab:circle"]');
    act(() => { ov.dispatchEvent(ptr('pointerdown', 200, 200, { pointerType: 'pen' })); });
    act(() => { vi.advanceTimersByTime(200); });
    act(() => { ov.dispatchEvent(ptr('pointerup', 200, 200, { pointerType: 'pen' })); });
    act(() => { vi.advanceTimersByTime(500); });
    expect(api.addFiles).not.toHaveBeenCalled();
    expect(placer()).not.toBeNull();
    act(() => { ov.dispatchEvent(ptr('pointerdown', 200, 200, { pointerType: 'pen' })); });
    act(() => { ov.dispatchEvent(ptr('pointermove', 220, 200, { pointerType: 'pen' })); });
    act(() => { vi.advanceTimersByTime(500); });
    expect(api.addFiles).not.toHaveBeenCalled();
    act(() => { ov.dispatchEvent(ptr('pointerup', 220, 200, { pointerType: 'pen' })); });
    act(() => { ov.dispatchEvent(ptr('pointerdown', 240, 260, { pointerType: 'pen' })); });
    act(() => { vi.advanceTimersByTime(400); });
    expect(api.addFiles).toHaveBeenCalledTimes(1);
    flush();
    const el = lastElements().at(-1);
    expect(el.x + el.width / 2).toBeCloseTo(240);
    expect(el.y + el.height / 2).toBeCloseTo(260);
    expect(placer()).toBeNull();
  });

  it('Escape · 다른 도구 · 메모지 단추 다시 누름은 따라다니기를 취소하고 아무것도 붙이지 않는다', () => {
    render();
    pick('[data-sticky="tab:circle"]');
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(placer()).toBeNull();
    pick('[data-sticky="tab:circle"]');
    click(btn('eraser'));
    expect(placer()).toBeNull();
    pick('[data-sticky="tab:circle"]');
    click(btn('sticky'));
    expect(placer()).toBeNull();
    expect(document.querySelector('.vw-tb-pop')).toBeNull();
    flush();
    expect(api.addFiles).not.toHaveBeenCalled();
  });

  it('무늬 칸은 선택을 바꾸되 팝오버를 닫지 않고, 미리보기 그림이 그 무늬로 바뀐다', () => {
    render();
    const pop = openPicker();
    click(pop.querySelector('[data-sticky-pattern="grid"]'));
    expect(document.querySelector('.vw-tb-pop')).not.toBeNull();
    expect(pop.querySelector('[data-sticky-pattern="grid"]').getAttribute('aria-pressed')).toBe('true');
    expect(pop.querySelector('[data-sticky="tab:circle"] img').src).toContain(encodeURIComponent('data-pattern="grid"'));
  });

  it('길게 누르면(500ms) 팝오버 없이 마지막 메모지의 그림자가 바로 따라다닌다; 더블탭도 같다', () => {
    localStorage.setItem('mc_sticky_last', JSON.stringify({ type: 'cut', friend: 'heart', pattern: 'ruled' }));
    render();
    act(() => { btn('sticky').dispatchEvent(new Event('pointerdown', { bubbles: true })); });
    act(() => { vi.advanceTimersByTime(500); });
    act(() => { btn('sticky').dispatchEvent(new Event('pointerup', { bubbles: true })); });
    expect(document.querySelector('.vw-tb-pop')).toBeNull();
    expect(placer()).not.toBeNull();
    place(150, 150);
    expect(lastElements().at(-1).customData.sticky).toEqual({ v: 1, type: 'cut', friend: 'heart', pattern: 'ruled' });
    act(() => { btn('sticky').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
    expect(placer()).not.toBeNull();
    place(200, 200);
    expect(lastElements().filter((e) => e.id.startsWith('sticky_'))).toHaveLength(2);
  });

  it('페이지가 바뀌거나 Escape·바깥 pointerdown 이면 팝오버가 닫힌다; 페이지가 바뀌면 따라다니기도 끝난다', () => {
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
    pick('[data-sticky="tab:circle"]');
    render({ pageId: 'p3' });
    expect(placer()).toBeNull();
  });

  it('api 가 아직 없으면 눌러도 팝오버가 열리지 않고 아무 일도 없다 (렌더 중 ref 를 읽어 disabled 를 정하지 않는다)', () => {
    render({ apiRef: { current: null } });
    expect(btn('sticky').disabled).toBe(false);
    click(btn('sticky'));
    expect(document.querySelector('.vw-tb-pop')).toBeNull();
    act(() => { btn('sticky').dispatchEvent(new Event('pointerdown', { bubbles: true })); });
    act(() => { vi.advanceTimersByTime(600); });
    flush();
    expect(placer()).toBeNull();
    expect(api.addFiles).not.toHaveBeenCalled();
  });

  it('길게 누르기는 첫째 버튼(펜·손가락·왼쪽 클릭)만 — 오른쪽 버튼은 무시하고, pointercancel 이면 타이머를 끈다', () => {
    render();
    act(() => { btn('sticky').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 2 })); });
    act(() => { vi.advanceTimersByTime(600); });
    expect(placer()).toBeNull();
    act(() => { btn('sticky').dispatchEvent(new Event('pointerdown', { bubbles: true })); });
    act(() => { vi.advanceTimersByTime(200); });
    act(() => { btn('sticky').dispatchEvent(new Event('pointercancel', { bubbles: true })); });
    act(() => { vi.advanceTimersByTime(600); });
    expect(placer()).toBeNull();
  });

  it('장면에 파일이 빠진 옛 메모지가 있어도 새 메모지 붙이기는 파일을 다시 넣고 정상 동작한다', () => {
    elements = [{ id: 'sticky_old', type: 'image', fileId: 'stickyf_v1_tab_circle_plain', locked: true, customData: { sticky: { v: 1, type: 'tab', friend: 'circle', pattern: 'plain' } }, x: 0, y: 0, width: 100, height: 100 }];
    api.getFiles = () => ({});
    render();
    pick('[data-sticky="tab:circle"]');
    place(80, 80);
    expect(api.addFiles).toHaveBeenCalledWith([expect.objectContaining({ id: 'stickyf_v1_tab_circle_plain' })]);
    expect(lastElements().filter((e) => e.customData?.sticky)).toHaveLength(2);
  });

  it('전체 지우기는 메모지도 지운다 (배경만 남김)', () => {
    elements = [{ id: '__bg_image__', type: 'image' }, { id: 'sticky_a', type: 'image', customData: { sticky: {} } }, { id: 'fd1' }];
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render();
    click(btn('clear'));
    expect(lastElements().map((e) => e.id)).toEqual(['__bg_image__']);
  });

  it('PDF 쪽에서도 메모지와 이미지·메모지 이동이 있고, 배경 이미지가 없으면 W/H 미니 단추는 나오지 않는다', () => {
    elements = [{ id: 'fd1', type: 'freedraw' }];
    render({ pdfMode: true });
    expect(btn('sticky')).not.toBeNull();
    expect(btn('image_move')).not.toBeNull();
    click(btn('image_move'));
    expect(mount.querySelectorAll('.vw-tb-mini')).toHaveLength(0);
    click(btn('image_move'));
    elements = [{ id: '__bg_image__', type: 'image', locked: true }];
    render({ pdfMode: false });
    click(btn('image_move'));
    expect(mount.querySelectorAll('.vw-tb-mini')).toHaveLength(2);
  });

  it('HTML 도구 쪽에는 메모지 단추가 없다 (이동 도구도 없어 다룰 수 없으므로)', () => {
    render({ htmlMode: true });
    expect(btn('sticky')).toBeNull();
    expect(btn('image_move')).toBeNull();
  });
});

describe('DrawingToolbar — 이미지·메모지 이동', () => {
  let root, mount, api, appState, elements;
  const own = { id: 'sticky_1', type: 'image', locked: true, customData: { sticky: { v: 1 } } };
  const student = { id: '__sn_sticky_2', type: 'image', locked: true, customData: { sticky: { v: 1 } } };
  const bg = { id: '__bg_image__', type: 'image', locked: true };

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
  const lastElements = () => api.updateScene.mock.calls.at(-1)[0].elements;

  beforeEach(() => {
    localStorage.clear();
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
  afterEach(() => { act(() => { root.unmount(); }); mount.remove(); });

  it('이름이 이미지·메모지 이동이고, 켜면 배경과 내 메모지만 잠금이 풀리고 끄면 다시 잠긴다', () => {
    elements = [bg, own, student, { id: 'fd1', locked: false }];
    render();
    expect(btn('image_move').title).toMatch(/^이미지·메모지 이동/);
    click(btn('image_move'));
    expect(lastElements().map((e) => [e.id, e.locked])).toEqual([['__bg_image__', false], ['sticky_1', false], ['__sn_sticky_2', true], ['fd1', false]]);
    click(btn('image_move'));
    expect(lastElements().map((e) => [e.id, e.locked])).toEqual([['__bg_image__', true], ['sticky_1', true], ['__sn_sticky_2', true], ['fd1', false]]);
  });

  it('다른 도구로 나가도 메모지가 다시 잠긴다', () => {
    elements = [bg, own];
    render();
    click(btn('image_move'));
    expect(elements.find((e) => e.id === 'sticky_1').locked).toBe(false);
    click(btn('eraser'));
    expect(elements.find((e) => e.id === 'sticky_1').locked).toBe(true);   // 장면 상태(모의가 누적) 기준
  });

  it('이동 모드에서 메모지를 선택하면 [메모지 삭제] 가 나타나고 누르면 isDeleted, 선택이 없으면 사라진다', () => {
    elements = [bg, own, { id: 'img_1', type: 'image', locked: false }];
    render();
    click(btn('image_move'));
    expect(api.onChange).toHaveBeenCalledTimes(1);
    const cb = api.onChange.mock.calls[0][0];
    expect(btn('sticky_delete')).toBeNull();
    act(() => { cb(elements, { ...appState, selectedElementIds: { img_1: true } }); });
    expect(btn('sticky_delete')).toBeNull();
    act(() => { cb(elements, { ...appState, selectedElementIds: { sticky_1: true, img_1: true } }); });
    expect(btn('sticky_delete')).not.toBeNull();
    appState = { ...appState, selectedElementIds: { sticky_1: true, img_1: true } };
    click(btn('sticky_delete'));
    const next = lastElements();
    expect(next.find((e) => e.id === 'sticky_1').isDeleted).toBe(true);
    expect(next.find((e) => e.id === 'img_1').isDeleted).toBeFalsy();
    expect(btn('sticky_delete')).toBeNull();
  });

  it('메모지가 선택된 채로 이동 모드를 꺼도 내 메모지는 전부 다시 잠긴다', () => {
    elements = [bg, own, { ...own, id: 'sticky_9' }];
    render();
    click(btn('image_move'));
    const cb = api.onChange.mock.calls[0][0];
    act(() => { cb(elements, { ...appState, selectedElementIds: { sticky_1: true } }); });
    appState = { ...appState, selectedElementIds: { sticky_1: true } };
    expect(btn('sticky_delete')).not.toBeNull();
    click(btn('image_move'));
    expect(elements.filter((e) => e.customData?.sticky).map((e) => e.locked)).toEqual([true, true]);
    expect(btn('sticky_delete')).toBeNull();
  });

  it('이동 모드를 끄면 onChange 구독이 해제되고 팝오버도 닫혀 있다', () => {
    const unsub = vi.fn();
    api.onChange = vi.fn(() => unsub);
    render();
    click(btn('sticky'));                       // 팝오버 열림
    expect(document.querySelector('.vw-tb-pop')).not.toBeNull();
    click(btn('image_move'));
    expect(document.querySelector('.vw-tb-pop')).toBeNull();
    click(btn('image_move'));
    expect(unsub).toHaveBeenCalledTimes(1);
  });
});
