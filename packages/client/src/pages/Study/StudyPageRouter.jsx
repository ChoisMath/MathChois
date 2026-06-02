import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import StudyViewer from './StudyViewer';
import CoachingViewer from './CoachingViewer';
import { getCachedChapterAndPages } from '../../lib/dataCache';

/** 페이지 타입에 따라 일반 StudyViewer ↔ AI CoachingViewer 분기 */
export default function StudyPageRouter() {
  const { chapterId, pageId } = useParams();
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
    return <CoachingViewer chapterId={chapterId} pages={state.pages} currentPage={state.page} />;
  }
  return <StudyViewer />;
}
