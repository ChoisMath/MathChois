import { it, expect } from 'vitest';
import { DEF, LEN, state, blanks, hasStyle, rows, text, opt, isV2, validateTemplate, tablesMarkdown, finalPrompt, MOTION_OPTS } from '@mathchois/shared';
const L = MOTION_OPTS;
const V1 = '## 1. Channel\n- Name: {{Channel name=Chois}}\n- Tagline: {{Tagline=vibe}}\n- Logo: {{?Logo=use my logo}}\n- Numbers: {{-Numbers=none}}\n## 2. Scene\n';
const V2 = '{{#b}}- Brand: {{Brand name=}}\n{{#a}}- Brand: {{Brand name=PULSE}}\n- Length: {{@len}}\n{{#sound}}{{#!remotion}}- Sound: {{@sound}}\n## 3. Files\n- Attach {{@files}}\n{{#logo}}- {{@logo}}\n- Literal \\{{x}}\n';
it('state: defaults, clamp, invalid values fall back', () => {
  expect(state(null)).toEqual(DEF);
  expect(state({ len: 200, ratio: '2:1', lang: 'xx', style: 'z', render: 'x' })).toMatchObject({ len: LEN.max, ratio: '16:9', lang: 'ko', style: 'b', render: 'hf' });
  expect(state({ len: 1 }).len).toBe(LEN.min);
});
it('blanks: v1 — order, opt flags, dedupe', () => {
  expect(blanks(V1)).toEqual([
    { name: 'Channel name', def: 'Chois', opt: false, on: true },
    { name: 'Tagline', def: 'vibe', opt: false, on: true },
    { name: 'Logo', def: 'use my logo', opt: true, on: true },
    { name: 'Numbers', def: 'none', opt: true, on: false },
  ]);
});
it('blanks(st): only lines kept under the state; a/b switch', () => {
  expect(blanks(V2, { style: 'b' })[0].def).toBe('');
  expect(blanks(V2, { style: 'a' })[0].def).toBe('PULSE');
  expect(hasStyle(V2)).toBe(true); expect(hasStyle(V1)).toBe(false);
  expect(isV2(V2)).toBe(true); expect(isV2(V1)).toBe(false);
});
it('rows: 조건 여럿 — {{#sound}}{{#!remotion}} line drops when remotion', () => {
  const on = text(rows(V2, { st: { sound: true, render: 'hf' }, L: L.en, lang: 'en' }), () => 'X');
  const off = text(rows(V2, { st: { sound: true, render: 'remotion' }, L: L.en, lang: 'en' }), () => 'X');
  expect(on).toContain('- Sound:'); expect(off).not.toContain('- Sound:');
});
it('rows: off blank drops its line; section renumber; literal \\{{', () => {
  const t = text(rows(V1, { off: { Logo: true }, lang: 'en' }), (n) => ({ 'Channel name': 'C', Tagline: 'T' })[n] ?? '');
  expect(t).not.toContain('Logo'); expect(t).toContain('## 2. Scene');
  const t2 = text(rows('## 1. A\n{{#remotion}}## 2. B\n## 3. C\n', { st: { render: 'hf' }, lang: 'en' }), () => '');
  expect(t2).toBe('## 1. A\n## 2. C');
  expect(text(rows(V2, { st: { logo: false }, L: L.en, lang: 'en' }), () => '')).toContain('- Literal {{x}}');
});
it('opt: files join (en: a, b, and c / ko: 쉼표), hook, len, format, lang', () => {
  const st = state({ logo: true, sound: true });
  expect(opt('files', st, L.en, 'en')).toBe(`${L.en.fFonts}, ${L.en.fLogo}, and ${L.en.fSound}`);
  expect(opt('files', state({ logo: true, sound: false }), L.en, 'en')).toBe(`${L.en.fFonts} and ${L.en.fLogo}`);
  expect(opt('files', state({ logo: false, sound: false }), L.en, 'en')).toBe(L.en.fFonts);
  expect(opt('files', st, L.ko, 'ko')).toBe([L.ko.fFonts, L.ko.fLogo, L.ko.fSound].join(', '));
  expect(opt('hook', state({ sound: false }), L.en, 'en')).toBe(L.en.hookOff);
  expect(opt('len', state({ len: 12 }), L.ko, 'ko')).toBe('12' + L.ko.secs);
  expect(opt('format', state({ ratio: '9:16' }), L.ko, 'ko')).toBe('세로(9:16) 1080×1920, 30fps');
  expect(opt('shape', state({ ratio: '16:9' }), L.ko, 'ko')).toBe('');
  expect(opt('lang', state({ lang: 'en' }), L.ko, 'ko')).toBe(L.ko.onscreen.replace('{lang}', '영어'));
});
it('rows: long video adds L.long line under the len line', () => {
  const rs = rows('- Length: {{@len}}\n', { st: { len: 45 }, L: L.ko, lang: 'ko' });
  expect(rs.length).toBe(2); expect(rs[1].some((s) => s.o === 'long')).toBe(true);
  expect(rows('- Length: {{@len}}\n', { st: { len: 30 }, L: L.ko, lang: 'ko' }).length).toBe(1);
});
it('validateTemplate', () => {
  expect(validateTemplate(V2)).toEqual([]);
  expect(validateTemplate('{{#magic}}- x')).toEqual(['1행: 알 수 없는 조건 magic']);
  expect(validateTemplate('- {{Name=')).toEqual(['1행: 닫히지 않은 {{']);
  expect(validateTemplate('- a {{#sound}} b')).toEqual(['1행: 줄 가운데 {{#조건}}']);
});
it('tablesMarkdown + finalPrompt with tables', () => {
  const tables = { shots: [['0–1', 'a|b', 'why']], cues: [['0.0', 'kick', 'ev']] };
  expect(tablesMarkdown(tables, 'ko')).toContain('| 0–1 | a\\|b | why |');
  const out = finalPrompt({ tpl: V1, lang: 'en', withTables: true, tables });
  expect(out.startsWith('## 1. Channel\n- Name: Chois')).toBe(true);
  expect(out).toContain("## 8. Shot list (director's intent)");
  expect(finalPrompt({ tpl: V2, st: { style: 'b' }, lang: 'en' })).toContain('- Brand: [Brand name]');
});
it('finalPrompt: {{-…}} blank is off by default, on when off[name] === false (R1, paint() 규칙)', () => {
  expect(finalPrompt({ tpl: V1, lang: 'en' })).not.toContain('- Numbers:');
  expect(finalPrompt({ tpl: V1, lang: 'en', off: { Numbers: false } })).toContain('- Numbers: none');
});
