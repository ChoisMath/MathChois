import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Pencil, ChevronUp, ChevronDown, Menu } from 'lucide-react';
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
} from '../../lib/excalidrawUtils';

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

  const excalidrawAPIRef     = useRef(null);
  const saveTimerRef         = useRef(null);
  const currentPageRef       = useRef(null);
  const bgPositionRef        = useRef(null);
  const containerRef         = useRef(null);
  const mountedRef           = useRef(true);
  const commentModeRef       = useRef(false);
  const lastSavedRef         = useRef(null); // 마지막 저장 내용 (JSON) — 변경 감지용
  const savedStudentFilesRef = useRef({});   // 학생이 삽입한 이미지 파일
  const savedTeacherFilesRef = useRef({});   // 교사가 삽입한 이미지 파일

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
      const api = excalidrawAPIRef.current;
      const savedTool  = localStorage.getItem('mc_active_tool') || 'freedraw';
      const savedColor = localStorage.getItem('mc_tool_color')  || '#e03131';
      const savedWidth = parseFloat(localStorage.getItem('mc_stroke_width') || '0.4');
      const validExcalidrawTools = ['freedraw', 'selection', 'text', 'line', 'rectangle', 'ellipse'];
      const excalidrawTool = savedTool === 'triangle' ? 'freedraw' :
        (validExcalidrawTools.includes(savedTool) ? savedTool : 'freedraw');
      api.updateScene({ appState: { currentItemStrokeColor: savedColor, currentItemStrokeWidth: savedWidth, currentItemRoundness: 'sharp' }, commitToHistory: false });
      api.setActiveTool({ type: excalidrawTool });
    }
  }, [commentMode]);

  /* ── 초기 데이터 로드 ── */
  useEffect(() => {
    const fetchData = async () => {
      if (!mountedRef.current) return;
      setLoading(true);

      const [chapRes, pgsRes, profileRes] = await Promise.all([
        supabase.from('chapters').select('id, title').eq('id', chapterId).single(),
        supabase.from('pages').select('id, image_url, position').eq('chapter_id', chapterId).order('position'),
        supabase.from('profiles').select('id, name, avatar_url').eq('id', studentId).single(),
      ]);

      if (!mountedRef.current) return;
      setChapter(chapRes.data);
      setPages(pgsRes.data || []);
      setStudentProfile(profileRes.data);
      setLoading(false);
    };
    fetchData();
  }, [chapterId, studentId]);

  /* ── 학생 필기 Realtime 구독 ── */
  useEffect(() => {
    if (!currentPage) return;

    const channel = supabase
      .channel(`sn_${currentPage.id}_${studentId}`)
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'student_notes',
          filter: `page_id=eq.${currentPage.id}`,
        },
        (payload) => {
          const row = payload.new;
          if (!row || row.student_id !== studentId) return;

          const api = excalidrawAPIRef.current;
          if (!api) return;

          /* bgPosition 업데이트 */
          if (row.excalidraw_data?.bgPosition) {
            bgPositionRef.current = row.excalidraw_data.bgPosition;
          }

          /* 새 학생 필기 elements 적용 */
          const newStudentEls = (row.excalidraw_data?.elements || []).map((el) => ({
            ...el, id: STUDENT_NOTE_PREFIX + el.id, locked: true, opacity: 60,
          }));
          studentEls.current = newStudentEls;

          /* BG + 교사 코멘트는 유지, 학생 필기만 교체 */
          const preserved = api.getSceneElements().filter(
            (el) => !el.id.startsWith(STUDENT_NOTE_PREFIX)
          );
          api.updateScene({ elements: [...preserved, ...newStudentEls], commitToHistory: false });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentPage?.id, studentId]);

  /* ── 페이지 변경 시 scene 데이터 로드 ── */
  useEffect(() => {
    if (!currentPage) return;

    const loadPageData = async () => {
      bgPositionRef.current = null;
      studentEls.current  = [];
      teacherEls.current  = [];
      lastSavedRef.current  = null; // 페이지 변경 시 저장 기준점 초기화

      /* 학생 필기 + 이 학생에 대한 교사 코멘트 */
      const [snRes, tscRes] = await Promise.all([
        supabase
          .from('student_notes')
          .select('excalidraw_data')
          .eq('student_id', studentId)
          .eq('page_id', currentPage.id)
          .maybeSingle(),
        supabase
          .from('teacher_student_comments')
          .select('excalidraw_data')
          .eq('teacher_id', user?.id)
          .eq('student_id', studentId)
          .eq('page_id', currentPage.id)
          .maybeSingle(),
      ]);

      studentEls.current = (snRes.data?.excalidraw_data?.elements || []).map((el) => ({
        ...el, id: STUDENT_NOTE_PREFIX + el.id, locked: true, opacity: 60,
      }));
      bgPositionRef.current      = snRes.data?.excalidraw_data?.bgPosition ?? null;
      savedStudentFilesRef.current = snRes.data?.excalidraw_data?.files ?? {};
      teacherEls.current           = tscRes.data?.excalidraw_data?.elements || [];
      savedTeacherFilesRef.current = tscRes.data?.excalidraw_data?.files ?? {};

      rebuildScene();
    };

    loadPageData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage?.id, studentId, user?.id]);

  /* BG + student + teacher elements → scene */
  const rebuildScene = useCallback(async () => {
    const api = excalidrawAPIRef.current;
    if (!api || !currentPageRef.current?.image_url || !containerRef.current) return;

    try {
      const { dataUrl, mimeType } = await fetchAsDataUrl(currentPageRef.current.image_url);
      const { w: iW, h: iH } = await getImageNaturalSize(dataUrl);

      let bgX, bgY, bgW, bgH;
      const saved = bgPositionRef.current;
      if (saved) {
        ({ x: bgX, y: bgY, width: bgW, height: bgH } = saved);
      } else {
        const W = containerRef.current.clientWidth  || 800;
        const H = containerRef.current.clientHeight || 1000;
        const scale = Math.min(W / iW, H / iH);
        bgW = iW * scale; bgH = iH * scale;
        bgX = (W - bgW) / 2; bgY = (H - bgH) / 2;
        bgPositionRef.current = { x: bgX, y: bgY, width: bgW, height: bgH };
      }

      api.addFiles([{ id: BG_FILE_ID, dataURL: dataUrl, mimeType, created: Date.now() }]);
      const studentFilesList = Object.values(savedStudentFilesRef.current);
      const teacherFilesList = Object.values(savedTeacherFilesRef.current);
      if (studentFilesList.length > 0 || teacherFilesList.length > 0) {
        api.addFiles([...studentFilesList, ...teacherFilesList]);
      }
      const bgEl = createBgElement(bgX, bgY, bgW, bgH);
      api.updateScene({ elements: [bgEl, ...studentEls.current, ...teacherEls.current], commitToHistory: false });
    } catch (err) {
      console.error('scene 재구성 실패:', err);
      api.updateScene({ elements: [...studentEls.current, ...teacherEls.current], commitToHistory: false });
    }
  }, []);

  /* ── Excalidraw 마운트 ── */
  const handleExcalidrawMount = useCallback(async (api) => {
    excalidrawAPIRef.current = api;

    /* 저장된 도구 설정 복원 */
    const savedTool  = localStorage.getItem('mc_active_tool') || 'freedraw';
    const savedColor = localStorage.getItem('mc_tool_color')  || '#e03131';
    const savedWidth = parseFloat(localStorage.getItem('mc_stroke_width') || '0.4');
    const validExcalidrawTools = ['freedraw', 'selection', 'text', 'line', 'rectangle', 'ellipse'];
    const excalidrawTool = savedTool === 'triangle' ? 'freedraw' :
      (validExcalidrawTools.includes(savedTool) ? savedTool : 'freedraw');
    api.updateScene({ appState: { currentItemStrokeColor: savedColor, currentItemStrokeWidth: savedWidth, currentItemRoundness: 'sharp' }, commitToHistory: false });
    api.setActiveTool({ type: excalidrawTool });

    await rebuildScene();
  }, [rebuildScene]);

  /* ── onChange: 코멘트 모드 + 실제 변경 시에만 저장 ── */
  const handleExcalidrawChange = useCallback((elements) => {
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
      await supabase.from('teacher_student_comments').upsert(
        {
          teacher_id:      user.id,
          student_id:      studentId,
          page_id:         page.id,
          excalidraw_data: {
            elements: filtered,
            ...(Object.keys(teacherFiles).length > 0 && { files: teacherFiles }),
          },
          updated_at:      new Date().toISOString(),
        },
        { onConflict: 'teacher_id,student_id,page_id' }
      );
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
          <span className="text-sm text-gray-500">— {studentProfile?.name || '학생'}</span>
        </div>

        <div className="flex items-center gap-2">
          {commentMode && (
            <span className={`text-xs ${saveStatus === 'saved' ? 'text-green-600' : 'text-gray-400'}`}>
              {saveStatus === 'saved' ? '저장됨' : '저장 중...'}
            </span>
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
        />
      )}

      {/* ── 본문: 사이드바 + 캔버스 ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* 페이지 목록 사이드바 */}
        {sidebarOpen && (
          <div className="w-44 bg-white border-r overflow-y-auto flex-shrink-0">
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
                  onClick={() => goPage(idx)}
                  className={`block w-full rounded-md overflow-hidden border-2 transition-colors text-left ${
                    idx === currentPageIndex ? 'border-indigo-500' : 'border-transparent hover:border-gray-300'
                  }`}
                >
                  <img src={pg.image_url} alt={`페이지 ${idx + 1}`} className="w-full aspect-[3/4] object-cover" />
                  <div className="bg-gray-50 text-center text-xs py-1 text-gray-600">{idx + 1}</div>
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
          <style>{ALWAYS_HIDE_CSS}{showExcalidrawPanel ? '' : PANEL_HIDE_CSS}</style>

          {currentPage ? (
            <Excalidraw
              key={currentPage.id}
              excalidrawAPI={handleExcalidrawMount}
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
              viewModeEnabled={!commentMode}
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

export default StudentWorkViewer;
