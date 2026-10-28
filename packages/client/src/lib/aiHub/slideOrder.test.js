import { describe, expect, it } from 'vitest';
import { arrange, opensOutsideFilter, parseQuery, stepSlide, stepStyle, toSearch } from './slideOrder';

const items = [
  { id: '24', no: 24, family: 'hand', added: '2026-10-01' },
  { id: '59', no: 59, family: 'photo', added: '2026-10-03' },
  { id: '04', no: 4, family: 'toon', added: '2026-10-03' },
];
const all = { family: null, sort: 'pop', view: 'cover' };

describe('parseQuery / toSearch', () => {
  it('reads valid values and falls back for the rest', () => {
    expect(parseQuery(new URLSearchParams('f=hand&s=new&v=body'), ['hand'])).toEqual({ family: 'hand', sort: 'new', view: 'body' });
    expect(parseQuery(new URLSearchParams('f=neon&s=zzz&v=x'), ['hand'])).toEqual(all);
    expect(parseQuery(new URLSearchParams('f=photo'), ['hand'])).toEqual(all);
  });
  it('omits defaults', () => {
    expect(toSearch(all)).toBe('');
    expect(toSearch({ family: 'hand', sort: 'no', view: 'body' })).toBe('?f=hand&s=no&v=body');
  });
});

describe('arrange', () => {
  it('keeps source order for popularity', () => {
    expect(arrange(items, all).map((i) => i.id)).toEqual(['24', '59', '04']);
  });
  it('sorts by number and by newest, newer number first on the same day', () => {
    expect(arrange(items, { ...all, sort: 'no' }).map((i) => i.id)).toEqual(['04', '24', '59']);
    expect(arrange(items, { ...all, sort: 'new' }).map((i) => i.id)).toEqual(['59', '04', '24']);
  });
  it('filters by family without mutating the input', () => {
    expect(arrange(items, { ...all, family: 'toon' }).map((i) => i.id)).toEqual(['04']);
    expect(items.map((i) => i.id)).toEqual(['24', '59', '04']);
  });
});

describe('opensOutsideFilter', () => {
  it('is true only for an existing style the filter hides', () => {
    const q = { ...all, family: 'toon' };
    expect(opensOutsideFilter(items, q, '04')).toBe(false);
    expect(opensOutsideFilter(items, q, '59')).toBe(true);
    expect(opensOutsideFilter(items, q, '999')).toBe(false);
    expect(opensOutsideFilter(items, all, '59')).toBe(false);
  });
});

describe('stepSlide / stepStyle', () => {
  const counts = [3, 2];
  it('moves within a deck', () => {
    expect(stepSlide({ style: 0, slide: 0 }, 1, counts)).toEqual({ style: 0, slide: 1 });
  });
  it('rolls into the next style and back into the previous style last slide', () => {
    expect(stepSlide({ style: 0, slide: 2 }, 1, counts)).toEqual({ style: 1, slide: 0 });
    expect(stepSlide({ style: 1, slide: 0 }, -1, counts)).toEqual({ style: 0, slide: 2 });
  });
  it('wraps at both ends', () => {
    expect(stepSlide({ style: 1, slide: 1 }, 1, counts)).toEqual({ style: 0, slide: 0 });
    expect(stepSlide({ style: 0, slide: 0 }, -1, counts)).toEqual({ style: 1, slide: 1 });
  });
  it('jumps styles to their first slide', () => {
    expect(stepStyle({ style: 0, slide: 2 }, 1, 2)).toEqual({ style: 1, slide: 0 });
    expect(stepStyle({ style: 0, slide: 2 }, -1, 2)).toEqual({ style: 1, slide: 0 });
  });
});
