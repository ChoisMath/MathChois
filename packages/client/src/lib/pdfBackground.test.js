import { describe, it, expect } from 'vitest';
import { resolveBackground } from './pdfBackground';

describe('resolveBackground', () => {
  it('accepts a legacy url string, an image page, a pdf page, or nothing', () => {
    expect(resolveBackground('/api/files/chapter-pages/a.png')).toEqual({ kind: 'image', imageUrl: '/api/files/chapter-pages/a.png' });
    expect(resolveBackground({ imageUrl: '/x.png', pdfUrl: null })).toEqual({ kind: 'image', imageUrl: '/x.png' });
    expect(resolveBackground({ pdfUrl: '/api/files/chapter-pdfs/c/a.pdf', pdfPage: 2 })).toEqual({ kind: 'pdf', pdfUrl: '/api/files/chapter-pdfs/c/a.pdf', pdfPage: 2 });
    expect(resolveBackground({ videoUrl: 'https://youtu.be/x' })).toBeNull();
    expect(resolveBackground(null)).toBeNull();
  });
});

describe('pinBackgrounds', () => {
  it('pins each distinct pdf once and releases them all', async () => {
    const { pinBackgrounds } = await import('./pdfBackground');
    const log = [];
    const cache = { pin: (url) => { log.push(`pin ${url}`); return () => log.push(`unpin ${url}`); } };
    const unpinAll = pinBackgrounds([
      { pdfUrl: '/a.pdf', pdfPage: 1 },
      { pdfUrl: '/a.pdf', pdfPage: 2 },
      { kind: 'pdf', pdfUrl: '/b.pdf', pdfPage: 1 },
      '/x.png',
      { imageUrl: '/y.png' },
      null,
    ], cache);
    expect(log).toEqual(['pin /a.pdf', 'pin /b.pdf']);
    unpinAll();
    expect(log).toEqual(['pin /a.pdf', 'pin /b.pdf', 'unpin /a.pdf', 'unpin /b.pdf']);
  });
});
