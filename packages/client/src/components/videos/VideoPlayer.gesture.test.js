// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import VideoPlayer from './VideoPlayer';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/* 드래그 제스처가 길게 누름 없이 바로 시작되는지 — 라이브러리 URL 이 아니라 자막 조회(네트워크)는 없다. */
const SRC = 'https://example.test/sample.mp4';
const RECT = { left: 0, top: 0, width: 400, height: 200, right: 400, bottom: 200, x: 0, y: 0, toJSON() {} };

function mount(props = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => { root.render(createElement(VideoPlayer, { src: SRC, hotkeys: false, ...props })); });
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

  it('a touch without movement is a tap: it opens the touch controls and leaves playback alone', () => {
    const m = mount();
    pointer(m.video, 'pointerdown', { x: 100, y: 100 });
    pointer(m.video, 'pointermove', { x: 103, y: 102 }); // 손떨림 수준
    pointer(m.video, 'pointerup', { x: 103, y: 102 });
    expect(m.host.textContent).not.toContain('좌우로 드래그하여 이동');
    act(() => { vi.advanceTimersByTime(400); });
    expect(play).not.toHaveBeenCalled();
    // 처음 터치(재생 바만 보이던 상태)는 닫지 않고 가운데 버튼까지 연다
    expect(m.host.querySelector('[role="group"][aria-label="재생 조작"]')).not.toBeNull();
    m.unmount();
  });

  it('a second single tap closes the touch controls, and they also close by themselves after 3s', () => {
    const m = mount();
    const group = () => m.host.querySelector('[role="group"][aria-label="재생 조작"]');
    pointer(m.video, 'pointerdown', { x: 100, y: 100 });
    pointer(m.video, 'pointerup', { x: 100, y: 100 });
    act(() => { vi.advanceTimersByTime(400); });
    expect(group()).not.toBeNull();
    pointer(m.video, 'pointerdown', { x: 100, y: 100 });
    pointer(m.video, 'pointerup', { x: 100, y: 100 });
    expect(group()).toBeNull();
    act(() => { vi.advanceTimersByTime(400); });
    pointer(m.video, 'pointerdown', { x: 100, y: 100 });
    pointer(m.video, 'pointerup', { x: 100, y: 100 });
    expect(group()).not.toBeNull();
    act(() => { vi.advanceTimersByTime(3100); }); // 정지 상태여도 3초 뒤 숨김
    expect(group()).toBeNull();
    expect(play).not.toHaveBeenCalled();
    m.unmount();
  });

  it('touching a control inside the overlay (settings) restarts the 3s hide timer', () => {
    const m = mount();
    const group = () => m.host.querySelector('[role="group"][aria-label="재생 조작"]');
    pointer(m.video, 'pointerdown', { x: 100, y: 100 });
    pointer(m.video, 'pointerup', { x: 100, y: 100 });
    expect(group()).not.toBeNull();
    act(() => { vi.advanceTimersByTime(2000); });
    const settings = m.host.querySelector('button[aria-label="설정"]');
    pointer(settings, 'pointerdown', { x: 380, y: 190 });
    act(() => { settings.click(); });
    act(() => { vi.advanceTimersByTime(2000); }); // 처음 탭에서 4초 — 설정을 누른 때부터는 2초
    expect(group()).not.toBeNull();
    m.unmount();
  });

  it('a double tap whose second tap lands on the center play button still seeks (no play toggle)', () => {
    const m = mount();
    m.video.currentTime = 50;
    pointer(m.video, 'pointerdown', { x: 300, y: 100 });
    pointer(m.video, 'pointerup', { x: 300, y: 100 });
    act(() => { vi.advanceTimersByTime(150); });
    const playBtn = m.host.querySelector('[role="group"][aria-label="재생 조작"] button[aria-label="재생"]');
    pointer(playBtn, 'pointerdown', { x: 300, y: 100 });
    act(() => { playBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 300, clientY: 100 })); });
    expect(play).not.toHaveBeenCalled();
    expect(m.video.currentTime).toBeCloseTo(60, 0); // 오른쪽 절반 → 앞으로 10초
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

/* 꾹 누르기: 움직이지 않고 500ms 누르고 있으면 오른쪽 절반은 2배속, 왼쪽 절반은 2배속 되감기. 떼면 원상 복귀. */
describe('VideoPlayer press-and-hold', () => {
  const setPaused = (video, paused) => Object.defineProperty(video, 'paused', { configurable: true, value: paused });

  it('holding the right half plays at 2x and restores the rate on release', () => {
    const m = mount();
    setPaused(m.video, false);
    pointer(m.video, 'pointerdown', { x: 300, y: 100 });
    act(() => { vi.advanceTimersByTime(499); });
    expect(m.host.textContent).not.toContain('2배속');
    act(() => { vi.advanceTimersByTime(1); });
    expect(m.host.textContent).toContain('2배속');
    expect(m.video.playbackRate).toBe(2);
    pointer(m.video, 'pointerup', { x: 300, y: 100 });
    expect(m.video.playbackRate).toBe(1);
    expect(m.host.textContent).not.toContain('2배속');
    act(() => { vi.advanceTimersByTime(400); });
    expect(play).not.toHaveBeenCalled(); // 꾹 누르기는 탭이 아니다
    expect(pause).not.toHaveBeenCalled(); // 재생 중이었으니 계속 재생
    m.unmount();
  });

  it('holding the right half while paused plays for the hold and pauses again on release', () => {
    const m = mount();
    pointer(m.video, 'pointerdown', { x: 300, y: 100 });
    act(() => { vi.advanceTimersByTime(500); });
    expect(play).toHaveBeenCalledTimes(1);
    pointer(m.video, 'pointerup', { x: 300, y: 100 });
    expect(pause).toHaveBeenCalled();
    expect(m.video.playbackRate).toBe(1);
    m.unmount();
  });

  it('holding the left half rewinds at 2x and resumes playback from there on release', () => {
    const m = mount();
    setPaused(m.video, false);
    m.video.currentTime = 50;
    pointer(m.video, 'pointerdown', { x: 100, y: 100 });
    act(() => { vi.advanceTimersByTime(500); });
    expect(m.host.textContent).toContain('되감기');
    expect(pause).toHaveBeenCalled(); // 되감는 동안 정지
    // 1초 누름 → 2초 뒤로. 탐색은 한 번에 하나만 나가므로 브라우저처럼 틱마다 seeked 를 돌려준다.
    for (let i = 0; i < 10; i++) {
      act(() => { vi.advanceTimersByTime(100); });
      act(() => { m.video.dispatchEvent(new Event('seeked')); });
    }
    expect(m.video.currentTime).toBeCloseTo(48, 0);
    pointer(m.video, 'pointerup', { x: 100, y: 100 });
    expect(m.video.currentTime).toBeCloseTo(48, 0);
    expect(play).toHaveBeenCalledTimes(1); // 재생 중이었으니 복귀
    expect(m.host.textContent).not.toContain('되감기');
    m.unmount();
  });

  it('moving before the hold starts is still a drag gesture', () => {
    const m = mount();
    m.video.currentTime = 50;
    pointer(m.video, 'pointerdown', { x: 300, y: 100 });
    act(() => { vi.advanceTimersByTime(300); });
    pointer(m.video, 'pointermove', { x: 340, y: 102 });
    act(() => { vi.advanceTimersByTime(500); });
    expect(m.host.textContent).toContain('좌우로 드래그하여 이동');
    expect(m.host.textContent).not.toContain('2배속');
    expect(m.video.playbackRate).toBe(1);
    pointer(m.video, 'pointerup', { x: 340, y: 102 });
    m.unmount();
  });

  it('releasing before the hold starts is still a tap', () => {
    const m = mount();
    pointer(m.video, 'pointerdown', { x: 300, y: 100 });
    act(() => { vi.advanceTimersByTime(300); });
    pointer(m.video, 'pointerup', { x: 300, y: 100 });
    act(() => { vi.advanceTimersByTime(600); });
    expect(m.host.textContent).not.toContain('2배속');
    expect(play).not.toHaveBeenCalled(); // 단일 탭 → 조작 창만(재생 상태는 그대로)
    expect(m.host.querySelector('[role="group"][aria-label="재생 조작"]')).not.toBeNull();
    m.unmount();
  });

  it('a cancelled pointer during a hold restores the rate immediately', () => {
    const m = mount();
    setPaused(m.video, false);
    pointer(m.video, 'pointerdown', { x: 300, y: 100 });
    act(() => { vi.advanceTimersByTime(500); });
    expect(m.video.playbackRate).toBe(2);
    pointer(m.video, 'pointercancel', { x: 300, y: 100 });
    expect(m.video.playbackRate).toBe(1);
    expect(m.host.textContent).not.toContain('2배속');
    m.unmount();
  });
});

describe('VideoPlayer touch overlay details', () => {
  const group = (m) => m.host.querySelector('[role="group"][aria-label="재생 조작"]');
  const barShown = (m) => m.host.querySelector('input[aria-label="재생 위치"]').closest('.bottom-0').className.includes('opacity-100');
  const openOverlay = (m) => {
    pointer(m.video, 'pointerdown', { x: 100, y: 100 });
    pointer(m.video, 'pointerup', { x: 100, y: 100 });
    act(() => { vi.advanceTimersByTime(400); }); // 두 번 탭 판정이 지난 뒤
  };
  const click = (el, detail) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail, clientX: 100, clientY: 100 })); });

  it('the bar stays up during a touch scrub longer than 3s', () => {
    const m = mount();
    openOverlay(m);
    pointer(m.video, 'pointerdown', { x: 100, y: 100 });
    pointer(m.video, 'pointermove', { x: 160, y: 100 });
    act(() => { vi.advanceTimersByTime(4000); });
    expect(barShown(m)).toBe(true);
    pointer(m.video, 'pointerup', { x: 160, y: 100 });
    m.unmount();
  });

  it('the title strip hides while a feedback flash shows over the touch overlay', () => {
    const m = mount({ title: '테스트 영상' });
    openOverlay(m);
    click(group(m).querySelector('button[aria-label="재생"]'), 0); // 키보드식 click(detail 0)
    act(() => { m.video.dispatchEvent(new Event('pause')); });
    expect(m.host.textContent).toContain('▶'); // 피드백 표시 중
    expect(m.host.textContent).not.toContain('테스트 영상');
    act(() => { vi.advanceTimersByTime(1000); }); // 피드백이 사라지면 제목이 돌아온다
    expect(m.host.textContent).toContain('테스트 영상');
    m.unmount();
  });

  it('does not cancel touchend (keeps focus/blur and outside-tap menus working)', () => {
    const m = mount();
    const ev = new Event('touchend', { bubbles: true, cancelable: true });
    act(() => { m.video.dispatchEvent(ev); });
    expect(ev.defaultPrevented).toBe(false);
    m.unmount();
  });

  it('ignores the ghost click a tap produces on the center button that just appeared under the finger', () => {
    const m = mount();
    m.video.currentTime = 50;
    pointer(m.video, 'pointerdown', { x: 100, y: 100 });
    pointer(m.video, 'pointerup', { x: 100, y: 100 });
    click(group(m).querySelector('button[aria-label="재생"]'), 1); // pointerdown 없이 온 click
    expect(play).not.toHaveBeenCalled();
    expect(m.video.currentTime).toBe(50);
    expect(group(m)).not.toBeNull();
    m.unmount();
  });

  it('center buttons are hidden from screen readers and the tab order (the bar has the same buttons)', () => {
    const m = mount();
    openOverlay(m);
    expect(group(m).getAttribute('aria-hidden')).toBe('true');
    group(m).querySelectorAll('button').forEach((b) => expect(b.tabIndex).toBe(-1));
    m.unmount();
  });

  it('a mouse click on a center button right after touching still presses it', () => {
    const m = mount();
    openOverlay(m);
    const btn = group(m).querySelector('button[aria-label="재생"]');
    pointer(btn, 'pointerdown', { x: 100, y: 100, pointerType: 'mouse' });
    click(btn, 1);
    expect(play).toHaveBeenCalledTimes(1);
    m.unmount();
  });

  it("in the player's own fullscreen the press-and-hold pill sits below the safe-area inset", () => {
    const m = mount();
    act(() => { m.host.querySelector('button[aria-label="전체화면"]').click(); }); // jsdom: 요소 전체화면 API 없음 → CSS 전체화면
    pointer(m.video, 'pointerdown', { x: 300, y: 100 });
    act(() => { vi.advanceTimersByTime(500); });
    const pill = [...m.host.querySelectorAll('span')].find((el) => el.textContent === '2배속');
    expect(pill.parentElement.className).toContain('safe-area-inset-top');
    pointer(m.video, 'pointerup', { x: 300, y: 100 });
    m.unmount();
  });
});
