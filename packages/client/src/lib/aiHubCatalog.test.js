import { describe, it, expect } from 'vitest';
import { MOTION_CATALOG, SLIDE_CATALOG, validateMotionCatalog, validateSlideCatalog, MOTION_SOURCES } from '@mathchois/shared';

describe('ai-hub catalog', () => {
  it('motion catalog: 106 items, ids unique, 01-pixel first', () => {
    expect(MOTION_CATALOG.length).toBe(106);
    expect(new Set(MOTION_CATALOG.map((m) => m.id)).size).toBe(106);
    expect(MOTION_CATALOG[0].id).toBe('01-pixel');
    expect(validateMotionCatalog(MOTION_CATALOG)).toEqual([]);
    expect(MOTION_SOURCES).toEqual(['chois', 'oppadu']);
  });
  it('slide catalog: 748 items, popularity order kept, 118 school', () => {
    expect(SLIDE_CATALOG.length).toBe(748);
    expect(SLIDE_CATALOG.filter((s) => s.source === 'school').length).toBe(118);
    expect(SLIDE_CATALOG[0].id).toBe('24');
    expect(validateSlideCatalog(SLIDE_CATALOG)).toEqual([]);
  });
  it('validate reports duplicate id/no, bad id, cover out of range', () => {
    expect(validateMotionCatalog([{ ...MOTION_CATALOG[0] }, { ...MOTION_CATALOG[0] }])).toContain('duplicate motion id: 01-pixel');
    expect(validateMotionCatalog([{ ...MOTION_CATALOG[0], id: 'pixel' }])).toContain('bad motion id: pixel');
    expect(validateSlideCatalog([{ ...SLIDE_CATALOG[0], cover: 99 }])).toContain('cover/body out of range: 24');
    expect(validateMotionCatalog([{ ...MOTION_CATALOG[0], source: 'x' }])).toContain('bad source: 01-pixel');
  });
  it('validate reports duplicate no, slides > 12, non-array', () => {
    expect(validateMotionCatalog([MOTION_CATALOG[0], { ...MOTION_CATALOG[1], no: MOTION_CATALOG[0].no }])).toContain(`duplicate motion no: ${MOTION_CATALOG[0].no}`);
    expect(validateSlideCatalog([{ ...SLIDE_CATALOG[0], slides: 13 }])).toContain('slides out of range: 24');
    expect(validateSlideCatalog([SLIDE_CATALOG[0], { ...SLIDE_CATALOG[1], no: SLIDE_CATALOG[0].no }])).toContain(`duplicate slide no: ${SLIDE_CATALOG[0].no}`);
    expect(validateMotionCatalog(null)).toEqual(['motion catalog is not an array']);
    expect(validateSlideCatalog({})).toEqual(['slide catalog is not an array']);
  });
});

describe('validate*Catalog guard', () => {
  it('reports a non-object element instead of throwing, and skips its other checks', () => {
    for (const bad of [null, undefined, 3, 'x', [1]]) {
      expect(validateMotionCatalog([MOTION_CATALOG[0], bad])).toEqual(['bad entry at 1']);
      expect(validateSlideCatalog([bad, SLIDE_CATALOG[0]])).toEqual(['bad entry at 0']);
    }
  });
});
