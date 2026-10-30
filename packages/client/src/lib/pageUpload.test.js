import { describe, it, expect, vi } from 'vitest';
import { uploadPagesWithPdf } from './pageUpload';
import { PDF_IMPORT_MESSAGES } from './pdfImport';

const img = (name) => ({ name, type: 'image/png' });
const pdf = (name) => ({ name, type: 'application/pdf' });

describe('uploadPagesWithPdf', () => {
  it('uploads in file-name order with each PDF as one contiguous batch', async () => {
    const calls = [];
    const uploadImage = vi.fn(async (file, position) => { calls.push(['image', file.name, position]); return { id: file.name }; });
    const uploadPdf = vi.fn(async (file) => { calls.push(['pdf', file.name]); return `/api/files/chapter-pdfs/${file.name}`; });
    const createPages = vi.fn(async (items) => { calls.push(['batch', items]); return items.map((it, i) => ({ id: `pdf-${i}` })); });
    const inspect = vi.fn(async () => ({ ok: true, numPages: 2 }));
    const onProgress = vi.fn();

    const selected = await uploadPagesWithPdf({
      files: [img('b.png'), pdf('a.pdf'), img('c10.png'), img('c9.png')],
      basePosition: 4, uploadImage, uploadPdf, createPages, onProgress, onRejected: vi.fn(), inspect,
    });

    expect(calls).toEqual([
      ['pdf', 'a.pdf'],
      ['batch', [
        { pdfUrl: '/api/files/chapter-pdfs/a.pdf', pdfPage: 1, position: 4 },
        { pdfUrl: '/api/files/chapter-pdfs/a.pdf', pdfPage: 2, position: 5 },
      ]],
      ['image', 'b.png', 6],
      ['image', 'c9.png', 7],
      ['image', 'c10.png', 8],
    ]);
    expect(selected).toEqual({ id: 'c10.png' });
    expect(onProgress).toHaveBeenCalledWith({ done: 0, total: 4, label: '쪽 생성 중 (파일 1/4)' });
    expect(onProgress).toHaveBeenLastCalledWith({ done: 4, total: 4, label: null });
  });

  it('reports a rejected PDF and leaves it out of the position plan', async () => {
    const onRejected = vi.fn();
    const uploadImage = vi.fn(async (file, position) => ({ id: file.name, position }));
    const uploadPdf = vi.fn();
    const selected = await uploadPagesWithPdf({
      files: [pdf('a.pdf'), img('b.png')],
      basePosition: 0, uploadImage, uploadPdf, createPages: vi.fn(), onProgress: vi.fn(), onRejected,
      inspect: async () => ({ ok: false, message: PDF_IMPORT_MESSAGES.unreadable }),
    });
    expect(onRejected).toHaveBeenCalledWith(expect.objectContaining({ name: 'a.pdf' }), PDF_IMPORT_MESSAGES.unreadable);
    expect(uploadPdf).not.toHaveBeenCalled();
    expect(selected).toEqual({ id: 'b.png', position: 0 });
  });

  it('keeps going after a failed file and selects the first page of the last PDF', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const selected = await uploadPagesWithPdf({
      files: [img('a.png'), pdf('b.pdf')],
      basePosition: 0,
      uploadImage: async () => { throw new Error('boom'); },
      uploadPdf: async () => '/api/files/chapter-pdfs/b.pdf',
      createPages: async (items) => items.map((it) => ({ id: `p${it.pdfPage}` })),
      onProgress: vi.fn(), onRejected: vi.fn(), inspect: async () => ({ ok: true, numPages: 3 }),
    });
    expect(selected).toEqual({ id: 'p1' });
    expect(consoleError).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });
});
