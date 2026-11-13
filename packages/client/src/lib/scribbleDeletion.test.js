import { describe, it, expect } from 'vitest';
import { scribbleDeletionIds } from './scribbleDetect';

const fd = (id, x, y, w, h, extra = {}) => ({ id, type: 'freedraw', x, y, width: w, height: h, points: [[0, 0], [w, h]], ...extra });
const scribble = { id: 'scr', type: 'freedraw', x: 100, y: 100, points: [[0, 0], [50, 10], [0, 20], [50, 30]] };

describe('scribbleDeletionIds', () => {
  it('문지르기 자신 + 겹치는 freedraw 만 지운다 (제외 접두사·제외 id·비 freedraw 는 제외)', () => {
    const els = [
      { id: '__bg_image__', type: 'image', x: 0, y: 0, width: 1000, height: 1000 },
      fd('a', 120, 110, 10, 10),
      fd('tn_b', 120, 110, 10, 10),
      fd('far', 500, 500, 10, 10),
      { id: 'rect', type: 'rectangle', x: 120, y: 110, width: 10, height: 10 },
      scribble,
    ];
    expect([...scribbleDeletionIds(els, scribble, { excludePrefixes: ['tn_'], excludeIds: ['__bg_image__'] })].sort())
      .toEqual(['a', 'scr']);
  });

  it('지워지는 획과 같은 그룹인 도형 보정 채우기도 함께 지운다 (다른 그룹의 채우기는 남김)', () => {
    const els = [
      fd('stroke', 120, 110, 60, 40, { groupIds: ['g1'] }),
      { id: 'fill', type: 'line', x: 120, y: 110, width: 60, height: 40, groupIds: ['g1'], customData: { shapeFill: true } },
      { id: 'otherFill', type: 'line', x: 120, y: 110, width: 60, height: 40, groupIds: ['g2'], customData: { shapeFill: true } },
      { id: 'plainLine', type: 'line', x: 120, y: 110, width: 60, height: 40, groupIds: ['g1'] },
      scribble,
    ];
    expect([...scribbleDeletionIds(els, scribble)].sort()).toEqual(['fill', 'scr', 'stroke']);
  });
});
