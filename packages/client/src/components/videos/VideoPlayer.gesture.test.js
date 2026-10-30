// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import VideoPlayer from './VideoPlayer';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/* 드래그 제스처가 길게 누름 없이 바로 시작되는지 — 라이브러리 URL 이 아니라 자막 조회(네트워크)는 없다. */
const SRC = 'https://example.test/sample.mp4';
const RECT = { left: 0, top: 0, width: 400, height: 200, right: 400, bottom: 200, x: 0, y: 0, toJSON() {} };

function mount() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => { root.render(createElement(VideoPlayer, { src: SRC, hotkeys: false })); });
  const video = host.querySelector('video');
  Object.defineProperty(video, 'duration', { configurable: true, value: 100 });
  video.getBoundingClientRect = () => RECT;
  video.setPointerCapture = vi.fn();
  video.releasePointerCapture = vi.fn();
  return { host, video, unmount: () => { act(() => { root.unmount(); }); host.remove(); } };
}

const pointer = (el, type, { x, y, id = 1, pointerType = 'touch' }) => act(() => {
  el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType, clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true }));
});

let play; let pause;
beforeEach(() => {
  vi.useFakeTimers();
  play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
  pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  localStorage.clear();
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('VideoPlayer drag gestures (no long press)', () => {
  it('a sideways touch drag scrubs immediately', () => {
    const m = mount();
    m.video.currentTime = 50;
    pointer(m.video, 'pointerdown', { x: 100, y: 100 });
    pointer(m.video, 'pointermove', { x: 140, y: 102 }); // 40px 오른쪽, 길게 누르지 않음
    expect(m.host.textContent).toContain('좌우로 드래그하여 이동');
    expect(m.video.currentTime).toBeGreaterThan(50);
    expect(pause).toHaveBeenCalled(); // 스크럽 중 일시정지
    pointer(m.video, 'pointerup', { x: 140, y: 102 });
    expect(m.host.textContent).not.toContain('좌우로 드래그하여 이동');
    act(() => { vi.advanceTimersByTime(500); });
    expect(play).not.toHaveBeenCalled(); // 드래그는 탭이 아니다 (원래 정지 상태였으므로 복귀 재생도 없음)
    m.unmount();
  });

  it('a vertical touch drag on the right half changes volume immediately', () => {
    const m = mount();
    pointer(m.video, 'pointerdown', { x: 300, y: 100 });
    pointer(m.video, 'pointermove', { x: 302, y: 150 }); // 아래로 50px = 높이의 1/4 → 볼륨 1 → 0.75
    expect(m.host.textContent).toContain('볼륨');
    expect(m.video.volume).toBeCloseTo(0.75, 2);
    pointer(m.video, 'pointerup', { x: 302, y: 150 });
    expect(m.video.volume).toBeCloseTo(0.75, 2);
    m.unmount();
  });

  it('a vertical touch drag on the left half changes brightness immediately', () => {
    const m = mount();
    pointer(m.video, 'pointerdown', { x: 100, y: 100 });
    pointer(m.video, 'pointermove', { x: 100, y: 140 });
    expect(m.host.textContent).toContain('밝기');
    expect(m.video.style.filter).toMatch(/brightness\(0\.\d+\)/);
    pointer(m.video, 'pointerup', { x: 100, y: 140 });
    m.unmount();
  });

  it('a touch without movement is still a tap that toggles playback', () => {
    const m = mount();
    pointer(m.video, 'pointerdown', { x: 100, y: 100 });
    pointer(m.video, 'pointermove', { x: 103, y: 102 }); // 손떨림 수준
    pointer(m.video, 'pointerup', { x: 103, y: 102 });
    expect(m.host.textContent).not.toContain('좌우로 드래그하여 이동');
    act(() => { vi.advanceTimersByTime(400); }); // 더블탭 대기 뒤 단일 탭 확정
    expect(play).toHaveBeenCalledTimes(1);
    m.unmount();
  });

  it('a mouse drag does not scrub', () => {
    const m = mount();
    pointer(m.video, 'pointerdown', { x: 100, y: 100, pointerType: 'mouse' });
    pointer(m.video, 'pointermove', { x: 160, y: 100, pointerType: 'mouse' });
    expect(m.host.textContent).not.toContain('좌우로 드래그하여 이동');
    m.unmount();
  });

  it('the video never lets the browser pan (touch-action none)', () => {
    const m = mount();
    expect(m.video.style.touchAction).toBe('none');
    m.unmount();
  });
});
