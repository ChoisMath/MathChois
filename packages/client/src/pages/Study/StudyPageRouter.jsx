import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import StudyViewer from './StudyViewer';
import CoachingViewer from './CoachingViewer';
import StudentWhiteboardViewer from '../Whiteboard/StudentWhiteboardViewer';
import { getCachedChapterAndPages } from '../../lib/dataCache';

/** 페이지 타입에 따라 일반 StudyViewer ↔ AI CoachingViewer ↔ 화이트보드 분기 */
export default function StudyPageRouter() {
  const { chapterId, pageId } = useParams();
  // 챕터 단위로 불러와 두고, 쪽은 그 목록에서 **동기적으로** 고른다. 같은 챕터 안에서 쪽을 넘길 때 로딩 화면을 거치지
  // 않아야 StudyViewer 가 내렸다 올라오지 않는다(사이드바 열림 같은 화면 상태가 유지된다). 챕터가 바뀔 때만 로딩.
  // (effect 안에서 동기 setState 를 하지 않기 위해 상태에 chapterId 를 함께 둔다 — react-hooks/set-state-in-effect)
  const [state, setState] = useState({ chapterId: null, pages: [], chapter: null });
  const loading = state.chapterId !== chapterId;
  const page = loading ? null : state.pages.find((p) => p.id === pageId) || null;

  useEffect(() => {
    let alive = true;
    getCachedChapterAndPages(chapterId)
      .then(({ chapter, pages }) => {
        if (!alive) return;
        setState({ chapterId, pages: pages || [], chapter: chapter || null });
      })
      .catch(() => { if (alive) setState({ chapterId, pages: [], chapter: null }); });
    return () => { alive = false; };
  }, [chapterId]);

  if (loading) {
    return <div className="flex items-center justify-center" style={{ height: '100dvh' }}><p className="text-gray-500">로딩 중...</p></div>;
  }
  if (page?.pageType === 'whiteboard') {
    // 학생의 학급 = URL 챕터의 학급 (연결 챕터는 학생 학급의 챕터 id 가 URL 에 온다)
    return (
      <StudentWhiteboardViewer
        chapterId={chapterId}
        classroomId={state.chapter?.classroomId}
        pages={state.pages}
        currentPage={page}
      />
    );
  }
  if (page?.aiProblemId) {
    return <CoachingViewer chapterId={chapterId} pages={state.pages} currentPage={page} />;
  }
  return <StudyViewer />;
}
