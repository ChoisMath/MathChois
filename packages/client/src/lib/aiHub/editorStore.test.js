import { it, expect } from 'vitest';
import { DEF, blanks, rows, text, finalPrompt, MOTION_OPTS } from '@mathchois/shared';
import {
  KEYS, MAIN_KEYS, loadStore, saveStore, effectiveLen, pairBlanks, valueOf, isDirty, resetStore,
  migrateChannelName, setValue, setChecked, promptModel,
} from './editorStore';

/** 메모리 저장소 — localStorage 와 같은 getItem/setItem. broken 이면 모든 접근이 던진다. */
function mem(init = {}, { broken = false } = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k) => { if (broken) throw new Error('blocked'); return m.has(k) ? m.get(k) : null; },
    setItem: (k, v) => { if (broken) throw new Error('blocked'); m.set(k, String(v)); },
    dump: () => Object.fromEntries(m),
  };
}

const V1_EN = [
  '## 1. Channel',
  '- Name: {{Channel name=Chois의 바이브코딩}}',
  '- Tagline: {{Tagline=AI로 만드는 수업}}',
  '- Topic: {{Topic=바이브코딩 기초}}',
  '- Numbers: {{-Numbers=4단계}}',
  '- Logo: {{?Logo=use my pixel logo}}',
  '## 2. Scene',
  '- Mood: {{Mood=bright}}',
].join('\n');
const V1_KO = [
  '## 1. 채널',
  '- 이름: {{채널 이름=Chois의 바이브코딩}}',
  '- 소개: {{한 줄 소개=AI로 만드는 수업}}',
  '- 주제: {{주제=바이브코딩 기초}}',
  '- 숫자: {{-숫자=4단계}}',
  '- 로고: {{?로고=내 픽셀 로고}}',
  '## 2. 장면',
  '- 분위기: {{분위기=밝게}}',
].join('\n');
const V2_EN = [
  '## 1. Brief',
  '{{#b}}- Brand: {{Brand name=}}',
  '{{#a}}- Brand: {{Brand name=PULSE}}',
  '{{#a}}- Date: {{?Date=FRI 7PM}}',
  '{{#b}}- Key facts: {{?Key facts=}}',
  '- Length: {{@len}}',
  '- Format: {{@format}}',
  '{{#sound}}## 2. Sound',
  '{{#sound}}- {{@sound}}',
  '## 3. Render',
  '- {{@render}}',
  '- {{@lang}}',
  '{{#logo}}- {{@logo}}',
  '{{#!remotion}}- Keep the timeline paused.',
].join('\n');
const V2_KO = [
  '## 1. 개요',
  '{{#b}}- 브랜드: {{브랜드 이름=}}',
  '{{#a}}- 브랜드: {{브랜드 이름=PULSE}}',
  '{{#a}}- 날짜: {{?날짜=금 저녁 7시}}',
  '{{#b}}- 핵심 정보: {{?핵심 정보=}}',
  '- 길이: {{@len}}',
  '- 화면: {{@format}}',
  '{{#sound}}## 2. 소리',
  '{{#sound}}- {{@sound}}',
  '## 3. 렌더',
  '- {{@render}}',
  '- {{@lang}}',
  '{{#logo}}- {{@logo}}',
  '{{#!remotion}}- 타임라인은 멈춘 채로 둔다.',
].join('\n');
const SHOTS = [['0.0', 'open', 'hook'], ['5.0', 'peak', 'climax']];
const CUES = [['0.0', 'hit', 'logo'], ['9.0', 'tail', 'end']];
const P1 = { en: V1_EN, ko: V1_KO, shots: SHOTS, cues: CUES, v2: false };
const P2 = { en: V2_EN, ko: V2_KO, shots: SHOTS, cues: CUES, v2: true };

it('loadStore defaults when storage empty or broken', () => {
  for (const s of [mem(), mem({}, { broken: true }), null, mem({ [KEYS.fill]: '{nope', [KEYS.opt]: '[1]' })]) {
    const st = loadStore(s);
    expect(st.opt).toEqual(DEF);
    expect(st.fill).toEqual({ v: {}, off: {} });
    expect(st.lang).toBe('en');
    expect(st.withTables).toBe(true);
    expect(st.sound).toBe(false);
    expect(st.lenOwn).toBe(false);
  }
});

it('saveStore → loadStore round-trips under the exact keys; broken storage does not throw', () => {
  const s = mem();
  const st = { fill: { v: { Tagline: 'A' }, off: { Logo: true } }, opt: { ...DEF, ratio: '9:16', len: 20 }, lang: 'ko', lenOwn: true, sound: true, withTables: false };
  saveStore(s, st);
  expect(Object.keys(s.dump()).sort()).toEqual(['aiHub.fill', 'aiHub.lang', 'aiHub.lenOwn', 'aiHub.opt', 'aiHub.sound', 'aiHub.withTables']);
  expect(loadStore(s)).toEqual(st);
  expect(() => saveStore(mem({}, { broken: true }), st)).not.toThrow();
  expect(() => saveStore(null, st)).not.toThrow();
});

it('effectiveLen follows item.secs until user sets length', () => {
  const s = loadStore(mem());
  expect(effectiveLen(s, { secs: 45 })).toBe(45);
  expect(effectiveLen(s, {})).toBe(10);
  const own = { ...s, lenOwn: true, opt: { ...s.opt, len: 20 } };
  expect(effectiveLen(own, { secs: 45 })).toBe(20);
});

it('pairBlanks keys ko blanks by en name when counts match, else by own name', () => {
  const en = blanks(V1_EN), ko = blanks(V1_KO);
  const pk = pairBlanks(en, ko);
  expect(pk.map((b) => b.name)).toEqual(ko.map((b) => b.name));
  expect(pk.map((b) => b.key)).toEqual(en.map((b) => b.name));
  expect(pk[0]).toMatchObject({ name: '채널 이름', key: 'Channel name', label: '채널 이름', def: 'Chois의 바이브코딩' });
  const pe = pairBlanks(en, ko, 'en');
  expect(pe.map((b) => b.key)).toEqual(en.map((b) => b.name));
  expect(pe[0]).toMatchObject({ name: 'Channel name', key: 'Channel name', label: '채널 이름' });
  // 개수가 다르면 짝짓지 않는다
  const short = ko.slice(0, 2);
  expect(pairBlanks(en, short).map((b) => b.key)).toEqual(['채널 이름', '한 줄 소개']);
  expect(pairBlanks(en, short, 'en').map((b) => [b.key, b.label])).toEqual(en.map((b) => [b.name, b.name]));
});

it('valueOf: emptyMode hides defaults; user value wins', () => {
  const s = loadStore(mem());
  const b = { name: 'Brand name', key: 'Brand name', def: 'PULSE', opt: false, on: true };
  expect(valueOf(s, b, false)).toBe('PULSE');
  expect(valueOf(s, b, true)).toBe('');
  const w = { ...s, fill: { v: { 'Brand name': 'MATH' }, off: {} } };
  expect(valueOf(w, b, false)).toBe('MATH');
  expect(valueOf(w, b, true)).toBe('MATH');
  const blank = { ...s, fill: { v: { 'Brand name': '   ' }, off: {} } };
  expect(valueOf(blank, b, false)).toBe('PULSE');
});

it('migrateChannelName copies 채널 이름 → 브랜드 이름 once', () => {
  const s = loadStore(mem());
  const a = migrateChannelName({ ...s, fill: { v: { '채널 이름': '수학반' }, off: {} } });
  expect(a.fill.v['브랜드 이름']).toBe('수학반');
  const b = migrateChannelName({ ...s, fill: { v: { '채널 이름': '수학반', '브랜드 이름': '이미 있음' }, off: {} } });
  expect(b.fill.v['브랜드 이름']).toBe('이미 있음');
  // 칸 열쇠는 영문 이름이므로 영문 짝도 같은 규칙
  const c = migrateChannelName({ ...s, fill: { v: { 'Channel name': 'Math club' }, off: {} } });
  expect(c.fill.v['Brand name']).toBe('Math club');
  // loadStore 가 불러올 때 한 번 적용한다
  const st = mem({ [KEYS.fill]: JSON.stringify({ v: { 'Channel name': 'X' }, off: {} }) });
  expect(loadStore(st).fill.v['Brand name']).toBe('X');
});

it('isDirty false at defaults, true after value/off/opt change', () => {
  const s = loadStore(mem());
  const bl = pairBlanks(blanks(V1_EN), blanks(V1_KO), 'en');
  expect(isDirty(s, bl, DEF)).toBe(false);
  const ch = bl[0];
  expect(isDirty(setValue(s, ch, 'Math', false), bl, DEF)).toBe(true);
  // 옛 틀: 기본값과 같은 값으로 되돌리면 지운다
  expect(isDirty(setValue(setValue(s, ch, 'Math', false), ch, ch.def, false), bl, DEF)).toBe(false);
  const numbers = bl.find((b) => b.key === 'Numbers');
  expect(isDirty(setChecked(s, numbers, true), bl, DEF)).toBe(true); // 기본 끔 → 켬
  expect(isDirty(setChecked(setChecked(s, numbers, true), numbers, false), bl, DEF)).toBe(false);
  expect(isDirty({ ...s, opt: { ...s.opt, ratio: '1:1' } }, bl, DEF)).toBe(true);
  expect(isDirty({ ...s, lenOwn: true, opt: { ...s.opt, len: 20 } }, bl, DEF)).toBe(true);
  // 언어·소리·표 포함은 「기본값으로」 대상이 아니다
  expect(isDirty({ ...s, lang: 'ko', sound: true, withTables: false }, bl, DEF)).toBe(false);
});

it('resetStore clears values, offs, options and lenOwn but keeps lang/sound/withTables', () => {
  const s = { fill: { v: { a: '1' }, off: { b: true } }, opt: { ...DEF, ratio: '1:1', len: 40 }, lang: 'ko', lenOwn: true, sound: true, withTables: false };
  expect(resetStore(s)).toEqual({ fill: { v: {}, off: {} }, opt: DEF, lang: 'ko', lenOwn: false, sound: true, withTables: false });
});

it('setValue: one line only; v2 keeps a value equal to the example and drops an empty one', () => {
  const s = loadStore(mem());
  const b = { name: 'Brand name', key: 'Brand name', def: 'PULSE', opt: false, on: true };
  expect(setValue(s, b, 'A\nB', true).fill.v['Brand name']).toBe('A B');
  expect(setValue(s, b, 'PULSE', true).fill.v['Brand name']).toBe('PULSE');
  expect('Brand name' in setValue(setValue(s, b, 'X', true), b, '  ', true).fill.v).toBe(false);
});

/* 미리보기(rows + 내 값 함수)와 복사 글자(finalPrompt)가 같은 글을 만드는지 — 둘이 어긋나면 화면과 복사 결과가 달라진다 */
function equivalence(prompt, store, item) {
  for (const lang of ['en', 'ko']) {
    const m = promptModel({ prompt, store, item, lang });
    const preview = text(m.rows, m.val);
    const copy = finalPrompt({ tpl: prompt[lang], st: m.st, values: m.values, off: m.off, lang, withTables: false });
    expect(preview).toBe(copy);
    // 복사 글자는 표 포함 여부에 따라 finalPrompt 를 그대로 쓴다
    expect(m.copyText).toBe(finalPrompt({ tpl: prompt[lang], st: m.st, values: m.values, off: m.off, lang, withTables: store.withTables, tables: prompt }));
    // rows 를 직접 불러도 같은 줄 목록
    expect(text(rows(prompt[lang], { st: m.st, off: m.offs, L: MOTION_OPTS[lang], lang }), m.val)).toBe(copy);
  }
}

it('preview text equals finalPrompt — v1 template (defaults, values, offs)', () => {
  const s = loadStore(mem());
  equivalence(P1, s, {});
  const w = { ...s, fill: { v: { 'Channel name': '수학반', Tagline: '' }, off: { Numbers: false, Logo: true } } };
  equivalence(P1, w, {});
  const m = promptModel({ prompt: P1, store: w, item: {}, lang: 'ko' });
  expect(m.copyText).toContain('- 이름: 수학반');
  expect(m.copyText).toContain('- 숫자: 4단계');
  expect(m.copyText).not.toContain('로고');
  expect(m.v2).toBe(false);
  expect(m.emptyMode).toBe(false);
});

it('preview text equals finalPrompt — v2 template (style a/b, long, remotion, offs)', () => {
  const s = loadStore(mem());
  equivalence(P2, s, {});
  const m0 = promptModel({ prompt: P2, store: s, item: {}, lang: 'en' });
  expect(m0.v2).toBe(true);
  expect(m0.twoWay).toBe(true);
  expect(m0.emptyMode).toBe(true);
  expect(m0.copyText).toContain('- Brand: [Brand name]');
  expect(m0.copyText).not.toContain('Key facts'); // 내 주제에 맞게 + 값 없는 선택 칸 = 끔
  const a = { ...s, opt: { ...s.opt, style: 'a', render: 'remotion', len: 45 }, lenOwn: true, fill: { v: { 'Brand name': 'MATH' }, off: { Date: true } } };
  equivalence(P2, a, {});
  const m1 = promptModel({ prompt: P2, store: a, item: {}, lang: 'ko' });
  expect(m1.copyText).toContain('- 브랜드: MATH');
  expect(m1.copyText).toContain('긴 영상의 짜임');
  expect(m1.copyText).not.toContain('타임라인은 멈춘 채로');
  expect(m1.copyText).not.toContain('날짜');
  const b = { ...s, fill: { v: { 'Key facts': '3월 개강' }, off: {} } };
  equivalence(P2, b, { secs: 12 });
  expect(promptModel({ prompt: P2, store: b, item: { secs: 12 }, lang: 'ko' }).copyText).toContain('- 핵심 정보: 3월 개강');
});

it('promptModel: v2 without {{#b}} lines is always 예시 그대로; v1 counts 세부 설정', () => {
  const noB = { ...P2, en: V2_EN.replace(/\{\{#b\}\}[^\n]*\n/g, ''), ko: V2_KO.replace(/\{\{#b\}\}[^\n]*\n/g, '') };
  const m = promptModel({ prompt: noB, store: loadStore(mem()), item: {}, lang: 'en' });
  expect(m.twoWay).toBe(false);
  expect(m.st.style).toBe('a');
  expect(m.emptyMode).toBe(false);
  const v1 = promptModel({ prompt: P1, store: loadStore(mem()), item: {}, lang: 'en' });
  // 주 칸 = 채널 이름·한 줄 소개·주제·숫자(국문 이름으로 고른다) / 세부 = 로고·분위기
  expect(v1.blanks.filter((b) => MAIN_KEYS.includes(b.label)).map((b) => b.key)).toEqual(['Channel name', 'Tagline', 'Topic', 'Numbers']);
  expect(v1.total).toBe(2);
  expect(v1.used).toBe(2);
  const off = promptModel({ prompt: P1, store: setChecked(loadStore(mem()), v1.blanks.find((b) => b.key === 'Logo'), false), item: {}, lang: 'en' });
  expect(off.used).toBe(1);
});
