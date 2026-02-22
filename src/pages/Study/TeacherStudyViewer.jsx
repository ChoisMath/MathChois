import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, Menu, ChevronUp, ChevronDown,
} from 'lucide-react';
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import DrawingToolbar from '../../components/study/DrawingToolbar';
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
} from '../../lib/excalidrawUtils';
import { getCachedChapterAndPages } from '../../lib/dataCache';

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

  const containerRef          = useRef(null);
  const saveTimerRef          = useRef(null);
  const excalidrawAPIRef      = useRef(null);
  const currentPageRef        = useRef(null);
  const noteElementsRef       = useRef([]);
  const bgPositionRef         = useRef(null);
  const savedFilesRef         = useRef({}); // 저장된 사용자 삽입 이미지 파일
  const mountedRef            = useRef(true);
  const lastSavedRef          = useRef(null); // 마지막 저장 내용 (JSON) — 변경 감지용
  const activeSidebarItemRef  = useRef(null); // 사이드바 현재 페이지 요소
  const sidebarScrollRef      = useRef(null); // 사이드바 스크롤 컨테이너

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => { currentPageRef.current  = currentPage;  }, [currentPage]);
  useEffect(() => { noteElementsRef.current = noteElements; }, [noteElements]);

  /* ── 데이터 로드 ── */
  useEffect(() => {
    const fetchData = async () => {
      if (!mountedRef.current) return;
      setLoading(true);
      bgPositionRef.current = null;
      lastSavedRef.current  = null;

      /* 챕터·페이지 목록: 캐시 우선 → 없으면 병렬 fetch */
      const { chapter: chap, pages: pgs } = await getCachedChapterAndPages(chapterId, supabase);
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
            const { data: note } = await supabase
              .from('teacher_notes').select('excalidraw_data')
              .eq('teacher_id', user.id).eq('page_id', target.id).maybeSingle();
            if (!mountedRef.current) return;
            noteData = {
              elements:   note?.excalidraw_data?.elements   || [],
              bgPosition: note?.excalidraw_data?.bgPosition ?? null,
              files:      note?.excalidraw_data?.files      ?? {},
            };
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

  /* ── onChange → teacher_notes upsert ── */
  const handleExcalidrawChange = useCallback((elements) => {
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

    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (!mountedRef.current) return;
      setSaveStatus('saving');
      const allFiles  = excalidrawAPIRef.current?.getFiles() ?? {};
      const { [BG_FILE_ID]: _bgf, ...userFiles } = allFiles;
      await supabase.from('teacher_notes').upsert(
        {
          teacher_id:      user.id,
          page_id:         page.id,
          excalidraw_data: {
            elements:   teacherEls,
            bgPosition: bgPositionRef.current,
            ...(Object.keys(userFiles).length > 0 && { files: userFiles }),
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'teacher_id,page_id' }
      );
      if (mountedRef.current) {
        /* 노트 캐시 갱신 — 다음 방문 시 즉시 표시 */
        _notesCache.set(`${user.id}_${page.id}`, {
          elements:   teacherEls,
          bgPosition: bgPositionRef.current,
          files:      userFiles,
        });
        lastSavedRef.current = serialized;
        setSaveStatus('saved');
      }
    }, 1500);
  }, [user]);

  /* ── Excalidraw 마운트 ── */
  const handleExcalidrawMount = useCallback(async (api) => {
    excalidrawAPIRef.current = api;

    /* 저장된 도구 설정 복원 (React 렌더 사이클 충돌을 피하기 위해 setTimeout으로 지연) */
    setTimeout(() => {
      const savedTool  = localStorage.getItem('mc_active_tool') || 'freedraw';
      const savedColor = localStorage.getItem('mc_tool_color')  || '#e03131';
      const savedWidth = parseFloat(localStorage.getItem('mc_stroke_width') || '0.4');
      const validExcalidrawTools = ['freedraw', 'selection', 'text', 'line', 'rectangle', 'ellipse'];
      const excalidrawTool = savedTool === 'triangle' ? 'freedraw' :
        (validExcalidrawTools.includes(savedTool) ? savedTool : 'freedraw');
      
      api.updateScene({ appState: { currentItemStrokeColor: savedColor, currentItemStrokeWidth: savedWidth, currentItemRoundness: 'sharp' }, commitToHistory: false });
      api.setActiveTool({ type: excalidrawTool });
    }, 0);

    const page = currentPageRef.current;
    if (!page?.image_url || !containerRef.current) return;

    try {
      const { dataUrl, mimeType } = await fetchAsDataUrl(page.image_url);
      const { w: iW, h: iH } = await getImageNaturalSize(dataUrl);

      let bgX, bgY, bgW, bgH;
      const saved = bgPositionRef.current;
      if (saved) {
        ({ x: bgX, y: bgY, width: bgW, height: bgH } = saved);
      } else {
        const W     = containerRef.current.clientWidth  || 800;
        const H     = containerRef.current.clientHeight || 1000;
        const scale = Math.min(W / iW, H / iH);
        bgW = iW * scale;
        bgH = iH * scale;
        bgX = (W - bgW) / 2;
        bgY = (H - bgH) / 2;
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

  /* ── 파생 값 ── */
  const currentIndex = pages.findIndex((p) => p.id === currentPage?.id);
  const prevPage = currentIndex > 0                ? pages[currentIndex - 1] : null;
  const nextPage = currentIndex < pages.length - 1 ? pages[currentIndex + 1] : null;

  /* ── 인접 페이지 이미지 백그라운드 프리패치 ── */
  useEffect(() => {
    prefetchImages([prevPage?.image_url, nextPage?.image_url].filter(Boolean));
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
      <div className="h-14 bg-white shadow-sm flex items-center justify-between px-4 border-b flex-shrink-0 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/teacher/classrooms/${classroomId}/chapters/${chapterId}/monitor`)}
            className="p-1.5 text-gray-500 hover:text-gray-700 cursor-pointer"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="font-semibold text-gray-900">{chapter?.title}</span>
          <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full font-medium">교사 필기</span>
        </div>

        <div className="flex items-center gap-3">
          <span className={`text-xs ${saveStatus === 'saved' ? 'text-green-600' : 'text-gray-400'}`}>
            {saveStatus === 'saved'  && '저장됨'}
            {saveStatus === 'saving' && '저장 중...'}
          </span>

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

      {/* ── 필기 툴바 (접힘 상태이면 숨김) ── */}
      {!toolbarCollapsed && (
        <DrawingToolbar
          apiRef={excalidrawAPIRef}
          showPanel={showExcalidrawPanel}
          onTogglePanel={() => setShowExcalidrawPanel((v) => !v)}
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
                  className={`block rounded-md overflow-hidden border-2 transition-colors ${
                    pg.id === currentPage?.id ? 'border-indigo-500' : 'border-transparent hover:border-gray-300'
                  }`}
                >
                  <img src={pg.image_url} alt={`페이지 ${idx + 1}`} className="w-full aspect-[3/4] object-cover" loading="lazy" decoding="async" />
                  <div className="bg-gray-50 text-center text-xs py-1 text-gray-600">{idx + 1}</div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ── Excalidraw 캔버스 ── */}
        <div
          ref={containerRef}
          style={GRID_STYLE}
          className="flex-1 relative overflow-hidden"
        >
          <style>{ALWAYS_HIDE_CSS}{showExcalidrawPanel ? '' : PANEL_HIDE_CSS}</style>

          {currentPage ? (
            <Excalidraw
              key={currentPage.id}
              excalidrawAPI={handleExcalidrawMount}
              initialData={{
                elements: noteElements,
                appState: {
                  viewBackgroundColor:    'transparent',
                  currentItemStrokeColor: '#e03131',
                  currentItemStrokeWidth: 2,
                  scrollX:                0,
                  scrollY:                0,
                },
              }}
              onChange={handleExcalidrawChange}
              UIOptions={{
                canvasActions: {
                  changeViewBackgroundColor: false,
                  clearCanvas:               false,
                  export:                    false,
                  loadScene:                 false,
                  saveToActiveFile:          false,
                  toggleTheme:               false,
                  saveAsImage:               false,
                },
                tools: { image: false },
              }}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              페이지가 없습니다.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TeacherStudyViewer;
