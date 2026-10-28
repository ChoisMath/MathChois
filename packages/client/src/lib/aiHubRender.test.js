import { it, expect } from 'vitest';
import { renderMotionItems, renderSlideItems, MOTION_CATALOG, SLIDE_CATALOG } from '@mathchois/shared';

const e = (c) => ({ size: 1, sha256: c.repeat(64), updatedAt: 'x' });

it('motion: only items with video+poster, preview optional, prompt null when missing', () => {
  const m = { 'motion/01-pixel/video.mp4': e('a'), 'motion/01-pixel/poster.webp': e('b'), 'motion/11-rpg/video.mp4': e('c') };
  const out = renderMotionItems(MOTION_CATALOG, m, new Map());
  expect(out.map((i) => i.id)).toEqual(['01-pixel']);
  expect(out[0]).toMatchObject({ video: '/api/files/ai-hub/motion/01-pixel/video.mp4?v=aaaaaaaa', poster: '/api/files/ai-hub/motion/01-pixel/poster.webp?v=bbbbbbbb', preview: null, prompt: null });
});
it('motion: prompt row attached with v2 flag', () => {
  const m = { 'motion/01-pixel/video.mp4': e('a'), 'motion/01-pixel/poster.webp': e('b') };
  const p = new Map([['01-pixel', { en: '{{#a}}x', ko: 'y', shots: [], cues: [] }]]);
  expect(renderMotionItems(MOTION_CATALOG, m, p)[0].prompt).toEqual({ en: '{{#a}}x', ko: 'y', shots: [], cues: [], v2: true });
});
it('slide: all k images + thumbs + cover/body cards required', () => {
  const s = SLIDE_CATALOG[0]; // id 24, slides 8, cover 1, body 3
  const m = {};
  for (let k = 1; k <= s.slides; k++) { m[`slide/24/${k}.webp`] = e('a'); m[`slide/24/s/${k}.webp`] = e('b'); }
  m['slide/24/t/1.webp'] = e('c'); m['slide/24/t/3.webp'] = e('d');
  const out = renderSlideItems([s], m, new Map([['24', 'P']]));
  expect(out[0].images.length).toBe(8); expect(out[0].coverCard).toContain('/t/1.webp?v=cccccccc'); expect(out[0].prompt).toBe('P');
  delete m['slide/24/s/5.webp'];
  expect(renderSlideItems([s], m, new Map())).toEqual([]);
});
it('null manifest → []', () => { expect(renderMotionItems(MOTION_CATALOG, null, new Map())).toEqual([]); });
