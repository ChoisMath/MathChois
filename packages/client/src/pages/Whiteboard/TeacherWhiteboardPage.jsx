import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, LayoutGrid, Square, Settings, Loader } from 'lucide-react';
import { api } from '../../lib/api';
import { getCachedChapterAndPages, invalidatePagesCache } from '../../lib/dataCache';
import { getSocket } from '../../lib/socket';
import { usePdfDownloader } from '../../lib/pdfDownloader';
import { useWhiteboardGrid } from '../../hooks/useWhiteboardGrid';
import { buildTemplateElements } from '../../lib/whiteboardTemplateBuild';
import { exportBoardPng, boardsToPdfPages } from '../../lib/whiteboardExportBrowser';
import PageNavOverlay from '../../components/study/PageNavOverlay';
import WhiteboardCanvas from '../../components/whiteboard/WhiteboardCanvas';
import WhiteboardTile from '../../components/whiteboard/WhiteboardTile';
import WhiteboardSettingsDrawer from '../../components/whiteboard/WhiteboardSettingsDrawer';

const MODE_KEY = 'mc_wb_teacher_mode';

/**
 * 교사 화이트보드 — 격자(모든 모둠 타일) / 단일(모둠 드롭다운, 편집) + 설정 드로어
 * 라우트: /teacher/classrooms/:classroomId/chapters/:chapterId/whiteboard/:pageId
 *        (TeacherStudyPageRouter 도 pageType==='whiteboard' 이면 여기로)
 */
export default function TeacherWhiteboardPage() {
  const { classroomId, chapterId, pageId } = useParams();
  const navigate = useNavigate();
  const { downloadMultiplePages } = usePdfDownloader();

  const [view, setView] = useState(null);
  const [pages, setPages] = useState([]);
  const [chapter, setChapter] = useState(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState(() => { try { return localStorage.getItem(MODE_KEY) || 'grid'; } catch { return 'grid'; } });
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [drawer, setDrawer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const q = `?classroomId=${classroomId}`;

  const reload = useCallback(() => {
    return api.get(`/api/whiteboards/page/${pageId}${q}`)
      .then((v) => {
        setView(v);
        setSelectedGroupId((prev) => (prev && v.groups.some((g) => g.id === prev) ? prev : (v.groups[0]?.id ?? null)));
      })
      .catch((err) => setError(err.message ?? '보드를 불러오지 못했습니다.'));
  }, [pageId, q]);

  useEffect(() => {
    let alive = true;
    api.get(`/api/whiteboards/page/${pageId}${q}`)
      .then((v) => {
        if (!alive) return;
        setView(v);
        setSelectedGroupId((prev) => (prev && v.groups.some((g) => g.id === prev) ? prev : (v.groups[0]?.id ?? null)));
      })
      .catch((err) => { if (alive) setError(err.message ?? '보드를 불러오지 못했습니다.'); });
    getCachedChapterAndPages(chapterId)
      .then(({ chapter: ch, pages: pgs }) => { if (alive) { setChapter(ch); setPages(pgs || []); } })
      .catch(() => {});
    return () => { alive = false; };
  }, [pageId, chapterId, q]);

  /* 다른 창의 설정 변경 반영 */
  useEffect(() => {
    const sock = getSocket();
    if (!sock) return undefined;
    const onSettings = (d) => {
      if (d.pageId !== pageId || d.classroomId !== classroomId) return;
      setView((prev) => (prev ? { ...prev, settings: { ...prev.settings, allowCrossGroupView: d.allowCrossGroupView, lockedAll: d.lockedAll } } : prev));
    };
    const onLock = (d) => {
      setView((prev) => (prev ? { ...prev, groups: prev.groups.map((g) => (g.id === d.boardId ? { ...g, locked: d.locked } : g)) } : prev));
    };
    sock.on('wb:settings', onSettings);
    sock.on('wb:lock', onLock);
    return () => { sock.off('wb:settings', onSettings); sock.off('wb:lock', onLock); };
  }, [pageId, classroomId]);

  const boardIds = useMemo(() => (view?.groups ?? []).map((g) => g.id), [view]);
  const scenes = useWhiteboardGrid(boardIds, mode === 'grid' && !!view);

  const changeMode = (m) => { setMode(m); try { localStorage.setItem(MODE_KEY, m); } catch { /* ignore */ } };
  const flash = (msg) => { setNotice(msg); setTimeout(() => setNotice(''), 2500); };
  const run = async (fn, okMsg) => {
    setBusy(true);
    try { await fn(); if (okMsg) flash(okMsg); await reload(); }
    catch (err) { alert(err.message ?? '요청에 실패했습니다.'); }
    setBusy(false);
  };

  /* ── 설정 동작 ── */
  const handleSaveGroups = (groups) => run(() => api.put(`/api/whiteboards/page/${pageId}/groups${q}`, {
    groups: groups.map((g, i) => ({ id: g.id, name: g.name.trim() || `${i + 1}모둠`, position: i, studentIds: g.studentIds })),
  }), '모둠 배정을 저장했습니다.');
  const handleToggleCross = (v) => run(() => api.patch(`/api/whiteboards/page/${pageId}/settings${q}`, { allowCrossGroupView: v }));
  const handleToggleLockAll = (v) => run(() => api.patch(`/api/whiteboards/page/${pageId}/settings${q}`, { lockedAll: v }));
  const handleToggleGroupLock = (g, v) => run(() => api.patch(`/api/whiteboards/groups/${g.id}`, { locked: v }));
  const handleTemplateChange = (key) => run(async () => {
    await api.patch(`/api/pages/${pageId}`, { whiteboardTemplate: key });
    invalidatePagesCache(chapterId);
    if (!key) return;
    let applied = 0;
    for (const g of view.groups) {
      if (g.elementCount > 0) continue;
      const res = await api.post(`/api/whiteboards/groups/${g.id}/apply-template`, { elements: buildTemplateElements(key, 0, 0) });
      if (res?.applied) applied++;
    }
    flash(`${applied}개 빈 보드에 템플릿을 적용했습니다.`);
  });
  const handleReset = (g) => {
    if (!window.confirm(`"${g.name}" 보드를 비웁니다. 직전 상태로 한 번 되돌릴 수 있습니다. 계속할까요?`)) return;
    run(() => api.post(`/api/whiteboards/groups/${g.id}/reset`), '보드를 초기화했습니다.');
  };
  const handleRestore = (g) => run(() => api.post(`/api/whiteboards/groups/${g.id}/restore-previous`), '직전 상태로 되돌렸습니다.');
  const fetchScene = async (g) => {
    const b = await api.get(`/api/whiteboards/groups/${g.id}`);
    return { elements: b.scene.elements, files: b.scene.files, backgroundColor: b.backgroundColor, name: b.name };
  };
  const handleExportPng = (g) => run(async () => {
    const b = await fetchScene(g);
    await exportBoardPng(b, `${chapter?.title ?? '화이트보드'}_${b.name}`);
  });
  const handleExportPdf = (groups) => run(async () => {
    const boards = [];
    for (const g of groups) boards.push(await fetchScene(g));
    const pagesData = await boardsToPdfPages(boards);
    await downloadMultiplePages(`${chapter?.title ?? '화이트보드'}_모둠보드`, pagesData, { orientation: 'landscape' });
  });

  /* ── 네비게이션 ── */
  const idx = pages.findIndex((p) => p.id === pageId);
  const goTo = (p) => { if (p) navigate(`/teacher/classrooms/${classroomId}/chapters/${chapterId}/study/page/${p.id}`); };
  const exit = () => navigate(`/teacher/classrooms/${classroomId}/chapters/${chapterId}/monitor`);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3" style={{ height: '100dvh' }}>
        <p className="text-red-500">{error}</p>
        <button type="button" onClick={exit} className="px-4 py-2 border rounded-md cursor-pointer">돌아가기</button>
      </div>
    );
  }
  if (!view) {
    return <div className="flex items-center justify-center" style={{ height: '100dvh' }}><p className="text-gray-500">로딩 중...</p></div>;
  }

  const selected = view.groups.find((g) => g.id === selectedGroupId) ?? null;

  const modeToggle = (
    <div className="inline-flex rounded-md border overflow-hidden">
      <button type="button" onClick={() => changeMode('grid')} title="전체 모둠 보기"
        className={`px-2 min-h-9 cursor-pointer ${mode === 'grid' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
        <LayoutGrid className="h-4 w-4" />
      </button>
      <button type="button" onClick={() => changeMode('single')} title="모둠 하나 편집"
        className={`px-2 min-h-9 cursor-pointer ${mode === 'single' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
        <Square className="h-4 w-4" />
      </button>
    </div>
  );
  const groupSelect = (
    <select value={selectedGroupId ?? ''} onChange={(e) => setSelectedGroupId(e.target.value)}
      className="border rounded-md px-2 min-h-9 text-sm bg-white" aria-label="모둠 선택">
      {view.groups.map((g) => <option key={g.id} value={g.id}>{g.name}{g.locked ? ' 🔒' : ''}</option>)}
    </select>
  );
  const left = (
    <>
      <button type="button" onClick={exit} title="모니터로" className="p-1.5 text-gray-500 hover:text-gray-800 cursor-pointer"><ArrowLeft className="h-5 w-5" /></button>
      {modeToggle}
      {mode === 'single' && groupSelect}
      {pages.length > 0 && <span className="text-xs text-gray-400 whitespace-nowrap">{idx + 1} / {pages.length}</span>}
    </>
  );
  const right = (
    <>
      {busy && <Loader className="h-4 w-4 animate-spin text-gray-400" />}
      <button type="button" onClick={() => setDrawer(true)} title="설정"
        className="inline-flex items-center gap-1 px-2 min-h-9 rounded-md border bg-white hover:bg-gray-50 cursor-pointer text-sm">
        <Settings className="h-4 w-4" /> 설정
      </button>
    </>
  );

  return (
    <div className="relative flex flex-col bg-gray-100" style={{ height: '100dvh' }}>
      {mode === 'grid' ? (
        <>
          <div className="flex items-center gap-2 px-2 h-12 bg-white border-b shadow-sm shrink-0">
            {left}
            <span className="font-medium text-sm text-gray-800 truncate">{chapter?.title}</span>
            <span className="text-xs text-gray-400">{view.groups.length}개 모둠</span>
            {view.settings.lockedAll && <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs">전체 잠금</span>}
            {view.settings.allowCrossGroupView && <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs">다른 모둠 열람 허용</span>}
            <div className="flex-1" />
            {right}
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {view.groups.length === 0 ? (
              <p className="text-gray-500 text-sm">모둠이 없습니다. 설정에서 모둠을 추가하세요.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {view.groups.map((g) => (
                  <WhiteboardTile key={g.id} board={g} scene={scenes[g.id]}
                    onClick={() => { setSelectedGroupId(g.id); changeMode('single'); }} />
                ))}
              </div>
            )}
            {view.unassigned.length > 0 && (
              <p className="mt-4 text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-md px-3 py-2">
                미배정 학생 {view.unassigned.length}명: {view.unassigned.map((m) => m.name).join(', ')} — 설정에서 배정하세요.
              </p>
            )}
          </div>
        </>
      ) : (
        <WhiteboardCanvas
          boardId={selected?.id ?? null}
          pageId={pageId}
          isTeacher
          templateKey={view.templateKey}
          topLeft={left}
          topRight={right}
          onRemoved={reload}
        />
      )}

      {notice && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-40 bg-gray-900 text-white text-sm px-3 py-1.5 rounded-full shadow">{notice}</div>
      )}
      {pages.length > 1 && (
        <PageNavOverlay onPrev={() => goTo(pages[idx - 1])} onNext={() => goTo(pages[idx + 1])} hasPrev={idx > 0} hasNext={idx >= 0 && idx < pages.length - 1} />
      )}
      {drawer && (
        <WhiteboardSettingsDrawer
          view={view} selectedGroupId={selectedGroupId} busy={busy}
          onClose={() => setDrawer(false)}
          onSaveGroups={handleSaveGroups}
          onToggleCross={handleToggleCross}
          onToggleLockAll={handleToggleLockAll}
          onToggleGroupLock={handleToggleGroupLock}
          onTemplateChange={handleTemplateChange}
          onReset={handleReset}
          onRestore={handleRestore}
          onExportPng={handleExportPng}
          onExportPdf={handleExportPdf}
        />
      )}
    </div>
  );
}
