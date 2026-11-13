import { describe, it, expect } from 'vitest';
import { planUnitCopy } from '@mathchois/shared';

const src = (id, title, chapters = [], videos = [], extra = {}) =>
  ({ id, title, description: null, isHidden: false, chapters, videos, ...extra });
const ch = (id, title, sourceChapterId = null) => ({ id, title, description: null, sourceChapterId });
const v = (videoId, chapterTitle = null, note = null) => ({ videoId, note, chapterTitle });
const empty = { units: [], chapters: [], videos: [] };

describe('planUnitCopy', () => {
  it('빈 학급: 단원·챕터·영상 모두 새로, 원본 순서 유지, 연결 챕터 id', () => {
    const p = planUnitCopy([src('u1', '1단원', [ch('c1', '수열'), ch('c2', '급수', 'orig')], [v('v1', '수열')])], empty);
    expect(p.units).toEqual([{ existingUnitId: null, title: '1단원', description: null, isHidden: false }]);
    expect(p.newChapters.map((c) => [c.title, c.sourceChapterId, c.unitIndex])).toEqual([['수열', 'c1', 0], ['급수', 'orig', 0]]);
    expect(p.newVideos).toEqual([{ unitIndex: 0, videoId: 'v1', note: null, chapterTitle: '수열' }]);
    expect(p.counts).toMatchObject({ unitsCreated: 1, unitsMerged: 0, chaptersCreated: 2, videosCreated: 1, linksUnresolved: 0 });
  });

  it('같은 이름 단원은 합치고 숨김은 대상 값(계획엔 existingUnitId 만)', () => {
    const p = planUnitCopy([src('u1', '1단원 ', [], [], { isHidden: true })],
      { ...empty, units: [{ id: 't-u1', title: '1단원' }] });
    expect(p.units).toHaveLength(1);
    expect(p.units[0].existingUnitId).toBe('t-u1');
    expect(p.counts).toMatchObject({ unitsCreated: 0, unitsMerged: 1 });
  });

  it('대상에 같은 이름 단원이 둘이면 앞(목록 순서상 먼저) 단원에 합친다', () => {
    const p = planUnitCopy([src('u1', '1단원')],
      { ...empty, units: [{ id: 't-first', title: '1단원' }, { id: 't-second', title: '1단원' }] });
    expect(p.units[0].existingUnitId).toBe('t-first');
  });

  it('대상에 같은 이름 챕터(공백만 다름)가 있으면 새로 만들지 않고 옮김', () => {
    const p = planUnitCopy([src('u1', '1단원', [ch('c1', '수열')])],
      { ...empty, chapters: [{ id: 't-c1', title: ' 수열 ' }] });
    expect(p.movedChapters).toEqual([{ chapterId: 't-c1', unitIndex: 0 }]);
    expect(p.newChapters).toEqual([]);
    expect(p.counts).toMatchObject({ chaptersCreated: 0, chaptersMoved: 1 });
  });

  it('원본 단원 안 같은 이름 챕터 둘 → 하나만 생성', () => {
    const p = planUnitCopy([src('u1', '1단원', [ch('c1', '수열'), ch('c2', '수열')])], empty);
    expect(p.newChapters.map((c) => c.sourceChapterId)).toEqual(['c1']);
    expect(p.counts.chaptersCreated).toBe(1);
  });

  it('선택한 원본 단원 둘의 이름이 같으면 대상 단원 하나', () => {
    const p = planUnitCopy([
      src('u1', '1단원', [ch('c1', '수열')], [v('v1')]),
      src('u2', '1단원', [ch('c2', '급수')], [v('v2')]),
    ], empty);
    expect(p.units).toHaveLength(1);
    expect(p.newChapters.map((c) => c.unitIndex)).toEqual([0, 0]);
    expect(p.newVideos.map((x) => x.unitIndex)).toEqual([0, 0]);
    expect(p.counts).toMatchObject({ unitsCreated: 1, unitsMerged: 0 });
  });

  it('필기 챕터가 단원 밖: 대상에 같은 이름 있으면 연결, 없으면 linksUnresolved', () => {
    const p = planUnitCopy([src('u1', '1단원', [ch('c1', '수열')], [v('v1', '미분'), v('v2', '적분')])],
      { ...empty, chapters: [{ id: 't-c5', title: '미분' }] });
    expect(p.newVideos.map((x) => x.chapterTitle)).toEqual(['미분', '적분']);
    expect(p.newChapters.map((c) => c.title)).toEqual(['수열']); // 단원 밖 챕터는 따라 복사하지 않음
    expect(p.counts.linksUnresolved).toBe(1);
  });

  it('이미 배정된 영상: 옮기고 메모·연결 유지, 미해결로 세지 않음', () => {
    const p = planUnitCopy([src('u1', '1단원', [], [v('v1', '없는챕터', '원본 메모')])],
      { ...empty, videos: [{ id: 't-cv1', videoId: 'v1', note: '기존', chapterId: 't-c9' }] });
    expect(p.newVideos).toEqual([]);
    expect(p.movedVideos).toEqual([{ classroomVideoId: 't-cv1', unitIndex: 0, fillNote: null, linkChapterTitle: null }]);
    expect(p.counts).toMatchObject({ videosCreated: 0, videosMoved: 1, linksUnresolved: 0 });
  });

  it('이미 배정된 영상의 메모가 공백뿐이고 연결이 없으면 원본 메모·연결로 채움', () => {
    const p = planUnitCopy([src('u1', '1단원', [ch('c1', '수열')], [v('v1', '수열', '원본 메모')])],
      { ...empty, videos: [{ id: 't-cv1', videoId: 'v1', note: '  ', chapterId: null }] });
    expect(p.movedVideos).toEqual([{ classroomVideoId: 't-cv1', unitIndex: 0, fillNote: '원본 메모', linkChapterTitle: '수열' }]);
    expect(p.counts.linksUnresolved).toBe(0);
  });

  it('같은 videoId 가 원본에 두 번 나오면 첫 번째만', () => {
    const p = planUnitCopy([src('u1', 'A', [], [v('v1')]), src('u2', 'B', [], [v('v1')])], empty);
    expect(p.newVideos).toEqual([{ unitIndex: 0, videoId: 'v1', note: null, chapterTitle: null }]);
  });

  it('빈 단원도 단원은 생성', () => {
    const p = planUnitCopy([src('u1', '빈 단원')], empty);
    expect(p.units).toHaveLength(1);
    expect(p.counts).toEqual({ unitsCreated: 1, unitsMerged: 0, chaptersCreated: 0, chaptersMoved: 0, videosCreated: 0, videosMoved: 0, linksUnresolved: 0 });
  });

  it('숨긴 원본 단원을 새로 만들 때 isHidden 과 설명 복사', () => {
    const p = planUnitCopy([src('u1', '1단원', [], [], { isHidden: true, description: '설명' })], empty);
    expect(p.units[0]).toEqual({ existingUnitId: null, title: '1단원', description: '설명', isHidden: true });
  });
});
