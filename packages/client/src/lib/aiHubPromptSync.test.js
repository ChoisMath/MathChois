import { describe, it, expect } from 'vitest';
import { decidePromptSync, remakeIdsIn } from '@mathchois/shared';

const eq = (a, b) => a === b;

describe('decidePromptSync', () => {
  it('no existing row → insert', () => {
    expect(decidePromptSync(null, 'x', eq)).toBe('insert');
  });
  it('web-edited row is skipped whether or not the incoming value differs', () => {
    const existing = { value: 'x', editedAt: '2026-10-29T01:02:03.000Z' };
    expect(decidePromptSync(existing, 'x', eq)).toBe('skipEdited');
    expect(decidePromptSync(existing, 'y', eq)).toBe('skipEdited');
    expect(decidePromptSync({ value: 'x', editedAt: new Date() }, 'y', eq)).toBe('skipEdited');
  });
  it('untouched row: same → unchanged, different → update', () => {
    expect(decidePromptSync({ value: 'x', editedAt: null }, 'x', eq)).toBe('unchanged');
    expect(decidePromptSync({ value: 'x', editedAt: null }, 'y', eq)).toBe('update');
  });
});

describe('remakeIdsIn', () => {
  it('returns requested ids whose catalog source is chois or school, in request order', () => {
    const catalog = [{ id: '01-x', source: 'chois' }, { id: '51-a', source: 'oppadu' }, { id: '60-s', source: 'school' }];
    expect(remakeIdsIn(catalog, ['51-a', '01-x', '99-new'])).toEqual(['01-x']);
    expect(remakeIdsIn(catalog, ['60-s', '01-x'])).toEqual(['60-s', '01-x']);
    expect(remakeIdsIn(catalog, ['51-a', '99-new'])).toEqual([]);
  });
});
