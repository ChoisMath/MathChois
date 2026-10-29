import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  BRAND_ASSETS, BRAND_BASE_URL, BRAND_PAGE_URL, brandAssetUrls, localizeBrandHtml, localizeBrandCss, isAiHubFile,
} from '@mathchois/shared';

const fixture = (name) => readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8');
const index = fixture('oppadu-brand-index.html');
const detail = fixture('oppadu-brand-detail.html');

/** `<script id="…">…</script>` 블록 본문. */
const inlineScript = (html, id) => {
  const m = html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`));
  return m ? m[1] : null;
};

describe('brand urls', () => {
  it('constants point at the oppadu lookbook', () => {
    expect(BRAND_PAGE_URL).toBe('https://www.oppadu.com/ai/design-systems-site/');
    expect(BRAND_BASE_URL).toBe('https://www.oppadu.com/tools/design-systems-site/');
  });
});

describe('brandAssetUrls', () => {
  const urls = brandAssetUrls(index);
  it('maps every assets/* entry of BRAND_ASSETS to a real url', () => {
    expect(Object.keys(urls).sort()).toEqual(BRAND_ASSETS.filter((a) => a.startsWith('assets/')).sort());
    expect(urls['assets/app.js']).toMatch(/^https:\/\/www\.oppadu\.com\/.*\/tools\/design-systems-site\/assets\/app\.js\?ver=\d+$/);
    expect(urls['assets/pcf-ui.css']).toMatch(/\/css\/pcf-ui\.css\?ver=\d+$/);
    expect(urls['assets/base.css']).toMatch(/\/themes\/oppadu\/css\/base\.css\?ver=\d+$/);
    expect(urls['assets/shell.js']).toMatch(/\/shell\/assets\/shell\.js\?ver=/);
    expect(urls['assets/fonts/PretendardVariable.woff2']).toBe('https://www.oppadu.com/wp-content/themes/generatepress_child/fonts/PretendardVariable.woff2');
  });
  it('throws naming the asset when the page no longer links it', () => {
    const without = index.replace(/<script id="oppadu-pcf-resources-js" [^>]*><\/script>/, '');
    expect(() => brandAssetUrls(without)).toThrow(/assets\/pcf-resources\.js/);
  });
});

describe('localizeBrandHtml index', () => {
  const out = localizeBrandHtml(index, 'index');
  it('drops ads, analytics, chat, the site frame scripts and jQuery', () => {
    for (const s of ['adsbygoogle', 'googletagmanager', 'chat.js', 'pcf.js', 'jquery', 'gtag(', 'oppadu-ads-css', 'base-dynamic.css', 'style.css', 'pcf-rails']) expect(out).not.toContain(s);
  });
  it('points kept assets at the local copy', () => {
    for (const s of ['src="assets/app.js"', 'src="assets/pcf-resources.js"', 'src="assets/shell.js"', 'src="assets/ai-hub-static.js"',
      'href="assets/pcf-ui.css"', 'href="assets/pcf-resources.css"', 'href="assets/app.css"', 'href="assets/ai-hub.css"', 'href="assets/shell.css"', 'href="assets/tokens.css"', 'href="assets/base.css"',
      "url('assets/fonts/PretendardVariable.woff2')"]) expect(out).toContain(s);
    expect(out).not.toMatch(/\?ver=/);
  });
  it('keeps app.js after its config and pcf-resources.js after its names', () => {
    expect(out.indexOf('id="oppadu-dsg-js-before"')).toBeLessThan(out.indexOf('src="assets/app.js"'));
    expect(out.indexOf('id="oppadu-pcf-resources-js-before"')).toBeLessThan(out.indexOf('src="assets/pcf-resources.js"'));
  });
  it('rewrites OPD_DSG to the copy (relative base, member)', () => {
    const cfg = inlineScript(out, 'oppadu-dsg-js-before');
    expect(cfg).toContain('"base":"./"');
    expect(cfg).toContain('"member":true');
    expect(cfg).toContain('"paged":true');
    expect(inlineScript(out, 'oppadu-pcf-resources-js-before')).toContain('"brands":"브랜드 디자인"');
  });
  it('keeps only the hub shell div.aih as the body, help data at the end', () => {
    expect(out).not.toContain('pcf-r1');
    expect(out).not.toContain('pcf-rail');
    expect(out).toContain('class="aih aihx"');
    for (const s of ['aih-side', 'aih-main', 'aih-mnav', 'aihx-crumb', 'pcfrs-dsg-bar', 'pcf-listq', 'id="grid"']) expect(out).toContain(s);
    expect(out).toContain('data-otl-help-data');
    expect(out.indexOf('data-otl-help-data')).toBeGreaterThan(out.indexOf('id="grid"'));
    expect(out).toContain('data-view="index"');
    expect(out.match(/<\/body>/g)).toHaveLength(1);
  });
  it('drops event handlers, embedded frames and javascript: urls from kept markup', () => {
    const evil = index
      .replace(/<body /, '<body onload="x()" ')
      .replace('<main class="otl-body">', `<main class="otl-body"><img src="x" alt="keep-img" onerror="alert(1)"><iframe src="https://x.example/ad"><p>in-frame</p></iframe>`
        + `<a href="javascript:alert(1)" class="keep-a">a</a><a href=' JaVaScRiPt:alert(2)' class="keep-b">b</a><a href="&#106;avascript:alert(3)" class="keep-c">c</a><a href="&#99999999;x" class="keep-e">e</a>`
        + `<div class="keep-div" title="a>b" ONCLICK='alert(4)' onmouseover=alert(5)>d</div><object data="x.swf"><embed src="x.swf"></object><embed src="y.swf">`
        + `<noscript><img src="https://x.example/pixel.gif"></noscript><frameset><frame src="https://x.example/f"></frameset>`);
    const out = localizeBrandHtml(evil, 'index');
    for (const s of ['onload', 'onerror', 'onclick', 'onmouseover', 'alert(', '<iframe', 'in-frame', 'x.example', '<object', '<embed', 'x.swf', 'y.swf', '<noscript', '<frame', 'javascript:']) expect(out.toLowerCase()).not.toContain(s.toLowerCase());
    for (const s of ['alt="keep-img"', 'class="keep-a"', 'class="keep-b"', 'class="keep-c"', 'href="&#99999999;x" class="keep-e"', 'class="keep-div"', 'title="a>b"', '>d</div>', 'data-view="index"', 'id="grid"']) expect(out).toContain(s);
    // 스크립트 내용(설정 블록)은 건드리지 않는다.
    expect(out).toContain('"base":"./"');
  });
  it('drops handlers and script urls separated by a quote or a slash instead of a space', () => {
    const body = `<img src="x"onerror="alert(1)" alt="k1"><img/onerror=alert(2) alt="k2"><a title="x"href="javascript:alert(4)" class="k4">a</a>`
      + `<a/href="javascript:alert(5)" class="k5">a</a><img src='y'ONLOAD='alert(6)'/>`;
    for (const open of ['<body/onload=alert(1) data-view="index">', '<body class="a"onload=alert(1) data-view="index">']) {
      const evil = index.replace(/<body [^>]*>/, open).replace('<main class="otl-body">', `<main class="otl-body">${body}`);
      const out = localizeBrandHtml(evil, 'index');
      expect(out.toLowerCase()).not.toMatch(/onerror|onload|alert\(|javascript:/);
      for (const s of ['alt="k1"', 'alt="k2"', 'class="k4"', 'class="k5"', "src='y'", 'data-view="index"']) expect(out).toContain(s);
    }
  });
  it('leaves attribute values that merely contain on…= or href= byte-identical', () => {
    const values = `<div title="turn once=1 online=2 on=3" data-x='{"a":"b onfoo=1"}' data-y="see href=javascript:x" class="kv">v</div>`;
    const out = localizeBrandHtml(index.replace('<main class="otl-body">', `<main class="otl-body">${values}`), 'index');
    expect(out).toContain(values);
  });
  it('keeps help data only as JSON', () => {
    const asJs = index.replace('<script type="application/json" data-otl-help-data>', '<script data-otl-help-data>alert(1);');
    expect(localizeBrandHtml(asJs, 'index')).not.toContain('data-otl-help-data');
    const asModule = index.replace('<script type="application/json" data-otl-help-data>', '<script type="module" data-otl-help-data>');
    expect(localizeBrandHtml(asModule, 'index')).not.toContain('data-otl-help-data');
    const upper = index.replace('<script type="application/json" data-otl-help-data>', '<script type="Application/JSON" data-otl-help-data>');
    expect(localizeBrandHtml(upper, 'index')).toContain('data-otl-help-data');
  });
  it('drops scripts it does not know', () => {
    const extra = index.replace('</head>', '<script src="https://x.example/new.js"></script>\n</head>')
      .replace('<main class="otl-body">', '<main class="otl-body"><script src="https://x.example/in-body.js"></script><script>window.y=1</script>');
    const res = localizeBrandHtml(extra, 'index');
    expect(res).not.toContain('x.example');
    expect(res).not.toContain('window.y');
  });
  it('throws when the hub shell or the lookbook config is missing', () => {
    expect(() => localizeBrandHtml(index.replace('class="aih aihx"', 'class="other"'), 'index')).toThrow(/div\.aih/);
    expect(() => localizeBrandHtml(index.replace(/<script id="oppadu-dsg-js-before">[\s\S]*?<\/script>/, ''), 'index')).toThrow(/OPD_DSG/);
  });
});

describe('localizeBrandHtml detail', () => {
  const out = localizeBrandHtml(detail, 'detail');
  it('drops event handlers, frames and javascript: urls on detail pages too', () => {
    const evil = detail.replace('<body ', '<body onload="x()" ')
      .replace('<h2>Sources</h2>', '<h2 onclick="alert(1)">Sources</h2><iframe src="https://x.example/f"></iframe><a href="javascript:alert(2)">j</a>');
    const res = localizeBrandHtml(evil, 'detail');
    for (const s of ['onload', 'onclick', 'alert(', '<iframe', 'x.example', 'javascript:']) expect(res).not.toContain(s);
    expect(res).toContain('<h2>Sources</h2>');
    expect(res).toContain('>j</a>');
    expect(res).toContain('data-view="detail"');
  });
  it('drops quote- or slash-separated handlers on detail pages too', () => {
    const evil = detail.replace('<body ', '<body/onload=alert(1) ')
      .replace('<h2>Sources</h2>', '<h2 class="s"onclick="alert(2)">Sources</h2><a/href="javascript:alert(3)">j</a><img src="z"onerror=alert(4)>');
    const res = localizeBrandHtml(evil, 'detail');
    expect(res.toLowerCase()).not.toMatch(/onload|onclick|onerror|alert\(|javascript:/);
    for (const s of ['<h2 class="s">Sources</h2>', '>j</a>', 'src="z"', 'data-view="detail"']) expect(res).toContain(s);
  });
  it('points the shell and app assets one level up', () => {
    expect(out).toContain('href="../assets/shell.css"');
    expect(out).toContain('src="../assets/shell.js"');
    expect(out).toContain('href="../assets/app.css"');
    expect(out).not.toContain('/wp-content/');
    expect(out).not.toContain('?ver=');
  });
  it('drops the hit counter and the json-ld, keeps the document', () => {
    expect(out).not.toContain('wp-json');
    expect(out).not.toContain('ld+json');
    expect(out).toContain('11st (십일번가)');
    expect(out).toContain('data-view="detail"');
  });
  it('links back to the copied gallery, other site paths go to oppadu', () => {
    expect(out).toContain('href="../index.html#/11st"');
    expect(out).toContain('href="../index.html">디자인 시스템 갤러리');
    expect(out).toContain('href="../index.html">전체 브랜드');
    expect(out).toContain('href="https://www.11st.co.kr/"');
  });
});

describe('localizeBrandCss', () => {
  it('points the font at the copy', () => {
    expect(localizeBrandCss("url('https://www.oppadu.com/wp-content/themes/generatepress_child/fonts/PretendardVariable.woff2')")).toBe("url('fonts/PretendardVariable.woff2')");
    expect(localizeBrandCss('src:url("/wp-content/themes/generatepress_child/fonts/PretendardVariable.woff2?v=2") format("woff2")')).toBe('src:url("fonts/PretendardVariable.woff2") format("woff2")');
  });
  it('leaves other urls alone', () => {
    const css = `a{background:url("data:image/svg+xml,%3Csvg%3E")}`;
    expect(localizeBrandCss(css)).toBe(css);
  });
});

describe('BRAND_ASSETS', () => {
  it('every asset is an allowed brand file', () => expect(BRAND_ASSETS.every((a) => isAiHubFile('brand/' + a))).toBe(true));
});
