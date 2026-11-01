import { describe, it, expect } from 'vitest';
import { scribbleDeletionIds } from './scribbleDetect';

const fd = (id, extra = {}) => ({ id, type: 'freedraw', x: 0, y: 0, width: 40, height: 40, points: [[0, 0], [40, 40]], ...extra });

describe('scribbleDeletionIds — 메모지 제외', () => {
  const scribble = fd('scr', { points: [[0, 0], [40, 0], [0, 10], [40, 10], [0, 20], [40, 20], [0, 30], [40, 30], [0, 40], [40, 40]] });

  it('겹치는 획은 지우고, sticky_ 접두사 획과 image 메모지는 남긴다', () => {
    const elements = [
      scribble,
      fd('ink'),
      fd('sticky_fd'),
      { id: 'sticky_1', type: 'image', x: 0, y: 0, width: 40, height: 40, customData: { sticky: { v: 1 } } },
    ];
    const ids = scribbleDeletionIds(elements, scribble, { excludePrefixes: ['sticky_'], excludeIds: ['__bg_image__'] });
    expect(ids.has('ink')).toBe(true);
    expect(ids.has('sticky_fd')).toBe(false);
    expect(ids.has('sticky_1')).toBe(false);
  });
});
