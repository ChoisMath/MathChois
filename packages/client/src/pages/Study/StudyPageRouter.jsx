import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import StudyViewer from './StudyViewer';
import CoachingViewer from './CoachingViewer';
import StudentWhiteboardViewer from '../Whiteboard/StudentWhiteboardViewer';
import { getCachedChapterAndPages } from '../../lib/dataCache';

/** 페이지 타입에 따라 일반 StudyViewer ↔ AI CoachingViewer ↔ 화이트보드 분기 */
export default function StudyPageRouter() {
  const { chapterId, pageId } = useParams();
  // 로드한 결과에 key 를 붙여 두고, 현재 라우트와 key 가 다르면 로딩 중으로 본다
  // (effect 안에서 loading 을 동기 setState 하지 않기 위함 — react-hooks/set-state-in-effect)
  const key = `${chapterId}/${pageId}`;
  const [state, setState] = useState({ key: null, pages: [], page: null, chapter: null });
  const loading = state.key !== key;

  useEffect(() => {
    let alive = true;
    getCachedChapterAndPages(chapterId)
      .then(({ chapter, pages }) => {
        if (!alive) return;
        const page = (pages || []).find((p) => p.id === pageId) || null;
        setState({ key: `${chapterId}/${pageId}`, pages: pages || [], page, chapter: chapter || null });
      })
      .catch(() => { if (alive) setState({ key: `${chapterId}/${pageId}`, pages: [], page: null, chapter: null }); });
    return () => { alive = false; };
  }, [chapterId, pageId]);

  if (loading) {
    return <div className="flex items-center justify-center" style={{ height: '100dvh' }}><p className="text-gray-500">로딩 중...</p></div>;
  }
  if (state.page?.pageType === 'whiteboard') {
    // 학생의 학급 = URL 챕터의 학급 (연결 챕터는 학생 학급의 챕터 id 가 URL 에 온다)
    return (
      <StudentWhiteboardViewer
        chapterId={chapterId}
        classroomId={state.chapter?.classroomId}
        pages={state.pages}
        currentPage={state.page}
      />
    );
  }
  if (state.page?.aiProblemId) {
    return <CoachingViewer chapterId={chapterId} pages={state.pages} currentPage={state.page} />;
  }
  return <StudyViewer />;
}
