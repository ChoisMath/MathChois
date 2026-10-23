import { describe, it, expect } from 'vitest';
import { buildVideoQuery, formatBytes, formatDuration, progressPercent, subtitleQueryUrl } from './videos.js';

describe('videos lib', () => {
  it('builds query strings skipping empty values', () => {
    expect(buildVideoQuery({ q: '원', subject: '', mine: 1, page: 2, minorUnit: undefined, x: false }))
      .toBe('q=%EC%9B%90&mine=1&page=2');
    expect(buildVideoQuery()).toBe('');
  });

  it('formats bytes', () => {
    expect(formatBytes(512)).toBe('512B');
    expect(formatBytes(2048)).toBe('2KB');
    expect(formatBytes(3.5 * 1024 * 1024)).toBe('3.5MB');
    expect(formatBytes(1.5 * 1024 ** 3)).toBe('1.50GB');
  });

  it('formats durations', () => {
    expect(formatDuration(null)).toBe('');
    expect(formatDuration(59)).toBe('0:59');
    expect(formatDuration(600)).toBe('10:00');
    expect(formatDuration(3661)).toBe('1:01:01');
  });

  it('computes progress percent', () => {
    expect(progressPercent(30, 100)).toBe(30);
    expect(progressPercent(33, 100)).toBe(33);
    expect(progressPercent(150, 100)).toBe(100);
    expect(progressPercent(-5, 100)).toBe(0);
    expect(progressPercent(10, 0)).toBeNull();
    expect(progressPercent(10, null)).toBeNull();
    expect(progressPercent(undefined, 60)).toBe(0);
  });
});

describe('subtitleQueryUrl', () => {
  it('한글·공백 URL 을 인코딩', () => {
    expect(subtitleQueryUrl('/api/files/videos/library/1_이차 함수.mp4'))
      .toBe('/api/video-subtitles?videoUrl=%2Fapi%2Ffiles%2Fvideos%2Flibrary%2F1_%EC%9D%B4%EC%B0%A8%20%ED%95%A8%EC%88%98.mp4');
  });
});
