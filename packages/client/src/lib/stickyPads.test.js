import { describe, it, expect } from 'vitest';
import {
  STICKY_TYPES, STICKY_FRIENDS, STICKY_PATTERNS, STICKY_ID_PREFIX,
  stickyFileId, stickySvg, stickyDataUrl, stickyAspect, stickyFile,
  buildStickyElement, isStickyElement, isOwnSticky, isStickySpec, friendColor,
} from './stickyPads';
import { COLOR_STYLES } from './classroomColor';

describe('stickyPads — 모델', () => {
  it('fileId 는 조합마다 하나이고 결정적이다', () => {
    const s = { type: 'tab', friend: 'circle', pattern: 'ruled' };
    expect(stickyFileId(s)).toBe('stickyf_v1_tab_circle_ruled');
    expect(stickySvg(s)).toBe(stickySvg({ ...s }));
  });

  it('유형별 비율', () => {
    expect(stickyAspect('tab')).toBe(1);
    expect(stickyAspect('face')).toBeCloseTo(200 / 180);
    expect(stickyAspect('mark')).toBeCloseTo(190 / 200);
    expect(stickyAspect('cut')).toBeCloseTo(170 / 180);
  });

  it('72 조합 모두 viewBox 가 있고 width/height 속성은 없는 SVG 를 만든다', () => {
    for (const type of STICKY_TYPES) for (const friend of STICKY_FRIENDS) for (const pattern of STICKY_PATTERNS) {
      const svg = stickySvg({ type, friend, pattern });
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toMatch(/viewBox="0 0 \d+ \d+"/);
      expect(svg).not.toMatch(/<svg[^>]*\swidth=/);
      expect(svg.length).toBeLessThan(8000);
    }
  });

  it('무늬: ruled 는 간격 22 수평선, grid 는 간격 14 모눈, plain 은 둘 다 없음', () => {
    const base = { type: 'tab', friend: 'square' };
    expect(stickySvg({ ...base, pattern: 'ruled' })).toContain('data-pattern="ruled"');
    expect(stickySvg({ ...base, pattern: 'ruled' })).toMatch(/height="22"/);
    expect(stickySvg({ ...base, pattern: 'grid' })).toContain('data-pattern="grid"');
    expect(stickySvg({ ...base, pattern: 'grid' })).toMatch(/width="14" height="14"/);
    expect(stickySvg({ ...base, pattern: 'plain' })).not.toContain('data-pattern');
  });

  it('친구 색은 학급 색 그대로 (동글=하늘, 세모=코랄)', () => {
    expect(friendColor('circle')).toEqual({ cover: COLOR_STYLES.sky.cover, tint: COLOR_STYLES.sky.tint, deep: COLOR_STYLES.sky.deep });
    expect(stickySvg({ type: 'tab', friend: 'triangle', pattern: 'plain' })).toContain(COLOR_STYLES.coral.tint);
  });

  it('워터마크 유형은 종이색 면 + 12% 윤곽, 다이컷은 clipPath 를 쓴다', () => {
    expect(stickySvg({ type: 'mark', friend: 'cloud', pattern: 'grid' })).toContain('#f8fafd');
    expect(stickySvg({ type: 'mark', friend: 'cloud', pattern: 'plain' })).toMatch(/opacity="\.12"|opacity="0\.12"/);
    expect(stickySvg({ type: 'cut', friend: 'heart', pattern: 'ruled' })).toContain('<clipPath');
  });

  it('dataUrl 과 file', () => {
    const s = { type: 'face', friend: 'star', pattern: 'plain' };
    expect(stickyDataUrl(s).startsWith('data:image/svg+xml;utf8,')).toBe(true);
    expect(stickyFile(s, 5)).toEqual({ id: 'stickyf_v1_face_star_plain', mimeType: 'image/svg+xml', dataURL: stickyDataUrl(s), created: 5 });
  });

  it('isStickySpec', () => {
    expect(isStickySpec({ type: 'cut', friend: 'cloud', pattern: 'grid' })).toBe(true);
    expect(isStickySpec({ type: 'oval', friend: 'cloud', pattern: 'grid' })).toBe(false);
    expect(isStickySpec(null)).toBe(false);
  });
});

describe('stickyPads — 요소', () => {
  const spec = { type: 'tab', friend: 'circle', pattern: 'plain' };

  it('잠긴 image 요소 하나, customData.sticky, 비율 높이, 접두사 id', () => {
    const el = buildStickyElement(spec, { x: 10, y: 20, width: 200, now: 7, rand: () => 0.5 });
    expect(el).toMatchObject({
      type: 'image', fileId: 'stickyf_v1_tab_circle_plain', status: 'saved', locked: true, opacity: 100,
      x: 10, y: 20, width: 200, height: 200, isDeleted: false, customData: { sticky: { v: 1, ...spec } },
    });
    expect(el.id.startsWith(STICKY_ID_PREFIX)).toBe(true);
    expect(el.updated).toBe(7);
  });

  it('opacity 와 id 를 넘기면 그대로 쓴다; face 는 높이가 더 크다', () => {
    const el = buildStickyElement({ ...spec, type: 'face' }, { x: 0, y: 0, width: 180, opacity: 70, id: 'sticky_fixed' });
    expect(el.opacity).toBe(70);
    expect(el.id).toBe('sticky_fixed');
    expect(el.height).toBeCloseTo(200);
  });

  it('isStickyElement / isOwnSticky', () => {
    const own = buildStickyElement(spec, { x: 0, y: 0, width: 100 });
    expect(isStickyElement(own)).toBe(true);
    expect(isOwnSticky(own)).toBe(true);
    expect(isOwnSticky({ ...own, id: '__sn_' + own.id })).toBe(false); // 교사 창에 내려온 학생 메모지
    expect(isStickyElement({ type: 'image', id: 'img_1' })).toBe(false);
  });
});
