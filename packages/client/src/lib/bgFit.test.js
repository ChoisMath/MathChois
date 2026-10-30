import { describe, it, expect } from 'vitest';
import { fixBgAspect, fitViewportToBg, resolveBgLayout, bgViewportAppState, BG_FIT_MARGIN, BG_ASPECT_TOL } from './bgFit';

describe('fixBgAspect — 저장된 배경 크기의 비율 보정', () => {
  it('비율 차가 허용 안이면 그대로(같은 객체 값)', () => {
    const saved = { x: 20, y: 20, width: 800, height: 600 };
    expect(fixBgAspect(saved, 1600, 1200)).toEqual(saved);
    expect(fixBgAspect(saved, 1600, 1212)).toEqual(saved); // 1% 차이
  });

  it('비율 차가 2% 넘으면 폭·x·y 는 두고 높이만 이미지 비율로', () => {
    const saved = { x: 20, y: 30, width: 800, height: 450 }; // 16:9 로 저장
    const fixed = fixBgAspect(saved, 1600, 1200);             // 실제 4:3
    expect(fixed).toEqual({ x: 20, y: 30, width: 800, height: 600 });
  });

  it('이미지 크기가 없거나 저장값이 없으면 그대로', () => {
    expect(fixBgAspect(null, 100, 100)).toBeNull();
    const saved = { x: 0, y: 0, width: 10, height: 99 };
    expect(fixBgAspect(saved, 0, 100)).toEqual(saved);
  });

  it('상수', () => {
    expect(BG_ASPECT_TOL).toBe(0.02);
    expect(BG_FIT_MARGIN).toBe(20);
  });
});

describe('fitViewportToBg — 뷰포트를 배경 이미지에 맞춤', () => {
  // Excalidraw: screen = (scene + scroll) * zoom
  const toScreen = (scene, { zoom, scrollX, scrollY }) => ({ x: (scene.x + scrollX) * zoom, y: (scene.y + scrollY) * zoom });

  it('휴대폰 크기로 저장된 이미지가 아이패드 화면에 꽉 차게 (가로 중앙·위 여백 20)', () => {
    const bg = { x: 20, y: 20, width: 320, height: 240 };     // 360px 폰에서 저장
    const vp = fitViewportToBg({ containerWidth: 1024, containerHeight: 700, bg });
    const tl = toScreen({ x: bg.x, y: bg.y }, vp);
    const br = toScreen({ x: bg.x + bg.width, y: bg.y + bg.height }, vp);
    expect(tl.y).toBeCloseTo(BG_FIT_MARGIN, 6);
    expect(br.y).toBeCloseTo(700, 6);                           // 높이가 제한 → 아래까지
    expect(tl.x + (1024 - br.x)).toBeCloseTo(1024 - (br.x - tl.x), 6); // 가로 중앙
    expect(tl.x).toBeCloseTo((1024 - (br.x - tl.x)) / 2, 6);
    expect(vp.zoom).toBeCloseTo((700 - BG_FIT_MARGIN) / 240, 6);
  });

  it('가로로 긴 이미지는 폭이 제한, 세로로 긴 이미지는 높이가 제한', () => {
    expect(fitViewportToBg({ containerWidth: 800, containerHeight: 600, bg: { x: 20, y: 20, width: 2000, height: 500 } }).zoom)
      .toBeCloseTo((800 - 2 * BG_FIT_MARGIN) / 2000, 6);
    expect(fitViewportToBg({ containerWidth: 800, containerHeight: 600, bg: { x: 20, y: 20, width: 500, height: 2000 } }).zoom)
      .toBeCloseTo((600 - BG_FIT_MARGIN) / 2000, 6);
  });

  it('calculateBgPosition 으로 막 계산한 값은 줌 1 에 가깝다', () => {
    const bg = { x: 20, y: 20, width: 760, height: 570 };     // 800x600 컨테이너에 맞춘 값
    const vp = fitViewportToBg({ containerWidth: 800, containerHeight: 600, bg });
    expect(vp.zoom).toBeCloseTo(1, 6);
    expect(toScreen({ x: 20, y: 20 }, vp)).toEqual({ x: 20, y: 20 });
  });

  it('줌은 Excalidraw 범위 0.1~30 으로 잘린다', () => {
    expect(fitViewportToBg({ containerWidth: 800, containerHeight: 600, bg: { x: 0, y: 0, width: 1e6, height: 1e6 } }).zoom).toBe(0.1);
    expect(fitViewportToBg({ containerWidth: 800, containerHeight: 600, bg: { x: 0, y: 0, width: 1, height: 1 } }).zoom).toBe(30);
  });

  it('컨테이너나 배경 크기가 없으면 null', () => {
    expect(fitViewportToBg({ containerWidth: 0, containerHeight: 600, bg: { x: 0, y: 0, width: 10, height: 10 } })).toBeNull();
    expect(fitViewportToBg({ containerWidth: 800, containerHeight: 600, bg: null })).toBeNull();
  });
});

describe('resolveBgLayout — 저장값/계산값 선택 + 진단', () => {
  it('저장값이 있으면 비율을 보정해 쓰고 source=saved', () => {
    const r = resolveBgLayout({ saved: { x: 20, y: 20, width: 320, height: 180 }, imageW: 1600, imageH: 1200, containerWidth: 1024, containerHeight: 700 });
    expect(r.source).toBe('saved');
    expect(r.bg).toEqual({ x: 20, y: 20, width: 320, height: 240 });
    expect(r.diag.aspectFixed).toBe(true);
    expect(r.viewport.zoom).toBeCloseTo((700 - 20) / 240, 6);
    expect(bgViewportAppState(r.viewport)).toEqual({ zoom: { value: r.viewport.zoom }, scrollX: r.viewport.scrollX, scrollY: r.viewport.scrollY });
  });

  it('저장값이 없거나 너무 작으면 컨테이너에 맞춰 계산하고 source=computed, 줌≈1', () => {
    const r = resolveBgLayout({ saved: { x: 0, y: 0, width: 5, height: 5 }, imageW: 1600, imageH: 1200, containerWidth: 800, containerHeight: 600 });
    expect(r.source).toBe('computed');
    expect(r.bg.x).toBe(20);
    expect(r.bg.width / r.bg.height).toBeCloseTo(4 / 3, 6);
    expect(r.viewport.zoom).toBeCloseTo(1, 6);
    expect(r.diag.saved).toBeNull();
    expect(bgViewportAppState(null)).toEqual({});
  });
});
