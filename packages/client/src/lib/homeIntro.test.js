// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { claimHomeIntro, HOME_INTRO_KEY } from './homeIntro.js';

describe('claimHomeIntro', () => {
  beforeEach(() => localStorage.clear());

  it('첫 방문이면 true 를 돌려주고 재생 기록을 남긴다', () => {
    expect(claimHomeIntro(localStorage)).toBe(true);
    expect(localStorage.getItem(HOME_INTRO_KEY)).not.toBeNull();
  });

  it('두 번째 방문부터는 false', () => {
    claimHomeIntro(localStorage);
    expect(claimHomeIntro(localStorage)).toBe(false);
  });

  it('동작 줄이기 설정이면 재생하지 않고 기록도 남기지 않는다', () => {
    expect(claimHomeIntro(localStorage, { reducedMotion: true })).toBe(false);
    expect(localStorage.getItem(HOME_INTRO_KEY)).toBeNull();
  });

  it('저장소를 쓸 수 없으면(사파리 사생활 보호 등) 재생하지 않는다', () => {
    const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
    expect(claimHomeIntro(broken)).toBe(false);
    expect(claimHomeIntro(null)).toBe(false);
  });
});
