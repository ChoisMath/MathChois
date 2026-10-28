import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeClipboard } from './clipboard';

// vitest 의 environment 가 node 라서 navigator·document 를 흉내 낸다.
function fakeDom({ execCommand }) {
  const ta = { setAttribute() {}, select() {}, remove: vi.fn(), style: {} };
  vi.stubGlobal('document', {
    createElement: () => ta,
    body: { appendChild() {} },
    execCommand,
  });
  return ta;
}

afterEach(() => vi.unstubAllGlobals());

describe('writeClipboard', () => {
  it('returns true when the Clipboard API succeeds', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    expect(await writeClipboard('x')).toBe(true);
  });
  it('falls back to execCommand and returns its result', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    const ta = fakeDom({ execCommand: vi.fn(() => true) });
    expect(await writeClipboard('x')).toBe(true);
    expect(ta.remove).toHaveBeenCalled();
  });
  it('returns false when execCommand reports failure', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    fakeDom({ execCommand: vi.fn(() => false) });
    expect(await writeClipboard('x')).toBe(false);
  });
  it('returns false instead of throwing when the fallback throws', async () => {
    vi.stubGlobal('navigator', {});
    fakeDom({ execCommand: vi.fn(() => { throw new Error('boom'); }) });
    expect(await writeClipboard('x')).toBe(false);
  });
});
