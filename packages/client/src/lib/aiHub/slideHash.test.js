import { describe, expect, it } from 'vitest';
import { readHashId } from './slideHash';

describe('readHashId', () => {
  it('reads the id after #', () => {
    expect(readHashId('#24')).toBe('24');
    expect(readHashId('')).toBe('');
  });
  it('never throws on malformed escapes', () => {
    expect(readHashId('#%E0')).toBe('');
  });
});
