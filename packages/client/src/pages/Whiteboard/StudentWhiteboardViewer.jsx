import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Users } from 'lucide-react';
import { api } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import PageNavOverlay from '../../components/study/PageNavOverlay';
import WhiteboardCanvas from '../../components/whiteboard/WhiteboardCanvas';

/**
 * 학생 화이트보드 — 자기 모둠 보드 편집, 열람 허용 시 다른 모둠 읽기 전용 전환.
 * StudyPageRouter 가 `page.pageType === 'whiteboard'` 일 때 렌더한다.
 */
export default function StudentWhiteboardViewer({ chapterId, classroomId, pages, currentPage }) {
  const navigate = useNavigate();
  const [view, setView] = useState(null);
  const [error, setError] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState(null);

  const pageId = currentPage.id;

  const load = useCallback(() => {
    return api.get(`/api/whiteboards/page/${pageId}?classroomId=${classroomId}`)
      .then((v) => {
        setView(v);
        setSelectedGroupId((prev) => (prev && v.groups.some((g) => g.id === prev) ? prev : v.myGroupId));
      })
      .catch((err) => setError(err.message ?? '보드를 불러오지 못했습니다.'));
  }, [pageId, classroomId]);

  useEffect(() => {
    let alive = true;
    api.get(`/api/whiteboards/page/${pageId}?classroomId=${classroomId}`)
      .then((v) => {
        if (!alive) return;
        setView(v);
        setSelectedGroupId((prev) => (prev && v.groups.some((g) => g.id === prev) ? prev : v.myGroupId));
      })
      .catch((err) => { if (alive) setError(err.message ?? '보드를 불러오지 못했습니다.'); });
    return () => { alive = false; };
  }, [pageId, classroomId]);

  /* 열람 허용 토글 반영 (서버 wb:settings) */
  useEffect(() => {
    const sock = getSocket();
    if (!sock) return undefined;
    const onSettings = (d) => {
      if (d.pageId !== pageId || d.classroomId !== classroomId) return;
      setView((prev) => (prev ? { ...prev, settings: { ...prev.settings, allowCrossGroupView: d.allowCrossGroupView, lockedAll: d.lockedAll } } : prev));
      if (!d.allowCrossGroupView) setSelectedGroupId((prev) => (view?.myGroupId ?? prev));
    };
    sock.on('wb:settings', onSettings);
    return () => sock.off('wb:settings', onSettings);
  }, [pageId, classroomId, view?.myGroupId]);

  const idx = useMemo(() => pages.findIndex((p) => p.id === pageId), [pages, pageId]);
  const goTo = (p) => { if (p) navigate(`/student/study/${chapterId}/page/${p.id}`); };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3" style={{ height: '100dvh' }}>
        <p className="text-red-500">{error}</p>
        <button type="button" onClick={() => navigate(`/student/classrooms/${classroomId}`)} className="px-4 py-2 border rounded-md cursor-pointer">돌아가기</button>
      </div>
    );
  }
  if (!view) {
    return <div className="flex items-center justify-center" style={{ height: '100dvh' }}><p className="text-gray-500">로딩 중...</p></div>;
  }

  const myGroup = view.groups.find((g) => g.id === view.myGroupId) ?? null;
  const selected = view.groups.find((g) => g.id === selectedGroupId) ?? null;
  const canSwitch = view.settings.allowCrossGroupView && view.groups.length > 1;
  const isOwnBoard = !!selected && selected.id === view.myGroupId;

  const left = (
    <>
      <button
        type="button" onClick={() => navigate(`/student/classrooms/${classroomId}`)} title="나가기"
        className="p-1.5 text-gray-500 hover:text-gray-800 cursor-pointer"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      {canSwitch ? (
        <select
          value={selectedGroupId ?? ''} onChange={(e) => setSelectedGroupId(e.target.value)}
          className="border rounded-md px-2 min-h-9 text-sm bg-white"
          aria-label="모둠 선택"
        >
          {view.groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}{g.id === view.myGroupId ? ' (내 모둠)' : ''}</option>
          ))}
        </select>
      ) : (
        <span className="inline-flex items-center gap-1 text-sm font-medium text-gray-800 whitespace-nowrap">
          <Users className="h-4 w-4 text-indigo-500" /> {myGroup?.name ?? '모둠 없음'}
        </span>
      )}
      <span className="text-xs text-gray-400 whitespace-nowrap">{idx + 1} / {pages.length}</span>
    </>
  );

  if (!view.myGroupId) {
    return (
      <div className="relative flex flex-col" style={{ height: '100dvh' }}>
        <div className="flex items-center gap-2 px-2 h-12 bg-white border-b">{left}</div>
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-6">
          <Users className="h-10 w-10 text-gray-300" />
          <p className="text-gray-700 font-medium">모둠이 배정되지 않았습니다.</p>
          <p className="text-sm text-gray-500">선생님께 모둠 배정을 요청하세요. 배정되면 이 페이지를 다시 열면 됩니다.</p>
          <button type="button" onClick={load} className="mt-2 px-4 min-h-10 border rounded-md text-sm cursor-pointer">다시 확인</button>
        </div>
        <PageNavOverlay onPrev={() => goTo(pages[idx - 1])} onNext={() => goTo(pages[idx + 1])} hasPrev={idx > 0} hasNext={idx < pages.length - 1} />
      </div>
    );
  }

  return (
    <div className="relative" style={{ height: '100dvh' }}>
      <WhiteboardCanvas
        boardId={selected?.id ?? null}
        pageId={pageId}
          isTeacher={false}
        readOnly={!isOwnBoard}
        templateKey={isOwnBoard ? view.templateKey : null}
        showStartTemplatePicker={isOwnBoard && !view.templateKey}
        topLeft={left}
        onRemoved={load}
      />
      <PageNavOverlay onPrev={() => goTo(pages[idx - 1])} onNext={() => goTo(pages[idx + 1])} hasPrev={idx > 0} hasNext={idx < pages.length - 1} />
    </div>
  );
}
