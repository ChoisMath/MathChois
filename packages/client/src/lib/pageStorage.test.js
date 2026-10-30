// pageStorage.test.js
import { describe, it, expect } from 'vitest';
import { storagePathOf, fileUrlsToDeleteFor } from './pageStorage';

const pdf = '/api/files/chapter-pdfs/chapters/c1/1_a.pdf';
describe('fileUrlsToDeleteFor', () => {
  it('deletes an image page file, and a pdf only when no other page references it', () => {
    expect(fileUrlsToDeleteFor({ id: 'p1', imageUrl: '/api/files/chapter-pages/x.png' }, [])).toEqual(['/api/files/chapter-pages/x.png']);
    const p1 = { id: 'p1', pdfUrl: pdf, pdfPage: 1 }, p2 = { id: 'p2', pdfUrl: pdf, pdfPage: 2 };
    expect(fileUrlsToDeleteFor(p1, [p2])).toEqual([]);
    expect(fileUrlsToDeleteFor(p1, [])).toEqual([pdf]);
    expect(fileUrlsToDeleteFor({ id: 'v', videoUrl: 'https://youtu.be/x' }, [])).toEqual([]);
  });
  it('storagePathOf strips the origin', () => {
    expect(storagePathOf('http://h' + pdf)).toBe(pdf);
    expect(storagePathOf('https://youtu.be/x')).toBeNull();
  });
});
