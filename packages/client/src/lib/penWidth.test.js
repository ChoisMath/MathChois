import { describe, it, expect } from 'vitest';
import { sceneStrokeWidth, MIN_SCENE_STROKE_WIDTH, PEN_WIDTH_MIN, PEN_WIDTH_MAX, PEN_WIDTH_STEP, PEN_WIDTH_DEFAULT } from './penWidth.js';

describe('sceneStrokeWidth', () => {
  it('divides the slider width by zoom so the on-screen thickness stays constant', () => {
    expect(sceneStrokeWidth(0.2, 1)).toBe(0.2);
    expect(sceneStrokeWidth(0.2, 4)).toBeCloseTo(0.05, 10);
    expect(sceneStrokeWidth(0.2, 8)).toBeCloseTo(0.025, 10);
  });

  it('lets the thinnest slider value stay thin at tablet zoom (old floor 0.05 made it 5px on a phone)', () => {
    expect(sceneStrokeWidth(PEN_WIDTH_MIN, 4)).toBeCloseTo(PEN_WIDTH_MIN / 4, 10);
    expect(sceneStrokeWidth(PEN_WIDTH_MIN, 4)).toBeLessThan(0.05);
  });

  it('floors at MIN_SCENE_STROKE_WIDTH so the 2-decimal path precision stays well below the radius', () => {
    expect(sceneStrokeWidth(PEN_WIDTH_MIN, 100)).toBe(MIN_SCENE_STROKE_WIDTH);
    expect(MIN_SCENE_STROKE_WIDTH * 5).toBeGreaterThanOrEqual(0.05); // radius = strokeWidth×10÷2 ≥ 5 × 0.01 truncation step
  });

  it('exposes a slider range that starts thinner than before', () => {
    expect(PEN_WIDTH_MIN).toBeLessThan(0.1);
    expect(PEN_WIDTH_MAX).toBe(2);
    expect(PEN_WIDTH_STEP).toBeLessThanOrEqual(PEN_WIDTH_MIN);
    expect(PEN_WIDTH_DEFAULT).toBe(0.2);
  });
});
