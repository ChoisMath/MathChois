// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement, useEffect } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route, useNavigate, useParams } from 'react-router-dom';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mounts = { student: 0, teacher: 0 };
function viewerMock(kind) {
  return function Viewer() {
    const { pageId } = useParams();
    useEffect(() => { mounts[kind] += 1; }, []);
    return createElement('div', { 'data-viewer': kind, 'data-page': pageId });
  };
}
vi.mock('./StudyViewer', () => ({ default: viewerMock('student') }));
vi.mock('./TeacherStudyViewer', () => ({ default: viewerMock('teacher') }));
vi.mock('./CoachingViewer', () => ({ default: () => createElement('div', { 'data-viewer': 'coaching' }) }));
vi.mock('./TeacherCoachingReview', () => ({ default: () => createElement('div', { 'data-viewer': 'coaching' }) }));
vi.mock('../Whiteboard/StudentWhiteboardViewer', () => ({ default: () => createElement('div', { 'data-viewer': 'whiteboard' }) }));
vi.mock('../Whiteboard/TeacherWhiteboardPage', () => ({ default: () => createElement('div', { 'data-viewer': 'whiteboard' }) }));

const chapters = {
  c1: { chapter: { id: 'c1', classroomId: 'k' }, pages: [{ id: 'p1' }, { id: 'p2' }, { id: 'wb', pageType: 'whiteboard' }, { id: 'ai', aiProblemId: 'q' }] },
  c2: { chapter: { id: 'c2', classroomId: 'k' }, pages: [{ id: 'p9' }] },
};
vi.mock('../../lib/dataCache', () => ({ getCachedChapterAndPages: vi.fn((id) => Promise.resolve(chapters[id])) }));

const { default: StudyPageRouter } = await import('./StudyPageRouter');
const { default: TeacherStudyPageRouter } = await import('./TeacherStudyPageRouter');

let nav;
function NavProbe() { nav = useNavigate(); return null; }
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

function setup(pattern, Router, first) {
  const host = document.createElement('div');
  const root = createRoot(host);
  act(() => {
    root.render(createElement(MemoryRouter, { initialEntries: [first] },
      createElement(NavProbe),
      createElement(Routes, null, createElement(Route, { path: pattern, element: createElement(Router) }))));
  });
  return { host, root };
}

describe.each([
  ['학생', '/student/study/:chapterId/page/:pageId', StudyPageRouter, 'student', (c, p) => `/student/study/${c}/page/${p}`],
  ['교사', '/teacher/classrooms/:classroomId/chapters/:chapterId/study/page/:pageId', TeacherStudyPageRouter, 'teacher', (c, p) => `/teacher/classrooms/k/chapters/${c}/study/page/${p}`],
])('%s 필기 라우터 — 같은 챕터 안에서 페이지를 넘길 때 뷰어를 내렸다 올리지 않는다', (_, pattern, Router, kind, url) => {
  beforeEach(() => { mounts[kind] = 0; });

  it('첫 열기는 로딩 뒤 뷰어, 다음 쪽으로 가도 같은 뷰어 인스턴스가 새 pageId 를 받는다(사이드바 등 상태 유지)', async () => {
    const { host, root } = setup(pattern, Router, url('c1', 'p1'));
    expect(host.textContent).toContain('로딩 중');
    await flush();
    expect(host.querySelector(`[data-viewer="${kind}"]`).getAttribute('data-page')).toBe('p1');
    expect(mounts[kind]).toBe(1);
    act(() => { nav(url('c1', 'p2')); });
    expect(host.textContent).not.toContain('로딩 중'); // 동기적으로 바로 다음 쪽
    expect(host.querySelector(`[data-viewer="${kind}"]`).getAttribute('data-page')).toBe('p2');
    await flush();
    expect(mounts[kind]).toBe(1); // 다시 마운트되지 않음
    act(() => { root.unmount(); });
  });

  it('쪽 종류가 바뀌면(화이트보드·AI 코칭) 그 화면으로 바꾸고, 다른 챕터로 가면 로딩 뒤 새로 올린다', async () => {
    const { host, root } = setup(pattern, Router, url('c1', 'p1'));
    await flush();
    act(() => { nav(url('c1', 'wb')); });
    expect(host.querySelector('[data-viewer="whiteboard"]')).not.toBeNull();
    act(() => { nav(url('c1', 'ai')); });
    expect(host.querySelector('[data-viewer="coaching"]')).not.toBeNull();
    act(() => { nav(url('c2', 'p9')); });
    expect(host.textContent).toContain('로딩 중');
    await flush();
    expect(host.querySelector(`[data-viewer="${kind}"]`).getAttribute('data-page')).toBe('p9');
    expect(mounts[kind]).toBe(2);
    act(() => { root.unmount(); });
  });
});
