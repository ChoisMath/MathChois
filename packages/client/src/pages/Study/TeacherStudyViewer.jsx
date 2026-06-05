import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, Menu, ChevronUp, ChevronDown,
} from 'lucide-react';
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { api } from '../../lib/api';
import { toolUrl } from '../../lib/toolUrl';
import { useAuth } from '../../contexts/AuthContext';
import DrawingToolbar from '../../components/study/DrawingToolbar';
import PageNavOverlay from '../../components/study/PageNavOverlay';
import {
  BG_ELEMENT_ID,
  BG_FILE_ID,
  ALWAYS_HIDE_CSS,
  PANEL_HIDE_CSS,
  GRID_STYLE,
  fetchAsDataUrl,
  getImageNaturalSize,
  createBgElement,
  prefetchImages,
  calculateBgPosition,
  EXCALIDRAW_UI_OPTIONS,
  TOUCH_CSS,
  waitForLayout,
  clearImageCacheForUrl,
} from '../../lib/excalidrawUtils';
import { useExcalidrawTouch } from '../../hooks/useExcalidrawTouch';
import { useScribbleErase } from '../../hooks/useScribbleErase';
import { useFreedrawSmoothing } from '../../hooks/useFreedrawSmoothing';
import { useExcalidrawUndo } from '../../hooks/useExcalidrawUndo';
import ExcalidrawErrorBoundary from '../../components/ExcalidrawErrorBoundary';
import { getCachedChapterAndPages } from '../../lib/dataCache';
import { usePdfDownloader } from '../../lib/pdfDownloader';
import { PdfDownloadButton } from '../../components/common/PdfDownloadButton';
import { extractYouTubeId, getYouTubeEmbedUrl, getYouTubeThumbnail } from '../../lib/youtubeUtils';

/* ── 세션 내 캐시 ── */
const _notesCache = new Map(); // `${teacherId}_${pageId}` → { elements, bgPosition, files }

/* ─────────── 메인 컴포넌트 ─────────── */
const TeacherStudyViewer = () => {
  const { classroomId, chapterId, pageId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [chapter, setChapter]         = useState(null);
  const [pages, setPages]             = useState([]);
  const [currentPage, setCurrentPage] = useState(null);
  const [loading, setLoading]         = useState(true);
  const [sidebarOpen, setSidebarOpen]         = useState(true);
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false);
  const [noteElements, setNoteElements] = useState([]);
  const [saveStatus, setSaveStatus]   = useState('saved');
  const [showExcalidrawPanel, setShowExcalidrawPanel] = useState(false);
  const { isDownloading, downloadPage, downloadMultiplePages } = usePdfDownloader();

  const containerRef          = useRef(null);
  const saveTimerRef          = useRef(null);
  const excalidrawAPIRef      = useRef(null);
  const currentPageRef        = useRef(null);
  const noteElementsRef       = useRef([]);
  const bgPositionRef         = useRef(null);
  const savedFilesRef         = useRef({}); // 저장된 사용자 삽입 이미지 파일
  const mountedRef            = useRef(true);
  const lastSavedRef          = useRef(null); // 마지막 저장 내용 (JSON) — 변경 감지용
  const pendingSaveDataRef    = useRef(null);
  const activeSidebarItemRef  = useRef(null); // 사이드바 현재 페이지 요소

  const sidebarScrollRef      = useRef(null); // 사이드바 스크롤 컨테이너

  const [screenLocked, setScreenLocked] = useState(false);
  const screenLockedRef   = useRef(false);
  const screenLockBaseRef = useRef({ zoom: 1, scrollX: 0, scrollY: 0 });
  const isRestoringRef       = useRef(false);
  const baseStrokeWidthRef   = useRef(parseFloat(localStorage.getItem('mc_stroke_width') || '0.2'));
  const lastZoomRef          = useRef(1);
  const isAdjustingWidthRef  = useRef(false);
  useEffect(() => { screenLockedRef.current = screenLocked; }, [screenLocked]);

  useExcalidrawTouch({ excalidrawAPIRef, containerRef, screenLockedRef, baseStrokeWidthRef });
  const { checkForScribble } = useScribbleErase({ excalidrawAPIRef });
  const { checkForSmoothing } = useFreedrawSmoothing({ excalidrawAPIRef });
  const { recordHistory, undo, redo, canUndo, canRedo } = useExcalidrawUndo({ excalidrawAPIRef });

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    currentPageRef.current  = currentPage;
    noteElementsRef.current = noteElements;
  }, [currentPage, noteElements]);

  /* ── 페이지 이동 시 pending 저장 flush ── */
  useEffect(() => {
    pendingSaveDataRef.current = null;
    return () => {
      clearTimeout(saveTimerRef.current);
      const pending = pendingSaveDataRef.current;
      if (!pending) return;
      pendingSaveDataRef.current = null;
      if (pending.cacheKey && pending.cacheData) {
        _notesCache.set(pending.cacheKey, pending.cacheData);
      }
      api.put(pending.endpoint, pending.payload).catch((err) => {
        console.error('페이지 이동 시 저장 실패:', err);
        if (pending.cacheKey) _notesCache.delete(pending.cacheKey);
      });
    };
  }, [pageId]);

  /* ── 데이터 로드 ── */
  useEffect(() => {
    const fetchData = async () => {
      if (!mountedRef.current) return;
      setLoading(true);
      bgPositionRef.current = null;
      lastSavedRef.current  = null;

      /* 챕터·페이지 목록: 캐시 우선 → 없으면 병렬 fetch */
      const { chapter: chap, pages: pgs } = await getCachedChapterAndPages(chapterId);
      if (!mountedRef.current) return;
      setChapter(chap);
      setPages(pgs);

      if (pgs && pgs.length > 0) {
        const found = pgs.find((p) => p.id === pageId);
        const target = found || pgs[0];

        if (!found) {
          navigate(
            `/teacher/classrooms/${classroomId}/chapters/${chapterId}/study/page/${pgs[0].id}`,
            { replace: true }
          );
          return;
        }

        setCurrentPage(target);
        /* 마지막 방문 페이지 저장 (재접속 시 이어보기에 사용) */
        localStorage.setItem(`mc_teacherLastPage_${chapterId}`, target.id);

        if (user) {
          const nk = `${user.id}_${target.id}`;
          let noteData;
          if (_notesCache.has(nk)) {
            noteData = _notesCache.get(nk);
          } else {
            try {
              const note = await api.get(`/api/notes/teacher/${target.id}`);
              if (!mountedRef.current) return;
              noteData = {
                elements:   note?.excalidrawData?.elements   || [],
                bgPosition: note?.excalidrawData?.bgPosition ?? null,
                files:      note?.excalidrawData?.files      ?? {},
              };
            } catch {
              if (!mountedRef.current) return;
              noteData = { elements: [], bgPosition: null, files: {} };
            }
            _notesCache.set(nk, noteData);
          }
          setNoteElements(noteData.elements);
          bgPositionRef.current = noteData.bgPosition;
          savedFilesRef.current = noteData.files;
        }
      }
      if (mountedRef.current) setLoading(false);
    };
    fetchData();
  }, [chapterId, pageId, navigate, classroomId, user]);

  /* ── onChange → teacher_notes upsert & 화면 고정 ── */
  const handleExcalidrawChange = useCallback((elements, appState) => {
    if (isRestoringRef.current || isAdjustingWidthRef.current) return;

    /* Excalidraw 내부 penMode 비활성화 — OS 팜 리젝션에 위임 */
    if (appState?.penMode) {
      excalidrawAPIRef.current?.updateScene({ appState: { penMode: false }, commitToHistory: false });
      return;
    }

    /* 줌-독립 펜 두께 (미세 부동소수점 변동 무시) */
    if (appState && Math.abs((appState.zoom?.value || 1) - lastZoomRef.current) > 0.01) {
      lastZoomRef.current = appState.zoom.value;
      const tool = excalidrawAPIRef.current?.getAppState()?.activeTool?.type;
      if (tool === 'freedraw' && baseStrokeWidthRef.current) {
        isAdjustingWidthRef.current = true;
        excalidrawAPIRef.current?.updateScene({
          appState: { currentItemStrokeWidth: Math.max(baseStrokeWidthRef.current / appState.zoom.value, 0.05) },
          commitToHistory: false,
        });
        requestAnimationFrame(() => { isAdjustingWidthRef.current = false; });
      }
    }

    if (appState && screenLockedRef.current) {
      const base = screenLockBaseRef.current;
      if (appState.zoom.value !== base.zoom ||
          appState.scrollX !== base.scrollX ||
          appState.scrollY !== base.scrollY) {
        isRestoringRef.current = true;
        excalidrawAPIRef.current?.updateScene({
          appState: {
            zoom: { value: base.zoom },
            scrollX: base.scrollX,
            scrollY: base.scrollY,
          }
        });
        requestAnimationFrame(() => { isRestoringRef.current = false; });
        return;
      }
    }
    /* 문지르기 지우개 감지 */
    checkForScribble(elements, appState);
    checkForSmoothing(elements, appState);
    recordHistory(elements);

    const bgEl = elements.find((el) => el.id === BG_ELEMENT_ID);
    if (bgEl) {
      bgPositionRef.current = { x: bgEl.x, y: bgEl.y, width: bgEl.width, height: bgEl.height };
    }

    const page = currentPageRef.current;
    if (!user || !page) return;

    const teacherEls = elements.filter((el) => el.id !== BG_ELEMENT_ID && !el.isDeleted);

    /* 직전 저장 내용과 동일하면 저장 스킵 */
    const serialized = JSON.stringify(teacherEls.map((el) => ({ id: el.id, type: el.type, x: el.x, y: el.y, points: el.points, text: el.text, width: el.width, height: el.height, strokeColor: el.strokeColor, strokeWidth: el.strokeWidth })));
    if (serialized === lastSavedRef.current) return;

    /* 페이지 이동 시 flush용 데이터 즉시 캡처 */
    const allFilesSnap = excalidrawAPIRef.current?.getFiles() ?? {};
    const { [BG_FILE_ID]: _bgfSnap, ...userFilesSnap } = allFilesSnap;
    pendingSaveDataRef.current = {
      endpoint: `/api/notes/teacher/${page.id}`,
      payload: {
        excalidrawData: {
          elements: teacherEls,
          bgPosition: bgPositionRef.current,
          ...(Object.keys(userFilesSnap).length > 0 && { files: userFilesSnap }),
        },
      },
      cacheKey: `${user.id}_${page.id}`,
      cacheData: { elements: teacherEls, bgPosition: bgPositionRef.current, files: userFilesSnap },
    };

    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (mountedRef.current) setSaveStatus('saving');
      const allFiles  = excalidrawAPIRef.current?.getFiles() ?? {};
      const { [BG_FILE_ID]: _bgf, ...userFiles } = allFiles;
      try {
        await api.put(`/api/notes/teacher/${page.id}`, {
          excalidrawData: {
            elements:   teacherEls,
            bgPosition: bgPositionRef.current,
            ...(Object.keys(userFiles).length > 0 && { files: userFiles }),
          },
        });
        /* 노트 캐시 갱신 — 저장 성공 시에만 */
        _notesCache.set(`${user.id}_${page.id}`, {
          elements:   teacherEls,
          bgPosition: bgPositionRef.current,
          files:      userFiles,
        });
        lastSavedRef.current = serialized;
        pendingSaveDataRef.current = null;
      } catch (err) {
        console.error('교사 필기 저장 실패:', err);
      }
      if (mountedRef.current) setSaveStatus('saved');
    }, 1500);
  }, [user]);

  const handleToggleScreenLock = useCallback(() => {
    setScreenLocked(prev => {
      if (!prev && excalidrawAPIRef.current) {
        const s = excalidrawAPIRef.current.getAppState();
        screenLockBaseRef.current = { zoom: s.zoom.value, scrollX: s.scrollX, scrollY: s.scrollY };
      }
      return !prev;
    });
  }, []);

  /* ── Excalidraw 마운트 ── */
  const handleExcalidrawMount = useCallback(async (api) => {
    excalidrawAPIRef.current = api;

    /* 펜+검정으로 초기화 (React 렌더 사이클 충돌 방지) */
    setTimeout(() => {
      const savedWidth = parseFloat(localStorage.getItem('mc_stroke_width') || '0.2');
      baseStrokeWidthRef.current = savedWidth;
      const zoom = api.getAppState()?.zoom?.value || 1;
      lastZoomRef.current = zoom;

      api.updateScene({ appState: { currentItemStrokeColor: '#000000', currentItemStrokeWidth: Math.max(savedWidth / zoom, 0.05), currentItemRoundness: 'sharp' }, commitToHistory: false });
      api.setActiveTool({ type: 'freedraw' });
    }, 0);

    const page = currentPageRef.current;
    if (!page?.imageUrl || !containerRef.current) return;

    try {
      const { dataUrl, mimeType } = await fetchAsDataUrl(page.imageUrl);
      const { w: iW, h: iH } = await getImageNaturalSize(dataUrl);

      let bgX, bgY, bgW, bgH;
      const saved = bgPositionRef.current;
      if (saved && saved.width > 10 && saved.height > 10) {
        ({ x: bgX, y: bgY, width: bgW, height: bgH } = saved);
      } else {
        const { width: W, height: H } = await waitForLayout(containerRef.current);
        const pos = calculateBgPosition(W, H, iW, iH);
        bgX = pos.x; bgY = pos.y; bgW = pos.width; bgH = pos.height;
        bgPositionRef.current = { x: bgX, y: bgY, width: bgW, height: bgH };
      }

      /* 캐시된 DataURL은 즉시 반환되어 Excalidraw 초기 렌더 전에 addFiles가 호출될 수 있음.
         한 이벤트 루프 후에 실행하여 Excalidraw가 렌더링 준비를 완료하도록 보장 */
      await new Promise((r) => setTimeout(r, 0));
      api.addFiles([{ id: '__bg_file__', dataURL: dataUrl, mimeType, created: Date.now() }]);
      const userFilesList = Object.values(savedFilesRef.current);
      if (userFilesList.length > 0) api.addFiles(userFilesList);
      /* addFiles의 React 상태 커밋 후 updateScene — 별도 렌더 사이클에서 실행해야 이미지가 표시됨 */
      await new Promise((r) => requestAnimationFrame(r));
      const bgEl = createBgElement(bgX, bgY, bgW, bgH);
      api.updateScene({ elements: [bgEl, ...noteElementsRef.current], commitToHistory: false });

    } catch (err) {
      console.error('배경 이미지 로드 실패:', err);
      api.updateScene({ elements: noteElementsRef.current, commitToHistory: false });
    }
  }, []);

  /* ── 이미지 리로드 (원본 비율로 재배치) ── */
  const handleReloadImage = useCallback(async () => {
    const page = currentPageRef.current;
    const excApi = excalidrawAPIRef.current;
    if (!page?.imageUrl || !excApi || !containerRef.current) return;
    bgPositionRef.current = null;
    clearImageCacheForUrl(page.imageUrl);
    try {
      const { dataUrl, mimeType } = await fetchAsDataUrl(page.imageUrl);
      const { w: iW, h: iH } = await getImageNaturalSize(dataUrl);
      const { width: W, height: H } = await waitForLayout(containerRef.current);
      const pos = calculateBgPosition(W, H, iW, iH);
      bgPositionRef.current = { x: pos.x, y: pos.y, width: pos.width, height: pos.height };
      excApi.addFiles([{ id: BG_FILE_ID, dataURL: dataUrl, mimeType, created: Date.now() }]);
      await new Promise(r => requestAnimationFrame(r));
      const preserved = excApi.getSceneElements().filter(el => el.id !== BG_ELEMENT_ID);
      const bgEl = createBgElement(pos.x, pos.y, pos.width, pos.height);
      excApi.updateScene({ elements: [bgEl, ...preserved], commitToHistory: false });
    } catch (err) {
      console.error('이미지 리로드 실패:', err);
    }
  }, []);

  /* ── 파생 값 ── */
  const currentIndex = pages.findIndex((p) => p.id === currentPage?.id);
  const prevPage = currentIndex > 0                ? pages[currentIndex - 1] : null;
  const nextPage = currentIndex < pages.length - 1 ? pages[currentIndex + 1] : null;

  /* ── 인접 페이지 이미지 백그라운드 프리패치 ── */
  useEffect(() => {
    prefetchImages([prevPage?.imageUrl, nextPage?.imageUrl].filter(Boolean));
  }, [prevPage?.id, nextPage?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── 사이드바: 현재 페이지가 세로 중앙에 오도록 자동 스크롤 ── */
  useEffect(() => {
    if (loading) return;
    const raf = requestAnimationFrame(() => {
      const container = sidebarScrollRef.current;
      const item      = activeSidebarItemRef.current;
      if (!container || !item) return;
      const cRect = container.getBoundingClientRect();
      const iRect = item.getBoundingClientRect();
      const target = container.scrollTop + (iRect.top - cRect.top) - cRect.height / 2 + iRect.height / 2;
      container.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(raf);
  }, [currentPage?.id, sidebarOpen, loading]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <p className="text-gray-500">로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-gray-100" style={{ height: '100vh' }}>

      {/* ── 내비게이션 바 ── */}
      <div className="h-14 bg-white shadow-sm flex items-center justify-between px-4 border-b flex-shrink-0 sticky top-0 z-[60]">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/teacher/classrooms/${classroomId}/chapters/${chapterId}/monitor`)} title="뒤로 가기"
            className="p-1.5 text-gray-500 hover:text-gray-700 cursor-pointer flex items-center justify-center"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="font-semibold text-gray-900">{chapter?.title}</span>
          <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full font-medium">교사 필기</span>
        </div>

        <div className="flex items-center gap-3">
          {!currentPage?.videoUrl && !currentPage?.htmlUrl && (
          <span className={`text-xs ${saveStatus === 'saved' ? 'text-green-600' : 'text-gray-400'}`}>
            {saveStatus === 'saved'  && '저장됨'}
            {saveStatus === 'saving' && '저장 중...'}
          </span>
          )}

          {/* PDF 다운로드 */}
          {currentPage && noteElements && !currentPage?.videoUrl && !currentPage?.htmlUrl && (
            <PdfDownloadButton
              onClick={() => {
                const title = `${user?.name || '교사'}_${chapter?.title || '챕터'}_${currentPage.position + 1}p`;
                downloadPage(title, noteElementsRef.current, savedFilesRef.current, currentPage.imageUrl, bgPositionRef.current);
              }}
              onDownloadAll={async () => {
                const title = `${user?.name || '교사'}_${chapter?.title || '챕터'}_전체`;
                const pageIds = pages.map(p => p.id).join(',');
                const notes = await api.get(`/api/notes/teacher-bulk?pageIds=${pageIds}`);
                const notesMap = Object.fromEntries((notes || []).map(n => [n.pageId, n.excalidrawData]));

                const pageDataList = pages.map(pg => {
                  const note = notesMap[pg.id] || { elements: [], files: {}, bgPosition: null };
                  return {
                    bgUrl: pg.imageUrl,
                    elements: note.elements || [],
                    files: note.files || {},
                    bgPosition: note.bgPosition,
                  };
                });
                downloadMultiplePages(title, pageDataList);
              }}
              isDownloading={isDownloading}
              className="py-1 px-2 text-xs"
            />
          )}

          {/* 툴바 접기/펼치기 */}
          <button
            onClick={() => setToolbarCollapsed((v) => !v)}
            title={toolbarCollapsed ? '툴바 펼치기' : '툴바 접기'}
            className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors cursor-pointer"
          >
            {toolbarCollapsed
              ? <ChevronDown className="h-4 w-4" />
              : <ChevronUp className="h-4 w-4" />}
          </button>

          {/* 이전/다음 페이지 */}
          <button
            onClick={() => prevPage && navigate(`/teacher/classrooms/${classroomId}/chapters/${chapterId}/study/page/${prevPage.id}`)}
            disabled={!prevPage}
            title="이전 페이지"
            className="p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-30 cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {pages.length > 0 && (
            <span className="text-sm text-gray-400 min-w-[3rem] text-center">
              {currentIndex + 1} / {pages.length}
            </span>
          )}
          <button
            onClick={() => nextPage && navigate(`/teacher/classrooms/${classroomId}/chapters/${chapterId}/study/page/${nextPage.id}`)}
            disabled={!nextPage}
            title="다음 페이지"
            className="p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-30 cursor-pointer"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          <button onClick={() => setSidebarOpen((v) => !v)}
            title={sidebarOpen ? '페이지 목록 숨기기' : '페이지 목록 펼치기'}
            className="p-1.5 text-gray-500 hover:text-gray-700 cursor-pointer">
            {sidebarOpen ? <ChevronRight className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* ── 필기 툴바 (접힘 상태이면 숨김, 영상/HTML 페이지면 숨김) ── */}
      {!toolbarCollapsed && !currentPage?.videoUrl && !currentPage?.htmlUrl && (
        <DrawingToolbar
          apiRef={excalidrawAPIRef}
          pageId={currentPage?.id}
          showPanel={showExcalidrawPanel}
          onTogglePanel={() => setShowExcalidrawPanel((v) => !v)}
          screenLocked={screenLocked}
          onToggleScreenLock={handleToggleScreenLock}
          onBaseWidthChange={(w) => { baseStrokeWidthRef.current = w; }}
          onReloadImage={handleReloadImage}
          onUndo={undo} onRedo={redo} canUndo={canUndo} canRedo={canRedo}
        />
      )}

      {/* ── 본문 ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* 페이지 목록 사이드바 */}
        {sidebarOpen && (
          <div ref={sidebarScrollRef} className="w-44 bg-white border-r overflow-y-auto flex-shrink-0">
            <div className="px-3 py-2 border-b flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">페이지</span>
              <button onClick={() => setSidebarOpen(false)} title="목록 숨기기"
                className="text-gray-400 hover:text-gray-600 cursor-pointer">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2 p-2">
              {pages.map((pg, idx) => (
                <Link
                  key={pg.id}
                  ref={pg.id === currentPage?.id ? activeSidebarItemRef : null}
                  to={`/teacher/classrooms/${classroomId}/chapters/${chapterId}/study/page/${pg.id}`}
                  className={`relative block rounded-md overflow-hidden transition-colors ${
                    pg.id === currentPage?.id ? 'border-4 border-indigo-500' : 'border-4 border-transparent hover:border-gray-300'
                  }`}
                >
                  {pg.aiProblemId ? (
                    <div className="w-full aspect-video flex items-center justify-center bg-indigo-50 text-indigo-600 text-xs font-medium">AI 코칭</div>
                  ) : pg.htmlUrl ? (
                    <div className="w-full aspect-video flex items-center justify-center bg-emerald-50 text-emerald-600 text-xs font-medium">HTML</div>
                  ) : pg.videoUrl ? (
                    <div className="relative">
                      <img src={getYouTubeThumbnail(extractYouTubeId(pg.videoUrl))} alt={`영상 ${idx + 1}`} className="w-full h-auto object-cover bg-gray-900" loading="lazy" decoding="async" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="bg-red-600 rounded-full p-1"><svg className="h-3 w-3 text-white fill-white" viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21"/></svg></div>
                      </div>
                    </div>
                  ) : (
                    <img src={pg.imageUrl} alt={`페이지 ${idx + 1}`} className="w-full h-auto object-contain bg-white" loading="lazy" decoding="async" />
                  )}
                  <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-xs text-center py-0.5">
                    {idx + 1}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ── Excalidraw 캔버스 / YouTube / HTML 도구 ── */}
        <div className="flex-1 relative overflow-hidden">
        {currentPage?.htmlUrl ? (
          <div className="w-full h-full flex items-center justify-center bg-white">
            <iframe
              src={toolUrl(currentPage.htmlUrl)}
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals"
              className="w-full h-full"
              title="HTML 도구"
            />
          </div>
        ) : currentPage?.videoUrl ? (
          <div className="w-full h-full flex items-center justify-center bg-black">
            <iframe
              src={getYouTubeEmbedUrl(extractYouTubeId(currentPage.videoUrl))}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : (
        <div
          ref={containerRef}
          style={GRID_STYLE}
          className="w-full h-full relative overflow-hidden"
        >
          <style>{ALWAYS_HIDE_CSS}{TOUCH_CSS}{showExcalidrawPanel ? '' : PANEL_HIDE_CSS}</style>

          {currentPage ? (
            <ExcalidrawErrorBoundary key={currentPage.id}>
            <Excalidraw
              excalidrawAPI={handleExcalidrawMount}
              viewModeEnabled={false}
              initialData={{
                elements: noteElements,
                appState: {
                  viewBackgroundColor:    'transparent',
                  currentItemStrokeColor: '#000000',
                  currentItemStrokeWidth: 2,
                  scrollX:                0,
                  scrollY:                0,
                },
              }}
              onChange={handleExcalidrawChange}
              UIOptions={EXCALIDRAW_UI_OPTIONS}
            />
            </ExcalidrawErrorBoundary>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              페이지가 없습니다.
            </div>
          )}
        </div>
        )}
        <PageNavOverlay
          onPrev={() => prevPage && navigate(`/teacher/classrooms/${classroomId}/chapters/${chapterId}/study/page/${prevPage.id}`)}
          onNext={() => nextPage && navigate(`/teacher/classrooms/${classroomId}/chapters/${chapterId}/study/page/${nextPage.id}`)}
          hasPrev={!!prevPage}
          hasNext={!!nextPage}
        />
        </div>
      </div>
    </div>
  );
};

export default TeacherStudyViewer;
