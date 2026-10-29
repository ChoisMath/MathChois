// 오빠두 브랜드 룩북(목록 페이지·브랜드 상세 틀)을 우리 사본(`ai-hub/brand/`)으로 옮길 때 HTML·CSS 를 고치는 순수 함수.
// 사본 빌더(`scripts/ai-hub/oppadu/brand-build.ts`)가 쓰고, 규칙은 `aiHubBrandLocalize.test.js` 가 픽스처로 지킨다.
//
// 남기는 것(keep list)은 `BRAND_ASSETS` 의 자산과 아래 인라인 블록뿐이다. 그 밖의 `<script>`·스타일시트·광고·분석·채팅·알림은
// 모두 뺀다 — 허용 목록 방식이라 오빠두가 새 스크립트를 붙여도 사본에는 들어오지 않는다. 사본이 깨지면 원인 파일을
// `BRAND_ASSETS`(서버 허용 경로도 같이 넓어진다)나 아래 id 목록에 더한다.
import { BRAND_ASSETS } from './paths.js';

export const BRAND_PAGE_URL = 'https://www.oppadu.com/ai/design-systems-site/';
export const BRAND_BASE_URL = 'https://www.oppadu.com/tools/design-systems-site/';

const SITE_ORIGIN = 'https://www.oppadu.com';
const SITE_HOST = 'www.oppadu.com';
const FONT_FILE = 'PretendardVariable.woff2';
const FONT_ASSET = `assets/fonts/${FONT_FILE}`;
/** 상세 틀의 상대 주소(`../assets/…`)를 풀 기준 — 어느 slug 든 같은 폴더다. */
const DETAIL_PAGE_URL = `${BRAND_BASE_URL}brand/_.html`;
/** 목록·상세에서 사본으로 돌려 보낼 오빠두 갤러리 주소(경로 부분). */
const GALLERY_PATH = '/ai/design-systems-site/';

/** 인라인 `<script id>` — 룩북 설정(OPD_DSG)과 색 탭·찾기 이름표(OPD_PCFRS_NM). `script[data-otl-help-data]` 도 남긴다. */
const KEEP_INLINE_SCRIPTS = ['oppadu-dsg-js-before', 'oppadu-pcf-resources-js-before'];
/** 인라인 `<style id>` — Pretendard 글꼴 선언(오빠두는 이 글꼴을 CSS 파일이 아니라 여기서 선언한다). */
const KEEP_INLINE_STYLES = ['pretendard-face'];

/** 페이지에서 받아 오는 자산(`assets/*`) — 주소의 마지막 경로 조각(파일 이름)으로 찾는다. */
const PAGE_ASSETS = BRAND_ASSETS.filter((a) => a.startsWith('assets/'));
const ASSET_BY_NAME = new Map(PAGE_ASSETS.map((a) => [a.slice(a.lastIndexOf('/') + 1), a]));

type Page = 'index' | 'detail';

const SCRIPT_RE = /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi;
const COMMENT_RE = /<!--[\s\S]*?-->/g;
const HOLE = (i: number) => `\u0000S${i}\u0000`;
const HOLE_RE = /\u0000S(\d+)\u0000/g;

/** 여는 태그의 속성. 이름은 소문자, 값 없는 속성은 ''. `&amp;`·`&#038;` 은 풀어 둔다(주소 비교용). */
function attrsOf(tag: string): Record<string, string> {
  const open = tag.slice(0, tag.indexOf('>') + 1).replace(/^<[a-z]+/i, '').replace(/\/?>$/, '');
  const out: Record<string, string> = {};
  for (const m of open.matchAll(/([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    const name = (m[1] ?? '').toLowerCase();
    if (!(name in out)) out[name] = (m[2] ?? m[3] ?? m[4] ?? '').replace(/&amp;|&#0*38;/g, '&');
  }
  return out;
}

/** 다시 쓰는 속성 값(id·media)용. */
const attr = (name: string, value: string | undefined) => (value ? ` ${name}="${value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"` : '');
const classTokens = (attrs: Record<string, string>) => (attrs.class ?? '').split(/\s+/).filter(Boolean);

/** 오빠두 쪽 주소 → 사본 자산 경로(`assets/…`). keep list 밖이거나 다른 호스트면 null. */
function assetOf(url: string, base: string): string | null {
  let u: URL;
  try {
    u = new URL(url, base);
  } catch {
    return null;
  }
  if (u.hostname !== SITE_HOST) return null;
  return ASSET_BY_NAME.get(u.pathname.slice(u.pathname.lastIndexOf('/') + 1)) ?? null;
}

/** CSS 안의 Pretendard 글꼴 주소(절대·루트 상대, 쿼리 포함)를 `to` 로 바꾼다. */
function localizeFontUrls(css: string, to: string): string {
  return css.replace(
    /url\(\s*(["']?)(?:https?:\/\/[^/"')\s]+)?\/[^"')\s]*\/PretendardVariable\.woff2(?:\?[^"')\s]*)?\1\s*\)/g,
    (_m, q: string) => `url(${q}${to}${q})`,
  );
}

/** 사본의 `assets/*.css` 용 — 글꼴은 같은 폴더 밑 `fonts/` 에 있다. */
export function localizeBrandCss(css: string): string {
  return localizeFontUrls(css, `fonts/${FONT_FILE}`);
}

/**
 * 목록 페이지가 실제로 읽는 자산 주소(`ver` 쿼리 포함) — 키는 `BRAND_ASSETS` 의 `assets/*` 전부.
 * 하나라도 페이지에서 찾지 못하거나 같은 이름이 서로 다른 주소로 두 번 나오면 던진다(사본을 만들 수 없다).
 */
export function brandAssetUrls(indexHtml: string): Record<string, string> {
  const { text, scripts } = maskScripts(indexHtml);
  const html = text.replace(COMMENT_RE, '');
  const found: Record<string, string> = {};
  const conflicts: string[] = [];
  const add = (url: string) => {
    const asset = assetOf(url, BRAND_PAGE_URL);
    if (!asset) return;
    const abs = new URL(url, BRAND_PAGE_URL).href;
    const prev = found[asset];
    if (prev && prev !== abs) conflicts.push(`${asset}: ${prev} / ${abs}`);
    else found[asset] = abs;
  };
  for (const m of html.matchAll(HOLE_RE)) {
    const src = attrsOf(scripts[Number(m[1])] ?? '').src;
    if (src) add(src);
  }
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const a = attrsOf(tag);
    if (a.href && /\b(?:stylesheet|preload)\b/i.test(a.rel ?? '')) add(a.href);
  }
  for (const m of html.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/g)) add(m[1] ?? '');
  if (conflicts.length) throw new Error(`brand page links an asset name twice:\n  ${conflicts.join('\n  ')}`);
  const missing = PAGE_ASSETS.filter((a) => !found[a]);
  if (missing.length) throw new Error(`brand page ${BRAND_PAGE_URL} no longer links: ${missing.join(', ')}`);
  return Object.fromEntries(PAGE_ASSETS.map((a) => [a, found[a] as string]));
}

/** `<script>` 블록을 자리표(HOLE)로 바꿔 둔다 — 스크립트 안의 `<!--`·`<div` 문자열이 주석 제거·깊이 세기를 흐리지 않게. */
function maskScripts(html: string): { text: string; scripts: string[] } {
  const scripts: string[] = [];
  const text = html.replace(SCRIPT_RE, (m) => HOLE(scripts.push(m) - 1));
  return { text, scripts };
}

/**
 * keep list 에 있는 `<script>` 를 사본용으로 바꾼다. 남기지 않을 것이면 null.
 * 외부 스크립트는 keep list 자산이면 사본 경로로, 인라인은 정해 둔 id 와 도움말 데이터만.
 */
function keepScript(block: string, prefix: string, base: string): string | null {
  const a = attrsOf(block);
  if (a.src !== undefined) {
    const asset = assetOf(a.src, base);
    if (!asset || !asset.endsWith('.js')) return null;
    const extra = ['defer', 'async'].filter((k) => k in a).map((k) => ` ${k}`).join('');
    return `<script${attr('id', a.id)} src="${prefix}${asset}"${extra}></script>`;
  }
  if ('data-otl-help-data' in a) return block;
  if (a.id && KEEP_INLINE_SCRIPTS.includes(a.id)) return a.id === 'oppadu-dsg-js-before' ? localizeDsgConfig(block) : block;
  return null;
}

/** 룩북 설정: 자료 기준 주소를 사본 기준 상대 경로로, 회원 잠금을 연다(잠금은 화면만이고 자료는 공개 JSON). */
function localizeDsgConfig(block: string): string {
  const STR = /"base"\s*:\s*"(?:[^"\\]|\\.)*"/;
  if (!STR.test(block)) throw new Error('OPD_DSG has no "base" — the lookbook config changed');
  let out = block.replace(STR, '"base":"./"');
  out = /"member"\s*:\s*(?:true|false)/.test(out)
    ? out.replace(/"member"\s*:\s*(?:true|false)/, '"member":true')
    : out.replace(/"base":"\.\/"/, '"base":"./","member":true');
  return out;
}

/** `<link>`·`<style>` 하나를 사본용으로(남기지 않으면 ''). */
function keepHeadTag(tag: string, prefix: string, base: string): string {
  const a = attrsOf(tag);
  if (/^<style/i.test(tag)) {
    return a.id && KEEP_INLINE_STYLES.includes(a.id) ? localizeFontUrls(tag, `${prefix}${FONT_ASSET}`) : '';
  }
  const asset = a.href ? assetOf(a.href, base) : null;
  if (!asset) return '';
  const rel = (a.rel ?? '').toLowerCase();
  if (asset.endsWith('.css') && /\bstylesheet\b/.test(rel)) {
    return `<link rel="stylesheet"${attr('id', a.id)} href="${prefix}${asset}"${attr('media', a.media)}>`;
  }
  if (asset === FONT_ASSET && /\bpreload\b/.test(rel)) return `<link rel="preload" as="font" type="font/woff2" crossorigin href="${prefix}${asset}">`;
  return '';
}

const HEAD_TAG_RE = /<link\b[^>]*>|<style\b[^>]*>[\s\S]*?<\/style\s*>/gi;

/** 여는 태그가 `pred` 를 만족하는 첫 `<tag>` 요소의 [시작, 끝) — 같은 태그의 여닫기 깊이를 센다. */
function findElement(html: string, tag: string, pred: (attrs: Record<string, string>) => boolean, from = 0): [number, number] | null {
  const open = new RegExp(`<${tag}\\b[^>]*>`, 'gi');
  open.lastIndex = from;
  let m: RegExpExecArray | null;
  while ((m = open.exec(html))) {
    if (!pred(attrsOf(m[0]))) continue;
    const re = new RegExp(`<${tag}\\b|</${tag}\\s*>`, 'gi');
    re.lastIndex = m.index;
    let depth = 0;
    let t: RegExpExecArray | null;
    while ((t = re.exec(html))) {
      depth += t[0][1] === '/' ? -1 : 1;
      if (depth === 0) return [m.index, t.index + t[0].length];
    }
    return null; // 닫히지 않음
  }
  return null;
}

function removeElements(html: string, tag: string, pred: (attrs: Record<string, string>) => boolean): string {
  let out = html;
  for (let at = findElement(out, tag, pred); at; at = findElement(out, tag, pred, at[0])) out = out.slice(0, at[0]) + out.slice(at[1]);
  return out;
}

/**
 * 본문의 사이트 주소: 오빠두 갤러리(`/ai/design-systems-site/…`)는 사본 목록으로, 상세의 「전체 브랜드」(`./`)도 목록으로,
 * 그 밖의 루트 상대 주소(`/…`)는 오빠두 절대 주소로 — 사본을 서빙하는 우리 origin 에는 그 경로가 없다.
 */
function rewriteSiteLinks(html: string, page: Page, prefix: string): string {
  const toIndex = `${prefix}index.html`;
  return html.replace(/(\s(?:href|src|action)\s*=\s*)(["'])(.*?)\2/gi, (m, lead: string, q: string, url: string) => {
    let next = url;
    const abs = url.startsWith(SITE_ORIGIN + '/') ? url.slice(SITE_ORIGIN.length) : url;
    if (abs === GALLERY_PATH || abs.startsWith(GALLERY_PATH + '#') || abs.startsWith(GALLERY_PATH + '?')) next = toIndex + abs.slice(GALLERY_PATH.length);
    else if (page === 'detail' && url === './') next = toIndex;
    else if (/^\/(?!\/)/.test(url)) next = SITE_ORIGIN + url;
    return next === url ? m : `${lead}${q}${next}${q}`;
  });
}

/**
 * 오빠두 페이지 → 사본 페이지. `index` 는 목록(사본 루트의 index.html), `detail` 은 브랜드 상세 틀(`brand/<slug>.html`).
 * - `<head>`: charset·viewport·title 과 keep list 의 스타일시트·글꼴·인라인 블록만.
 * - 목록의 `<body>` 는 허브 틀 `div.aih` 하나만(사이트 머리글 `pcf-*`·푸터·모바일 메뉴·알림 창 제외). 상세는 본문 그대로.
 * - 본문의 `<script>` 는 모두 빼고, keep list 의 것만 원래 순서대로 본문 끝에 둔다(도움말 데이터가 맨 앞).
 * - 광고 칸(`ins`, `div.oa-ad`)은 지운다.
 */
export function localizeBrandHtml(html: string, page: Page): string {
  const prefix = page === 'index' ? '' : '../';
  const base = page === 'index' ? BRAND_PAGE_URL : DETAIL_PAGE_URL;
  const { text, scripts } = maskScripts(html);
  const doc = text.replace(COMMENT_RE, '');

  const headOpen = /<head\b[^>]*>/i.exec(doc);
  const headEnd = doc.search(/<\/head\s*>/i);
  const bodyOpen = /<body\b[^>]*>/i.exec(doc);
  const bodyEnd = doc.search(/<\/body\s*>/i);
  if (!headOpen || headEnd < 0 || !bodyOpen || bodyEnd < 0) throw new Error(`brand ${page} page: <head>/<body> not found`);
  const head = doc.slice(headOpen.index + headOpen[0].length, headEnd);
  const body = doc.slice(bodyOpen.index + bodyOpen[0].length, bodyEnd);

  const headOut: string[] = [];
  const charset = /<meta\s+charset\b[^>]*>/i.exec(head);
  const viewport = /<meta\s+name\s*=\s*["']viewport["'][^>]*>/i.exec(head);
  const title = /<title\b[^>]*>[\s\S]*?<\/title\s*>/i.exec(head);
  for (const m of [charset, viewport, title]) if (m) headOut.push(m[0]);
  const headTagRe = new RegExp(`${HEAD_TAG_RE.source}|${HOLE_RE.source}`, 'gi');
  for (const m of head.matchAll(headTagRe)) {
    const kept = m[1] !== undefined ? keepScript(scripts[Number(m[1])] ?? '', prefix, base) : keepHeadTag(m[0], prefix, base);
    if (kept) headOut.push(kept);
  }

  // 본문 스크립트: 모두 빼고, 남길 것만 순서대로 모아 끝에 둔다.
  let helpData = '';
  const tail: string[] = [];
  for (const m of body.matchAll(HOLE_RE)) {
    const block = scripts[Number(m[1])] ?? '';
    const kept = keepScript(block, prefix, base);
    if (!kept) continue;
    if ('data-otl-help-data' in attrsOf(block)) helpData ||= kept;
    else tail.push(kept);
  }
  const all = [...headOut, ...tail].join('\n');
  if (page === 'index' && !all.includes('id="oppadu-dsg-js-before"')) throw new Error('brand index page: <script id="oppadu-dsg-js-before"> (window.OPD_DSG) not found');
  // 같은 자산이 두 번 나오면 한 번만(오빠두 쪽 중복 등록 대비) — id 가 달라도 같은 파일이면 같은 것으로 본다.
  const seen = new Set<string>();
  const once = (s: string) => {
    const key = s.replace(/\sid="[^"]*"/, '');
    return seen.has(key) ? false : (seen.add(key), true);
  };

  let main = body.replace(HOLE_RE, '');
  if (page === 'index') {
    const at = findElement(main, 'div', (a) => classTokens(a).includes('aih'));
    if (!at) throw new Error('brand index page: hub shell div.aih not found');
    main = main.slice(at[0], at[1]);
  }
  main = main.replace(/<ins\b[^>]*>[\s\S]*?<\/ins\s*>/gi, '');
  main = removeElements(main, 'div', (a) => classTokens(a).includes('oa-ad'));
  main = main.replace(HEAD_TAG_RE, (tag) => keepHeadTag(tag, prefix, base));
  main = rewriteSiteLinks(main, page, prefix);

  const htmlOpen = /<html\b[^>]*>/i.exec(doc)?.[0] ?? '<html lang="ko">';
  return [
    '<!doctype html>',
    htmlOpen,
    '<head>',
    ...headOut.filter(once),
    '</head>',
    bodyOpen[0],
    main.trim(),
    ...(helpData ? [helpData] : []),
    ...tail.filter(once),
    '</body>',
    '</html>',
    '',
  ].join('\n');
}
