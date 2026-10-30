// pdfImport.test.js
import { describe, it, expect, vi } from 'vitest';
import { classifyPdfInspection, inspectPdf, planPagePositions, isPdfFile, PDF_IMPORT_MESSAGES, PDF_MAX_BYTES } from './pdfImport';

describe('classifyPdfInspection', () => {
  it('maps size, password, unreadable and page-count limits to messages', () => {
    expect(classifyPdfInspection({ size: PDF_MAX_BYTES + 1, numPages: 1 })).toEqual({ ok: false, message: PDF_IMPORT_MESSAGES.tooLarge });
    expect(classifyPdfInspection({ size: 10, errorName: 'PasswordException' })).toEqual({ ok: false, message: PDF_IMPORT_MESSAGES.encrypted });
    expect(classifyPdfInspection({ size: 10, errorName: 'InvalidPDFException' })).toEqual({ ok: false, message: PDF_IMPORT_MESSAGES.unreadable });
    expect(classifyPdfInspection({ size: 10, numPages: 501 })).toEqual({ ok: false, message: PDF_IMPORT_MESSAGES.tooManyPages });
    expect(classifyPdfInspection({ size: 10, numPages: 500 })).toEqual({ ok: true, numPages: 500 });
  });
});

describe('inspectPdf', () => {
  const file = (size) => ({ size, arrayBuffer: async () => new ArrayBuffer(size) });
  it('reads numPages through the injected opener and destroys the doc', async () => {
    const destroy = vi.fn();
    const open = vi.fn(async () => ({ numPages: 3, destroy }));
    await expect(inspectPdf(file(10), { open })).resolves.toEqual({ ok: true, numPages: 3 });
    expect(destroy).toHaveBeenCalled();
  });
  it('does not open an oversized file', async () => {
    const open = vi.fn();
    await expect(inspectPdf(file(PDF_MAX_BYTES + 1), { open })).resolves.toMatchObject({ ok: false });
    expect(open).not.toHaveBeenCalled();
  });
});

describe('planPagePositions', () => {
  it('gives each PDF a contiguous block in file order', () => {
    expect(planPagePositions([{ kind: 'image' }, { kind: 'pdf', numPages: 3 }, { kind: 'image' }], 5))
      .toEqual([{ start: 5, count: 1 }, { start: 6, count: 3 }, { start: 9, count: 1 }]);
  });
});

describe('isPdfFile', () => {
  it('accepts by mime or .pdf extension', () => {
    expect(isPdfFile({ type: 'application/pdf', name: 'a' })).toBe(true);
    expect(isPdfFile({ type: '', name: '교재 테스트.PDF' })).toBe(true);
    expect(isPdfFile({ type: 'image/png', name: 'a.png' })).toBe(false);
  });
});
