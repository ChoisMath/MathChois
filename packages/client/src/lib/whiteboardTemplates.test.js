import { describe, it, expect } from 'vitest';
import {
  TEMPLATES, TEMPLATE_CATEGORIES, BOARD_W, BOARD_H, buildTemplateSkeletons, getTemplate,
} from './whiteboardTemplates';

const ALLOWED = new Set(['rectangle', 'ellipse', 'diamond', 'line', 'arrow', 'text']);

/** skeleton 의 오른쪽/아래 끝 */
function extent(s) {
  if (s.type === 'text') return { right: s.x, bottom: s.y };
  if (s.type === 'line' || s.type === 'arrow') {
    const xs = s.points.map((p) => s.x + p[0]);
    const ys = s.points.map((p) => s.y + p[1]);
    return { right: Math.max(...xs), bottom: Math.max(...ys), left: Math.min(...xs), top: Math.min(...ys) };
  }
  return { right: s.x + s.width, bottom: s.y + s.height, left: s.x, top: s.y };
}

describe('whiteboardTemplates', () => {
  it('34종, key 유일, 카테고리 16/14/4', () => {
    expect(TEMPLATES).toHaveLength(34);
    expect(new Set(TEMPLATES.map((t) => t.key)).size).toBe(34);
    const count = (c) => TEMPLATES.filter((t) => t.category === c).length;
    expect(count('organizer')).toBe(16);
    expect(count('analysis')).toBe(14);
    expect(count('activity')).toBe(4);
    expect(TEMPLATE_CATEGORIES.map((c) => c.key)).toEqual(['organizer', 'analysis', 'activity']);
  });

  it('발표 영역은 3200×1800', () => {
    expect(BOARD_W).toBe(3200);
    expect(BOARD_H).toBe(1800);
  });

  it.each(TEMPLATES.map((t) => [t.key, t]))('%s 는 유효한 skeleton 을 만든다', (_key, t) => {
    const skeletons = t.build();
    expect(skeletons.length).toBeGreaterThan(0);
    for (const s of skeletons) {
      expect(ALLOWED.has(s.type)).toBe(true);
      expect(Number.isFinite(s.x)).toBe(true);
      expect(Number.isFinite(s.y)).toBe(true);
      if (s.type !== 'text') expect(s.strokeColor).toBe('#1e1e1e');
      if (s.type === 'line' || s.type === 'arrow') {
        expect(Array.isArray(s.points)).toBe(true);
        expect(s.points.length).toBeGreaterThanOrEqual(2);
      }
      if (s.type === 'rectangle' || s.type === 'ellipse' || s.type === 'diamond') {
        expect(s.width).toBeGreaterThan(0);
        expect(s.height).toBeGreaterThan(0);
      }
      const e = extent(s);
      expect(e.right).toBeLessThanOrEqual(BOARD_W + 0.001);
      expect(e.bottom).toBeLessThanOrEqual(BOARD_H + 0.001);
      expect(e.left ?? s.x).toBeGreaterThanOrEqual(-0.001);
      expect(e.top ?? s.y).toBeGreaterThanOrEqual(-0.001);
    }
    expect(typeof t.name).toBe('string');
    expect(t.name.length).toBeGreaterThan(0);
  });

  it('buildTemplateSkeletons 는 원점 이동을 적용하고 원본을 바꾸지 않는다', () => {
    const base = getTemplate('swot').build();
    const moved = buildTemplateSkeletons('swot', 100, 50);
    expect(moved[0].x).toBe(base[0].x + 100);
    expect(moved[0].y).toBe(base[0].y + 50);
    expect(getTemplate('swot').build()[0].x).toBe(base[0].x);
    expect(buildTemplateSkeletons('nope')).toEqual([]);
  });
});
