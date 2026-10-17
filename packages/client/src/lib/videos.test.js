import { describe, it, expect } from 'vitest';
import { buildVideoQuery, formatBytes, formatDuration } from './videos.js';

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
});
