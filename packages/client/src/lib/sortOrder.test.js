// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  sortItems, loadSortOrder, saveSortOrder, isManualOrder, DEFAULT_SORT_ORDER, sortOrderStorageKey,
} from './sortOrder.js';

const items = [
  { id: 'a', position: 2, createdAt: '2026-10-01T00:00:00Z' },
  { id: 'b', position: 0, createdAt: '2026-10-03T00:00:00Z' },
  { id: 'c', position: 1, createdAt: '2026-10-02T00:00:00Z' },
];
const ids = (list) => list.map((x) => x.id);

describe('sortItems', () => {
  it('custom → position 오름차순', () => {
    expect(ids(sortItems(items, 'custom'))).toEqual(['b', 'c', 'a']);
  });
  it('newest → createdAt 내림차순', () => {
    expect(ids(sortItems(items, 'newest'))).toEqual(['b', 'c', 'a']);
  });
  it('oldest → createdAt 오름차순', () => {
    expect(ids(sortItems(items, 'oldest'))).toEqual(['a', 'c', 'b']);
  });
  it('createdAt 동률/누락은 position 으로 보조 정렬', () => {
    const same = [
      { id: 'x', position: 1, createdAt: '2026-10-01T00:00:00Z' },
      { id: 'y', position: 0, createdAt: '2026-10-01T00:00:00Z' },
      { id: 'z', position: 2, createdAt: null },
    ];
    expect(ids(sortItems(same, 'newest'))).toEqual(['y', 'x', 'z']);
    expect(ids(sortItems(same, 'oldest'))).toEqual(['z', 'y', 'x']);
  });
  it('원본 배열을 변경하지 않고, 알 수 없는 값은 custom 으로 처리', () => {
    const copy = [...items];
    sortItems(items, 'newest');
    expect(items).toEqual(copy);
    expect(ids(sortItems(items, 'garbage'))).toEqual(['b', 'c', 'a']);
  });
});

describe('persistence', () => {
  beforeEach(() => localStorage.clear());

  it('기본값은 교사 지정순(custom)', () => {
    expect(loadSortOrder('chapters', 'u1')).toBe(DEFAULT_SORT_ORDER);
    expect(isManualOrder(DEFAULT_SORT_ORDER)).toBe(true);
    expect(isManualOrder('newest')).toBe(false);
  });
  it('사용자·종류별로 저장/복원하며 잘못된 값은 무시', () => {
    saveSortOrder('chapters', 'u1', 'newest');
    expect(loadSortOrder('chapters', 'u1')).toBe('newest');
    expect(loadSortOrder('videos', 'u1')).toBe('custom');
    expect(loadSortOrder('chapters', 'u2')).toBe('custom');
    saveSortOrder('chapters', 'u1', 'bogus');
    expect(loadSortOrder('chapters', 'u1')).toBe('newest');
    localStorage.setItem(sortOrderStorageKey('videos', 'u1'), 'nope');
    expect(loadSortOrder('videos', 'u1')).toBe('custom');
  });
});
