// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { useWetInk } from './useWetInk';
import { HOLD_MS } from '../lib/shapeRecognizer';

vi.mock('@excalidraw/excalidraw', () => ({
  viewportCoordsToSceneCoords: ({ clientX, clientY }, app) => ({
    x: clientX / app.zoom.value - app.scrollX,
    y: clientY / app.zoom.value - app.scrollY,
  }),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function Harness({ api, overlayEl }) {
  const excalidrawAPIRef = useRef(api);
  const overlayRef = useRef(overlayEl);
  const drawModeRef = useRef(true);
  const penActiveRef = useRef(true);
  useWetInk({ excalidrawAPIRef, overlayRef, drawModeRef, penActiveRef });
  return null;
}

const pen = (type, x, y) => new PointerEvent(type, {
  pointerType: 'pen', pointerId: 7, button: 0, clientX: x, clientY: y, pressure: 0.5, bubbles: true, cancelable: true,
});

/** 꼭짓점 사이를 step 간격으로 pointermove */
const moveAlong = (canvas, verts, step = 4) => {
  for (let i = 0; i < verts.length - 1; i++) {
    const [a, b] = [verts[i], verts[i + 1]];
    const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 1; k <= n; k++) canvas.dispatchEvent(pen('pointermove', a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n));
  }
};

describe('useWetInk — 펜 멈춤 도형 보정', () => {
  let container, canvas, overlay, root, mount, api, committed;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    HTMLCanvasElement.prototype.getContext = () => null; // jsdom: 렌더는 건너뛰고 commit 만 본다
    container = document.createElement('div');
    const exc = document.createElement('div');
    exc.className = 'excalidraw';
    canvas = document.createElement('canvas');
    exc.appendChild(canvas);
    overlay = document.createElement('canvas');
    container.appendChild(exc);
    container.appendChild(overlay);
    document.body.appendChild(container);
    committed = [];
    api = {
      getAppState: () => ({ zoom: { value: 1 }, scrollX: 0, scrollY: 0, currentItemStrokeWidth: 0.2, currentItemStrokeColor: '#000000' }),
      getSceneElements: () => [],
      updateScene: vi.fn(({ elements }) => { committed.push(...elements); }),
    };
    mount = document.createElement('div');
    document.body.appendChild(mount);
    root = createRoot(mount);
    act(() => { root.render(createElement(Harness, { api, overlayEl: overlay })); });
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    mount.remove(); container.remove();
    vi.useRealTimers();
  });

  const last = () => committed[committed.length - 1];
  const absPts = (el) => el.points.map(([x, y]) => [el.x + x, el.y + y]);

  it('멈춤 없이 떼면 손글씨 점 그대로 commit', () => {
    canvas.dispatchEvent(pen('pointerdown', 100, 100));
    moveAlong(canvas, [[100, 100], [300, 110]]);
    canvas.dispatchEvent(pen('pointerup', 300, 110));
    expect(last().type).toBe('freedraw');
    expect(last().points.length).toBe(51); // down 1 + move 50
    expect(absPts(last())[50]).toEqual([300, 110]);
  });

  it(`끝에서 ${HOLD_MS}ms 멈추면 선분으로 보정 (수평 스냅 포함)`, () => {
    canvas.dispatchEvent(pen('pointerdown', 100, 100));
    moveAlong(canvas, [[100, 100], [200, 103], [300, 101]]);
    vi.advanceTimersByTime(HOLD_MS + 50);
    canvas.dispatchEvent(pen('pointerup', 300, 101));
    const pts = absPts(last());
    expect(pts[0]).toEqual([100, 100]);
    expect(pts[pts.length - 1]).toEqual([300, 100]);          // 1° 이내 → 수평 스냅
    expect(pts.every((p) => p[1] === 100)).toBe(true);
    expect(pts.length).toBeGreaterThan(60);                    // 3px 간격 촘촘한 점
  });

  it('선분 보정 뒤 펜을 끌면 끝점이 따라온다', () => {
    canvas.dispatchEvent(pen('pointerdown', 100, 100));
    moveAlong(canvas, [[100, 100], [300, 100]]);
    vi.advanceTimersByTime(HOLD_MS + 50);
    moveAlong(canvas, [[300, 100], [300, 200]]);
    canvas.dispatchEvent(pen('pointerup', 300, 200));
    const pts = absPts(last());
    expect(pts[0]).toEqual([100, 100]);
    expect(pts[pts.length - 1]).toEqual([300, 200]);
    // 모든 점이 (100,100)-(300,200) 직선 위
    for (const [x, y] of pts) expect(Math.abs((y - 100) - (x - 100) * 0.5)).toBeLessThan(1e-9);
  });

  it('닫힌 도형(사각형)은 멈추면 고정되고, 20px 넘게 더 움직이면 취소되어 손글씨로 돌아간다', () => {
    const rect = [[100, 100], [300, 106], [296, 220], [100, 214], [102, 104]]; // 살짝 기운 손그림 (축 정렬 12° 이내)
    canvas.dispatchEvent(pen('pointerdown', 100, 100));
    moveAlong(canvas, rect);
    vi.advanceTimersByTime(HOLD_MS + 50);
    canvas.dispatchEvent(pen('pointerup', 102, 104));
    const snapped = absPts(last());
    expect(snapped[0]).toEqual(snapped[snapped.length - 1]);  // 폐곡선
    expect(snapped.every(([x, y]) => x === 100 || x === 300 || y === 100 || y === 220)).toBe(true);

    committed.length = 0;
    canvas.dispatchEvent(pen('pointerdown', 100, 100));
    moveAlong(canvas, rect);
    vi.advanceTimersByTime(HOLD_MS + 50);
    moveAlong(canvas, [[102, 104], [102, 140]]);              // 36px 더 이동 → 취소
    canvas.dispatchEvent(pen('pointerup', 102, 140));
    const raw = absPts(last());
    expect(raw[raw.length - 1]).toEqual([102, 140]);
    expect(raw.some(([x, y]) => !(x === 100 || x === 300 || y === 100 || y === 220))).toBe(true);
  });

  it('멈춤 반경 4px 안의 떨림은 멈춤으로 친다 / 반경 밖 이동은 타이머를 되돌린다', () => {
    canvas.dispatchEvent(pen('pointerdown', 100, 100));
    moveAlong(canvas, [[100, 100], [300, 100]]);
    vi.advanceTimersByTime(300);
    canvas.dispatchEvent(pen('pointermove', 302, 101));        // 2px 떨림
    vi.advanceTimersByTime(300);                               // 누적 600ms ≥ HOLD_MS
    canvas.dispatchEvent(pen('pointerup', 302, 101));
    expect(absPts(last()).every((p) => p[1] === 100)).toBe(true);

    committed.length = 0;
    canvas.dispatchEvent(pen('pointerdown', 100, 100));
    moveAlong(canvas, [[100, 100], [300, 100]]);
    vi.advanceTimersByTime(300);
    canvas.dispatchEvent(pen('pointermove', 320, 100));        // 20px 이동 → 재시작
    vi.advanceTimersByTime(300);
    canvas.dispatchEvent(pen('pointerup', 320, 100));
    expect(last().points.length).toBe(52);                     // 손글씨 그대로
  });

  it('짧은 획(40px 미만)은 멈춰도 그대로이고, 성공할 때까지 다음 멈춤에서 다시 시도한다', () => {
    canvas.dispatchEvent(pen('pointerdown', 100, 100));
    vi.advanceTimersByTime(HOLD_MS + 50);                      // 펜을 대고 생각만 함
    moveAlong(canvas, [[100, 100], [120, 100]]);
    vi.advanceTimersByTime(HOLD_MS + 50);                      // 20px 에서 멈춤 → null
    moveAlong(canvas, [[120, 100], [300, 100]]);
    vi.advanceTimersByTime(HOLD_MS + 50);                      // 200px 에서 멈춤 → 선분
    canvas.dispatchEvent(pen('pointerup', 300, 100));
    const pts = absPts(last());
    expect(pts[pts.length - 1]).toEqual([300, 100]);
    expect(pts.length).toBeGreaterThan(60);
  });

  it('판정된 뒤에는 같은 획에서 다시 판정하지 않는다 (선분 끌기 중 멈춰도 그대로 선분)', () => {
    canvas.dispatchEvent(pen('pointerdown', 100, 100));
    moveAlong(canvas, [[100, 100], [300, 100]]);
    vi.advanceTimersByTime(HOLD_MS + 50);
    moveAlong(canvas, [[300, 100], [300, 300], [100, 300], [100, 104]]); // 선분 끌며 사각형 경로
    vi.advanceTimersByTime(HOLD_MS + 50);
    canvas.dispatchEvent(pen('pointerup', 100, 104));
    const pts = absPts(last());
    expect(pts[0]).toEqual([100, 100]);
    expect(pts[pts.length - 1]).toEqual([100, 104]);          // 끝점 추종된 선분 (수직 스냅 → x=100)
    expect(pts.every((p) => p[0] === 100)).toBe(true);
  });

  it('?shapesnap=0 (localStorage mc_shape_snap_off) 이면 보정하지 않는다', () => {
    act(() => { root.unmount(); });
    localStorage.setItem('mc_shape_snap_off', '1');
    root = createRoot(mount);
    act(() => { root.render(createElement(Harness, { api, overlayEl: overlay })); });
    canvas.dispatchEvent(pen('pointerdown', 100, 100));
    moveAlong(canvas, [[100, 100], [300, 103]]);
    vi.advanceTimersByTime(HOLD_MS + 50);
    canvas.dispatchEvent(pen('pointerup', 300, 103));
    expect(last().points.length).toBe(51);
  });

  it('같은 pointermove 가 두 번 전달되어도(iPad) 점이 중복으로 들어가지 않는다', () => {
    const down = pen('pointerdown', 100, 100);
    Object.defineProperty(down, 'timeStamp', { value: 1000 });
    canvas.dispatchEvent(down);
    for (let x = 108; x <= 300; x += 8) {
      const e = pen('pointermove', x, 100);
      const batch = [ // 실기기처럼: 샘플마다 고유 timeStamp, 재전달 때도 같은 샘플
        new PointerEvent('pointermove', { pointerType: 'pen', pointerId: 7, clientX: x - 4, clientY: 100 }),
        new PointerEvent('pointermove', { pointerType: 'pen', pointerId: 7, clientX: x, clientY: 100 }),
      ];
      Object.defineProperty(batch[0], 'timeStamp', { value: 1000 + x - 4 });
      Object.defineProperty(batch[1], 'timeStamp', { value: 1000 + x });
      Object.defineProperty(e, 'timeStamp', { value: 1000 + x });
      e.getCoalescedEvents = () => batch;
      canvas.dispatchEvent(e);
      canvas.dispatchEvent(e); // 같은 이벤트 객체 재전달 (timeStamp·좌표 동일)
    }
    canvas.dispatchEvent(pen('pointerup', 300, 100));
    const pts = absPts(last());
    expect(pts.length).toBe(1 + 25 * 2);
    for (let i = 1; i < pts.length; i++) expect(pts[i][0]).toBeGreaterThan(pts[i - 1][0]); // 역행 없음
  });

  it('언마운트 시 멈춤 타이머가 정리되어 commit 이 일어나지 않는다', () => {
    canvas.dispatchEvent(pen('pointerdown', 100, 100));
    moveAlong(canvas, [[100, 100], [300, 100]]);
    act(() => { root.unmount(); });
    root = createRoot(mount); // afterEach 가 unmount 할 수 있게
    vi.advanceTimersByTime(HOLD_MS + 50);
    expect(api.updateScene).not.toHaveBeenCalled();
  });
});
