import { describe, it, expect } from 'vitest';
import {
  accuracy, watchPercent, itemsForUnit, groupByUnit, studentSummary,
  classRowForChapter, classRowForVideo, resolveDashboardSelection,
} from './dashboardViews';

const units = [{ id: 'u2', title: '2단원', position: 1 }, { id: 'u1', title: '1단원', position: 0 }];
const chapters = [
  { id: 'c1', title: '1-1', totalPages: 6, unitId: 'u1', position: 0 },
  { id: 'c2', title: '1-2', totalPages: 6, unitId: 'u1', position: 1 },
  { id: 'c3', title: '기타', totalPages: 0, unitId: null, position: 2 },
];
const videos = [
  { id: 'v1', title: '영상1', unitId: 'u1', durationSec: 100, position: 0 },
  { id: 'v2', title: '영상2', unitId: null, durationSec: null, position: 1 },
  { id: 'v3', title: '영상3', unitId: 'u1', durationSec: 200, position: 2 },
];
const student = {
  studentId: 's1', name: '김민준',
  overall: { attempts: 3, correct: 2 },
  cells: { c1: { attempts: 3, correct: 2, notedPages: 4 }, c2: { attempts: 0, correct: 0, notedPages: 1 } },
  videoCells: { v1: { maxPositionSec: 90, completed: true }, v3: { maxPositionSec: 50, completed: false }, v2: { maxPositionSec: 10, completed: true } },
};

describe('accuracy / watchPercent', () => {
  it('시도가 없으면 null, 있으면 반올림 %', () => {
    expect(accuracy(0, 0)).toBeNull();
    expect(accuracy(2, 3)).toBe(67);
  });
  it('길이를 모르면 null, 100 을 넘지 않는다', () => {
    expect(watchPercent(50, null)).toBeNull();
    expect(watchPercent(50, 0)).toBeNull();
    expect(watchPercent(120, 100)).toBe(100);
    expect(watchPercent(45, 90)).toBe(50);
  });
});

describe('itemsForUnit', () => {
  it('없음=전체, none=미지정, 그 외=그 단원', () => {
    expect(itemsForUnit(chapters, null)).toHaveLength(3);
    expect(itemsForUnit(chapters, undefined)).toHaveLength(3);
    expect(itemsForUnit(chapters, 'none').map((c) => c.id)).toEqual(['c3']);
    expect(itemsForUnit(videos, 'u1').map((v) => v.id)).toEqual(['v1', 'v3']);
  });
});

describe('groupByUnit', () => {
  it('단원 position 순으로 묶고, 빈 단원은 빼고, 미지정은 마지막에', () => {
    const g = groupByUnit(units, chapters, videos);
    expect(g.map((x) => x.unit?.id ?? null)).toEqual(['u1', null]); // u2 는 비어 생략
    expect(g[0].chapters.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(g[0].videos.map((v) => v.id)).toEqual(['v1', 'v3']);
    expect(g[1].chapters.map((c) => c.id)).toEqual(['c3']);
    expect(g[1].videos.map((v) => v.id)).toEqual(['v2']);
  });
});

describe('studentSummary', () => {
  it('영상 완료 수·필기 페이지·시도를 합산한다', () => {
    expect(studentSummary(student, chapters, videos)).toEqual({
      videosCompleted: 2, videosTotal: 3, notedPages: 5, totalPages: 12, attempts: 3, correct: 2,
    });
  });
  it('videoCells 가 없어도 동작한다', () => {
    const s = { ...student, videoCells: undefined, cells: {} };
    expect(studentSummary(s, chapters, videos)).toEqual({
      videosCompleted: 0, videosTotal: 3, notedPages: 0, totalPages: 12, attempts: 3, correct: 2,
    });
  });
});

describe('classRowForChapter / classRowForVideo', () => {
  const s2 = { studentId: 's2', cells: { c1: { attempts: 1, correct: 0, notedPages: 2 } }, videoCells: { v1: { maxPositionSec: 10, completed: false } } };
  it('반 전체 필기율·정답률', () => {
    expect(classRowForChapter([student, s2], chapters[0])).toEqual({ notedRate: 50, accuracy: 50 }); // (4+2)/(2*6), 2/4
    expect(classRowForChapter([student, s2], chapters[2])).toEqual({ notedRate: null, accuracy: null });
    expect(classRowForChapter([], chapters[0])).toEqual({ notedRate: null, accuracy: null });
  });
  it('반 전체 시청·완료 수', () => {
    expect(classRowForVideo([student, s2], videos[0])).toEqual({ watched: 2, completed: 1 });
    expect(classRowForVideo([student, s2], videos[2])).toEqual({ watched: 1, completed: 0 });
  });
});

describe('resolveDashboardSelection', () => {
  const ctx = { units, students: [{ studentId: 's1' }, { studentId: 's2' }] };
  it('잘못된 view 는 chapters, 유효하면 그대로', () => {
    expect(resolveDashboardSelection({ view: 'nope' }, ctx)).toMatchObject({ view: 'chapters', changed: true });
    expect(resolveDashboardSelection({ view: 'videos' }, ctx)).toMatchObject({ view: 'videos', changed: false });
  });
  it('삭제된 단원은 전체(null)로 되돌리고 changed', () => {
    expect(resolveDashboardSelection({ view: 'chapters', unit: 'gone' }, ctx)).toMatchObject({ unit: null, changed: true });
    expect(resolveDashboardSelection({ view: 'chapters', unit: 'none' }, ctx)).toMatchObject({ unit: 'none', changed: false });
    expect(resolveDashboardSelection({ view: 'chapters', unit: 'u1' }, ctx)).toMatchObject({ unit: 'u1', changed: false });
  });
  it('학생별에서 학생이 없거나 명렬에 없으면 첫 학생, 학생 0명이면 null', () => {
    expect(resolveDashboardSelection({ view: 'students' }, ctx)).toMatchObject({ student: 's1', changed: true });
    expect(resolveDashboardSelection({ view: 'students', student: 'left' }, ctx)).toMatchObject({ student: 's1', changed: true });
    expect(resolveDashboardSelection({ view: 'students', student: 's2' }, ctx)).toMatchObject({ student: 's2', changed: false });
    expect(resolveDashboardSelection({ view: 'students' }, { units, students: [] })).toMatchObject({ student: null, changed: false });
  });
  it('챕터별·영상별에서는 student 를 그대로 둔다(주소를 흔들지 않음)', () => {
    expect(resolveDashboardSelection({ view: 'chapters', student: 's2' }, ctx)).toMatchObject({ student: 's2', changed: false });
  });
});
