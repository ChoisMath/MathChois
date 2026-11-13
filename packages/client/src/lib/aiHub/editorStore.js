/**
 * 모션 프롬프트 편집기 상태 — 오빠두 light.js 의 S(빈칸 값)·OS(옵션)·msl-len-own·msl-lang 을 순수 함수로 옮겼다.
 * 모든 스타일이 한 벌을 함께 쓴다(값을 바꾸고 다른 스타일로 넘어가도 그대로). 저장은 localStorage(교사 브라우저마다).
 *
 * Store = {
 *   fill: { v: { 칸 열쇠: 값 }, off: { 칸 열쇠: true(끔) | false(켬) } },   // 사용자가 손댄 것만
 *   opt: PromptState,       // 방식·로고·소리·음악·렌더·길이·비율·화면 글자
 *   lang: 'en' | 'ko',      // 프롬프트 언어(복사할 글)
 *   lenOwn: boolean,        // 길이를 직접 정했나 — 아니면 편마다 그 예시의 secs 를 따라간다
 *   sound: boolean,         // 영상 소리 켜기
 *   withTables: boolean,    // 복사할 때 장면표·소리 큐 표를 붙이나(me.chois.pro 기능)
 * }
 *
 * 칸 열쇠: 영문 틀의 칸 이름. 국문 틀의 같은 자리 칸(개수가 같을 때)도 같은 열쇠를 써서 언어를 바꿔도 값이 따라간다.
 * 이름표(label)는 국문 짝 이름 — 화면 말이 한국어이고, 「주 칸」(MAIN_KEYS)도 국문 이름으로 고른다(오빠두와 같음).
 */
import { DEF, LEN, state, clampLen, blanks, isV2, hasStyle, rows, finalPrompt, MOTION_OPTS } from '@mathchois/shared';

export const KEYS = {
  fill: 'aiHub.fill',
  opt: 'aiHub.opt',
  lang: 'aiHub.lang',
  lenOwn: 'aiHub.lenOwn',
  sound: 'aiHub.sound',
  withTables: 'aiHub.withTables',
};

/** 옛 틀(01–50)에서 위에 늘 보이는 칸(채널마다 다른 것) — 나머지는 「세부 설정」 안. 국문 이름으로 비교한다. */
export const MAIN_KEYS = ['채널 이름', '브랜드 이름', '한 줄 소개', '주제', '숫자'];

/* 오빠두 10/13 「채널 이름 → 브랜드 이름」(v2 칸 이름). 옛 틀에 적은 채널 이름을 v2 틀의 브랜드 이름으로 한 번 옮긴다.
   열쇠는 영문 칸 이름이므로 영문 짝도 같은 규칙으로 옮긴다. */
const RENAMES = [['채널 이름', '브랜드 이름'], ['Channel name', 'Brand name']];

const get = (storage, key) => {
  try { return storage ? storage.getItem(key) : null; } catch { return null; }
};
const set = (storage, key, value) => {
  try { if (storage) storage.setItem(key, value); } catch { /* 저장소가 막혀도 화면은 그대로 */ }
};
const parse = (raw) => {
  try { return raw == null ? null : JSON.parse(raw); } catch { return null; }
};
const isPlainObject = (o) => !!o && typeof o === 'object' && !Array.isArray(o);

function cleanFill(raw) {
  const v = {}, off = {};
  if (isPlainObject(raw)) {
    if (isPlainObject(raw.v)) for (const [k, x] of Object.entries(raw.v)) if (typeof x === 'string') v[k] = x;
    if (isPlainObject(raw.off)) for (const [k, x] of Object.entries(raw.off)) if (typeof x === 'boolean') off[k] = x;
  }
  return { v, off };
}

export function migrateChannelName(store) {
  let v = store.fill.v;
  for (const [from, to] of RENAMES) {
    if (v[from] != null && v[to] == null) v = { ...v, [to]: v[from] };
  }
  return v === store.fill.v ? store : { ...store, fill: { ...store.fill, v } };
}

export function loadStore(storage) {
  const opt = parse(get(storage, KEYS.opt));
  return migrateChannelName({
    fill: cleanFill(parse(get(storage, KEYS.fill))),
    opt: state(isPlainObject(opt) ? opt : null),
    lang: get(storage, KEYS.lang) === 'ko' ? 'ko' : 'en',
    lenOwn: get(storage, KEYS.lenOwn) === 'true',
    sound: get(storage, KEYS.sound) === 'true',
    withTables: get(storage, KEYS.withTables) !== 'false',
  });
}

export function saveStore(storage, store) {
  set(storage, KEYS.fill, JSON.stringify(store.fill));
  set(storage, KEYS.opt, JSON.stringify(store.opt));
  set(storage, KEYS.lang, store.lang);
  set(storage, KEYS.lenOwn, String(!!store.lenOwn));
  set(storage, KEYS.sound, String(!!store.sound));
  set(storage, KEYS.withTables, String(!!store.withTables));
}

/** 이 편에 쓸 길이 — 사람이 길이를 바꾸기 전에는 그 예시의 길이(없으면 10초), 한 번 바꾸면 모든 편에 그 값. */
export function effectiveLen(store, item) {
  return store.lenOwn ? clampLen(store.opt.len) : clampLen(item?.secs ?? DEF.len);
}

/**
 * 지금 언어(lang)의 칸 목록에 열쇠·이름표를 붙인다. 두 틀의 칸 개수가 같으면 같은 자리끼리 짝이다.
 * key = 영문 칸 이름(짝이 없으면 제 이름), label = 국문 칸 이름(짝이 없으면 제 이름).
 */
export function pairBlanks(enBlanks, koBlanks, lang = 'ko') {
  const same = enBlanks.length === koBlanks.length;
  const list = lang === 'en' ? enBlanks : koBlanks;
  return list.map((b, k) => ({
    ...b,
    key: same ? enBlanks[k].name : b.name,
    label: same ? koBlanks[k].name : b.name,
  }));
}

const filled = (u) => u != null && String(u).trim() !== '';

/** 칸에 들어갈 값 — 적은 값, 없으면 (내 주제에 맞게면 비움 / 아니면 예시 값). */
export function valueOf(store, blank, emptyMode) {
  const u = store.fill.v[blank.key];
  if (filled(u)) return String(u);
  return emptyMode ? '' : blank.def;
}

/** 내가 바꾼 값인가(미리보기 강조) */
export function isOwn(store, blank) {
  const u = store.fill.v[blank.key];
  return filled(u) && u !== blank.def;
}

/** 선택 칸이 꺼졌나 — 사용자가 켜고 끈 값, 없으면 틀의 기본({{-…}} = 끔). 선택 칸이 아니면 늘 켬. */
export function isOff(store, blank) {
  if (!blank.opt) return false;
  const o = store.fill.off[blank.key];
  return o != null ? !!o : !blank.on;
}

const oneLine = (s) => String(s).replace(/\s*[\r\n]+\s*/g, ' '); // 칸은 줄 안에 있다 — 줄바꿈이 들어가면 줄 구조가 깨진다

/** 칸 값 바꾸기. v2 = 비우면 지움(예시와 같아도 남겨 「내 주제에 맞게」로 넘어가도 쓰이게) · 옛 틀 = 예시와 같으면 지움. */
export function setValue(store, blank, raw, v2) {
  const value = oneLine(raw);
  const v = { ...store.fill.v };
  if (v2 ? value.trim() === '' : value === blank.def) delete v[blank.key];
  else v[blank.key] = value;
  return { ...store, fill: { ...store.fill, v } };
}

/** 선택 칸 체크(checked = 프롬프트에 넣음). 틀의 기본과 같아지면 기록을 지운다. */
export function setChecked(store, blank, checked) {
  const off = { ...store.fill.off };
  if (checked === blank.on) delete off[blank.key];
  else off[blank.key] = !checked;
  return { ...store, fill: { ...store.fill, off } };
}

/** 「기본값으로」 단추를 보일까 — 칸 값·끈 칸·옵션(길이를 직접 정한 것 포함)이 기본과 다를 때. 언어·소리·표 포함은 보지 않는다. */
export function isDirty(store, blankList, defaults = DEF) {
  const { v, off } = store.fill;
  const blankDirty = blankList.some((b) => (v[b.key] != null && v[b.key] !== b.def) || (b.opt && off[b.key] != null && !!off[b.key] === b.on));
  const optDirty = Object.keys(defaults).some((k) => store.opt[k] !== defaults[k]);
  return blankDirty || optDirty || !!store.lenOwn;
}

export function resetStore(store) {
  return { ...store, fill: { v: {}, off: {} }, opt: state(null), lenOwn: false };
}

/**
 * 한 편·한 언어의 편집 화면 모델 — 미리보기(rows + val)와 복사 글자(finalPrompt)를 같은 입력으로 만든다.
 * prompt = { en, ko, shots, cues }, item = 목록 항목(secs).
 * 돌려주는 것: v2 · twoWay(방식 고르기 있음) · st · emptyMode · blanks(지금 언어, 열쇠·이름표 붙음) · rows · offs(실제로 끈 칸, 이름별) ·
 *   val(이름 → 넣을 글) · values/off(finalPrompt 에 넘긴 값) · copyText · total/used(세부 설정 칸 수).
 */
export function promptModel({ prompt, store, item, lang }) {
  const v2 = isV2(prompt.en);
  const twoWay = hasStyle(prompt.en);
  // 두 판이 없는 편은 늘 「예시 그대로」(오빠두 stOf)
  const st = state({ ...store.opt, style: twoWay ? store.opt.style : 'a', len: effectiveLen(store, item) });
  const emptyMode = v2 && st.style === 'b';
  const bl = pairBlanks(blanks(prompt.en, st), blanks(prompt.ko, st), lang);

  const by = {}, offs = {}, values = {}, off = {};
  let total = 0, used = 0;
  for (const b of bl) {
    by[b.name] = b;
    const u = store.fill.v[b.key];
    if (u != null) values[b.name] = u;
    if (b.opt && store.fill.off[b.key] != null) off[b.name] = !!store.fill.off[b.key];
    if (isOff(store, b) || (emptyMode && b.opt && !valueOf(store, b, emptyMode))) offs[b.name] = true;
    if (!MAIN_KEYS.includes(b.label)) { total++; if (!isOff(store, b)) used++; }
  }
  if (v2) { total += 3; used += (st.logo ? 1 : 0) + (st.sound ? 1 : 0) + (st.sound && st.music ? 1 : 0); }

  const val = (name) => (offs[name] ? '' : (by[name] ? valueOf(store, by[name], emptyMode) : '') || `[${name}]`);
  const rs = rows(prompt[lang], { st, off: offs, L: MOTION_OPTS[lang], lang });
  const copyText = finalPrompt({ tpl: prompt[lang], st, values, off, lang, withTables: store.withTables, tables: prompt });

  return { v2, twoWay, st, emptyMode, blanks: bl, by, rows: rs, offs, val, values, off, copyText, total, used, long: st.len > LEN.long };
}
