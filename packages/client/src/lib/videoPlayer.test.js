import { describe, it, expect, beforeEach } from 'vitest';
import {
  SEEK_STEPS, PLAYBACK_RATES, DEFAULT_SETTINGS,
  normalizeSeekStep, normalizeRate, normalizeSettings, stepRate, formatRate, formatTime,
  loadSettings, saveSettings, loadResumePosition, saveResumePosition, isTypingTarget,
  BRIGHTNESS_MIN, BRIGHTNESS_MAX, GESTURE_AXIS_THRESHOLD,
  decideGestureAxis, verticalGestureKind, dragToLevel,
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
