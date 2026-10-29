import { describe, it, expect } from 'vitest';
import { decidePromptSync, remakeIdsIn, readSyncResponse } from '@mathchois/shared';

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

describe('readSyncResponse', () => {
  const ok = { ok: true, mode: 'sync', count: 2, inserted: 1, updated: 1, unchanged: 0, skippedEdited: [], replaced: [{ id: 'a', before: 'x' }] };
  it('returns the body of a stage-2 sync response', () => {
    expect(readSyncResponse(ok)).toBe(ok);
  });
  it('rejects a stage-1 server response (no mode, no replaced) with a deploy hint', () => {
    const old = { ok: true, count: 1, overwrite: false, inserted: 1, skipped: 0 };
    expect(() => readSyncResponse(old)).toThrow('server does not support ?mode=sync — deploy stage 2 (merge to main) first');
  });
  it('rejects mode=sync without a replaced array, and non-objects', () => {
    expect(() => readSyncResponse({ ...ok, replaced: undefined })).toThrow(/does not support \?mode=sync/);
    expect(() => readSyncResponse({ ...ok, mode: 'other' })).toThrow(/does not support \?mode=sync/);
    expect(() => readSyncResponse(null)).toThrow(/does not support \?mode=sync/);
    expect(() => readSyncResponse('nope')).toThrow(/does not support \?mode=sync/);
  });
});
