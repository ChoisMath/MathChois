import { describe, it, expect } from 'vitest';
import { formatReport, formatPushResult, formatPushBlock, keepPushSections } from '@mathchois/shared';

const set = (over = {}) => ({ added: [], updated: {}, keptRemake: 0, gone: [], media: 0, ...over });
const brand = (over = {}) => ({ added: [], removed: [], total: 293, generatedAt: '2026-10-14T03:00:00+09:00', ...over });
const NEXT = '다음 할 일: npm run ai:push -- --set motion --sync-prompts → --set slide --sync-prompts → --set brand';

const full = {
  date: '2026-10-29',
  motion: set({
    added: ['120-a', '121-b', '122-c'],
    updated: { '57-x': ['name', 'secs'], '58-y': ['no'] },
    keptRemake: 50,
    media: 9,
  }),
  slide: set({ keptRemake: 118 }),
  brand: brand(),
  engineChanged: false,
  skipped: [],
};

describe('formatReport', () => {
  const { summary, markdown } = formatReport(full);

  it('writes the motion line with added ids and updated fields', () => {
    expect(summary).toContain('모션: 추가 3 (120-a, 121-b, 122-c) · 갱신 2 (57-x: name·secs, 58-y: no) · 변형본이라 건너뜀 50 · 오빠두에서 사라진 0 · 미디어 새로/바뀜 9');
  });
  it('writes the slide line like the motion one, counting pictures, and omits empty parentheses', () => {
    expect(summary).toContain('슬라이드: 추가 0 · 갱신 0 · 변형본이라 건너뜀 118 · 오빠두에서 사라진 0 · 그림 새로/바뀜 0');
  });
  it('names vanished ids in parentheses', () => {
    const r = formatReport({ ...full, motion: set({ gone: ['52-gone'] }) });
    expect(r.summary).toContain('모션: 추가 0 · 갱신 0 · 변형본이라 건너뜀 0 · 오빠두에서 사라진 1 (52-gone) · 미디어 새로/바뀜 0');
  });
  it('writes the brand line with the oppadu build date', () => {
    expect(summary).toContain('브랜드: 293개 (오빠두 생성 2026-10-14) · 추가 0 · 사라진 0');
  });
  it('names added and removed brand slugs', () => {
    const r = formatReport({ ...full, brand: brand({ total: 294, added: ['acme', 'zeta'], removed: ['old-co'] }) });
    expect(r.summary).toContain('브랜드: 294개 (오빠두 생성 2026-10-14) · 추가 2 (acme, zeta) · 사라진 1 (old-co)');
  });
  it('ends with the next step', () => {
    expect(summary.at(-1)).toBe(NEXT);
  });
  it('has no engine warning unless the engine changed', () => {
    expect(summary.some((l) => l.startsWith('⚠'))).toBe(false);
    const r = formatReport({ ...full, engineChanged: true });
    expect(r.summary).toContain('⚠ 오빠두 프롬프트 엔진이 바뀌었습니다 — promptEngine.ts 확인 필요');
  });
  it('starts with 변경 없음 when nothing changed', () => {
    const r = formatReport({ date: '2026-10-29', motion: set({ keptRemake: 50 }), slide: set(), brand: brand(), engineChanged: false, skipped: [] });
    expect(r.summary[0]).toBe('변경 없음');
    expect(r.summary.at(-1)).toBe(NEXT);
    expect(summary[0]).not.toBe('변경 없음');
  });
  it('treats an empty report as no change', () => {
    expect(formatReport({ date: '2026-10-29', engineChanged: false, skipped: [] }).summary[0]).toBe('변경 없음');
  });
  it('counts media, a brand change or a field update alone as a change', () => {
    const base = { date: '2026-10-29', engineChanged: false, skipped: [] };
    expect(formatReport({ ...base, slide: set({ media: 1 }) }).summary[0]).not.toBe('변경 없음');
    expect(formatReport({ ...base, brand: brand({ removed: ['x'] }) }).summary[0]).not.toBe('변경 없음');
    expect(formatReport({ ...base, motion: set({ updated: { a: ['name'] } }) }).summary[0]).not.toBe('변경 없음');
  });
  it('says which sets were skipped', () => {
    const r = formatReport({ ...full, slide: undefined, skipped: ['slide'] });
    expect(r.summary).toContain('슬라이드: 수집본이 없어 건너뜀');
    expect(r.summary.some((l) => l.startsWith('슬라이드: 추가'))).toBe(false);
  });
  it('shortens long id lists on screen but keeps every id in the markdown', () => {
    const ids = Array.from({ length: 15 }, (_, n) => `${200 + n}`);
    const r = formatReport({ ...full, slide: set({ added: ids }) });
    expect(r.summary).toContain('슬라이드: 추가 15 (200, 201, 202, 203, 204, 205, 206, 207, 208, 209, …외 5) · 갱신 0 · 변형본이라 건너뜀 0 · 오빠두에서 사라진 0 · 그림 새로/바뀜 0');
    expect(r.markdown).toContain(`추가 15 (${ids.join(', ')})`);
  });
  it('puts the date and every summary line in the markdown', () => {
    expect(markdown).toMatch(/^# 오빠두 동기화 2026-10-29\n/);
    for (const line of summary) expect(markdown).toContain(line);
  });
});

describe('formatPushResult', () => {
  const result = { inserted: 3, updated: 56, unchanged: 0, skippedEdited: [], replaced: [] };
  it('writes counts and the backup path', () => {
    expect(formatPushResult('motion', result, '.oppadu/2026-10-29/replaced-prompts-motion.json'))
      .toBe('motion: 넣음 3 · 바뀜 56 · 같음 0 · 웹에서 고쳐 건너뜀 0 · 백업 .oppadu/2026-10-29/replaced-prompts-motion.json');
  });
  it('names the ids skipped because they were edited on the web', () => {
    expect(formatPushResult('slide', { ...result, skippedEdited: ['51-a', '57-x'] }, 'b.json'))
      .toBe('slide: 넣음 3 · 바뀜 56 · 같음 0 · 웹에서 고쳐 건너뜀 2 (51-a, 57-x) · 백업 b.json');
  });
});

describe('report.md push sections', () => {
  const report = '# 오빠두 동기화 2026-10-29\n\n- 변경 없음\n- 다음 할 일: …\n';
  it('formatPushBlock is a "## push" section appended after the report', () => {
    expect(formatPushBlock('motion: 넣음 1')).toBe('\n## push\nmotion: 넣음 1\n');
  });
  it('a fresh report keeps every earlier push section of the same day, in order', () => {
    const old = '# 오빠두 동기화 2026-10-29\n\n- 모션: 추가 1\n' + formatPushBlock('motion: A') + formatPushBlock('slide: B');
    const out = keepPushSections(report, old);
    expect(out.startsWith(report)).toBe(true);
    expect(out).not.toContain('모션: 추가 1');
    expect(out.indexOf('motion: A')).toBeGreaterThan(out.indexOf('다음 할 일'));
    expect(out.indexOf('slide: B')).toBeGreaterThan(out.indexOf('motion: A'));
    expect(out.match(/^## push$/gm)).toHaveLength(2);
    // 두 번째 실행에도 그대로 이어진다.
    expect(keepPushSections(report, out)).toBe(out);
  });
  it('no old file or no push sections → the new report as is', () => {
    expect(keepPushSections(report, null)).toBe(report);
    expect(keepPushSections(report, '# 오빠두 동기화 2026-10-29\n\n- 변경 없음\n')).toBe(report);
  });
});
