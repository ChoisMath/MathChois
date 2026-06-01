import { describe, it, expect } from 'vitest';
import { chaikinSmooth, resampleStrokePoints } from './freedrawResample';
import { isScribblePattern } from './scribbleDetect';

describe('chaikinSmooth', () => {
  it('점 개수를 늘리고 원본 끝점 근처를 보존한다', () => {
    const pts = [[0, 0], [10, 0], [10, 10]];
    const out = chaikinSmooth(pts, 1);
    expect(out.length).toBeGreaterThan(pts.length);
    expect(out[0][0]).toBeCloseTo(0, 1);
    expect(out[0][1]).toBeCloseTo(0, 1);
    expect(out[out.length - 1][0]).toBeCloseTo(10, 1);
    expect(out[out.length - 1][1]).toBeCloseTo(10, 1);
  });

  it('2점 이하는 그대로 반환', () => {
    expect(chaikinSmooth([[0, 0]], 1)).toEqual([[0, 0]]);
  });
});

describe('resampleStrokePoints', () => {
  it('alreadySmoothed 면 동일 참조 반환(멱등)', () => {
    const dense = Array.from({ length: 50 }, (_, i) => [i, Math.sin(i / 5)]);
    const out = resampleStrokePoints(dense, { alreadySmoothed: true });
    expect(out).toBe(dense);
  });

  it('각진 입력은 점이 늘어난다', () => {
    const pts = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const out = resampleStrokePoints(pts);
    expect(out.length).toBeGreaterThan(pts.length);
  });
});

describe('리샘플과 스크리블 감지의 안전한 공존', () => {
  // 좌우로 왕복하는 삼각파 지그재그(주기 8, 진폭 30) — 명확한 스크리블
  const scribble = [];
  for (let i = 0; i < 40; i++) {
    const phase = i % 8;
    const x = phase < 4 ? phase * 10 : (8 - phase) * 10;
    scribble.push([x, i * 1.5]);
  }

  it('명확한 지그재그는 scribble 로 감지된다 (리샘플 전 판정 보장)', () => {
    expect(isScribblePattern(scribble)).toBe(true);
  });

  it('매끄러운 호를 리샘플해도 scribble 로 오인하지 않는다 (오삭제 방지)', () => {
    const arc = Array.from({ length: 30 }, (_, i) => {
      const t = (i / 29) * Math.PI; // 반원 호
      return [Math.cos(t) * 50, Math.sin(t) * 50];
    });
    expect(isScribblePattern(arc)).toBe(false);
    const smoothed = resampleStrokePoints(arc);
    expect(isScribblePattern(smoothed)).toBe(false);
  });
});
