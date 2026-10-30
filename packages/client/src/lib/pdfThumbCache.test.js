import { describe, it, expect } from 'vitest';
import { bucketWidth, createThumbCache, thumbKey } from './pdfThumbCache';

describe('thumb cache', () => {
  it('keys by url, page and width and evicts beyond max', () => {
    const c = createThumbCache(2);
    c.set(thumbKey('/a.pdf', 1, 240), 'd1'); c.set(thumbKey('/a.pdf', 2, 240), 'd2'); c.set(thumbKey('/a.pdf', 3, 240), 'd3');
    expect(c.get(thumbKey('/a.pdf', 1, 240))).toBeUndefined();
    expect(c.get(thumbKey('/a.pdf', 3, 240))).toBe('d3');
    expect(thumbKey('/a.pdf', 1, 240)).not.toBe(thumbKey('/a.pdf', 1, 480));
  });

  it('evicts least recently used entries beyond the byte budget even under maxEntries', () => {
    const c = createThumbCache({ maxEntries: 100, maxBytes: 10 });
    c.set('a', 'x'.repeat(4));
    c.set('b', 'x'.repeat(4));
    expect(c.get('a')).toBe('xxxx'); // a 를 최근 사용으로
    c.set('c', 'x'.repeat(4)); // 12 > 10 → 가장 오래 안 쓴 b 축출
    expect(c.get('b')).toBeUndefined();
    expect(c.get('a')).toBe('xxxx');
    expect(c.get('c')).toBe('xxxx');
    expect(c.size).toBe(2);
    expect(c.bytes).toBe(8);
  });

  it('drops an entry larger than the whole budget instead of keeping it', () => {
    const c = createThumbCache({ maxEntries: 100, maxBytes: 10 });
    c.set('a', 'xx');
    c.set('huge', 'x'.repeat(11));
    expect(c.get('huge')).toBeUndefined();
    expect(c.get('a')).toBeUndefined();
    expect(c.bytes).toBe(0);
  });

  it('replacing a key updates the byte total', () => {
    const c = createThumbCache({ maxBytes: 100 });
    c.set('a', 'x'.repeat(50));
    c.set('a', 'x'.repeat(10));
    expect(c.bytes).toBe(10);
    expect(c.size).toBe(1);
  });
});

describe('bucketWidth', () => {
  it('rounds the display width up to 120 px steps', () => {
    expect(bucketWidth(240)).toBe(240);
    expect(bucketWidth(241)).toBe(360);
    expect(bucketWidth(1000)).toBe(1080);
  });
});
