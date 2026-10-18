import { describe, it, expect, beforeEach } from 'vitest';
import {
  RATIO_MIN, RATIO_MAX, DEFAULT_SPLIT_SETTINGS, SPLIT_KEY, SPLIT_PAGE_PREFIX,
  clampRatio, normalizeSplitSettings, loadSplitSettings, saveSplitSettings,
  loadSplitPage, saveSplitPage, ratioFromPointer, stepRatio,
} from './splitLayout.js';

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

describe('splitLayout settings', () => {
  beforeEach(() => { globalThis.localStorage = fakeStorage(); });

  it('defaults to a 50:50 split with the video on the start side', () => {
    expect(DEFAULT_SPLIT_SETTINGS).toEqual({ ratio: 0.5, videoSide: 'start' });
    expect(loadSplitSettings()).toEqual({ ratio: 0.5, videoSide: 'start' });
  });

  it('clamps the ratio into [RATIO_MIN, RATIO_MAX] and falls back on garbage', () => {
    expect(RATIO_MIN).toBe(0.2);
    expect(RATIO_MAX).toBe(0.8);
    expect(clampRatio(0.05)).toBe(0.2);
    expect(clampRatio(0.95)).toBe(0.8);
    expect(clampRatio(0.37)).toBe(0.37);
    expect(clampRatio(NaN)).toBe(0.5);
    expect(clampRatio('abc')).toBe(0.5);
  });

  it('normalizes unknown sides to start', () => {
    expect(normalizeSplitSettings({ ratio: 0.3, videoSide: 'end' })).toEqual({ ratio: 0.3, videoSide: 'end' });
    expect(normalizeSplitSettings({ ratio: 0.3, videoSide: 'left' })).toEqual({ ratio: 0.3, videoSide: 'start' });
    expect(normalizeSplitSettings(null)).toEqual({ ratio: 0.5, videoSide: 'start' });
  });

  it('merges partial saves and round-trips through localStorage', () => {
    saveSplitSettings({ videoSide: 'end' });
    expect(saveSplitSettings({ ratio: 0.3 })).toEqual({ ratio: 0.3, videoSide: 'end' });
    expect(loadSplitSettings()).toEqual({ ratio: 0.3, videoSide: 'end' });
    expect(JSON.parse(localStorage.getItem(SPLIT_KEY))).toEqual({ ratio: 0.3, videoSide: 'end' });
  });

  it('survives corrupt storage', () => {
    localStorage.setItem(SPLIT_KEY, '{not json');
    expect(loadSplitSettings()).toEqual({ ratio: 0.5, videoSide: 'start' });
  });
});

describe('splitLayout remembered page', () => {
  beforeEach(() => { globalThis.localStorage = fakeStorage(); });

  it('remembers the last page per classroom video', () => {
    expect(loadSplitPage('cv1')).toBeNull();
    saveSplitPage('cv1', 'p1');
    expect(loadSplitPage('cv1')).toBe('p1');
    expect(loadSplitPage('cv2')).toBeNull();
    expect(localStorage.getItem(`${SPLIT_PAGE_PREFIX}cv1`)).toBe('p1');
  });

  it('clears the memory when the page id is empty', () => {
    saveSplitPage('cv1', 'p1');
    saveSplitPage('cv1', null);
    expect(loadSplitPage('cv1')).toBeNull();
  });
});

describe('ratioFromPointer', () => {
  const rect = { left: 100, top: 50, width: 800, height: 600 };

  it('uses the x axis for a horizontal (side-by-side) split', () => {
    expect(ratioFromPointer(rect, 300, 0, 'horizontal')).toBe(0.25);
    expect(ratioFromPointer(rect, 500, 999, 'horizontal')).toBe(0.5);
  });

  it('uses the y axis for a vertical (stacked) split', () => {
    expect(ratioFromPointer(rect, 0, 200, 'vertical')).toBe(0.25);
    expect(ratioFromPointer(rect, 0, 500, 'vertical')).toBe(0.75);
  });

  it('clamps to the configured bounds', () => {
    expect(ratioFromPointer(rect, 100, 0, 'horizontal')).toBe(0.2);
    expect(ratioFromPointer(rect, 900, 0, 'horizontal')).toBe(0.8);
    expect(ratioFromPointer(rect, 900, 0, 'horizontal', 0.1, 0.9)).toBe(0.9);
  });

  it('returns the default when the rect has no size', () => {
    expect(ratioFromPointer({ left: 0, top: 0, width: 0, height: 0 }, 10, 10, 'horizontal')).toBe(0.5);
  });
});

describe('stepRatio', () => {
  it('moves by 2% and clamps', () => {
    expect(stepRatio(0.5, 1)).toBe(0.52);
    expect(stepRatio(0.5, -1)).toBe(0.48);
    expect(stepRatio(0.79, 1)).toBe(0.8);
    expect(stepRatio(0.21, -1)).toBe(0.2);
  });
});
