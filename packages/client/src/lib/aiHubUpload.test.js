import { it, expect } from 'vitest';
import { tokenMatches, validateManifest } from '@mathchois/shared';

it('tokenMatches: bearer, exact, constant length', () => {
  expect(tokenMatches('Bearer abc', 'abc')).toBe(true);
  expect(tokenMatches('Bearer abd', 'abc')).toBe(false);
  expect(tokenMatches('abc', 'abc')).toBe(false);
  expect(tokenMatches('Bearer abc', undefined)).toBe(false);
});

it('tokenMatches: empty expected, longer/shorter tokens, missing header', () => {
  expect(tokenMatches('Bearer ', '')).toBe(false);
  expect(tokenMatches('Bearer abc', '')).toBe(false);
  expect(tokenMatches('Bearer abcd', 'abc')).toBe(false);
  expect(tokenMatches('Bearer ab', 'abc')).toBe(false);
  expect(tokenMatches('Bearer ', 'abc')).toBe(false);
  expect(tokenMatches(undefined, 'abc')).toBe(false);
  expect(tokenMatches('bearer abc', 'abc')).toBe(false);
});

it('validateManifest', () => {
  expect(validateManifest({ 'motion/01-pixel/video.mp4': { size: 1, sha256: 'a'.repeat(64), updatedAt: 't' } })).toEqual([]);
  expect(validateManifest({ 'motion/01-pixel/video.mp4': { size: -1, sha256: 'zz', updatedAt: 't' } })).toEqual(['motion/01-pixel/video.mp4: bad entry']);
  expect(validateManifest({ '../x': { size: 1, sha256: 'a'.repeat(64), updatedAt: 't' } })).toEqual(['../x: path not allowed']);
});

it('validateManifest: non-object roots and malformed entries', () => {
  expect(validateManifest({})).toEqual([]);
  expect(validateManifest(null)).toEqual(['manifest: not an object']);
  expect(validateManifest([])).toEqual(['manifest: not an object']);
  expect(validateManifest('x')).toEqual(['manifest: not an object']);
  expect(validateManifest({ 'motion/01-pixel/video.mp4': {} })).toEqual(['motion/01-pixel/video.mp4: bad entry']);
  expect(validateManifest({ 'motion/01-pixel/video.mp4': null })).toEqual(['motion/01-pixel/video.mp4: bad entry']);
  expect(validateManifest({ 'motion/01-pixel/video.mp4': { size: 1.5, sha256: 'a'.repeat(64), updatedAt: 't' } })).toEqual(['motion/01-pixel/video.mp4: bad entry']);
  expect(validateManifest({ 'motion/01-pixel/video.mp4': { size: 1, sha256: 'A'.repeat(64), updatedAt: 't' } })).toEqual(['motion/01-pixel/video.mp4: bad entry']);
  expect(validateManifest({ 'motion/01-pixel/video.mp4': { size: 1, sha256: 'a'.repeat(64), updatedAt: '' } })).toEqual(['motion/01-pixel/video.mp4: bad entry']);
  expect(validateManifest({ 'motion/01-pixel/video.mp4': { size: 1, sha256: 'a'.repeat(64), updatedAt: 't', extra: 1 } })).toEqual(['motion/01-pixel/video.mp4: bad entry']);
});
