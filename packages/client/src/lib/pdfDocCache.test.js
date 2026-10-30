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

  describe('pin', () => {
    const setup = () => {
      const docs = {};
      const open = vi.fn(async (url) => { const d = fakeDoc(); docs[url] = d; return d; });
      return { docs, cache: createDocCache({ open, max: 2 }) };
    };

    it('skips a pinned document and evicts the least recently used unpinned one', async () => {
      const { docs, cache } = setup();
      await cache.get('/a.pdf');
      cache.pin('/a.pdf');
      await cache.get('/b.pdf'); await cache.get('/c.pdf');
      expect(docs['/b.pdf'].destroy).toHaveBeenCalled();
      expect(docs['/a.pdf'].destroy).not.toHaveBeenCalled();
    });
    it('lets the next overflow destroy a document after unpin', async () => {
      const { docs, cache } = setup();
      await cache.get('/a.pdf');
      const unpin = cache.pin('/a.pdf');
      await cache.get('/b.pdf'); await cache.get('/c.pdf');
      unpin();
      expect(docs['/a.pdf'].destroy).not.toHaveBeenCalled();
      await cache.get('/d.pdf');
      expect(docs['/a.pdf'].destroy).toHaveBeenCalled();
      expect(docs['/c.pdf'].destroy).not.toHaveBeenCalled();
    });
    it('counts pins (two pins, one unpin → still pinned)', async () => {
      const { docs, cache } = setup();
      await cache.get('/a.pdf');
      const unpin1 = cache.pin('/a.pdf');
      cache.pin('/a.pdf');
      unpin1();
      unpin1(); // 같은 해제 함수를 두 번 불러도 한 번만 센다
      await cache.get('/b.pdf'); await cache.get('/c.pdf');
      expect(docs['/a.pdf'].destroy).not.toHaveBeenCalled();
      expect(docs['/b.pdf'].destroy).toHaveBeenCalled();
    });
    it('exceeds max while everything is pinned and trims on the last unpin', async () => {
      const { docs, cache } = setup();
      const unpins = [];
      for (const u of ['/a.pdf', '/b.pdf', '/c.pdf']) { await cache.get(u); unpins.push(cache.pin(u)); }
      expect(Object.values(docs).some((d) => d.destroy.mock.calls.length)).toBe(false);
      unpins[0]();
      expect(docs['/a.pdf'].destroy).toHaveBeenCalled();
      expect(docs['/b.pdf'].destroy).not.toHaveBeenCalled();
    });
    it('evict(url) still closes a pinned document', async () => {
      const { docs, cache } = setup();
      await cache.get('/a.pdf');
      cache.pin('/a.pdf');
      cache.evict('/a.pdf');
      expect(docs['/a.pdf'].destroy).toHaveBeenCalled();
    });
  });
});
