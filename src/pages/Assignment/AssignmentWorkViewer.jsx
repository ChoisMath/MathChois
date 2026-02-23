import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, Pencil, ChevronUp, ChevronDown, Menu,
  CheckCircle, XCircle, Trophy, Loader, X
} from 'lucide-react';
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import DrawingToolbar from '../../components/study/DrawingToolbar';
import { usePdfDownloader } from '../../lib/pdfDownloader';
import { PdfDownloadButton } from '../../components/common/PdfDownloadButton';
import {
  BG_ELEMENT_ID, BG_FILE_ID,
  ALWAYS_HIDE_CSS, PANEL_HIDE_CSS, GRID_STYLE,
  fetchAsDataUrl, getImageNaturalSize, createBgElement, prefetchImages,
} from '../../lib/excalidrawUtils';

const TEACHER_COMMENT_PREFIX = '__atc_';

const STUDENT_NOTE_PREFIX = '__asn_sn_';

const AssignmentWorkViewer = () => {
  const { assignmentId, studentId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [assignment, setAssignment]         = useState(null);
  const [pages, setPages]                   = useState([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [studentProfile, setStudentProfile] = useState(null);
  const [submission, setSubmission]         = useState(null);
  const [commentMode, setCommentMode]       = useState(false);
  const [sidebarOpen, setSidebarOpen]       = useState(false);
  const [saveStatus, setSaveStatus]         = useState('saved');
  const [showExcalidrawPanel, setShowExcalidrawPanel] = useState(false);
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false);
  const [loading, setLoading]               = useState(true);
  const { isDownloading, downloadPage, downloadMultiplePages } = usePdfDownloader();

  /* 채점 UI 상태 */
  const [scoreInput, setScoreInput]         = useState('');
  const [grading, setGrading]               = useState(false);
  const [rejectionText, setRejectionText]   = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);

  const excalidrawAPIRef     = useRef(null);
  const saveTimerRef         = useRef(null);
  const currentPageRef       = useRef(null);
  const bgPositionRef        = useRef(null);
  const containerRef         = useRef(null);
  const mountedRef           = useRef(true);
  const commentModeRef       = useRef(false);
  const lastSavedRef         = useRef(null);
  const savedStudentFilesRef = useRef({});
  const savedTeacherFilesRef = useRef({});
  const activeSidebarItemRef = useRef(null);
  const sidebarScrollRef     = useRef(null);
  const lastZoomRef          = useRef(1);
  const lastScrollXRef       = useRef(0);
  const studentEls           = useRef([]);
  const teacherEls           = useRef([]);
  const isTouchingRef        = useRef(false);

  /* ── 전역 터치 상태 추적 (피드백루프 방지) ── */
  useEffect(() => {
    const handleTouchStart = () => { isTouchingRef.current = true; };
    const handleTouchEnd = (e) => {
      if (e.touches.length === 0) isTouchingRef.current = false;
    };
    
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    document.addEventListener('touchcancel', handleTouchEnd, { passive: true });
    
    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const currentPage = pages[currentPageIndex] || null;
  useEffect(() => { currentPageRef.current = currentPage; }, [currentPage]);
  useEffect(() => { commentModeRef.current = commentMode; }, [commentMode]);

  useEffect(() => {
    if (commentMode && excalidrawAPIRef.current) {
      const api = excalidrawAPIRef.current;
      const savedTool  = localStorage.getItem('mc_active_tool') || 'freedraw';
      const savedColor = localStorage.getItem('mc_tool_color')  || '#e03131';
      const savedWidth = parseFloat(localStorage.getItem('mc_stroke_width') || '0.2');
      const validTools = ['freedraw', 'selection', 'text', 'line', 'rectangle', 'ellipse'];
      const excTool = savedTool === 'triangle' ? 'freedraw' : (validTools.includes(savedTool) ? savedTool : 'freedraw');
      api.updateScene({ appState: { currentItemStrokeColor: savedColor, currentItemStrokeWidth: savedWidth, currentItemRoundness: 'sharp' }, commitToHistory: false });
      api.setActiveTool({ type: excTool });
    }
  }, [commentMode]);

  /* 초기 데이터 로드 */
  useEffect(() => {
    const fetchData = async () => {
      if (!mountedRef.current) return;
      setLoading(true);
      const [asnRes, pgsRes, profileRes, subRes] = await Promise.all([
        supabase.from('assignments').select('id, title, max_score').eq('id', assignmentId).single(),
        supabase.from('assignment_pages').select('id, image_url, position').eq('assignment_id', assignmentId).order('position'),
        supabase.from('profiles').select('id, name, avatar_url').eq('id', studentId).single(),
        supabase.from('assignment_submissions').select('*')
          .eq('assignment_id', assignmentId).eq('student_id', studentId).maybeSingle(),
      ]);
      if (!mountedRef.current) return;
      setAssignment(asnRes.data);
      setPages(pgsRes.data || []);
      setStudentProfile(profileRes.data);
      setSubmission(subRes.data);
      if (subRes.data?.score != null) setScoreInput(String(subRes.data.score));
      setLoading(false);
    };
    fetchData();
  }, [assignmentId, studentId]);

  /* Realtime: 학생 필기 변경 감지 */
  useEffect(() => {
    if (!currentPage) return;
    const channel = supabase
      .channel(`asn_wv_${currentPage.id}_${studentId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'assignment_notes',
        filter: `page_id=eq.${currentPage.id}`,
      }, (payload) => {
        const row = payload.new;
        if (!row || row.student_id !== studentId) return;
        const api = excalidrawAPIRef.current;
        if (!api) return;
        if (row.excalidraw_data?.bgPosition) bgPositionRef.current = row.excalidraw_data.bgPosition;
        const newStudentEls = (row.excalidraw_data?.elements || []).map((el) => ({
          ...el, id: STUDENT_NOTE_PREFIX + el.id, locked: true, opacity: 60,
        }));
        studentEls.current = newStudentEls;
        const preserved = api.getSceneElements().filter((el) => !el.id.startsWith(STUDENT_NOTE_PREFIX));
        api.updateScene({ elements: [...preserved, ...newStudentEls], commitToHistory: false });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentPage, studentId]);

  /* ── body 스크롤 고정 (모바일에서 터치 시 UI 밀림 방지) ── */
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    document.body.style.touchAction = 'none';
    return () => {
      document.body.style.overflow = '';
      document.body.style.overscrollBehavior = '';
      document.body.style.touchAction = '';
    };
  }, []);

  /* 페이지 변경 시 데이터 로드 */
  useEffect(() => {
    if (!currentPage) return;
    const loadPageData = async () => {
      bgPositionRef.current = null;
      studentEls.current  = [];
      teacherEls.current  = [];
      lastSavedRef.current = null;

      const [snRes, tcRes] = await Promise.all([
        supabase.from('assignment_notes').select('excalidraw_data')
          .eq('student_id', studentId).eq('page_id', currentPage.id).maybeSingle(),
        supabase.from('assignment_teacher_comments').select('excalidraw_data')
          .eq('teacher_id', user?.id).eq('student_id', studentId).eq('page_id', currentPage.id).maybeSingle(),
      ]);

      studentEls.current = (snRes.data?.excalidraw_data?.elements || []).map((el) => ({
        ...el, id: STUDENT_NOTE_PREFIX + el.id, locked: true, opacity: 60,
      }));
      bgPositionRef.current = snRes.data?.excalidraw_data?.bgPosition ?? null;
      savedStudentFilesRef.current = snRes.data?.excalidraw_data?.files ?? {};
      teacherEls.current           = tcRes.data?.excalidraw_data?.elements || [];
      savedTeacherFilesRef.current = tcRes.data?.excalidraw_data?.files ?? {};
      rebuildScene();
    };
    loadPageData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage?.id, studentId, user?.id]);

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
      const sf = Object.values(savedStudentFilesRef.current);
      const tf = Object.values(savedTeacherFilesRef.current);
      if (sf.length > 0 || tf.length > 0) api.addFiles([...sf, ...tf]);
      await new Promise((r) => requestAnimationFrame(r));
      const bgEl = createBgElement(bgX, bgY, bgW, bgH);
      api.updateScene({ elements: [bgEl, ...studentEls.current, ...teacherEls.current], commitToHistory: false });
    } catch (err) {
      console.error('scene 재구성 실패:', err);
      api.updateScene({ elements: [...studentEls.current, ...teacherEls.current], commitToHistory: false });
    }
  }, []);

  const handleExcalidrawMount = useCallback(async (api) => {
    excalidrawAPIRef.current = api;
    const savedTool  = localStorage.getItem('mc_active_tool') || 'freedraw';
    const savedColor = localStorage.getItem('mc_tool_color')  || '#e03131';
    const savedWidth = parseFloat(localStorage.getItem('mc_stroke_width') || '0.4');
    const validTools = ['freedraw', 'selection', 'text', 'line', 'rectangle', 'ellipse'];
    const excTool = savedTool === 'triangle' ? 'freedraw' : (validTools.includes(savedTool) ? savedTool : 'freedraw');
    api.updateScene({ appState: { currentItemStrokeColor: savedColor, currentItemStrokeWidth: savedWidth, currentItemRoundness: 'sharp' }, commitToHistory: false });
    api.setActiveTool({ type: excTool });
    await new Promise((r) => setTimeout(r, 0));
    await rebuildScene();
  }, [rebuildScene]);

  const handleExcalidrawChange = useCallback((elements, appState) => {
    if (appState) {
      const isFreedraw = appState.activeTool.type === 'freedraw';
      if (isFreedraw) {
        if (!isTouchingRef.current && (appState.zoom.value !== lastZoomRef.current || appState.scrollX !== lastScrollXRef.current)) {
          excalidrawAPIRef.current?.updateScene({
            appState: { zoom: { value: lastZoomRef.current }, scrollX: lastScrollXRef.current }
          });
        }
      } else {
        lastZoomRef.current = appState.zoom.value;
        lastScrollXRef.current = appState.scrollX;
      }
    }

    if (!commentModeRef.current) return;
    const page = currentPageRef.current;
    if (!user || !page) return;
    const filtered = elements.filter(
      (el) => el.id !== BG_ELEMENT_ID && !el.id.startsWith(STUDENT_NOTE_PREFIX) && !el.isDeleted
    );
    const serialized = JSON.stringify(filtered.map((el) => ({ id: el.id, type: el.type, x: el.x, y: el.y, points: el.points, text: el.text, width: el.width, height: el.height, strokeColor: el.strokeColor, strokeWidth: el.strokeWidth })));
    if (serialized === lastSavedRef.current) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (!mountedRef.current) return;
      setSaveStatus('saving');
      teacherEls.current = filtered;
      const allFiles = excalidrawAPIRef.current?.getFiles() ?? {};
      const teacherFiles = Object.fromEntries(
        Object.entries(allFiles).filter(([id]) => id !== BG_FILE_ID && !savedStudentFilesRef.current[id])
      );
      savedTeacherFilesRef.current = teacherFiles;
      await supabase.from('assignment_teacher_comments').upsert(
        {
          teacher_id: user.id, student_id: studentId, page_id: page.id,
          excalidraw_data: {
            elements: filtered,
            ...(Object.keys(teacherFiles).length > 0 && { files: teacherFiles }),
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'teacher_id,student_id,page_id' }
      );
      if (mountedRef.current) { lastSavedRef.current = serialized; setSaveStatus('saved'); }
    }, 1500);
  }, [user, studentId]);

  /* 사이드바 자동 스크롤 */
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

  useEffect(() => {
    if (pages.length === 0) return;
    prefetchImages([pages[currentPageIndex - 1]?.image_url, pages[currentPageIndex + 1]?.image_url].filter(Boolean));
  }, [currentPageIndex, pages]);

  const goPage = (idx) => { if (idx >= 0 && idx < pages.length) setCurrentPageIndex(idx); };

  /* 채점 완료 */
  const handleGrade = async () => {
    const score = parseInt(scoreInput);
    if (isNaN(score) || score < 0) return;
    setGrading(true);
    const { data } = await supabase.from('assignment_submissions').upsert(
      {
        assignment_id: assignmentId, student_id: studentId,
        status: 'graded', score, max_score: assignment?.max_score,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'assignment_id,student_id' }
    ).select().single();
    setGrading(false);
    if (data) setSubmission(data);
  };

  /* 반려 */
  const handleReject = async () => {
    if (!rejectionText.trim()) return;
    setGrading(true);
    const { data } = await supabase.from('assignment_submissions').upsert(
      {
        assignment_id: assignmentId, student_id: studentId,
        status: 'rejected', rejection_comment: rejectionText.trim(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'assignment_id,student_id' }
    ).select().single();
    setGrading(false);
    setShowRejectModal(false);
    setRejectionText('');
    if (data) setSubmission(data);
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <p className="text-gray-500">로딩 중...</p>
    </div>
  );

  const canGrade = ['submitted', 'late_submitted'].includes(submission?.status);
  const maxScore = assignment?.max_score ?? 100;

  return (
    <div className="flex flex-col bg-gray-100" style={{ height: '100vh' }}>

      {/* 내비게이션 바 */}
      <div className="h-14 bg-white shadow-sm flex items-center justify-between px-4 border-b flex-shrink-0 sticky top-0 z-[60]">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/teacher/classrooms/${assignment?.classroom_id}/assignments/${assignmentId}/monitor`)}
            className="p-1.5 text-gray-500 hover:text-gray-700 cursor-pointer"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="font-semibold text-gray-900">{assignment?.title}</span>
          <span className="text-sm text-gray-500">— {studentProfile?.name || '학생'}</span>
        </div>

        <div className="flex items-center gap-2">
          {commentMode && (
            <span className={`text-xs ${saveStatus === 'saved' ? 'text-green-600' : 'text-gray-400'}`}>
              {saveStatus === 'saved' ? '저장됨' : '저장 중...'}
            </span>
          )}

          {/* 채점 UI */}
          <div className="flex items-center gap-1.5 border border-gray-200 rounded-md px-2 py-1">
            <Trophy className="h-4 w-4 text-gray-400" />
            <input
              type="number"
              min={0}
              max={maxScore}
              value={scoreInput}
              onChange={(e) => setScoreInput(e.target.value)}
              placeholder="점수"
              className="w-14 text-sm text-center border-none outline-none bg-transparent"
              disabled={!canGrade}
            />
            <span className="text-xs text-gray-400">/ {maxScore}</span>
          </div>

          {canGrade && (
            <>
              <button
                onClick={() => setShowRejectModal(true)}
                title="반려"
                className="p-1.5 text-orange-700 bg-orange-100 rounded-md hover:bg-orange-200 cursor-pointer flex items-center justify-center"
              >
                <XCircle className="h-5 w-5" />
              </button>
              <button
                onClick={handleGrade}
                disabled={grading || scoreInput === ''}
                title={grading ? '처리 중...' : '채점완료'}
                className="p-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 cursor-pointer flex items-center justify-center"
              >
                {grading ? <Loader className="animate-spin h-5 w-5" /> : <CheckCircle className="h-5 w-5" />}
              </button>
            </>
          )}
          {submission?.status === 'graded' && (
            <span className="text-xs font-medium text-blue-600 px-2 py-1 bg-blue-50 rounded-md">
              채점완료 {submission.score}/{submission.max_score ?? maxScore}점
            </span>
          )}
          {submission?.status === 'rejected' && (
            <span className="text-xs font-medium text-orange-600 px-2 py-1 bg-orange-50 rounded-md">반려됨</span>
          )}

          {/* PDF 다운로드 */}
          {currentPage && studentEls.current && (
            <PdfDownloadButton
              onClick={() => {
                const title = `${studentProfile?.name || '학생'}_${assignment?.title || '과제'}_${currentPage.position + 1}p`;
                const elsToDownload = [...studentEls.current, ...teacherEls.current];
                const filesToDownload = { ...savedStudentFilesRef.current, ...savedTeacherFilesRef.current };
                downloadPage(title, elsToDownload, filesToDownload, currentPage.image_url, bgPositionRef.current);
              }}
              onDownloadAll={async () => {
                const title = `${studentProfile?.name || '학생'}_${assignment?.title || '과제'}_전체`;
                // Fetch all notes for this student in this assignment
                const { data: studentNotes } = await supabase
                  .from('assignment_notes')
                  .select('page_id, excalidraw_data')
                  .eq('student_id', studentProfile.id)
                  .in('page_id', pages.map(p => p.id));
                const studentNotesMap = Object.fromEntries((studentNotes || []).map(n => [n.page_id, n.excalidraw_data]));

                // Fetch all teacher comments for this student in this assignment
                const { data: teacherNotes } = await supabase
                  .from('assignment_teacher_comments')
                  .select('page_id, excalidraw_data')
                  .eq('student_id', studentProfile.id)
                  .in('page_id', pages.map(p => p.id));
                const teacherNotesMap = Object.fromEntries((teacherNotes || []).map(n => [n.page_id, n.excalidraw_data]));

                const pageDataList = pages.map(pg => {
                  const sNote = studentNotesMap[pg.id] || { elements: [], files: {}, bgPosition: null };
                  const tNote = teacherNotesMap[pg.id] || { elements: [], files: {} };
                  
                  const sEls = sNote.elements || [];
                  const tEls = (tNote.elements || []).map(el => ({ ...el, id: TEACHER_COMMENT_PREFIX + el.id, locked: true, opacity: 60 }));
                  
                  return {
                    bgUrl: pg.image_url,
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
            title={commentMode ? '코멘트 모드 → 보기 모드' : '보기 모드 → 코멘트 모드'}
            className={`p-1.5 rounded-md transition-colors cursor-pointer ${commentMode ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}
          >
            <Pencil className="h-4 w-4" />
          </button>

          {commentMode && (
            <button onClick={() => setToolbarCollapsed((v) => !v)}
              className="p-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 cursor-pointer">
              {toolbarCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </button>
          )}

          <button onClick={() => goPage(currentPageIndex - 1)} disabled={currentPageIndex === 0}
            className="p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-30 cursor-pointer">
            <ChevronLeft className="h-4 w-4" />
          </button>
          {pages.length > 0 && (
            <span className="text-sm text-gray-400 min-w-[3rem] text-center">
              {currentPageIndex + 1} / {pages.length}
            </span>
          )}
          <button onClick={() => goPage(currentPageIndex + 1)} disabled={currentPageIndex >= pages.length - 1}
            className="p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-30 cursor-pointer">
            <ChevronRight className="h-4 w-4" />
          </button>

          <button onClick={() => setSidebarOpen((v) => !v)}
            className="p-1.5 text-gray-500 hover:text-gray-700 cursor-pointer">
            {sidebarOpen ? <ChevronRight className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* 필기 툴바 */}
      {commentMode && !toolbarCollapsed && (
        <DrawingToolbar
          apiRef={excalidrawAPIRef}
          showPanel={showExcalidrawPanel}
          onTogglePanel={() => setShowExcalidrawPanel((v) => !v)}
        />
      )}

      {/* 본문 */}
      <div className="flex flex-1 overflow-hidden">
        {sidebarOpen && (
          <div ref={sidebarScrollRef} className="w-44 bg-white border-r overflow-y-auto flex-shrink-0">
            <div className="px-3 py-2 border-b flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">페이지</span>
              <button onClick={() => setSidebarOpen(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2 p-2">
              {pages.map((pg, idx) => (
                <button key={pg.id}
                  ref={idx === currentPageIndex ? activeSidebarItemRef : null}
                  onClick={() => goPage(idx)}
                  className={`block w-full rounded-md overflow-hidden border-2 transition-colors text-left ${idx === currentPageIndex ? 'border-indigo-500' : 'border-transparent hover:border-gray-300'}`}>
                  <img src={pg.image_url} alt={`페이지 ${idx + 1}`} className="w-full aspect-[3/4] object-cover" loading="lazy" decoding="async" />
                  <div className="bg-gray-50 text-center text-xs py-1 text-gray-600">{idx + 1}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={containerRef} style={GRID_STYLE} className="flex-1 relative overflow-hidden">
          <style>{ALWAYS_HIDE_CSS}{showExcalidrawPanel ? '' : PANEL_HIDE_CSS}</style>
          {currentPage ? (
            <Excalidraw
              key={currentPage.id}
              excalidrawAPI={handleExcalidrawMount}
              viewModeEnabled={false}
              initialData={{
                elements: [],
                appState: { viewBackgroundColor: 'transparent', currentItemStrokeColor: '#e03131', currentItemStrokeWidth: 2, scrollX: 0, scrollY: 0 },
              }}
              onChange={handleExcalidrawChange}
              UIOptions={{
                canvasActions: { changeViewBackgroundColor: false, clearCanvas: false, export: false, loadScene: false, saveToActiveFile: false, toggleTheme: false, saveAsImage: false },
                tools: { image: false },
              }}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">페이지가 없습니다.</div>
          )}
        </div>
      </div>

      {/* 반려 모달 */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-3">반려 사유</h2>
            <textarea
              autoFocus
              value={rejectionText}
              onChange={(e) => setRejectionText(e.target.value)}
              placeholder="학생에게 전달할 반려 사유를 입력하세요"
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-orange-400 focus:border-orange-400 resize-none mb-4"
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => { setShowRejectModal(false); setRejectionText(''); }} title="취소"
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md cursor-pointer flex items-center justify-center">
                <X className="h-5 w-5" />
              </button>
              <button onClick={handleReject} disabled={grading || !rejectionText.trim()} title={grading ? '처리 중...' : '반려하기'}
                className="p-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 disabled:opacity-50 cursor-pointer flex items-center justify-center">
                {grading ? <Loader className="animate-spin h-5 w-5" /> : <XCircle className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssignmentWorkViewer;
