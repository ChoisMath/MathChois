import { describe, it, expect } from 'vitest';
import { pdfFieldsError } from './pageBody.js';

describe('pdfFieldsError', () => {
  const url = '/api/files/chapter-pdfs/chapters/c1/1700_a.pdf';
  it('accepts both absent or both valid', () => {
    expect(pdfFieldsError({})).toBeNull();
    expect(pdfFieldsError({ pdfUrl: url, pdfPage: 1 })).toBeNull();
  });
  it('rejects one without the other, non-integer page, page < 1, and foreign bucket', () => {
    expect(pdfFieldsError({ pdfUrl: url })).toBeTypeOf('string');
    expect(pdfFieldsError({ pdfPage: 2 })).toBeTypeOf('string');
    expect(pdfFieldsError({ pdfUrl: url, pdfPage: 1.5 })).toBeTypeOf('string');
    expect(pdfFieldsError({ pdfUrl: url, pdfPage: 0 })).toBeTypeOf('string');
    expect(pdfFieldsError({ pdfUrl: '/api/files/chapter-pages/x.pdf', pdfPage: 1 })).toBeTypeOf('string');
  });
});
