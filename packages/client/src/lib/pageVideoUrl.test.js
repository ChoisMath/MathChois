import { describe, it, expect } from 'vitest';
import { isLibraryVideoUrl, LIBRARY_VIDEO_PREFIX } from './pageVideoUrl';

describe('isLibraryVideoUrl', () => {
  it('accepts relative library paths', () => {
    expect(isLibraryVideoUrl('/api/files/videos/library/abc.mp4')).toBe(true);
    expect(isLibraryVideoUrl(`${LIBRARY_VIDEO_PREFIX}2026/10/x.webm?x=1`)).toBe(true);
  });

  it('accepts absolute URLs containing the library path', () => {
    expect(isLibraryVideoUrl('https://class.chois.pro/api/files/videos/library/abc.mp4')).toBe(true);
    expect(isLibraryVideoUrl('http://localhost:3000/api/files/videos/library/abc.mp4')).toBe(true);
  });

  it('rejects YouTube and other URLs', () => {
    expect(isLibraryVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(false);
    expect(isLibraryVideoUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(false);
    expect(isLibraryVideoUrl('/api/files/videos/thumbnails/abc.jpg')).toBe(false);
    expect(isLibraryVideoUrl('/api/files/chapter-pages/abc.png')).toBe(false);
    expect(isLibraryVideoUrl('https://evil.com/?u=/api/files/videos/library/abc.mp4')).toBe(false);
  });

  it('rejects empty / non-string input', () => {
    expect(isLibraryVideoUrl('')).toBe(false);
    expect(isLibraryVideoUrl(null)).toBe(false);
    expect(isLibraryVideoUrl(undefined)).toBe(false);
    expect(isLibraryVideoUrl(42)).toBe(false);
  });
});
