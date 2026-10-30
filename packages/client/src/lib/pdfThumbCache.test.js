import { describe, it, expect } from 'vitest';
import { createThumbCache, thumbKey } from './pdfThumbCache';

describe('thumb cache', () => {
  it('keys by url, page and width and evicts beyond max', () => {
    const c = createThumbCache(2);
    c.set(thumbKey('/a.pdf', 1, 240), 'd1'); c.set(thumbKey('/a.pdf', 2, 240), 'd2'); c.set(thumbKey('/a.pdf', 3, 240), 'd3');
    expect(c.get(thumbKey('/a.pdf', 1, 240))).toBeUndefined();
    expect(c.get(thumbKey('/a.pdf', 3, 240))).toBe('d3');
    expect(thumbKey('/a.pdf', 1, 240)).not.toBe(thumbKey('/a.pdf', 1, 480));
  });
});
