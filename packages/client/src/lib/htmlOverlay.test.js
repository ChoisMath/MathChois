import { describe, it, expect } from 'vitest';
import { overlayPointerEvents, iframePointerEvents, HTML_OVERLAY_LOCK_BASE } from './htmlOverlay';

describe('htmlOverlay', () => {
  it('overlay captures input only while drawing', () => {
    expect(overlayPointerEvents(true)).toBe('auto');
    expect(overlayPointerEvents(false)).toBe('none');
  });

  it('iframe receives input only when not drawing', () => {
    expect(iframePointerEvents(true)).toBe('none');
    expect(iframePointerEvents(false)).toBe('auto');
  });

  it('overlay and iframe never both capture input', () => {
    for (const drawing of [true, false]) {
      const both = overlayPointerEvents(drawing) === 'auto' && iframePointerEvents(drawing) === 'auto';
      expect(both).toBe(false);
    }
  });

  it('lock base pins the viewport to origin at zoom 1', () => {
    expect(HTML_OVERLAY_LOCK_BASE).toEqual({ zoom: 1, scrollX: 0, scrollY: 0 });
  });
});
