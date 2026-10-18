import { describe, it, expect } from 'vitest';
import {
  getExportBounds, createGuideElement, isGuideElement, withoutGuide, viewportCenterScene, fitDimensions,
  PRESENT_W, PRESENT_H,
} from './whiteboardExport';

const r = (x, y, w, h, extra = {}) => ({ id: `${x}-${y}`, type: 'rectangle', x, y, width: w, height: h, ...extra });

describe('getExportBounds', () => {
  it('요소가 없으면 발표 영역 3200×1800', () => {
    expect(getExportBounds([])).toEqual({ x: 0, y: 0, w: 3200, h: 1800 });
    expect(PRESENT_W).toBe(3200); expect(PRESENT_H).toBe(1800);
  });
  it('영역 안의 요소만 있으면 발표 영역', () => {
    expect(getExportBounds([r(100, 100, 500, 300), r(3000, 1700, 200, 100)])).toEqual({ x: 0, y: 0, w: 3200, h: 1800 });
  });
  it('밖으로 나가면 합집합 + 40px 여백', () => {
    expect(getExportBounds([r(-100, 50, 50, 50)])).toEqual({ x: -140, y: 0, w: 3340, h: 1800 });
    expect(getExportBounds([r(3100, 1750, 300, 300)])).toEqual({ x: 0, y: 0, w: 3440, h: 2090 });
  });
  it('안내선과 삭제 요소는 무시', () => {
    expect(getExportBounds([createGuideElement(), r(5000, 0, 10, 10, { isDeleted: true })])).toEqual({ x: 0, y: 0, w: 3200, h: 1800 });
  });
});

describe('guide element', () => {
  it('잠금·customData.guide 이며 withoutGuide 로 제거된다', () => {
    const g = createGuideElement();
    expect(g.locked).toBe(true);
    expect(isGuideElement(g)).toBe(true);
    expect(isGuideElement({ id: 'x', customData: { guide: true } })).toBe(true);
    expect(withoutGuide([g, r(0, 0, 1, 1)])).toHaveLength(1);
  });
});

describe('viewportCenterScene / fitDimensions', () => {
  it('뷰포트 중앙 장면 좌표', () => {
    expect(viewportCenterScene({ scrollX: -100, scrollY: -50, zoom: { value: 2 }, width: 800, height: 400 }))
      .toEqual({ x: 300, y: 150 });
  });
  it('타일 크기는 비율 유지, 확대 없음', () => {
    expect(fitDimensions(3200, 1800, 480, 270)).toEqual({ width: 480, height: 270, scale: 0.15 });
    expect(fitDimensions(100, 50, 480, 270)).toEqual({ width: 100, height: 50, scale: 1 });
  });
});
