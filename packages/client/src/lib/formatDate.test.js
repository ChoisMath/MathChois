import { describe, it, expect } from 'vitest';
import { formatYmd, formatMd } from './formatDate';

describe('formatYmd / formatMd', () => {
  const iso = '2026-10-21T03:04:05.000Z';
  it('연.월.일 — 두 자리로 맞춘다', () => {
    expect(formatYmd(iso)).toMatch(/^2026\.10\.2[01]$/); // 시간대에 따라 20/21
    expect(formatYmd('2026-01-05T12:00:00Z')).toBe('2026.01.05');
  });
  it('월.일', () => {
    expect(formatMd('2026-01-05T12:00:00Z')).toBe('01.05');
  });
  it('빈 값·잘못된 값은 빈 문자열', () => {
    expect(formatYmd(null)).toBe('');
    expect(formatYmd(undefined)).toBe('');
    expect(formatYmd('not-a-date')).toBe('');
    expect(formatMd('')).toBe('');
  });
});
