import { describe, it, expect } from 'vitest';
import { checkMotionBundle, motionUpstream, mergeMotion, checkSlideBundle, mergeSlide, diffBrandIndex } from '@mathchois/shared';

const table = [['0.0–1.0', '장면', '이유']];
const cues = [['0.000', 'kick', 'hit']];
const V2 = (id) => ({ en: `## 1. Intro ${id}\n{{#a}}LINE\n{{#b}}TOPIC {{Topic=}}`, ko: `## 1. 소개 ${id}\n{{#a}}줄\n{{#b}}주제 {{Topic=}}` });
const full = (id) => ({ prompt: 'old', ko: 'old', v2: V2(id), shots: table, cues });
const up = (id, no, extra = {}) => ({ id, no: String(no), g: '포스터·인쇄', name: `이름 ${id}`, use: '홍보', en: 'Poster', concept: '컨셉', ...extra });

const catalog = [
  { id: '01-x', no: 1, group: '게임·만화', name: '내 판', en: 'X', use: 'u', concept: 'c', featured: true, source: 'chois' },
  { id: '51-a', no: 51, group: '포스터·인쇄', name: '옛 이름', en: 'Poster', use: '홍보', concept: '컨셉', featured: true, source: 'oppadu' },
  { id: '52-gone', no: 52, group: '포스터·인쇄', name: '사라짐', en: 'G', use: 'u', concept: 'c', featured: false, source: 'oppadu' },
];

const bundle = (over = {}) => {
  const items = [up('01-x', 1, { g: '게임·만화', name: '오빠두 쪽 이름' }), up('51-a', 51, { secs: 15 }), up('53-new', 53)];
  return {
    kind: 'oppadu-motion', fetchedAt: '2026-10-29T00:00:00Z', page: 'https://www.oppadu.com/ai/motion-styles/',
    config: { a: 'https://cdn.example/', mv: '7', data: 'https://cdn.example/gallery-data.js', member: true, add: [] },
    gallery: { items },
    full: { items: Object.fromEntries(items.map((i) => [i.id, full(i.id)])) },
    ...over,
  };
};

describe('checkMotionBundle', () => {
  it('accepts a complete member bundle', () => {
    const r = checkMotionBundle(bundle());
    expect(r.ok).toBe(true);
    expect(r.bundle.gallery.items).toHaveLength(3);
  });
  it('rejects another kind and non-objects', () => {
    expect(checkMotionBundle({ ...bundle(), kind: 'oppadu-slide' }).ok).toBe(false);
    expect(checkMotionBundle(null).ok).toBe(false);
    expect(checkMotionBundle('x').ok).toBe(false);
  });
  it('rejects a bundle fetched without membership', () => {
    const b = bundle();
    b.config.member = false;
    expect(checkMotionBundle(b)).toEqual({ ok: false, error: '로그인·멤버십 확인 — 회원 전문을 받지 못했습니다' });
  });
  it('names the ids whose v2 template is missing', () => {
    const b = bundle();
    delete b.full.items['51-a'].v2;
    expect(checkMotionBundle(b)).toEqual({ ok: false, error: '1편의 전문이 없습니다 — 로그인·멤버십 확인 (51-a)' });
    delete b.full.items['53-new'];
    expect(checkMotionBundle(b)).toEqual({ ok: false, error: '2편의 전문이 없습니다 — 로그인·멤버십 확인 (51-a, 53-new)' });
  });
  it('treats shots/cues that are not 3-column tables the same way', () => {
    const b = bundle();
    b.full.items['51-a'].shots = [['a', 'b']];
    expect(checkMotionBundle(b)).toEqual({ ok: false, error: '1편의 전문이 없습니다 — 로그인·멤버십 확인 (51-a)' });
    const c = bundle();
    c.full.items['53-new'].cues = 'x';
    expect(checkMotionBundle(c).error).toBe('1편의 전문이 없습니다 — 로그인·멤버십 확인 (53-new)');
  });
  it('treats an empty (after trim) v2 template as missing, so it cannot overwrite a working prompt', () => {
    const b = bundle();
    b.full.items['51-a'].v2.en = '  \n ';
    expect(checkMotionBundle(b)).toEqual({ ok: false, error: '1편의 전문이 없습니다 — 로그인·멤버십 확인 (51-a)' });
    const c = bundle();
    c.full.items['53-new'].v2.ko = '';
    expect(checkMotionBundle(c).error).toBe('1편의 전문이 없습니다 — 로그인·멤버십 확인 (53-new)');
  });
  it('caps the id list in the missing-template message', () => {
    const b = bundle();
    for (let n = 60; n < 75; n++) { b.gallery.items.push(up(`${n}-x`, n)); }
    const r = checkMotionBundle(b);
    expect(r.error).toMatch(/^15편의 전문이 없습니다 — 로그인·멤버십 확인 \(.*…외 5\)$/);
  });
  it('reports a malformed list item without throwing', () => {
    const b = bundle();
    b.gallery.items.push({ id: 5 });
    const r = checkMotionBundle(b);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/gallery\.items/);
  });
  it('needs the gallery-data.js address (config.data) as a non-empty string', () => {
    for (const data of [undefined, '', '  ', 5]) {
      const b = bundle();
      b.config.data = data;
      expect(checkMotionBundle(b)).toEqual({ ok: false, error: '묶음 설정이 잘못되었습니다 (config.data)' });
    }
  });
  it('needs the media base (config.a) to end with a slash, since file names are appended to it', () => {
    const b = bundle();
    b.config.a = 'https://cdn.example';
    expect(checkMotionBundle(b)).toEqual({ ok: false, error: '묶음 설정이 잘못되었습니다 (config.a)' });
    const c = bundle();
    c.config.a = '';
    expect(checkMotionBundle(c).error).toBe('묶음 설정이 잘못되었습니다 (config.a)');
  });
});

describe('motionUpstream', () => {
  it('lists gallery.items then add, once per id, at the first position', () => {
    const b = bundle();
    b.config.add = [up('53-new', 53), up('54-tail', 54)];
    expect(motionUpstream(b).map((i) => i.id)).toEqual(['01-x', '51-a', '53-new', '54-tail']);
  });
  it('keeps the first occurrence when the same id repeats', () => {
    const b = bundle();
    b.config.add = [up('51-a', 51, { name: '뒤쪽' })];
    const hit = motionUpstream(b).find((i) => i.id === '51-a');
    expect(hit.name).toBe('이름 51-a');
  });
});

describe('mergeMotion', () => {
  const r = mergeMotion(catalog, bundle());

  it('orders remakes, then upstream originals, then vanished originals', () => {
    expect(r.list.map((i) => i.id)).toEqual(['01-x', '51-a', '53-new', '52-gone']);
  });
  it('never touches a remake', () => {
    expect(r.list[0]).toEqual(catalog[0]);
    expect(r.report.keptRemake).toBe(1);
    expect(r.prompts.map((p) => p.id)).not.toContain('01-x');
    expect(r.media.some((m) => m.rel.includes('01-x'))).toBe(false);
  });
  it('updates changed fields of an original and reports their names in the fixed order', () => {
    const a = r.list[1];
    expect(a).toMatchObject({ id: '51-a', name: '이름 51-a', secs: 15, featured: true, source: 'oppadu' });
    expect(r.report.updated['51-a']).toEqual(['name', 'secs']);
  });
  it('adds a new original with oppadu source, not featured and numeric no', () => {
    expect(r.list[2]).toEqual({ id: '53-new', no: 53, group: '포스터·인쇄', name: '이름 53-new', en: 'Poster', use: '홍보', concept: '컨셉', featured: false, source: 'oppadu' });
    expect(r.report.added).toEqual(['53-new']);
  });
  it('keeps vanished originals unchanged and reports them', () => {
    expect(r.list[3]).toEqual(catalog[2]);
    expect(r.report.gone).toEqual(['52-gone']);
    expect(r.report).toEqual({ added: ['53-new'], updated: { '51-a': ['name', 'secs'] }, keptRemake: 1, gone: ['52-gone'] });
  });
  it('does not mutate the input catalog', () => {
    expect(catalog[1].name).toBe('옛 이름');
    expect(catalog[1].secs).toBeUndefined();
  });
  it('stores the v2 template as the prompt with its shot and cue tables', () => {
    expect(r.prompts.map((p) => p.id)).toEqual(['51-a', '53-new']);
    expect(r.prompts[1]).toEqual({ id: '53-new', prompt: V2('53-new').en, ko: V2('53-new').ko, shots: table, cues });
  });
  it('lists three media files per original from the bundle CDN base', () => {
    expect(r.media).toHaveLength(6);
    expect(r.media.filter((m) => m.rel.startsWith('motion/53-new/'))).toEqual([
      { rel: 'motion/53-new/video.mp4', url: 'https://cdn.example/v/53-new.mp4?v=7' },
      { rel: 'motion/53-new/preview.mp4', url: 'https://cdn.example/c/53-new.mp4?v=7' },
      { rel: 'motion/53-new/poster.webp', url: 'https://cdn.example/p/53-new.webp?v=7' },
    ]);
  });
  it('is stable: merging its own result again reports no change', () => {
    const again = mergeMotion(r.list, bundle());
    expect(again.list).toEqual(r.list);
    expect(again.report).toEqual({ added: [], updated: {}, keptRemake: 1, gone: ['52-gone'] });
  });
  it('drops an optional field that upstream no longer has', () => {
    const next = mergeMotion(r.list, bundle()).list;
    const b = bundle();
    b.gallery.items[1] = up('51-a', 51);
    const out = mergeMotion(next, b);
    expect(out.report.updated['51-a']).toEqual(['secs']);
    expect('secs' in out.list[1]).toBe(false);
  });

  it('throws on a group outside the nine known ones', () => {
    const b = bundle();
    b.gallery.items[2] = up('53-new', 53, { g: '우주' });
    expect(() => mergeMotion(catalog, b)).toThrow(/motion sync: unknown group "우주" \(53-new\)/);
  });
  it('throws on an id that cannot be a media path', () => {
    const b = bundle();
    b.gallery.items[2] = up('53_New', 53);
    b.full.items['53_New'] = full('53_New');
    expect(() => mergeMotion(catalog, b)).toThrow(/motion sync: bad id/);
  });
  it('throws when the v2 template is invalid, naming the id', () => {
    const b = bundle();
    b.full.items['53-new'].v2 = { en: '## x\n{{#nope}}y', ko: 'ok' };
    expect(() => mergeMotion(catalog, b)).toThrow(/motion sync: template 53-new/);
  });
  it('throws when the merged catalog is invalid (duplicate no)', () => {
    const b = bundle();
    b.gallery.items[2] = up('53-new', 51);
    expect(() => mergeMotion(catalog, b)).toThrow(/motion sync: .*duplicate motion no/);
  });
  it('throws on a non-numeric no', () => {
    const b = bundle();
    b.gallery.items[2] = up('53-new', 'x');
    expect(() => mergeMotion(catalog, b)).toThrow(/motion sync: bad no/);
  });
});

// ─── 슬라이드 ─────────────────────────────────────────────────────────────

const style = (id, no, extra = {}) => ({
  id, no, family: 'work', name: `스타일 ${id}`, look: '깔끔', use: '보고', slides: 3, cover: 1, body: 2, added: '2026-10-01',
  prompt: `  프롬프트 ${id}\n`, ...extra,
});
const deck = { id: '24', no: 5, family: 'hand', name: '학교 덱', look: '손글씨', use: '수업', topic: '확률', slides: 8, cover: 1, body: 3, added: '2026-09-01', source: 'school' };
const slideCatalog = [
  deck,
  { id: '30', no: 2, family: 'work', name: '스타일 30', look: '옛 look', use: '보고', slides: 3, cover: 1, body: 2, added: '2026-10-01', source: 'oppadu' },
  { id: '99', no: 9, family: 'work', name: '사라짐', look: 'l', use: 'u', slides: 3, cover: 1, body: 2, added: '2026-10-01', source: 'oppadu' },
];
const IMG = 'https://cdn.example/img/';
const slideBundle = (over = {}) => ({
  kind: 'oppadu-slide', fetchedAt: '2026-10-29T00:00:00Z', page: 'https://www.oppadu.com/ai/slide-styles/', img: IMG,
  styles: [style('30', 2, { look: '새 look' }), style('31', 3), style('24', 5, { family: 'hand', slides: 8, name: '오빠두 쪽 이름' })],
  ...over,
});

describe('checkSlideBundle', () => {
  it('accepts a complete bundle (tags and sub optional)', () => {
    const b = slideBundle({ tags: { '30': ['a'] } });
    b.styles[0].sub = '부제';
    const r = checkSlideBundle(b);
    expect(r.ok).toBe(true);
    expect(r.bundle.styles).toHaveLength(3);
  });
  it('rejects another kind and non-objects', () => {
    expect(checkSlideBundle({ ...slideBundle(), kind: 'oppadu-motion' }).ok).toBe(false);
    expect(checkSlideBundle(null).ok).toBe(false);
    expect(checkSlideBundle([]).ok).toBe(false);
  });
  it('names the styles whose prompt is empty (missing, blank or non-string)', () => {
    const b = slideBundle();
    b.styles[0].prompt = '';
    delete b.styles[1].prompt;
    expect(checkSlideBundle(b)).toEqual({ ok: false, error: '2개 스타일의 프롬프트가 없습니다 — 로그인·멤버십 확인 (30, 31)' });
    const c = slideBundle();
    c.styles[2].prompt = '  \n';
    expect(checkSlideBundle(c).error).toBe('1개 스타일의 프롬프트가 없습니다 — 로그인·멤버십 확인 (24)');
  });
  it('caps the id list in that message', () => {
    const b = slideBundle();
    for (let n = 40; n < 55; n++) b.styles.push(style(String(n), n, { prompt: '' }));
    expect(checkSlideBundle(b).error).toMatch(/^15개 스타일의 프롬프트가 없습니다 — 로그인·멤버십 확인 \(.*…외 5\)$/);
  });
  it('reports a malformed style without throwing', () => {
    const b = slideBundle();
    b.styles.push({ id: 7 });
    const r = checkSlideBundle(b);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/styles\[3\]/);
    expect(checkSlideBundle({ ...slideBundle(), styles: 'x' }).ok).toBe(false);
    expect(checkSlideBundle({ ...slideBundle(), img: 5 }).ok).toBe(false);
  });
  it('needs the image folder (img) to end with a slash, since file names are appended to it', () => {
    expect(checkSlideBundle({ ...slideBundle(), img: 'https://cdn.example/img' })).toEqual({ ok: false, error: '묶음 설정이 잘못되었습니다 (img)' });
    expect(checkSlideBundle({ ...slideBundle(), img: '' }).error).toBe('묶음 설정이 잘못되었습니다 (img)');
  });
  it('rejects an empty style list', () => {
    expect(checkSlideBundle({ ...slideBundle(), styles: [] })).toEqual({ ok: false, error: '스타일 목록이 비었습니다' });
  });
});

describe('mergeSlide', () => {
  const r = mergeSlide(slideCatalog, slideBundle());

  it('orders by upstream popularity, keeps the school deck object in its slot, vanished originals last', () => {
    expect(r.list.map((s) => s.id)).toEqual(['30', '31', '24', '99']);
    expect(r.list[2]).toBe(slideCatalog[0]);
    expect(r.list[3]).toEqual(slideCatalog[2]);
  });
  it('puts school decks missing from upstream after the upstream list, in their current order, before vanished originals', () => {
    const cat = [slideCatalog[2], { ...deck, id: '25', no: 6 }, slideCatalog[1], { ...deck, id: '24', no: 5 }];
    const out = mergeSlide(cat, slideBundle({ styles: [style('30', 2), style('31', 3)] }));
    expect(out.list.map((s) => s.id)).toEqual(['30', '31', '25', '24', '99']);
  });
  it('reports changed fields in the fixed order and counts remakes', () => {
    expect(r.report).toEqual({ added: ['31'], updated: { '30': ['look'] }, keptRemake: 1, gone: ['99'] });
  });
  it('adds a new style as an oppadu original without topic or sub', () => {
    expect(r.list[1]).toEqual({ id: '31', no: 3, family: 'work', name: '스타일 31', look: '깔끔', use: '보고', slides: 3, cover: 1, body: 2, added: '2026-10-01', source: 'oppadu' });
  });
  it('never touches a remake (list, prompt, media)', () => {
    expect(r.prompts.map((p) => p.id)).toEqual(['30', '31']);
    expect(r.media.some((m) => m.rel.startsWith('slide/24/'))).toBe(false);
  });
  it('stores the trimmed prompt', () => {
    expect(r.prompts[1]).toEqual({ id: '31', prompt: '프롬프트 31' });
  });
  it('lists every page, every thumbnail and the cover/body cards', () => {
    const m = r.media.filter((f) => f.rel.startsWith('slide/31/'));
    expect(m).toHaveLength(8);
    expect(m).toContainEqual({ rel: 'slide/31/1.webp', url: `${IMG}31-1.webp` });
    expect(m).toContainEqual({ rel: 'slide/31/3.webp', url: `${IMG}31-3.webp` });
    expect(m).toContainEqual({ rel: 'slide/31/s/2.webp', url: `${IMG}s/31-2.webp` });
    expect(m).toContainEqual({ rel: 'slide/31/t/2.webp', url: `${IMG}t/31-2.webp` });
    expect(m).toContainEqual({ rel: 'slide/31/t/1.webp', url: `${IMG}t/31-1.webp` });
    expect(r.media).toHaveLength(16);
  });
  it('asks for a single card when cover and body are the same page', () => {
    const b = slideBundle({ styles: [style('31', 3, { cover: 2, body: 2 })] });
    const m = mergeSlide([], b).media;
    expect(m.filter((f) => f.rel.includes('/t/'))).toEqual([{ rel: 'slide/31/t/2.webp', url: `${IMG}t/31-2.webp` }]);
    expect(m).toHaveLength(7);
  });
  it('does not mutate the input catalog and is stable on a second merge', () => {
    expect(slideCatalog[1].look).toBe('옛 look');
    const again = mergeSlide(r.list, slideBundle());
    expect(again.list).toEqual(r.list);
    expect(again.report).toEqual({ added: [], updated: {}, keptRemake: 1, gone: ['99'] });
  });
  it('updates slides/cover/body/added/no too', () => {
    const b = slideBundle({ styles: [style('30', 7, { slides: 5, cover: 2, body: 4, added: '2026-10-20' })] });
    expect(mergeSlide(slideCatalog, b).report.updated['30']).toEqual(['no', 'look', 'slides', 'cover', 'body', 'added']);
  });

  it('throws on a family outside the seven known ones', () => {
    const b = slideBundle();
    b.styles[1].family = 'neon';
    expect(() => mergeSlide(slideCatalog, b)).toThrow(/slide sync: .*unknown family "neon" \(31\)/);
  });
  it('throws on more than 12 slides', () => {
    const b = slideBundle();
    b.styles[1].slides = 13;
    expect(() => mergeSlide(slideCatalog, b)).toThrow(/more than 12 slides \(31\)/);
  });
  it('throws when cover/body fall outside the deck', () => {
    const b = slideBundle();
    b.styles[1].cover = 5;
    expect(() => mergeSlide(slideCatalog, b)).toThrow(/cover\/body out of range \(31\)/);
  });
  it('throws on a bad id, a non-integer no and an empty prompt', () => {
    const a = slideBundle();
    a.styles[1].id = 'x1';
    expect(() => mergeSlide(slideCatalog, a)).toThrow(/slide sync: bad id "x1"/);
    const b = slideBundle();
    b.styles[1].no = 0;
    expect(() => mergeSlide(slideCatalog, b)).toThrow(/bad no "0" \(31\)/);
    const c = slideBundle();
    c.styles[1].prompt = ' ';
    expect(() => mergeSlide(slideCatalog, c)).toThrow(/prompt 31/);
  });
  it('throws when the merged catalog is invalid (duplicate no)', () => {
    const b = slideBundle();
    b.styles[1].no = 2;
    expect(() => mergeSlide(slideCatalog, b)).toThrow(/slide sync: .*duplicate slide no/);
  });
  it('does not complain about a remake id whose upstream copy would be invalid', () => {
    const b = slideBundle();
    b.styles[2].family = 'neon';
    expect(() => mergeSlide(slideCatalog, b)).not.toThrow();
  });
});

describe('diffBrandIndex', () => {
  const idx = (slugs, generated_at) => ({ generated_at, brands: slugs.map((slug) => ({ slug })) });
  it('lists added and removed slugs', () => {
    expect(diffBrandIndex(idx(['a', 'b']), idx(['b', 'c'], 'G'))).toEqual({ added: ['c'], removed: ['a'], total: 2, generatedAt: 'G' });
  });
  it('treats every brand as added when there is no previous index', () => {
    expect(diffBrandIndex(null, idx(['a', 'b'], 'G'))).toEqual({ added: ['a', 'b'], removed: [], total: 2, generatedAt: 'G' });
  });
  it('falls back to an empty generatedAt', () => {
    expect(diffBrandIndex(null, idx(['a'])).generatedAt).toBe('');
  });
});
