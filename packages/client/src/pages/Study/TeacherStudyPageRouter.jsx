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
  // 챕터 단위로 불러와 두고, 쪽은 그 목록에서 **동기적으로** 고른다. 같은 챕터 안에서 쪽을 넘길 때 로딩 화면을 거치지
  // 않아야 TeacherStudyViewer 가 내렸다 올라오지 않는다(사이드바 열림 같은 화면 상태가 유지된다). 챕터가 바뀔 때만 로딩.
  // (effect 안에서 동기 setState 를 하지 않기 위해 상태에 chapterId 를 함께 둔다 — react-hooks/set-state-in-effect)
  const [state, setState] = useState({ chapterId: null, pages: [] });
  const loading = state.chapterId !== chapterId;
  const page = loading ? null : state.pages.find((p) => p.id === pageId) || null;

  useEffect(() => {
    let alive = true;
    getCachedChapterAndPages(chapterId)
      .then(({ pages }) => {
        if (!alive) return;
        setState({ chapterId, pages: pages || [] });
      })
      .catch(() => { if (alive) setState({ chapterId, pages: [] }); });
    return () => { alive = false; };
  }, [chapterId]);

  if (loading) {
    return <div className="flex items-center justify-center" style={{ height: '100dvh' }}><p className="text-gray-500">로딩 중...</p></div>;
  }
  if (page?.pageType === 'whiteboard') {
    return <TeacherWhiteboardPage />;
  }
  if (page?.aiProblemId) {
    const base = `/teacher/classrooms/${classroomId}/chapters/${chapterId}/study/page`;
    return (
      <TeacherCoachingReview
        classroomId={classroomId}
        pages={state.pages}
        currentPage={page}
        onNavigate={(p) => navigate(`${base}/${p.id}`)}
        onExit={() => navigate(`/teacher/classrooms/${classroomId}/chapters/${chapterId}/monitor`)}
      />
    );
  }
  return <TeacherStudyViewer />;
}
