import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import TeacherStudyViewer from './TeacherStudyViewer';
import TeacherCoachingReview from './TeacherCoachingReview';
import TeacherWhiteboardPage from '../Whiteboard/TeacherWhiteboardPage';
import { getCachedChapterAndPages } from '../../lib/dataCache';

/** 교사 필기 라우트: AI 코칭 페이지면 TeacherCoachingReview(학생별 코칭), 아니면 TeacherStudyViewer */
export default function TeacherStudyPageRouter() {
  const { classroomId, chapterId, pageId } = useParams();
  const navigate = useNavigate();
  // 로드한 결과에 key 를 붙여 두고, 현재 라우트와 key 가 다르면 로딩 중으로 본다
  // (effect 안에서 loading 을 동기 setState 하지 않기 위함 — react-hooks/set-state-in-effect)
  const key = `${chapterId}/${pageId}`;
  const [state, setState] = useState({ key: null, pages: [], page: null });
  const loading = state.key !== key;

  useEffect(() => {
    let alive = true;
    getCachedChapterAndPages(chapterId)
      .then(({ pages }) => {
        if (!alive) return;
        const page = (pages || []).find((p) => p.id === pageId) || null;
        setState({ key: `${chapterId}/${pageId}`, pages: pages || [], page });
      })
      .catch(() => { if (alive) setState({ key: `${chapterId}/${pageId}`, pages: [], page: null }); });
    return () => { alive = false; };
  }, [chapterId, pageId]);

  if (loading) {
    return <div className="flex items-center justify-center" style={{ height: '100dvh' }}><p className="text-gray-500">로딩 중...</p></div>;
  }
  if (state.page?.pageType === 'whiteboard') {
    return <TeacherWhiteboardPage />;
  }
  if (state.page?.aiProblemId) {
    const base = `/teacher/classrooms/${classroomId}/chapters/${chapterId}/study/page`;
    return (
      <TeacherCoachingReview
        classroomId={classroomId}
        pages={state.pages}
        currentPage={state.page}
        onNavigate={(p) => navigate(`${base}/${p.id}`)}
        onExit={() => navigate(`/teacher/classrooms/${classroomId}/chapters/${chapterId}/monitor`)}
      />
    );
  }
  return <TeacherStudyViewer />;
}
