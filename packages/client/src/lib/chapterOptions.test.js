import { describe, it, expect } from 'vitest';
import { chapterOptionsForVideo } from './chapterOptions';

const chapters = [{ id: 'a', title: 'A', unitId: 'u1' }, { id: 'b', title: 'B', unitId: 'u2' }, { id: 'c', title: 'C', unitId: null }];
const ids = (list) => list.map((c) => c.id);

describe('chapterOptionsForVideo', () => {
  it('단원 없는 학급 → 전부', () => expect(ids(chapterOptionsForVideo(chapters, { unitId: null }, []))).toEqual(['a', 'b', 'c']));
  it('미분류 영상 → 전부', () => expect(ids(chapterOptionsForVideo(chapters, { unitId: null }, [{ id: 'u1' }]))).toEqual(['a', 'b', 'c']));
  it('단원 영상 → 그 단원 챕터만', () => expect(ids(chapterOptionsForVideo(chapters, { unitId: 'u1' }, [{ id: 'u1' }]))).toEqual(['a']));
  it('현재 연결이 다른 단원 챕터면 끝에 붙임', () =>
    expect(ids(chapterOptionsForVideo(chapters, { unitId: 'u1', chapterId: 'b' }, [{ id: 'u1' }]))).toEqual(['a', 'b']));
  it('unitId 가 목록에 없는 단원(지워짐)이면 전부', () =>
    expect(ids(chapterOptionsForVideo(chapters, { unitId: 'gone' }, [{ id: 'u1' }]))).toEqual(['a', 'b', 'c']));
});
