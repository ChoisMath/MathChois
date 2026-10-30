import { describe, it, expect } from 'vitest';
import { checkUploadPolicy, PDF_MAX_BYTES } from './uploadPolicy.js';

describe('checkUploadPolicy', () => {
  it('chapter-pdfs accepts only application/pdf', () => {
    expect(checkUploadPolicy('chapter-pdfs', 'application/pdf', 1024)).toEqual({ ok: true });
    expect(checkUploadPolicy('chapter-pdfs', 'image/png', 1024)).toMatchObject({ ok: false, status: 400 });
  });
  it('chapter-pdfs rejects files over 100MB with 413', () => {
    expect(checkUploadPolicy('chapter-pdfs', 'application/pdf', PDF_MAX_BYTES + 1)).toMatchObject({ ok: false, status: 413 });
    expect(checkUploadPolicy('chapter-pdfs', 'application/pdf', PDF_MAX_BYTES)).toEqual({ ok: true });
  });
  it('keeps the HTML-only and whiteboard rules', () => {
    expect(checkUploadPolicy('chapter-tools', 'image/png', 10)).toMatchObject({ ok: false, status: 400 });
    expect(checkUploadPolicy('visualizations', 'text/html', 10)).toEqual({ ok: true });
    expect(checkUploadPolicy('whiteboard-files', 'image/svg+xml', 10)).toMatchObject({ ok: false, status: 400 });
    expect(checkUploadPolicy('whiteboard-files', 'image/png', 2 * 1024 * 1024 + 1)).toMatchObject({ ok: false, status: 413 });
    expect(checkUploadPolicy('chapter-pages', 'image/png', 50 * 1024 * 1024)).toEqual({ ok: true });
  });
});
