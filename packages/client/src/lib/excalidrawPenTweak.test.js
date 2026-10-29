import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { excalidrawPenTweak } from '../../vite/excalidrawPenTweak.js';

/* 설치된 Excalidraw prod 번들 중 freedraw 경로 코드를 담은 청크를 찾는다. */
function loadFreedrawChunk() {
  const require = createRequire(import.meta.url);
  const dir = path.join(path.dirname(require.resolve('@excalidraw/excalidraw')), '..', 'prod');
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.js')) continue;
    const id = path.join(dir, f);
    const code = fs.readFileSync(id, 'utf8');
    if (code.includes('[0-9]{0,2}')) return { id, code };
  }
  throw new Error('freedraw path chunk not found');
}

/* 치환된 코드에서 소수점 절삭 정규식 리터럴을 꺼내 RegExp 로 만든다. */
function precisionRegexFrom(code) {
  const m = code.match(/\/(\(\\s\?\[A-Z\]\?,\?-\?\[0-9\]\*\\\.\[0-9\]\{0,2\}\)[^/]*)\/g/);
  if (!m) throw new Error('precision regex not found');
  return new RegExp(m[1], 'g');
}

describe('excalidrawPenTweak', () => {
  const { id, code } = loadFreedrawChunk();
  const plugin = excalidrawPenTweak();
  const out = plugin.transform(code, id);

  it('keeps the exponent of tiny coordinates so they stay near zero', () => {
    const re = precisionRegexFrom(out);
    expect('3.149743840222931e-12'.replace(re, '$1')).toBe('3.14e-12');
    expect(' -9.257920340031978e-7'.replace(re, '$1')).toBe(' -9.25e-7');
  });

  it('still truncates ordinary coordinates to two decimals', () => {
    const re = precisionRegexFrom(out);
    expect('M 12.3456,-0.5 Q 7.891,20.75'.replace(re, '$1')).toBe('M 12.34,-0.5 Q 7.89,20.75');
  });

  it('still replaces the freedraw perfect-freehand options', () => {
    expect(out).toContain('size:e.strokeWidth*10,thinning:0,smoothing:.12,streamline:.16');
    expect(out).not.toContain('strokeWidth*4.25');
  });
});

describe('excalidrawPenTweak scale normalization', () => {
  const { id, code } = loadFreedrawChunk();
  const out = excalidrawPenTweak().transform(code, id);

  it('runs perfect-freehand at a fixed size and scales the outline back', () => {
    // 외곽선은 scene 단위로 계산되는데 perfect-freehand 의 3단위 끝 생략 등 상수가 절대값이라
    // zoom 10 × 두께 하한 0.05 인 폰에서는 획(2~5단위)이 통째로 무너진다 — 점을 size 기준으로 키워 계산한다.
    expect(out).toMatch(/\.size=10;/);
    expect(out).toMatch(/p\[0\]\/k,p\[1\]\/k/);
    expect(out).not.toMatch(/return \w+\(\w+\(t,n\)\)\}/);
  });
});
