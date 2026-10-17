import { describe, it, expect, beforeEach } from 'vitest';
import {
  SEEK_STEPS, PLAYBACK_RATES, DEFAULT_SETTINGS,
  normalizeSeekStep, normalizeRate, normalizeSettings, stepRate, formatRate, formatTime,
  loadSettings, saveSettings, loadResumePosition, saveResumePosition, isTypingTarget,
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
