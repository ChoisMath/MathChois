import { describe, it, expect, beforeEach } from 'vitest';
import {
  SEEK_STEPS, PLAYBACK_RATES, DEFAULT_SETTINGS,
  normalizeSeekStep, normalizeRate, normalizeSettings, stepRate, formatRate, formatTime,
  loadSettings, saveSettings, loadResumePosition, saveResumePosition, isTypingTarget,
  BRIGHTNESS_MIN, BRIGHTNESS_MAX, GESTURE_AXIS_THRESHOLD,
  decideGestureAxis, verticalGestureKind, dragToLevel, createScrubSeeker,
} from './videoPlayer.js';

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

describe('videoPlayer settings', () => {
  beforeEach(() => { globalThis.localStorage = fakeStorage(); });

  it('exposes the agreed seek steps and speed range', () => {
    expect(SEEK_STEPS).toEqual([10, 20, 30, 60]);
    expect(PLAYBACK_RATES[0]).toBe(0.7);
    expect(PLAYBACK_RATES[PLAYBACK_RATES.length - 1]).toBe(2.5);
    expect(PLAYBACK_RATES).toContain(1.0);
  });

  it('normalizes unknown values to nearest allowed ones', () => {
    expect(normalizeSeekStep(25)).toBe(20);
    expect(normalizeSeekStep('abc')).toBe(DEFAULT_SETTINGS.seekStep);
    expect(normalizeRate(1.3)).toBe(1.25);
    expect(normalizeRate(99)).toBe(2.5);
    expect(normalizeSettings({ volume: 7, muted: 'yes' })).toEqual({
      seekStep: 10, playbackRate: 1, volume: 1, muted: true,
    });
  });

  it('round-trips through localStorage', () => {
    saveSettings({ seekStep: 30, playbackRate: 1.5, volume: 0.4, muted: false });
    expect(loadSettings()).toEqual({ seekStep: 30, playbackRate: 1.5, volume: 0.4, muted: false });
  });

  it('falls back to defaults on corrupt storage', () => {
    localStorage.setItem('mc_video_player', '{not json');
    expect(loadSettings()).toEqual({ ...DEFAULT_SETTINGS });
  });

  it('steps playback rate within bounds', () => {
    expect(stepRate(1.0, +1)).toBe(1.1);
    expect(stepRate(1.0, -1)).toBe(0.9);
    expect(stepRate(2.5, +1)).toBe(2.5);
    expect(stepRate(0.7, -1)).toBe(0.7);
  });

  it('formats rate and time', () => {
    expect(formatRate(1)).toBe('1×');
    expect(formatRate(1.25)).toBe('1.25×');
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(3725)).toBe('1:02:05');
    expect(formatTime(NaN)).toBe('0:00');
  });

  it('stores resume position but clears it near the end', () => {
    saveResumePosition('v1', 120, 600);
    expect(loadResumePosition('v1')).toBe(120);
    saveResumePosition('v1', 597, 600);
    expect(loadResumePosition('v1')).toBe(0);
    saveResumePosition('v1', 1, 600);
    expect(loadResumePosition('v1')).toBe(0);
  });

  it('detects typing targets', () => {
    expect(isTypingTarget({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isTypingTarget({ tagName: 'input' })).toBe(true);
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(isTypingTarget({ tagName: 'DIV' })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe('long-press drag gestures', () => {
  it('waits for the axis threshold, then picks the dominant axis', () => {
    expect(decideGestureAxis(3, 3)).toBeNull();
    expect(decideGestureAxis(GESTURE_AXIS_THRESHOLD, 0)).toBe('x');
    expect(decideGestureAxis(-20, 5)).toBe('x');
    expect(decideGestureAxis(5, 20)).toBe('y');
    expect(decideGestureAxis(0, -9)).toBe('y');
    expect(decideGestureAxis(10, 10)).toBe('x'); // 대각선 동률은 시간 이동(기존 동작) 우선
    expect(decideGestureAxis(NaN, undefined)).toBeNull();
  });

  it('maps the left half to brightness and the right half to volume', () => {
    expect(verticalGestureKind(10, 0, 400)).toBe('brightness');
    expect(verticalGestureKind(199, 0, 400)).toBe('brightness');
    expect(verticalGestureKind(200, 0, 400)).toBe('volume');
    expect(verticalGestureKind(390, 0, 400)).toBe('volume');
    expect(verticalGestureKind(150, 100, 400)).toBe('brightness'); // 요소가 화면 중간에 있을 때(left 보정)
    expect(verticalGestureKind(50, 0, 0)).toBe('volume'); // 폭을 모르면 안전하게 볼륨
  });

  it('turns an upward drag into a higher level, full height = full range', () => {
    expect(dragToLevel(0.5, -100, 200, 0, 1)).toBe(1); // 위로 반 화면 → +0.5
    expect(dragToLevel(0.5, 100, 200, 0, 1)).toBe(0);
    expect(dragToLevel(0.5, -20, 200, 0, 1)).toBe(0.6);
    expect(dragToLevel(0.5, 0, 200, 0, 1)).toBe(0.5);
    expect(dragToLevel(0.9, -500, 200, 0, 1)).toBe(1); // 범위 밖은 고정
    expect(dragToLevel(0.5, 50, 0, 0, 1)).toBe(0.5); // 높이를 모르면 그대로
    expect(dragToLevel(1, -65, 100, BRIGHTNESS_MIN, BRIGHTNESS_MAX)).toBeCloseTo(1.5 + 0, 2); // 1 + 0.65·1.3 → 1.845 → 1.5 로 고정
    expect(dragToLevel(1, 50, 100, BRIGHTNESS_MIN, BRIGHTNESS_MAX)).toBeCloseTo(0.35, 2);
    expect(dragToLevel(5, 0, 100, BRIGHTNESS_MIN, BRIGHTNESS_MAX)).toBe(BRIGHTNESS_MAX); // 시작값도 범위 안으로
  });
});

describe('scrub seeker (one seek in flight at a time)', () => {
  /** <video> 흉내: currentTime 대입/fastSeek 호출을 기록하고, completeSeek() 로 seeked 를 발생시킨다 */
  function fakeVideo({ fastSeek = false } = {}) {
    const listeners = {};
    let t = 0;
    const v = {
      seeking: false,
      seeks: [],
      fastSeeks: [],
      addEventListener: (type, fn) => { (listeners[type] ||= new Set()).add(fn); },
      removeEventListener: (type, fn) => { listeners[type]?.delete(fn); },
      completeSeek() { v.seeking = false; listeners.seeked?.forEach((fn) => fn()); },
      listenerCount: (type) => listeners[type]?.size ?? 0,
    };
    Object.defineProperty(v, 'currentTime', {
      get: () => t,
      set: (x) => { t = x; v.seeking = true; v.seeks.push(x); },
    });
    if (fastSeek) v.fastSeek = (x) => { t = x; v.seeking = true; v.fastSeeks.push(x); };
    return v;
  }

  it('sends the first request immediately and queues the rest until seeked', () => {
    const v = fakeVideo();
    const s = createScrubSeeker(v);
    expect(s.request(10)).toBe(true);
    expect(v.seeks).toEqual([10]);
    // 탐색 중에는 새 요청을 보내지 않고 마지막 목표만 기억한다
    expect(s.request(20)).toBe(false);
    expect(s.request(30)).toBe(false);
    expect(v.seeks).toEqual([10]);
    v.completeSeek();
    expect(v.seeks).toEqual([10, 30]); // 끝나면 가장 최근 목표 하나만 보낸다
    v.completeSeek();
    expect(v.seeks).toEqual([10, 30]); // 대기 중인 목표가 없으면 아무것도 안 한다
  });

  it('ignores targets that barely differ from the last seek', () => {
    const v = fakeVideo();
    const s = createScrubSeeker(v, { minStep: 0.5 });
    s.request(10);
    v.completeSeek();
    expect(s.request(10.2)).toBe(false);
    expect(v.seeks).toEqual([10]);
    expect(s.request(10.6)).toBe(true);
    expect(v.seeks).toEqual([10, 10.6]);
    // 대기열에 들어간 미세 변화도 seeked 뒤에 보내지 않는다
    s.request(10.7);
    v.completeSeek();
    expect(v.seeks).toEqual([10, 10.6]);
  });

  it('prefers fastSeek (keyframe) while scrubbing but finishes with an exact seek', () => {
    const v = fakeVideo({ fastSeek: true });
    const s = createScrubSeeker(v);
    s.request(42);
    expect(v.fastSeeks).toEqual([42]);
    expect(v.seeks).toEqual([]);
    v.completeSeek();
    s.finish(43.3);
    expect(v.seeks).toEqual([43.3]);
    expect(v.currentTime).toBe(43.3);
  });

  it('falls through after a stalled seek so a frozen seeked never blocks scrubbing', () => {
    let now = 1000;
    const v = fakeVideo();
    const s = createScrubSeeker(v, { stallMs: 500, now: () => now });
    s.request(10);
    now += 200;
    expect(s.request(20)).toBe(false);
    now += 400; // 600ms 동안 seeked 가 안 왔다 → 막혀 있다고 보고 다시 보낸다
    expect(s.request(30)).toBe(true);
    expect(v.seeks).toEqual([10, 30]);
  });

  it('finish() drops the queue, detaches the listener and seeks exactly once', () => {
    const v = fakeVideo();
    const s = createScrubSeeker(v);
    s.request(10);
    s.request(20);
    expect(v.listenerCount('seeked')).toBe(1);
    s.finish(25);
    expect(v.seeks).toEqual([10, 25]);
    expect(v.listenerCount('seeked')).toBe(0);
    v.completeSeek(); // 늦게 온 seeked 가 대기 목표를 되살리지 않는다
    expect(v.seeks).toEqual([10, 25]);
    s.finish(30); // 두 번 호출해도 안전
    expect(v.seeks).toEqual([10, 25, 30]);
  });
});
