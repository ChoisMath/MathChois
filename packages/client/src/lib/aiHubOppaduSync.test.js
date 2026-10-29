import { describe, it, expect } from 'vitest';
import { checkMotionBundle, motionUpstream, mergeMotion } from '@mathchois/shared';

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
  it('reports a malformed list item without throwing', () => {
    const b = bundle();
    b.gallery.items.push({ id: 5 });
    const r = checkMotionBundle(b);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/gallery\.items/);
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
