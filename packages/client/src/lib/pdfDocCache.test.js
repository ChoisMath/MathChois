import { describe, it, expect, vi } from 'vitest';
import { createDocCache } from './pdfDocCache';

const fakeDoc = () => ({ getPage: vi.fn(async (n) => ({ n })), destroy: vi.fn() });

describe('createDocCache', () => {
  it('opens each url once and reuses page proxies', async () => {
    const open = vi.fn(async () => fakeDoc());
    const cache = createDocCache({ open, max: 2 });
    const a1 = await cache.getPage('/a.pdf', 1);
    const a1b = await cache.getPage('/a.pdf', 1);
    expect(a1).toBe(a1b);
    expect(open).toHaveBeenCalledTimes(1);
  });
  it('destroys the least recently used document beyond max', async () => {
    const docs = [];
    const open = vi.fn(async () => { const d = fakeDoc(); docs.push(d); return d; });
    const cache = createDocCache({ open, max: 2 });
    await cache.get('/a.pdf'); await cache.get('/b.pdf'); await cache.get('/a.pdf'); await cache.get('/c.pdf');
    expect(docs[1].destroy).toHaveBeenCalled();      // b evicted
    expect(docs[0].destroy).not.toHaveBeenCalled();  // a was touched
  });
  it('drops a failed open so retry re-opens', async () => {
    const open = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(fakeDoc());
    const cache = createDocCache({ open, max: 2 });
    await expect(cache.get('/a.pdf')).rejects.toThrow();
    await expect(cache.get('/a.pdf')).resolves.toBeTruthy();
  });
});
