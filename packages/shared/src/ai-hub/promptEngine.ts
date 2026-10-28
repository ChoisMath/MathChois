/**
 * 모션 프롬프트 엔진 — 오빠두 모션 스타일 갤러리 `ms-prompt.js`(UMD `MSP`, 2026-10-25 판)를 함수 단위로 그대로 옮겼다.
 * 출처: https://www.oppadu.com/wp-content/themes/generatepress_child/tools/_motion-styles-assets/js/ms-prompt.js
 * 동작은 바꾸지 않고 타입만 붙였다. 갤러리 상세의 복사 단추·교사 편집기·공개 상세가 모두 이 함수들로 프롬프트를 만든다.
 * 원본에 없는 것: isV2 · validateTemplate(관리자 저장 전 검사) · tablesMarkdown(me.chois.pro placeholders.ts 에서) ·
 * finalPrompt(오빠두 light.js 의 paint() 가 복사 글자를 만드는 규칙).
 *
 * 틀 문법
 *   {{이름=기본값}} · {{?이름=기본값}} · {{-이름=기본값}}  사용자가 고치는 칸(? = 선택 칸 기본 켬, - = 선택 칸 기본 끔 — 끈 선택 칸은 그 줄째 빠진다)
 *   {{@키}}       체크·고르기 칸이 넣는 숨은 글(opt 표). 비면, 그 줄에 다른 글이 없을 때 줄째 빠진다
 *   {{#조건}}…    줄 맨 앞에서만 — 조건이 아니면 그 줄을 뺀다. 여럿 붙이면 모두 맞아야 한다. !조건 = 아닐 때
 *                 sound(사운드트랙 만들기) · compose(사운드트랙 + 음악 파일 없음) · logo · a(예시 그대로) · b(내 주제에 맞게) ·
 *                 hf(HyperFrames 로 렌더) · remotion(Remotion 으로 렌더)
 *   ## N.         줄을 빼고 나면 절 번호를 다시 매긴다(소리 절이 빠지면 4절이 3절이 된다)
 *   \{{…}}        글자 그대로
 *   옛 틀(01–50)은 @ · # 이 없을 뿐 같은 규칙이다(isV2 = @ 나 # 가 있는 틀).
 *
 * 상태 st = { style:'a'|'b', logo, sound, music, render:'hf'|'remotion', len:초, ratio:'16:9'…, lang:'ko'… } · 기본값 DEF(방식 기본 = 내 주제에 맞게)
 *   렌더링 = HyperFrames / Remotion 둘 중 하나(그 밖의 값은 hf 로 읽는다)
 *   길이 = 초 고정 숫자(LEN 최소~최대) · 화면 = 30fps 고정 + 비율만 고르기(RATIOS) · 화면 글자 = 언어 고르기(LANGS)
 * 글 표 L = motionOpts.ts 의 MOTION_OPTS.en / .ko(오빠두 v2opts 그대로)
 */
import { MOTION_OPTS, type OptTexts } from './motionOpts.js';

export type Ratio = '16:9' | '9:16' | '1:1' | '4:5' | '4:3' | '3:4';
export type PromptLang = 'en' | 'ko';
export type PromptState = {
  style: 'a' | 'b';
  logo: boolean;
  sound: boolean;
  music: boolean;
  render: 'hf' | 'remotion';
  len: number;
  ratio: Ratio;
  lang: Lang;
};
/** 사용자가 고치는 칸. opt = 선택 칸({{?…}}·{{-…}}), on = 기본 켬({{-…}} 만 false) */
export type Blank = { name: string; def: string; opt: boolean; on: boolean };
/** 줄 조각 — {t} 글자 · {b} 칸 이름 · {o, t} 체크·고르기 칸이 넣은 글 */
export type Segment = { t?: string; b?: string; o?: string };
/** 장면표·소리 큐 한 줄 = [시간, 장면/소리, 왜/화면 이벤트] */
export type Row = [string, string, string];

const TOK = /(\\)?\{\{([?\-@#]?)([^=}\n]+)(?:=([^}\n]*))?\}\}/g;
const HEAD_COND = /^\{\{#(!?[a-z]+)\}\}/;
export const DEF = { style: 'b', logo: true, sound: true, music: false, render: 'hf', len: 10, ratio: '16:9', lang: 'ko' } as const satisfies PromptState;
/* 길이(초) — 연출(첫 1초 · 절정 하나 · 마지막 2초 멈춤)이 짧은 인트로에 맞춰져 있어
   long(30초)을 넘기면 길이 줄 바로 아래에 「두세 막으로 짠다」 한 줄(글 표 L.long)을 붙인다 — 틀마다 고치지 않고 여기서(rows). */
export const LEN = { min: 3, max: 90, long: 30 } as const;
/* 화면 비율 → 가로×세로(30fps 고정). 이름은 opts 의 ratioName */
export const RATIOS: Record<Ratio, readonly [number, number]> = {
  '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080], '4:5': [1080, 1350], '4:3': [1440, 1080], '3:4': [1080, 1440],
};
/* 화면 글자 언어 코드(이름은 opts 의 langName) */
export const LANGS = ['ko', 'en', 'ja', 'zh-Hans', 'zh-Hant', 'es', 'fr', 'de', 'vi', 'th', 'id'] as const;
export type Lang = (typeof LANGS)[number];

export function clampLen(n: unknown): number {
  const v = parseInt(n as string, 10);
  if (!(v > 0)) return DEF.len;
  return Math.min(LEN.max, Math.max(LEN.min, v));
}

export function state(s?: Partial<PromptState> | null): PromptState {
  const o = {} as Record<keyof PromptState, unknown>;
  for (const k in DEF) {
    const key = k as keyof PromptState;
    o[key] = s && s[key] != null ? s[key] : DEF[key];
  }
  if (o.style !== 'a') o.style = 'b';
  if (o.render !== 'remotion') o.render = 'hf';
  o.logo = !!o.logo; o.sound = !!o.sound; o.music = !!o.music;
  o.len = clampLen(o.len);
  if (!RATIOS[o.ratio as Ratio]) o.ratio = DEF.ratio;
  if (LANGS.indexOf(o.lang as Lang) < 0) o.lang = DEF.lang;
  return o as PromptState;
}

function cond(name: string, st: PromptState): boolean {
  const neg = name.charAt(0) === '!';
  if (neg) name = name.slice(1);
  const v = name === 'sound' ? st.sound
    : name === 'compose' ? (st.sound && !st.music)
    : name === 'logo' ? st.logo
    : name === 'a' ? st.style === 'a'
    : name === 'b' ? st.style === 'b'
    : name === 'hf' ? st.render === 'hf'
    : name === 'remotion' ? st.render === 'remotion'
    : false;
  return neg ? !v : !!v;
}

function join(list: string[], lang: string | undefined): string {
  if (lang === 'ko' || list.length < 2) return list.join(', ');
  return list.length === 2 ? list.join(' and ') : list.slice(0, -1).join(', ') + ', and ' + list[list.length - 1];
}

/* 체크·고르기 칸이 넣는 글 — 어느 칸이 언제 무엇을 넣는지는 여기 한 곳 */
export function opt(key: string, st: PromptState, L: OptTexts | null | undefined, lang: PromptLang | undefined): string {
  if (!L) return '';
  switch (key) {
    case 'hook': return st.sound ? L.hookOn : L.hookOff;
    case 'logo': return st.logo ? L.logo : '';
    case 'hold': return st.logo ? L.holdLogo : L.holdName;
    case 'files': {
      const f = [L.fFonts];
      if (st.logo) f.push(L.fLogo);
      if (st.sound) f.push(L.fSound);
      return join(f, lang);
    }
    case 'cues': return st.sound ? L.cues : '';
    case 'sound': return !st.sound ? '' : (st.music ? L.musicFile : L.compose);
    case 'render':
      return st.render === 'remotion'
        ? L.renderRm + (st.sound ? L.renderRmAudio : '') + L.end
        : L.renderHf + (st.sound ? L.renderHfAudio : '') + L.end;
    case 'len': return st.len + L.secs;
    case 'frames': return String(st.len * 30); // Remotion durationInFrames(30fps 고정)
    case 'format': {
      const wh = RATIOS[st.ratio] || RATIOS[DEF.ratio];
      return String(L.format).replace('{w}', String(wh[0])).replace('{h}', String(wh[1])).replace('{shape}', (L.ratioName && L.ratioName[st.ratio]) || st.ratio);
    }
    case 'shape': // 가로(16:9)가 아니면 — 스타일 글은 가로 화면으로 썼다
      return st.ratio === '16:9' ? '' : String(L.shape).replace('{shape}', (L.ratioName && L.ratioName[st.ratio]) || st.ratio);
    case 'lang': {
      const nm = (L.langName && L.langName[st.lang]) || st.lang;
      return String(L.onscreen).replace('{lang}', nm) + (st.lang === 'en' ? '' : L.accent);
    }
  }
  return '';
}

/* 사용자가 고치는 칸 — 처음 나온 순서, 이름이 같으면 한 번.
   st 를 주면 그 상태에서 남는 줄의 칸만 센다({{#a}} 줄의 칸은 예시 그대로에만, {{#b}} 줄의 칸은 내 주제에 맞게에만).
   st 없이 부르면 모든 줄(두 판을 합친 목록) */
export function blanks(t: string, st?: Partial<PromptState> | null): Blank[] {
  const out: Blank[] = [], seen: Record<string, 1> = {}, s = st ? state(st) : null;
  String(t).split('\n').forEach((line) => {
    let c: RegExpExecArray | null, m: RegExpExecArray | null;
    while ((c = HEAD_COND.exec(line))) {
      if (s && !cond(c[1], s)) return;
      line = line.slice(c[0].length);
    }
    TOK.lastIndex = 0;
    while ((m = TOK.exec(line)) !== null) {
      if (m[1] || m[2] === '@' || m[2] === '#') continue;
      const name = m[3].trim();
      if (!name || seen[name]) continue;
      seen[name] = 1;
      out.push({ name, def: m[4] != null ? m[4].trim() : '', opt: m[2] !== '', on: m[2] !== '-' });
    }
  });
  TOK.lastIndex = 0;
  return out;
}

/* 이 틀에 「방식」 고르기가 있나(예시 그대로 / 내 주제에 맞게 두 판이 다 있는 편) */
export function hasStyle(t: string): boolean { return /\{\{#!?b\}\}/.test(t); }

export type RowsCtx = {
  st?: Partial<PromptState> | null;
  /** 끈 선택 칸 { 이름: true } */
  off?: Record<string, boolean>;
  L?: OptTexts | null;
  lang: PromptLang;
};

/* 남길 줄 — 줄 = 조각 목록 [{t}|{b:칸 이름}|{o:키, t}]. off = 끈 선택 칸 { 이름: true } */
export function rows(t: string, ctx: RowsCtx): Segment[][] {
  const st = state(ctx && ctx.st), off = (ctx && ctx.off) || {}, L = ctx && ctx.L, lang = ctx && ctx.lang;
  const out: Segment[][] = [];
  let gap = 0, sec = 0;
  String(t).split('\n').forEach((line) => {
    let m: RegExpExecArray | null, keep = true;
    while ((m = HEAD_COND.exec(line))) { if (!cond(m[1], st)) keep = false; line = line.slice(m[0].length); }
    if (!keep) return;
    const ss: Segment[] = [];
    let pos = 0, nb = 0, allOff = true, no = 0, optText = false;
    TOK.lastIndex = 0;
    while ((m = TOK.exec(line)) !== null) {
      if (m.index > pos) ss.push({ t: line.slice(pos, m.index) });
      pos = m.index + m[0].length;
      if (m[1]) { ss.push({ t: m[0].slice(1) }); continue; }
      const kind = m[2], name = m[3].trim();
      if (kind === '#') continue; // 줄 가운데 조건은 쓰지 않는다
      if (kind === '@') {
        no++;
        const v = opt(name, st, L, lang);
        if (v) { optText = true; ss.push({ o: name, t: v }); }
        continue;
      }
      nb++;
      if (!off[name]) allOff = false;
      ss.push({ b: name });
    }
    TOK.lastIndex = 0;
    if (pos < line.length) ss.push({ t: line.slice(pos) });
    if (nb && allOff) return; // 끈 선택 칸만 있는 줄
    if (no && !optText && !nb) {
      const lit = ss.map((s) => s.t).join('');
      if (/^\s*(?:[-*]\s*)?$/.test(lit)) return; // 비어 버린 체크 칸 줄
    }
    if (ss.length && ss[0].t != null && ss[0].o == null) {
      const h = /^(#{1,6}\s+)(\d+)\./.exec(ss[0].t);
      if (h) { sec++; ss[0] = { t: h[1] + sec + '.' + ss[0].t.slice(h[0].length) }; }
    }
    if (!ss.length) { gap++; if (gap > 1 || !out.length) return; out.push([]); return; }
    gap = 0;
    out.push(ss);
    // 긴 영상 — 길이 줄 바로 아래 한 줄(LEN 주석)
    if (st.len > LEN.long && L && L.long && ss.some((s) => s.o === 'len')) {
      out.push([{ t: /^\s*[-*]\s/.test(ss[0].t || '') ? ss[0].t!.match(/^\s*[-*]\s/)![0] : '' }, { o: 'long', t: L.long }]);
    }
  });
  while (out.length && !out[out.length - 1].length) out.pop();
  return out;
}

/* 줄 목록 → 글. val(칸 이름) = 그 칸에 넣을 값 */
export function text(rs: Segment[][], val: (name: string) => string): string {
  return rs.map((ss) => ss.map((s) => (s.b != null ? val(s.b) : s.t)).join('')).join('\n');
}

/* ───────────── 원본에 없는 것 ───────────── */

/** v2 틀 = {{@키}} 나 {{#조건}} 이 있는 틀(오빠두 51편 이후). 옛 틀은 사용자 칸만 있다. */
export function isV2(tpl: string): boolean { return /\{\{[@#]/.test(tpl); }

const COND_NAME = /^!?(?:sound|compose|logo|a|b|hf|remotion)$/;

/** 관리자 저장 전 검사 — 오류 문장 배열(빈 배열 = 정상). 줄 번호는 1부터. */
export function validateTemplate(tpl: string): string[] {
  const errors: string[] = [];
  String(tpl).split('\n').forEach((raw, i) => {
    const n = i + 1, unknown: string[] = [];
    let line = raw, c: RegExpExecArray | null;
    while ((c = HEAD_COND.exec(line))) {
      if (!COND_NAME.test(c[1])) unknown.push(c[1]);
      line = line.slice(c[0].length);
    }
    // 줄 맨 앞이 아닌 {{# 은 rows 가 조용히 버린다 — 글자 그대로(\{{#)는 괜찮다
    if (/(?:^|[^\\])\{\{#/.test(line)) errors.push(`${n}행: 줄 가운데 {{#조건}}`);
    for (const u of unknown) errors.push(`${n}행: 알 수 없는 조건 ${u}`);
    const open = (raw.match(/\{\{/g) || []).length, close = (raw.match(/\}\}/g) || []).length;
    if (open > close) errors.push(`${n}행: 닫히지 않은 {{`);
  });
  return errors;
}

/* 장면표·소리 큐 → 마크다운 표 — me.chois.pro web/src/components/motion-gallery/admin/placeholders.ts 와 같다 */
const mdCell = (v: string) => v.replace(/\|/g, '\\|').replace(/\n/g, ' ');
const table = (cols: string[], rs: readonly (readonly string[])[]) =>
  `| ${cols.join(' | ')} |\n| --- | --- | --- |\n` + rs.map((r) => `| ${r.map(mdCell).join(' | ')} |`).join('\n');

export function tablesMarkdown(item: { shots: readonly Row[]; cues: readonly Row[] }, lang: PromptLang): string {
  const en = lang === 'en';
  const h1 = en ? "## 8. Shot list (director's intent)" : '## 8. 장면표 (감독의 의도)';
  const h2 = en ? '## 9. Sound cue sheet' : '## 9. 소리 큐 시트';
  const c1 = en ? ['Time (s)', 'Scene', 'Why'] : ['시간(초)', '장면', '왜 이렇게'];
  const c2 = en ? ['Time (s)', 'Sound', 'Visual event'] : ['시각(초)', '소리', '화면 이벤트'];
  const note = en
    ? 'Keep the order and timing below within ±0.2 s; refine details, do not replace them.'
    : '아래 순서와 시각을 ±0.2 s 안에서 지키고, 세부만 다듬는다. 대체하지 않는다.';
  return `\n\n${h1}\n${note}\n\n${table(c1, item.shots)}\n\n${h2}\n\n${table(c2, item.cues)}\n`;
}

export type FinalPromptArgs = {
  tpl: string;
  st?: Partial<PromptState> | null;
  /** 사용자가 적은 칸 값 { 이름: 값 } — 비었거나 공백뿐이면 적지 않은 것 */
  values?: Record<string, string>;
  /** 선택 칸 켬·끔 { 이름: true(끔) | false(켬) } — 없으면 틀의 기본({{-…}} = 끔) */
  off?: Record<string, boolean>;
  lang: PromptLang;
  withTables?: boolean;
  tables?: { shots: readonly Row[]; cues: readonly Row[] };
};

/**
 * 완성 프롬프트(복사 글자) — 오빠두 light.js paint() 의 규칙:
 * - 끈 칸 = 호출자가 off[이름] 을 주면 그 값, 아니면 {{-…}} 선택 칸은 기본 끔.
 *   「내 주제에 맞게」(v2 틀 + style 'b') 에서는 값을 적지 않은 선택 칸도 끈다.
 * - 칸 값 = 적은 값 → (내 주제에 맞게면 '' / 아니면 기본값) → 그래도 비면 '[이름]'.
 */
export function finalPrompt({ tpl, st, values = {}, off = {}, lang, withTables, tables }: FinalPromptArgs): string {
  const s = state(st);
  const em = isV2(tpl) && s.style === 'b';
  const by: Record<string, Blank> = {}, offs: Record<string, boolean> = {};
  const valOf = (name: string): string => {
    const u = values[name];
    if (u != null && String(u).trim() !== '') return String(u);
    return em ? '' : (by[name] ? by[name].def : '');
  };
  for (const b of blanks(tpl, s)) {
    by[b.name] = b;
    const userOff = off[b.name] != null ? !!off[b.name] : b.opt && !b.on;
    if (userOff || (em && b.opt && !valOf(b.name))) offs[b.name] = true;
  }
  const body = text(rows(tpl, { st: s, off: offs, L: MOTION_OPTS[lang], lang }), (name) => (offs[name] ? '' : valOf(name) || '[' + name + ']'));
  return body + (withTables && tables ? tablesMarkdown(tables, lang) : '');
}
