import { describe, it, expect } from 'vitest';
import { resolveTab } from './classroomTabs';

describe('resolveTab', () => {
  it('기본값은 챕터', () => {
    expect(resolveTab(null, true)).toBe('chapters');
    expect(resolveTab(null, false)).toBe('chapters');
  });
  it('알려진 탭은 그대로', () => {
    expect(resolveTab('videos', false)).toBe('videos');
    expect(resolveTab('board', true)).toBe('board');
  });
  it('알 수 없는 값은 챕터', () => {
    expect(resolveTab('nope', true)).toBe('chapters');
  });
  it('대시보드는 교사만', () => {
    expect(resolveTab('dashboard', true)).toBe('dashboard');
    expect(resolveTab('dashboard', false)).toBe('chapters');
  });
});
