import { describe, it, expect } from 'vitest';
import { isPdfPage } from '@mathchois/shared';

describe('isPdfPage', () => {
  it('true only when pdfUrl and pdfPage>=1 are both present', () => {
    expect(isPdfPage({ pdfUrl: '/api/files/chapter-pdfs/chapters/c1/a.pdf', pdfPage: 1 })).toBe(true);
    expect(isPdfPage({ pdfUrl: '/api/files/chapter-pdfs/chapters/c1/a.pdf', pdfPage: 0 })).toBe(false);
    expect(isPdfPage({ pdfUrl: '', pdfPage: 1 })).toBe(false);
    expect(isPdfPage({ imageUrl: '/x.png' })).toBe(false);
    expect(isPdfPage(null)).toBe(false);
  });
});
