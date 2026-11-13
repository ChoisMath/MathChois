// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

const unpins = [];
vi.mock('../lib/pdfDocCache', () => ({
  pdfDocCache: {
    pin: vi.fn((url) => { const u = vi.fn(); unpins.push([url, u]); return u; }),
    get: vi.fn(() => new Promise(() => {})),
    getPage: vi.fn(),
    evict: vi.fn(),
  },
}));

const { pdfDocCache } = await import('../lib/pdfDocCache');
const { usePdfPage } = await import('./usePdfDocument');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function Probe({ url, n }) {
  usePdfPage(url, n);
  return null;
}

describe('usePdfPage document pin', () => {
  beforeEach(() => { unpins.length = 0; pdfDocCache.pin.mockClear(); });

  it('keeps the pin across a momentary null url and moves it only for a different url', () => {
    const root = createRoot(document.createElement('div'));
    act(() => root.render(createElement(Probe, { url: '/a.pdf', n: 1 })));
    expect(pdfDocCache.pin).toHaveBeenCalledTimes(1);
    act(() => root.render(createElement(Probe, { url: null, n: null })));
    act(() => root.render(createElement(Probe, { url: '/a.pdf', n: 2 })));
    expect(pdfDocCache.pin).toHaveBeenCalledTimes(1);
    expect(unpins[0][1]).not.toHaveBeenCalled();
    act(() => root.render(createElement(Probe, { url: '/b.pdf', n: 1 })));
    expect(unpins[0][1]).toHaveBeenCalledTimes(1);
    expect(pdfDocCache.pin).toHaveBeenLastCalledWith('/b.pdf');
    act(() => root.unmount());
    expect(unpins[1][1]).toHaveBeenCalledTimes(1);
  });
});
