import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import TeacherStudyViewer from './TeacherStudyViewer';
import TeacherCoachingReview from './TeacherCoachingReview';
import { getCachedChapterAndPages } from '../../lib/dataCache';

/** 교사 필기 라우트: AI 코칭 페이지면 TeacherCoachingReview(학생별 코칭), 아니면 TeacherStudyViewer */
export default function TeacherStudyPageRouter() {
  const { classroomId, chapterId, pageId } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState({ loading: true, pages: [], page: null });

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    getCachedChapterAndPages(chapterId)
      .then(({ pages }) => {
        if (!alive) return;
        const page = (pages || []).find((p) => p.id === pageId) || null;
        setState({ loading: false, pages: pages || [], page });
      })
      .catch(() => { if (alive) setState({ loading: false, pages: [], page: null }); });
    return () => { alive = false; };
  }, [chapterId, pageId]);

  if (state.loading) {
    return <div className="flex items-center justify-center" style={{ height: '100dvh' }}><p className="text-gray-500">로딩 중...</p></div>;
  }
  if (state.page?.aiProblemId) {
    const base = `/teacher/classrooms/${classroomId}/chapters/${chapterId}/study/page`;
    return (
      <TeacherCoachingReview
        classroomId={classroomId}
        chapterId={chapterId}
        pages={state.pages}
        currentPage={state.page}
        onNavigate={(p) => navigate(`${base}/${p.id}`)}
        onExit={() => navigate(`/teacher/classrooms/${classroomId}/chapters/${chapterId}/monitor`)}
      />
    );
  }
  return <TeacherStudyViewer />;
}
