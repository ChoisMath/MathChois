// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement, useRef } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

let pdfState = { page: null, pageSize: null, error: null, retry: vi.fn() };
vi.mock('./usePdfDocument', () => ({ usePdfPage: vi.fn(() => pdfState) }));
vi.mock('@mathchois/shared', () => ({ isPdfPage: (p) => !!p?.pdfUrl }));

const { usePdfBackground } = await import('./usePdfBackground');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(cb, 0));

const PAPER_SMALL = { x: 20, y: 20, width: 350, height: 495 }; // 휴대폰 크기 화면에서 저장된 종이
const CONTAINER = { width: 1020, height: 764 };                  // 태블릿 컨테이너
const PT = { width: 595, height: 842 };                          // A4 pt

function makeContainer() {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: CONTAINER.width });
  Object.defineProperty(el, 'clientHeight', { value: CONTAINER.height });
  document.body.appendChild(el);
  return el;
}
function makeApi() { return { addFiles: vi.fn(), updateScene: vi.fn() }; }
const viewportCalls = (api) => api.updateScene.mock.calls.map((c) => c[0]).filter((a) => a.appState?.zoom);
const flush = () => act(async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); });

function Harness({ page, containerEl, saved, onHook }) {
  const containerRef = useRef(containerEl);
  const bgPositionRef = useRef(saved);
  const hook = usePdfBackground({ page, containerRef, bgPositionRef });
  onHook(hook, bgPositionRef);
  return null;
}

/** 줌·스크롤 기대값: fitViewportToBg 와 같은 식 (여백 20, 가로 중앙) */
function expectedFit(rect) {
  const zoom = Math.min((CONTAINER.width - 40) / rect.width, (CONTAINER.height - 20) / rect.height);
  return { zoom, scrollX: (CONTAINER.width / zoom - rect.width) / 2 - rect.x, scrollY: 20 / zoom - rect.y };
}

describe('usePdfBackground — 첫 화면 맞춤 (종이가 컨테이너에 꽉 차게)', () => {
  let root, container, hook, bgRef;
  const pdf1 = { id: 'p1', pdfUrl: '/a.pdf', pdfPage: 1 };
  const pdf2 = { id: 'p2', pdfUrl: '/a.pdf', pdfPage: 2 };
  const render = (page, saved = PAPER_SMALL) => act(() => root.render(createElement(Harness, { page, containerEl: container, saved, onHook: (h, r) => { hook = h; bgRef = r; } })));

  beforeEach(() => {
    pdfState = { page: null, pageSize: null, error: null, retry: vi.fn() };
    container = makeContainer();
    root = createRoot(document.createElement('div'));
  });

  it('장면이 먼저, 종이가 나중: 종이가 정해지면 저장된(작은) 종이가 꽉 차게 한 번 맞춘다', async () => {
    await render(pdf1);
    const api = makeApi();
    await act(async () => { await hook.applyScene(api, [], [], 'p1'); });
    expect(viewportCalls(api)).toHaveLength(0); // 종이를 아직 모른다
    pdfState = { ...pdfState, page: {}, pageSize: PT };
    await render(pdf1);
    await flush();
    const vp = viewportCalls(api);
    expect(vp).toHaveLength(1);
    const want = expectedFit(PAPER_SMALL);
    expect(vp[0].appState.zoom.value).toBeCloseTo(want.zoom, 5);
    expect(vp[0].appState.scrollX).toBeCloseTo(want.scrollX, 5);
    expect(vp[0].appState.scrollY).toBeCloseTo(want.scrollY, 5);
    expect(bgRef.current).toEqual(PAPER_SMALL); // 저장값은 그대로 (필기 정렬)
  });

  it('종이가 먼저, 장면이 나중: 장면을 올린 뒤 맞춘다', async () => {
    pdfState = { ...pdfState, page: {}, pageSize: PT };
    await render(pdf1);
    await flush();
    const api = makeApi();
    await act(async () => { await hook.applyScene(api, [], [], 'p1'); });
    await flush();
    expect(viewportCalls(api)).toHaveLength(1);
    expect(viewportCalls(api)[0].appState.zoom.value).toBeCloseTo(expectedFit(PAPER_SMALL).zoom, 5);
  });

  it('종이 밖에 필기가 있으면 필기까지 보이게(contentExtent), 안에만 있으면 종이만', async () => {
    pdfState = { ...pdfState, page: {}, pageSize: PT };
    await render(pdf1);
    await flush();
    const outside = { id: 'fd', type: 'freedraw', x: 420, y: 300, width: 400, height: 60, angle: 0, isDeleted: false }; // 오른쪽으로 멀리
    const api = makeApi();
    await act(async () => { await hook.applyScene(api, [], [outside], 'p1'); });
    await flush();
    const extent = { x: 20, y: 20, width: 420 + 400 + 16 - 20, height: 495 }; // 폭 816 → 폭이 제한
    expect(viewportCalls(api)[0].appState.zoom.value).toBeCloseTo(expectedFit(extent).zoom, 5);
    expect(viewportCalls(api)[0].appState.zoom.value).toBeLessThan(expectedFit(PAPER_SMALL).zoom);
  });

  it('같은 마운트에서 장면을 다시 올려도(실시간 갱신) 다시 맞추지 않는다; 새 마운트(api)면 다시 맞춘다', async () => {
    pdfState = { ...pdfState, page: {}, pageSize: PT };
    await render(pdf1);
    await flush();
    const api = makeApi();
    await act(async () => { await hook.applyScene(api, [], [], 'p1'); });
    await flush();
    await act(async () => { await hook.applyScene(api, [], [{ id: 'x', x: 900, y: 900, width: 50, height: 50 }], 'p1'); });
    await flush();
    expect(viewportCalls(api)).toHaveLength(1);
    const api2 = makeApi();
    await act(async () => { await hook.applyScene(api2, [], [], 'p1'); });
    await flush();
    expect(viewportCalls(api2)).toHaveLength(1);
  });

  it('페이지가 바뀌어 종이가 먼저 와도 이전 페이지의 Excalidraw 는 건드리지 않고, 새 장면이 오면 맞춘다', async () => {
    pdfState = { ...pdfState, page: {}, pageSize: PT };
    await render(pdf1);
    await flush();
    const api1 = makeApi();
    await act(async () => { await hook.applyScene(api1, [], [], 'p1'); });
    await flush();
    await render(pdf2); // 같은 문서의 다음 쪽 — pageSize 는 이미 있음
    await flush();
    expect(viewportCalls(api1)).toHaveLength(1); // p2 종이로 p1 의 api 를 맞추지 않음
    const api2 = makeApi();
    await act(async () => { await hook.applyScene(api2, [], [], 'p2'); });
    await flush();
    expect(viewportCalls(api2)).toHaveLength(1);
  });

  it('rerender(이미지 위치 초기화)는 컨테이너에 다시 맞춘 종이만 기준으로 뷰포트를 다시 맞춘다', async () => {
    pdfState = { ...pdfState, page: {}, pageSize: PT };
    await render(pdf1);
    await flush();
    const api = makeApi();
    await act(async () => { await hook.applyScene(api, [], [{ id: 'fd', x: 2000, y: 0, width: 10, height: 10 }], 'p1'); });
    await flush();
    await act(async () => { await hook.rerender(); });
    await flush();
    const vp = viewportCalls(api);
    expect(vp).toHaveLength(2);
    const paper = bgRef.current; // calculateBgPosition(1020, 764, 595, 842)
    expect(paper.width).toBeCloseTo(595 * ((764 - 20) / 842), 3);
    expect(vp[1].appState.zoom.value).toBeCloseTo(expectedFit(paper).zoom, 5);
    expect(vp[1].appState.zoom.value).toBeCloseTo(1, 5);
  });
});
