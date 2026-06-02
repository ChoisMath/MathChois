import { describe, it, expect } from 'vitest';
import { splitFigureSegments, validateFigures } from './problemContent.js';

describe('splitFigureSegments', () => {
  it('splits text around [FIGURE:n] markers', () => {
    const segs = splitFigureSegments('앞 $x^2$ [FIGURE:1] 뒤 [FIGURE:2] 끝');
    expect(segs).toEqual([
      { type: 'text', value: '앞 $x^2$ ' },
      { type: 'figure', idx: 1 },
      { type: 'text', value: ' 뒤 ' },
      { type: 'figure', idx: 2 },
      { type: 'text', value: ' 끝' },
    ]);
  });

  it('returns single text segment when no markers', () => {
    expect(splitFigureSegments('수식만 $a+b$')).toEqual([{ type: 'text', value: '수식만 $a+b$' }]);
  });
});

describe('validateFigures', () => {
  it('passes when marker count matches figureNotes length', () => {
    expect(validateFigures('[FIGURE:1] [FIGURE:2]', ['a', 'b']).ok).toBe(true);
  });

  it('fails when counts mismatch', () => {
    const r = validateFigures('[FIGURE:1]', ['a', 'b']);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('일치');
  });

  it('fails when figure numbers are not contiguous from 1', () => {
    const r = validateFigures('[FIGURE:1] [FIGURE:3]', ['a', 'b']);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('연속');
  });

  it('passes when numbers are 1..n in any order', () => {
    expect(validateFigures('[FIGURE:2] [FIGURE:1]', ['a', 'b']).ok).toBe(true);
  });
});
