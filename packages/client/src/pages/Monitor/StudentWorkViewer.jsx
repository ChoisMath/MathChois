import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Pencil, ChevronUp, ChevronDown, Menu } from 'lucide-react';
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { api } from '../../lib/api';
import { subscribeToRoom } from '../../lib/socket';
import { useAuth } from '../../contexts/AuthContext';
import DrawingToolbar from '../../components/study/DrawingToolbar';
import { usePdfDownloader } from '../../lib/pdfDownloader';
import { PdfDownloadButton } from '../../components/common/PdfDownloadButton';
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
} from '../../lib/excalidrawUtils';
import { useExcalidrawTouch } from '../../hooks/useExcalidrawTouch';
import ExcalidrawErrorBoundary from '../../components/ExcalidrawErrorBoundary';

const STUDENT_NOTE_PREFIX = '__sn_';

const StudentWorkViewer = () => {
  const { classroomId, chapterId, studentId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [chapter, setChapter]             = useState(null);
  const [pages, setPages]                 = useState([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [studentProfile, setStudentProfile] = useState(null);
  const [commentMode, setCommentMode]     = useState(false);
  const [sidebarOpen, setSidebarOpen]     = useState(false);
  const [saveStatus, setSaveStatus]       = useState('saved');
  const [showExcalidrawPanel, setShowExcalidrawPanel] = useState(false);
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false);
  const [loading, setLoading]             = useState(true);

  const { isDownloading, downloadPage, downloadMultiplePages } = usePdfDownloader();

  const excalidrawAPIRef      = useRef(null);
  const saveTimerRef          = useRef(null);
  const currentPageRef        = useRef(null);
  const bgPositionRef         = useRef(null);
  const containerRef          = useRef(null);
  const mountedRef            = useRef(true);
  const commentModeRef        = useRef(false);
  const lastSavedRef          = useRef(null); // 마지막 저장 내용 (JSON) — 변경 감지용
  const savedStudentFilesRef  = useRef({});   // 학생이 삽입한 이미지 파일
  const savedTeacherFilesRef  = useRef({});   // 교사가 삽입한 이미지 파일
  const activeSidebarItemRef  = useRef(null); // 사이드바 현재 페이지 요소
  const sidebarScrollRef      = useRef(null); // 사이드바 스크롤 컨테이너

  /* scene data refs — avoid re-render loops */
  const studentEls = useRef([]);
  const teacherEls = useRef([]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const currentPage = pages[currentPageIndex] || null;
  useEffect(() => { currentPageRef.current = currentPage; }, [currentPage]);
  useEffect(() => { commentModeRef.current = commentMode; }, [commentMode]);

  /* 코멘트 모드 전환 시 저장된 도구/색상/굵기 복원 */
  useEffect(() => {
    if (commentMode && excalidrawAPIRef.current) {
      const excApi = excalidrawAPIRef.current;
      const savedTool  = localStorage.getItem('mc_active_tool') || 'freedraw';
      const savedColor = localStorage.getItem('mc_tool_color')  || '#e03131';
      const savedWidth = parseFloat(localStorage.getItem('mc_stroke_width') || '0.2');
      const validExcalidrawTools = ['freedraw', 'selection', 'text', 'line', 'rectangle', 'ellipse'];
      const excalidrawTool = savedTool === 'triangle' ? 'freedraw' :
        (validExcalidrawTools.includes(savedTool) ? savedTool : 'freedraw');
      excApi.updateScene({ appState: { currentItemStrokeColor: savedColor, currentItemStrokeWidth: savedWidth, currentItemRoundness: 'sharp' }, commitToHistory: false });
      excApi.setActiveTool({ type: excalidrawTool });
    }
  }, [commentMode]);

  /* ── 초기 데이터 로드 ── */
  useEffect(() => {
    const fetchData = async () => {
      if (!mountedRef.current) return;
      setLoading(true);

      try {
        const [chap, pgs, profile] = await Promise.all([
          api.get(`/api/chapters/${chapterId}`),
          api.get(`/api/chapters/${chapterId}/pages`),
          api.get(`/api/profiles/${studentId}`),
        ]);

        if (!mountedRef.current) return;
        setChapter(chap);
        setPages(pgs || []);
        setStudentProfile(profile);
      } catch (err) {
        console.error('StudentWorkViewer fetchData error:', err);
      }

      setLoading(false);
    };
    fetchData();
  }, [chapterId, studentId]);

  /* ── 학생 필기 Socket.IO 구독 ── */
  useEffect(() => {
    if (!currentPage) return;

    return subscribeToRoom(
      `work:${currentPage.id}:${studentId}`,
      'student-note:updated',
      async (data) => {
        // 학생 필기가 업데이트됨 → 최신 데이터를 API에서 다시 가져옴
        const excApi = excalidrawAPIRef.current;
        if (!excApi) return;

        try {
          const note = await api.get(`/api/notes/student-notes-for/${studentId}?pageIds=${currentPage.id}`);
          const noteData = Array.isArray(note) ? note[0] : note;

          /* bgPosition 업데이트 */
          if (noteData?.excalidrawData?.bgPosition) {
            bgPositionRef.current = noteData.excalidrawData.bgPosition;
          }

          /* 새 학생 필기 elements 적용 */
          const newStudentEls = (noteData?.excalidrawData?.elements || []).map((el) => ({
            ...el, id: STUDENT_NOTE_PREFIX + el.id, locked: true, opacity: 60,
          }));
          studentEls.current = newStudentEls;

          /* 학생 이미지 파일 업데이트 */
          const newStudentFiles = noteData?.excalidrawData?.files ?? {};
          if (Object.keys(newStudentFiles).length > 0) {
            excApi.addFiles(Object.values(newStudentFiles));
            savedStudentFilesRef.current = { ...savedStudentFilesRef.current, ...newStudentFiles };
          }

          /* BG + 교사 코멘트는 유지, 학생 필기만 교체 */
          const preserved = excApi.getSceneElements().filter(
            (el) => !el.id.startsWith(STUDENT_NOTE_PREFIX)
          );
          excApi.updateScene({ elements: [...preserved, ...newStudentEls], commitToHistory: false });
        } catch (err) {
          console.error('학생 필기 실시간 갱신 실패:', err);
        }
      }
    );
  }, [currentPage, studentId]);

  const [screenLocked, setScreenLocked] = useState(false);
  const screenLockedRef   = useRef(false);
  const screenLockBaseRef = useRef({ zoom: 1, scrollX: 0, scrollY: 0 });
  useEffect(() => { screenLockedRef.current = screenLocked; }, [screenLocked]);

  useExcalidrawTouch({ excalidrawAPIRef, containerRef, screenLockedRef });

  /* ── 페이지 변경 시 scene 데이터 로드 ── */
  useEffect(() => {
    if (!currentPage) return;

    const loadPageData = async () => {
      bgPositionRef.current = null;
      studentEls.current  = [];
      teacherEls.current  = [];
      lastSavedRef.current  = null; // 페이지 변경 시 저장 기준점 초기화

      try {
        /* 학생 필기 + 이 학생에 대한 교사 코멘트 */
        const [snNotes, tscComment] = await Promise.all([
          api.get(`/api/notes/student-notes-for/${studentId}?pageIds=${currentPage.id}`),
          api.get(`/api/comments/${currentPage.id}/${studentId}`),
        ]);

        const snData = Array.isArray(snNotes) ? snNotes[0] : snNotes;

        studentEls.current = (snData?.excalidrawData?.elements || []).map((el) => ({
          ...el, id: STUDENT_NOTE_PREFIX + el.id, locked: true, opacity: 60,
        }));
        bgPositionRef.current        = snData?.excalidrawData?.bgPosition ?? null;
        savedStudentFilesRef.current = snData?.excalidrawData?.files ?? {};
        teacherEls.current           = tscComment?.excalidrawData?.elements || [];
        savedTeacherFilesRef.current = tscComment?.excalidrawData?.files ?? {};
      } catch (err) {
        console.error('페이지 데이터 로드 실패:', err);
      }

      rebuildScene();
    };

    loadPageData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage?.id, studentId, user?.id]);

  /* BG + student + teacher elements → scene */
  const rebuildScene = useCallback(async () => {
    const excApi = excalidrawAPIRef.current;
    if (!excApi || !currentPageRef.current?.imageUrl || !containerRef.current) return;

    try {
      const { dataUrl, mimeType } = await fetchAsDataUrl(currentPageRef.current.imageUrl);
      const { w: iW, h: iH } = await getImageNaturalSize(dataUrl);

      let bgX, bgY, bgW, bgH;
      const saved = bgPositionRef.current;
      if (saved) {
        ({ x: bgX, y: bgY, width: bgW, height: bgH } = saved);
      } else {
        const W = containerRef.current.clientWidth  || 800;
        const H = containerRef.current.clientHeight || 1000;
        const pos = calculateBgPosition(W, H, iW, iH);
        bgX = pos.x; bgY = pos.y; bgW = pos.width; bgH = pos.height;
        bgPositionRef.current = { x: bgX, y: bgY, width: bgW, height: bgH };
      }

      excApi.addFiles([{ id: BG_FILE_ID, dataURL: dataUrl, mimeType, created: Date.now() }]);
      const studentFilesList = Object.values(savedStudentFilesRef.current);
      const teacherFilesList = Object.values(savedTeacherFilesRef.current);
      if (studentFilesList.length > 0 || teacherFilesList.length > 0) {
        excApi.addFiles([...studentFilesList, ...teacherFilesList]);
      }
      /* addFiles의 React 상태 커밋 후 updateScene — 별도 렌더 사이클에서 실행해야 이미지가 표시됨 */
      await new Promise((r) => requestAnimationFrame(r));
      const bgEl = createBgElement(bgX, bgY, bgW, bgH);
      excApi.updateScene({ elements: [bgEl, ...studentEls.current, ...teacherEls.current], commitToHistory: false });
    } catch (err) {
      console.error('scene 재구성 실패:', err);
      excApi.updateScene({ elements: [...studentEls.current, ...teacherEls.current], commitToHistory: false });
    }
  }, []);

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
  const handleExcalidrawMount = useCallback(async (excApi) => {
    excalidrawAPIRef.current = excApi;

    /* 저장된 도구 설정 복원 */
    const savedTool  = localStorage.getItem('mc_active_tool') || 'freedraw';
    const savedColor = localStorage.getItem('mc_tool_color')  || '#e03131';
    const savedWidth = parseFloat(localStorage.getItem('mc_stroke_width') || '0.4');
    const validExcalidrawTools = ['freedraw', 'selection', 'text', 'line', 'rectangle', 'ellipse'];
    const excalidrawTool = savedTool === 'triangle' ? 'freedraw' :
      (validExcalidrawTools.includes(savedTool) ? savedTool : 'freedraw');
    excApi.updateScene({ appState: { currentItemStrokeColor: savedColor, currentItemStrokeWidth: savedWidth, currentItemRoundness: 'sharp' }, commitToHistory: false });
    excApi.setActiveTool({ type: excalidrawTool });

    /* 캐시된 DataURL은 즉시 반환되어 Excalidraw 초기 렌더 전에 addFiles가 호출될 수 있음.
       한 이벤트 루프 후에 실행하여 Excalidraw가 렌더링 준비를 완료하도록 보장 */
    await new Promise((r) => setTimeout(r, 0));
    await rebuildScene();
  }, [rebuildScene]);

  /* ── onChange: 코멘트 모드 + 실제 변경 시에만 저장 ── */
  const handleExcalidrawChange = useCallback((elements, appState) => {
    if (appState && screenLockedRef.current) {
      const base = screenLockBaseRef.current;
      if (appState.zoom.value !== base.zoom ||
          appState.scrollX !== base.scrollX ||
          appState.scrollY !== base.scrollY) {
        excalidrawAPIRef.current?.updateScene({
          appState: {
            zoom: { value: base.zoom },
            scrollX: base.scrollX,
            scrollY: base.scrollY,
          }
        });
      }
    }

    if (!commentModeRef.current) return;
    const page = currentPageRef.current;
    if (!user || !page) return;

    const filtered = elements.filter(
      (el) =>
        el.id !== BG_ELEMENT_ID &&
        !el.id.startsWith(STUDENT_NOTE_PREFIX) &&
        !el.isDeleted
    );

    /* 직전 저장 내용과 동일하면 저장 스킵 */
    const serialized = JSON.stringify(filtered.map((el) => ({ id: el.id, type: el.type, x: el.x, y: el.y, points: el.points, text: el.text, width: el.width, height: el.height, strokeColor: el.strokeColor, strokeWidth: el.strokeWidth })));
    if (serialized === lastSavedRef.current) return;

    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (!mountedRef.current) return;
      setSaveStatus('saving');
      teacherEls.current = filtered;
      const allFiles = excalidrawAPIRef.current?.getFiles() ?? {};
      const teacherFiles = Object.fromEntries(
        Object.entries(allFiles).filter(
          ([id]) => id !== BG_FILE_ID && !savedStudentFilesRef.current[id]
        )
      );
      savedTeacherFilesRef.current = teacherFiles;
      try {
        await api.put(`/api/comments/${page.id}/${studentId}`, {
          excalidrawData: {
            elements: filtered,
            ...(Object.keys(teacherFiles).length > 0 && { files: teacherFiles }),
          },
        });
      } catch (err) {
        console.error('교사 코멘트 저장 실패:', err);
      }
      if (mountedRef.current) {
        lastSavedRef.current = serialized; // 저장 성공 시 기준점 갱신
        setSaveStatus('saved');
      }
    }, 1500);
  }, [user, studentId]);

  const goPage = (idx) => {
    if (idx < 0 || idx >= pages.length) return;
    setCurrentPageIndex(idx);
  };

  /* ── 인접 페이지 이미지 백그라운드 프리패치 ── */
  useEffect(() => {
    if (pages.length === 0) return;
    prefetchImages(
      [pages[currentPageIndex - 1]?.imageUrl, pages[currentPageIndex + 1]?.imageUrl].filter(Boolean)
    );
  }, [currentPageIndex, pages]);

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
  }, [currentPageIndex, sidebarOpen, loading]);

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
          <span className="text-sm text-gray-500">— {studentProfile?.name || '학생'}</span>
        </div>

        <div className="flex items-center gap-2">
          {commentMode && (
            <span className={`text-xs ${saveStatus === 'saved' ? 'text-green-600' : 'text-gray-400'}`}>
              {saveStatus === 'saved' ? '저장됨' : '저장 중...'}
            </span>
          )}
          {/* PDF 다운로드 */}
          {currentPage && studentEls.current && (
            <PdfDownloadButton
              onClick={() => {
                const title = `${studentProfile?.name || '학생'}_${chapter?.title || '챕터'}_${currentPage.position + 1}p`;
                const elsToDownload = [...studentEls.current, ...teacherEls.current];
                const filesToDownload = { ...savedStudentFilesRef.current, ...savedTeacherFilesRef.current };
                downloadPage(title, elsToDownload, filesToDownload, currentPage.imageUrl, bgPositionRef.current);
              }}
              onDownloadAll={async () => {
                const title = `${studentProfile?.name || '학생'}_${chapter?.title || '챕터'}_전체`;
                const pageIds = pages.map(p => p.id).join(',');
                // Fetch all student notes and teacher comments for this student
                const [studentNotesData, teacherCommentsData] = await Promise.all([
                  api.get(`/api/notes/student-notes-for/${studentId}?pageIds=${pageIds}`),
                  api.get(`/api/notes/teacher-comments-for/${studentId}?pageIds=${pageIds}`),
                ]);
                const studentNotesMap = Object.fromEntries(
                  (studentNotesData || []).map(n => [n.pageId, n.excalidrawData])
                );
                const teacherCommentsMap = Object.fromEntries(
                  (teacherCommentsData || []).map(n => [n.pageId, n.excalidrawData])
                );

                const pageDataList = pages.map(pg => {
                  const sNote = studentNotesMap[pg.id] || { elements: [], files: {}, bgPosition: null };
                  const tNote = teacherCommentsMap[pg.id] || { elements: [], files: {} };

                  const sEls = sNote.elements || [];
                  const tEls = (tNote.elements || []).map(el => ({ ...el, id: '__tc_' + el.id, locked: true, opacity: 60 }));

                  return {
                    bgUrl: pg.imageUrl,
                    elements: [...sEls, ...tEls],
                    files: { ...(sNote.files || {}), ...(tNote.files || {}) },
                    bgPosition: sNote.bgPosition,
                  };
                });
                downloadMultiplePages(title, pageDataList);
              }}
              isDownloading={isDownloading}
              className="py-1 px-2 text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
            />
          )}

          <button
            onClick={() => setCommentMode((v) => !v)}
            title={commentMode ? '코멘트 모드 (클릭하여 보기 모드로)' : '보기 모드 (클릭하여 코멘트 모드로)'}
            className={`p-1.5 rounded-md transition-colors cursor-pointer ${
              commentMode
                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`}
          >
            <Pencil className="h-4 w-4" />
          </button>

          {/* 툴바 접기/펼치기 (코멘트 모드에서만) */}
          {commentMode && (
            <button
              onClick={() => setToolbarCollapsed((v) => !v)}
              title={toolbarCollapsed ? '툴바 펼치기' : '툴바 접기'}
              className="p-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
            >
              {toolbarCollapsed
                ? <ChevronDown className="h-4 w-4" />
                : <ChevronUp className="h-4 w-4" />}
            </button>
          )}

          <button
            onClick={() => goPage(currentPageIndex - 1)}
            disabled={currentPageIndex === 0}
            title="이전 페이지"
            className="p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-30 cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {pages.length > 0 && (
            <span className="text-sm text-gray-400 min-w-[3rem] text-center">
              {currentPageIndex + 1} / {pages.length}
            </span>
          )}
          <button
            onClick={() => goPage(currentPageIndex + 1)}
            disabled={currentPageIndex >= pages.length - 1}
            title="다음 페이지"
            className="p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-30 cursor-pointer"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          {/* 페이지 목록 사이드바 토글 */}
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            title={sidebarOpen ? '페이지 목록 숨기기' : '페이지 목록 펼치기'}
            className="p-1.5 text-gray-500 hover:text-gray-700 cursor-pointer"
          >
            {sidebarOpen ? <ChevronRight className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* ── 필기 툴바 (코멘트 모드 + 펼침 상태일 때만) ── */}
      {commentMode && !toolbarCollapsed && (
        <DrawingToolbar
          apiRef={excalidrawAPIRef}
          showPanel={showExcalidrawPanel}
          onTogglePanel={() => setShowExcalidrawPanel((v) => !v)}
          screenLocked={screenLocked}
          onToggleScreenLock={handleToggleScreenLock}
        />
      )}

      {/* ── 본문: 사이드바 + 캔버스 ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* 페이지 목록 사이드바 */}
        {sidebarOpen && (
          <div ref={sidebarScrollRef} className="w-44 bg-white border-r overflow-y-auto flex-shrink-0">
            <div className="px-3 py-2 border-b flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">페이지</span>
              <button
                onClick={() => setSidebarOpen(false)}
                title="목록 숨기기"
                className="text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2 p-2">
              {pages.map((pg, idx) => (
                <button
                  key={pg.id}
                  ref={idx === currentPageIndex ? activeSidebarItemRef : null}
                  onClick={() => goPage(idx)}
                  className={`relative block w-full rounded-md overflow-hidden transition-colors text-left ${
                    idx === currentPageIndex ? 'border-4 border-indigo-500' : 'border-4 border-transparent hover:border-gray-300'
                  }`}
                >
                  <img src={pg.imageUrl} alt={`페이지 ${idx + 1}`} className="w-full h-auto object-contain bg-white" loading="lazy" decoding="async" />
                  <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-xs text-center py-0.5">
                    {idx + 1}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 캔버스 */}
        <div
          ref={containerRef}
          style={GRID_STYLE}
          className="flex-1 relative overflow-hidden"
        >
          <style>{ALWAYS_HIDE_CSS}{TOUCH_CSS}{showExcalidrawPanel ? '' : PANEL_HIDE_CSS}</style>

          {currentPage ? (
            <ExcalidrawErrorBoundary key={currentPage.id}>
            <Excalidraw
              excalidrawAPI={handleExcalidrawMount}
              viewModeEnabled={false}
              initialData={{
                elements: [],
                appState: {
                  viewBackgroundColor:    'transparent',
                  currentItemStrokeColor: '#e03131',
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
      </div>
    </div>
  );
};

export default StudentWorkViewer;
