import { describe, it, expect } from 'vitest';
import { sceneToScreen, visibleClip, renderPlan, placeBitmap, paperRectForPage, clampDpr, viewFromAppState, sameView, MAX_DPR } from './pdfLayerMath';

const paper = { x: 20, y: 20, width: 600, height: 800 };
const container = { width: 1000, height: 700 };
const pageSize = { width: 595, height: 842 };

describe('sceneToScreen', () => {
  it('applies (scene + scroll) * zoom', () => {
    expect(sceneToScreen(paper, { scrollX: 10, scrollY: -20, zoom: 2 })).toEqual({ left: 60, top: 0, width: 1200, height: 1600 });
  });
});

describe('renderPlan', () => {
  it('renders only the visible clip at zoom*paperScale*dpr', () => {
    const plan = renderPlan({ paper, view: { scrollX: 0, scrollY: 0, zoom: 1 }, container, pageSize, dpr: 2 });
    expect(plan.css).toEqual({ left: 20, top: 20, width: 600, height: 680 });
    expect(plan.canvasWidth).toBe(1200);
    expect(plan.canvasHeight).toBe(1360);
    expect(plan.scale).toBeCloseTo(1 * (600 / 595) * 2, 6);
    expect(plan.offsetX).toBe(0);
    expect(plan.offsetY).toBe(0);
  });
  it('shifts offsets when the paper is scrolled partly off-screen', () => {
    const plan = renderPlan({ paper, view: { scrollX: -120, scrollY: -300, zoom: 1 }, container, pageSize, dpr: 1 });
    expect(plan.css).toEqual({ left: 0, top: 0, width: 500, height: 520 });
    expect(plan.offsetX).toBe(-100); // paper screen-left is -100
    expect(plan.offsetY).toBe(-280);
  });
  it('never exceeds the container pixel budget at extreme zoom', () => {
    const plan = renderPlan({ paper, view: { scrollX: -100, scrollY: -100, zoom: 30 }, container, pageSize, dpr: 2 });
    expect(plan.canvasWidth).toBeLessThanOrEqual(container.width * 2);
    expect(plan.canvasHeight).toBeLessThanOrEqual(container.height * 2);
  });
  it('returns null when the paper is entirely off-screen', () => {
    expect(renderPlan({ paper, view: { scrollX: 5000, scrollY: 0, zoom: 1 }, container, pageSize, dpr: 1 })).toBeNull();
    expect(visibleClip({ left: -700, top: 0, width: 600, height: 800 }, container)).toBeNull();
  });
  it('uses integer canvas sizes for fractional DPR and clamps DPR to 3', () => {
    const plan = renderPlan({ paper, view: { scrollX: 0, scrollY: 0, zoom: 1 }, container, pageSize, dpr: 2.625 });
    expect(Number.isInteger(plan.canvasWidth) && Number.isInteger(plan.canvasHeight)).toBe(true);
    expect(clampDpr(4)).toBe(MAX_DPR);
    expect(renderPlan({ paper, view: { scrollX: 0, scrollY: 0, zoom: 1 }, container, pageSize, dpr: 4 }).canvasWidth).toBe(1800);
  });
});

describe('placeBitmap', () => {
  it('re-projects the rendered clip under a new scroll and zoom', () => {
    const rendered = { css: { left: 20, top: 20, width: 600, height: 680 }, view: { scrollX: 0, scrollY: 0, zoom: 1 } };
    expect(placeBitmap(rendered, { scrollX: 0, scrollY: 0, zoom: 1 })).toEqual({ left: 20, top: 20, scale: 1 });
    expect(placeBitmap(rendered, { scrollX: 10, scrollY: 0, zoom: 2 })).toEqual({ left: 60, top: 40, scale: 2 });
  });
});

describe('paperRectForPage', () => {
  it('keeps a valid saved bgPosition and otherwise fits the rotated page size', () => {
    const saved = { x: 5, y: 5, width: 300, height: 400 };
    expect(paperRectForPage(pageSize, container, saved)).toEqual(saved);
    expect(paperRectForPage(pageSize, container, { x: 0, y: 0, width: 4, height: 4 }).width).toBeGreaterThan(10);
    const landscape = paperRectForPage({ width: 842, height: 595 }, container, null);
    expect(landscape.width).toBeGreaterThan(landscape.height);
  });
});

describe('view helpers', () => {
  it('reads zoom.value and compares views with tolerance', () => {
    const v = viewFromAppState({ scrollX: 1, scrollY: 2, zoom: { value: 1.5 } });
    expect(v).toEqual({ scrollX: 1, scrollY: 2, zoom: 1.5 });
    expect(sameView(v, { scrollX: 1, scrollY: 2, zoom: 1.5000000001 })).toBe(true);
    expect(sameView(null, v)).toBe(false);
  });
});
