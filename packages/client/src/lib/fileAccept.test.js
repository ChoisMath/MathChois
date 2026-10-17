import { describe, it, expect } from 'vitest';
import { fileMatchesAccept, fileNameFromUrl, parseAccept } from './fileAccept.js';

const f = (name, type = '') => ({ name, type });

describe('fileAccept', () => {
  it('parses accept tokens', () => {
    expect(parseAccept(' .html, text/html ,IMAGE/*')).toEqual(['.html', 'text/html', 'image/*']);
    expect(parseAccept('')).toEqual([]);
    expect(parseAccept(undefined)).toEqual([]);
  });

  it('matches by extension, exact mime, and wildcard mime', () => {
    const accept = '.html,.htm,text/html';
    expect(fileMatchesAccept(f('a.HTML', ''), accept)).toBe(true);
    expect(fileMatchesAccept(f('a.htm', 'text/html'), accept)).toBe(true);
    expect(fileMatchesAccept(f('index', 'text/html'), accept)).toBe(true);
    expect(fileMatchesAccept(f('a.txt', 'text/plain'), accept)).toBe(false);
    expect(fileMatchesAccept(f('pic.png', 'image/png'), 'image/*')).toBe(true);
    expect(fileMatchesAccept(f('clip.mp4', 'video/mp4'), 'image/*')).toBe(false);
  });

  it('accepts everything when accept is empty', () => {
    expect(fileMatchesAccept(f('anything.bin', 'application/octet-stream'), '')).toBe(true);
  });

  it('extracts a display name from an upload url', () => {
    expect(fileNameFromUrl('/api/files/visualizations/library/1760000000000_circle%20eq.html')).toBe('circle eq.html');
    expect(fileNameFromUrl('/api/files/videos/library/1760000000000_lesson.mp4?x=1')).toBe('lesson.mp4');
    expect(fileNameFromUrl(null)).toBe('');
  });
});
