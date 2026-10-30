import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./pdfDocCache', () => ({ pdfDocCache: { getPage: vi.fn() } }));

const { pdfDocCache } = await import('./pdfDocCache');
const { rasterizePdfPage } = await import('./pdfRaster');

function fakePage({ width = 600, height = 800 } = {}) {
  return {
    getViewport: vi.fn(({ scale }) => ({ width: width * scale, height: height * scale })),
    render: vi.fn(() => ({ promise: Promise.resolve() })),
  };
}

describe('rasterizePdfPage', () => {
  let canvases;
  beforeEach(() => {
    canvases = [];
    pdfDocCache.getPage.mockReset();
    globalThis.document = {
      createElement: () => {
        const ctx = { fillRect: vi.fn(), fillStyle: '' };
        const canvas = { width: 0, height: 0, getContext: () => ctx, toDataURL: vi.fn(() => 'data:image/jpeg;base64,AA'), ctx };
        canvases.push(canvas);
        return canvas;
      },
    };
  });
  afterEach(() => { delete globalThis.document; });

  it('scales the long side, fills white, encodes JPEG 0.85 and releases the canvas', async () => {
    const page = fakePage({ width: 600, height: 800 });
    pdfDocCache.getPage.mockResolvedValue(page);
    const out = await rasterizePdfPage('/a.pdf', 1, { longSide: 400 });
    expect(out).toEqual({ dataUrl: 'data:image/jpeg;base64,AA', mimeType: 'image/jpeg', width: 300, height: 400 });
    expect(page.getViewport).toHaveBeenLastCalledWith({ scale: 0.5 });
    const [c] = canvases;
    expect(c.ctx.fillStyle).toBe('#ffffff');
    expect(c.ctx.fillRect).toHaveBeenCalledWith(0, 0, 300, 400);
    expect(c.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.85);
    expect([c.width, c.height]).toEqual([0, 0]);
  });

  it('shares one in-flight render per url/page/size and retries after a failure', async () => {
    const page = fakePage();
    pdfDocCache.getPage.mockResolvedValue(page);
    const [a, b] = await Promise.all([
      rasterizePdfPage('/a.pdf', 2, { longSide: 384 }),
      rasterizePdfPage('/a.pdf', 2, { longSide: 384 }),
    ]);
    expect(a).toBe(b);
    expect(page.render).toHaveBeenCalledTimes(1);

    await rasterizePdfPage('/a.pdf', 2, { longSide: 384 });
    expect(page.render).toHaveBeenCalledTimes(2);

    pdfDocCache.getPage.mockRejectedValueOnce(new Error('boom'));
    await expect(rasterizePdfPage('/a.pdf', 3, { longSide: 384 })).rejects.toThrow('boom');
    await expect(rasterizePdfPage('/a.pdf', 3, { longSide: 384 })).resolves.toMatchObject({ mimeType: 'image/jpeg' });
  });
});
