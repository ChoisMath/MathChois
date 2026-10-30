import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/pdfDocCache', () => ({ pdfDocCache: { prefetch: vi.fn() } }));

const { pdfDocCache } = await import('../lib/pdfDocCache');
const { prefetchPdfNeighbors } = await import('./usePdfDocument');
const { applyPdfScene } = await import('./usePdfBackground');

const pdf = (url, n) => ({ id: `${url}#${n}`, pdfUrl: url, pdfPage: n });

describe('prefetchPdfNeighbors', () => {
  beforeEach(() => pdfDocCache.prefetch.mockClear());

  it('prefetches only neighbours from the same document in one call', () => {
    prefetchPdfNeighbors(pdf('/a.pdf', 2), [pdf('/a.pdf', 1), pdf('/b.pdf', 1)]);
    expect(pdfDocCache.prefetch).toHaveBeenCalledTimes(1);
    expect(pdfDocCache.prefetch).toHaveBeenCalledWith('/a.pdf', [1]);
  });
  it('collects both neighbours', () => {
    prefetchPdfNeighbors(pdf('/a.pdf', 2), [pdf('/a.pdf', 1), pdf('/a.pdf', 3)]);
    expect(pdfDocCache.prefetch).toHaveBeenCalledWith('/a.pdf', [1, 3]);
  });
  it('is a no-op for non-PDF current pages, image/null neighbours and other documents', () => {
    prefetchPdfNeighbors({ id: 'i', imageUrl: '/x.png' }, [pdf('/a.pdf', 1)]);
    prefetchPdfNeighbors(pdf('/a.pdf', 1), [null, { id: 'i', imageUrl: '/x.png' }, pdf('/b.pdf', 2)]);
    prefetchPdfNeighbors(null, [pdf('/a.pdf', 1)]);
    expect(pdfDocCache.prefetch).not.toHaveBeenCalled();
  });
});

describe('applyPdfScene', () => {
  it('adds files (when any) then updates the scene without history, after a tick and a frame', async () => {
    vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(cb, 0));
    const calls = [];
    const api = { addFiles: vi.fn(() => calls.push('addFiles')), updateScene: vi.fn(() => calls.push('updateScene')) };
    const els = [{ id: 'e1' }];
    const p = applyPdfScene(api, [{ id: 'f1' }], els);
    expect(api.addFiles).not.toHaveBeenCalled(); // 한 틱 뒤
    await p;
    expect(calls).toEqual(['addFiles', 'updateScene']);
    expect(api.addFiles).toHaveBeenCalledWith([{ id: 'f1' }]);
    expect(api.updateScene).toHaveBeenCalledWith({ elements: els, commitToHistory: false });
    vi.unstubAllGlobals();
  });
  it('skips addFiles when there are no files', async () => {
    vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(cb, 0));
    const api = { addFiles: vi.fn(), updateScene: vi.fn() };
    await applyPdfScene(api, [], []);
    expect(api.addFiles).not.toHaveBeenCalled();
    expect(api.updateScene).toHaveBeenCalledWith({ elements: [], commitToHistory: false });
    vi.unstubAllGlobals();
  });
});
