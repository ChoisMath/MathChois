import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/*
 * 회귀 방지: pdfjs-dist 의 모던 빌드(build/pdf.mjs)는 2025 신규 API(Map.prototype.getOrInsertComputed 등)를
 * 폴리필 없이 써서 Chromium 141·태블릿 브라우저에서 렌더가 실패한다. legacy 빌드(core-js 폴리필 포함)와
 * 같은 legacy 워커를 써야 한다. 동적 import 경로는 실행 없이 확인하기 어렵고, 단위 테스트(Node)는
 * 이 API 가 있어 실패를 재현하지 못하므로 — 나중의 "업그레이드"가 경로를 되돌리지 않도록 소스를 직접 검사한다.
 */
describe('pdfjs loader', () => {
  const src = readFileSync(new URL('./pdfjs.js', import.meta.url), 'utf8');

  it('imports the legacy build of pdf.js', () => {
    expect(src).toMatch(/import\(\s*['"]pdfjs-dist\/legacy\/build\/pdf\.mjs['"]\s*\)/);
    expect(src).not.toMatch(/['"]pdfjs-dist\/build\//);
  });

  it('uses the legacy worker', () => {
    expect(src).toMatch(/['"]pdfjs-dist\/legacy\/build\/pdf\.worker(\.min)?\.mjs['"]/);
  });
});
