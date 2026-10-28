import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  splitGallery, buildSlideData, parseSchoolManifest, parseOriginalStyles, diffManifest,
  toAiHubRel, meUrlPath, formatCatalogSource, retryDelayMs, isAiHubFile,
  MOTION_CATALOG, SLIDE_CATALOG,
} from '@mathchois/shared';

const src = {
  id: '11-rpg', no: '11', g: '게임·만화', name: 'RPG 게임 화면', use: '퀘스트형 강의 소개', en: 'RPG Game Screen',
  concept: '마을 광장', prompt: '## 1. Channel {{Channel name=Chois의 바이브코딩}}', ko: '## 1. 채널',
  shots: [['0.0–1.0', '장면', '이유']], cues: [['0.000', 'kick', 'first frame']],
};

describe('splitGallery', () => {
  const { publicList, adminList } = splitGallery([src], ['11-rpg']);
  it('keeps only public keys and converts no to a number', () => {
    expect(publicList).toEqual([{ id: '11-rpg', no: 11, group: '게임·만화', name: 'RPG 게임 화면', en: 'RPG Game Screen', use: '퀘스트형 강의 소개', concept: '마을 광장', featured: true, source: 'chois' }]);
    expect(JSON.stringify(publicList)).not.toContain('Channel');
  });
  it('moves prompt, shots and cues to the admin list', () => {
    expect(adminList).toEqual([{ id: '11-rpg', prompt: src.prompt, ko: src.ko, shots: src.shots, cues: src.cues }]);
  });
  it('marks non-listed ids as not featured', () => {
    expect(splitGallery([src], []).publicList[0]?.featured).toBe(false);
  });
  it('throws when the result is not a valid catalog (bad group, duplicate no, non-numeric no)', () => {
    expect(() => splitGallery([{ ...src, g: '없는 분류' }], [])).toThrow(/bad group/);
    expect(() => splitGallery([src, { ...src, id: '12-x' }], [])).toThrow(/duplicate motion no/);
    expect(() => splitGallery([{ ...src, no: 'x' }], [])).toThrow(/bad no/);
  });
});

describe('splitGallery with originals', () => {
  const original = (id, no) => ({
    id, no, g: '포스터·인쇄', name: `원본 ${no}`, use: '홍보', en: 'Poster', concept: '원본 컨셉',
    final: { en: `EN ${id}`, ko: `KO ${id}` }, shots: [['0.0–1.0', '장면', '이유']], cues: [['0.000', 'kick', 'hit']],
  });
  const { publicList, adminList } = splitGallery([src], [], [original('11-rpg', '11'), original('101-gold-foil-invitation', '101')]);
  it('keeps the remade item and adds only originals without a remake, marked as oppadu', () => {
    expect(publicList.map((m) => [m.id, m.no, m.source])).toEqual([['11-rpg', 11, 'chois'], ['101-gold-foil-invitation', 101, 'oppadu']]);
  });
  it('uses the prefilled final prompts of originals as prompt/ko', () => {
    expect(adminList[1]).toMatchObject({ id: '101-gold-foil-invitation', prompt: 'EN 101-gold-foil-invitation', ko: 'KO 101-gold-foil-invitation' });
    expect(adminList[0]?.prompt).toBe(src.prompt);
  });
  it('carries the optional v2 kind/kindLabel/secs of an original', () => {
    const v2 = { ...original('102-v2', '102'), kind: 'intro', kindLabel: '인트로', secs: 12 };
    expect(splitGallery([], [], [v2]).publicList[0]).toMatchObject({ kind: 'intro', kindLabel: '인트로', secs: 12 });
  });
});

const entry = (id, no) => ({ id, no, family: 'hand', name: `n${id}`, look: 'l', use: 'u', topic: 't', cover: 1, body: 3, added: '2026-10-12' });

describe('buildSlideData', () => {
  it('keeps manifest order, takes page counts from the deck and splits prompts out', () => {
    const decks = new Map([['59', { pages: 7, prompt: ' p59 \n' }], ['24', { pages: 8, prompt: 'p24' }]]);
    const { publicList, adminList } = buildSlideData([entry('24', 24), entry('59', 59)], decks);
    expect(publicList.map((s) => [s.id, s.slides, s.source])).toEqual([['24', 8, 'school'], ['59', 7, 'school']]);
    expect(adminList).toEqual([{ id: '24', prompt: 'p24' }, { id: '59', prompt: 'p59' }]);
    expect(JSON.stringify(publicList)).not.toContain('p24');
  });
  it('skips entries without a confirmed deck', () => {
    const { publicList } = buildSlideData([entry('24', 24), entry('63', 63)], new Map([['24', { pages: 8, prompt: 'p' }]]));
    expect(publicList.map((s) => s.id)).toEqual(['24']);
  });
  it('fails when cover or body points past the deck', () => {
    expect(() => buildSlideData([{ ...entry('24', 24), body: 9 }], new Map([['24', { pages: 8, prompt: 'p' }]]))).toThrow(/cover\/body out of range/);
  });
});

describe('buildSlideData with originals', () => {
  const original = (id, no) => ({
    id, no, family: 'work', name: `o${id}`, look: 'ol', use: 'ou', slides: 6, cover: 1, body: 2, added: '2026-10-20', prompt: ` op${id} `,
  });
  const decks = new Map([['24', { pages: 8, prompt: 'p24' }]]);
  it('follows the original popularity order and puts the school deck in its place', () => {
    const { publicList, adminList } = buildSlideData([entry('24', 24), entry('63', 63)], decks, [original('200', 200), original('24', 24), original('63', 63)]);
    expect(publicList.map((s) => [s.id, s.source, s.slides])).toEqual([['200', 'oppadu', 6], ['24', 'school', 8], ['63', 'oppadu', 6]]);
    expect(publicList[0]?.topic).toBeUndefined();
    expect(adminList).toEqual([{ id: '200', prompt: 'op200' }, { id: '24', prompt: 'p24' }, { id: '63', prompt: 'op63' }]);
  });
  it('keeps school decks the original list no longer has, at the end', () => {
    const { publicList } = buildSlideData([entry('24', 24)], decks, [original('200', 200)]);
    expect(publicList.map((s) => s.id)).toEqual(['200', '24']);
  });
  it('parses original styles without a prompt as invalid and strips unknown fields', () => {
    const { prompt: _p, ...noPrompt } = original('200', 200);
    expect(() => parseOriginalStyles([noPrompt])).toThrow();
    expect(parseOriginalStyles([{ ...original('200', 200), sub: '부제' }])[0]).not.toHaveProperty('sub');
  });
});

describe('parseSchoolManifest', () => {
  it('rejects ids that could reach outside media/slide before any file is removed', () => {
    for (const id of ['', '../..', '24/../..', '7']) {
      expect(() => parseSchoolManifest([{ ...entry('24', 24), id }]), id).toThrow();
    }
    expect(() => parseSchoolManifest([{ no: 1 }])).toThrow();
    expect(() => parseSchoolManifest({})).toThrow();
  });
  it('accepts the source manifest shape', () => {
    expect(parseSchoolManifest([entry('24', 24)]).map((e) => e.id)).toEqual(['24']);
  });
});

describe('diffManifest', () => {
  const e = (c) => ({ size: 1, sha256: c.repeat(64), updatedAt: 't' });
  it('returns only the keys whose sha differs or is missing remotely, sorted', () => {
    const local = { 'motion/b/video.mp4': e('a'), 'motion/a/video.mp4': e('b'), 'motion/c/video.mp4': e('c') };
    const remote = { 'motion/b/video.mp4': e('a'), 'motion/a/video.mp4': e('d') };
    expect(diffManifest(local, remote)).toEqual(['motion/a/video.mp4', 'motion/c/video.mp4']);
    expect(diffManifest(local, local)).toEqual([]);
    expect(diffManifest(local, {})).toHaveLength(3);
  });
});

describe('toAiHubRel / meUrlPath', () => {
  it('maps me.chois.pro volume paths to MathChois ai-hub paths', () => {
    expect(toAiHubRel('media/motion/01-pixel/video.mp4')).toBe('motion/01-pixel/video.mp4');
    expect(toAiHubRel('media/slide/24/s/3.webp')).toBe('slide/24/s/3.webp');
    expect(toAiHubRel('private/brand/index.html')).toBe('brand/index.html');
    expect(toAiHubRel('private/brand/data/hero/x.json')).toBe('brand/data/hero/x.json');
  });
  it('maps the three manifests', () => {
    expect(toAiHubRel('media/motion/manifest.json')).toBe('manifest/motion.json');
    expect(toAiHubRel('media/slide/manifest.json')).toBe('manifest/slide.json');
    expect(toAiHubRel('private/brand/manifest.json')).toBe('manifest/brand.json');
    for (const rel of ['manifest/motion.json', 'manifest/slide.json', 'manifest/brand.json']) expect(isAiHubFile(rel)).toBe(true);
  });
  it('returns null for anything else (including path tricks)', () => {
    for (const k of ['private/motion-admin.json', 'x/y', '', 'media/other/a.png', '../media/motion/a']) expect(toAiHubRel(k), k).toBeNull();
  });
  it('builds the me.chois.pro download address: public for media, token route for brand', () => {
    expect(meUrlPath('media/motion/01-pixel/video.mp4')).toEqual({ path: '/media/motion/01-pixel/video.mp4', token: false });
    expect(meUrlPath('media/slide/24/1.webp')).toEqual({ path: '/media/slide/24/1.webp', token: false });
    // 공개 /ai/brand/site 는 HTML 을 가공해 sha 가 어긋난다 — 원본 바이트는 토큰 경로로만 받는다.
    expect(meUrlPath('private/brand/assets/app.js')).toEqual({ path: '/api/media/file?path=private%2Fbrand%2Fassets%2Fapp.js', token: true });
    expect(meUrlPath('private/brand/index.html')?.path).toBe('/api/media/file?path=private%2Fbrand%2Findex.html');
    expect(meUrlPath('private/motion-admin.json')).toBeNull();
    expect(meUrlPath('media/motion/manifest.json')).toBeNull();
  });
});

describe('formatCatalogSource', () => {
  const read = (name) => readFileSync(new URL(`../../../shared/src/ai-hub/${name}`, import.meta.url), 'utf8');
  it('writes the current motion catalog back byte for byte', () => {
    expect(formatCatalogSource('motion', MOTION_CATALOG)).toBe(read('motion.data.ts'));
  });
  it('writes the current slide catalog back byte for byte', () => {
    expect(formatCatalogSource('slide', SLIDE_CATALOG)).toBe(read('slide.data.ts'));
  });
  it('is deterministic about key order whatever the input order', () => {
    const m = MOTION_CATALOG[0];
    const shuffled = Object.fromEntries(Object.entries(m).reverse());
    expect(formatCatalogSource('motion', [shuffled])).toBe(formatCatalogSource('motion', [m]));
  });
  it('refuses an invalid catalog', () => {
    expect(() => formatCatalogSource('motion', [{ ...MOTION_CATALOG[0], id: 'x' }])).toThrow(/bad motion id/);
  });
});

describe('retryDelayMs', () => {
  it('honours Retry-After seconds', () => {
    expect(retryDelayMs(0, '1')).toBe(1000);
    expect(retryDelayMs(3, '12')).toBe(12000);
    expect(retryDelayMs(0, '0')).toBe(0);
  });
  it('without a usable header starts at 5 s and doubles up to 60 s', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map((a) => retryDelayMs(a))).toEqual([5000, 10000, 20000, 40000, 60000, 60000, 60000]);
    expect(retryDelayMs(1, 'soon')).toBe(10000);
    expect(retryDelayMs(0, '')).toBe(5000);
    expect(retryDelayMs(0, null)).toBe(5000);
  });
  it('reads an HTTP date', () => {
    const at = new Date(Date.now() + 30_000).toUTCString();
    expect(retryDelayMs(0, at)).toBeGreaterThan(27_000);
    expect(retryDelayMs(0, at)).toBeLessThanOrEqual(30_000);
  });
});
