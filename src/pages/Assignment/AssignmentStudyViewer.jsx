import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, Menu, Pencil, Send,
  ChevronUp, ChevronDown, GraduationCap, X, Download, Loader
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

/* 세션 내 캐시 */
const _notesCache    = new Map(); // `${userId}_${pageId}` → { elements, bgPosition, files }
const _commentsCache = new Map(); // `${userId}_${pageId}` → { elements, files }

const TEACHER_COMMENT_PREFIX = '__atc_';

/* ─────────── 교사 필기 모달 ─────────── */
function TeacherNotesModal({ page, onClose }) {
  const containerRef = useRef(null);
  const [status, setStatus] = useState('loading'); // 'loading' | 'empty' | 'ok'
  const [noteElements, setNoteElements] = useState([]);
  const [noteFiles, setNoteFiles] = useState({});
  const { isDownloading, downloadPage, downloadMultiplePages } = usePdfDownloader();
  const bgPositionRef = useRef(null);
  const [dbBgPosition, setDbBgPosition] = useState(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const load = async () => {
      setStatus('loading');
      const { data } = await supabase
        .from('assignment_teacher_notes')
        .select('excalidraw_data')
        .eq('page_id', page.id);
      const els = (data || []).flatMap((n) => n.excalidraw_data?.elements || []);
      if (els.length === 0) {
        setStatus('empty');
      } else {
        const files = Object.assign({}, ...(data || []).map((n) => n.excalidraw_data?.files ?? {}));
        const bgPos = (data || []).find((n) => n.excalidraw_data?.bgPosition)?.excalidraw_data.bgPosition;
        setNoteElements(els);
        setNoteFiles(files);
        setDbBgPosition(bgPos || null);
        setStatus('ok');
      }
    };
    load();
  }, [page.id]);

  const handleMount = useCallback(async (api) => {
    if (!page.image_url || !containerRef.current) return;
    try {
      const { dataUrl, mimeType } = await fetchAsDataUrl(page.image_url);
      const { w: iW, h: iH } = await getImageNaturalSize(dataUrl);
      const W = containerRef.current.clientWidth  || 800;
      const H = containerRef.current.clientHeight || 900;
      const scale = Math.min(W / iW, H / iH);
      
      let bgW, bgH, bgX, bgY;
      if (dbBgPosition) {
        ({ width: bgW, height: bgH, x: bgX, y: bgY } = dbBgPosition);
      } else {
        bgW = iW * scale;
        bgH = iH * scale;
        bgX = (W - bgW) / 2;
        bgY = (H - bgH) / 2;
      }
      
      bgPositionRef.current = { x: bgX, y: bgY, width: bgW, height: bgH };
      api.addFiles([{ id: '__bg_file__', dataURL: dataUrl, mimeType, created: Date.now() }]);
      /* 교사 필기에 삽입된 이미지 파일 복원 */
      const noteFilesList = Object.values(noteFiles);
      if (noteFilesList.length > 0) api.addFiles(noteFilesList);
      /* addFiles의 React 상태 커밋 후 updateScene — 별도 렌더 사이클에서 실행해야 이미지가 표시됨 */
      await new Promise((r) => requestAnimationFrame(r));
      const bgEl = createBgElement(bgX, bgY, bgW, bgH);
      api.updateScene({ elements: [bgEl, ...noteElements] });
    } catch (err) {
      console.error('교사 필기 모달 bg 로드 실패:', err);
      api.updateScene({ elements: noteElements });
    }
  }, [page.image_url, noteElements, noteFiles, dbBgPosition]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-12 flex items-center justify-between px-4 border-b flex-shrink-0">
          <span className="font-semibold text-gray-800">교사 필기</span>
          <div className="flex items-center gap-2">
            {status === 'ok' && (
              <PdfDownloadButton
                onClick={() => downloadPage('교사_필기', noteElements, noteFiles, page.image_url, bgPositionRef.current)}
                onDownloadAll={async () => {
                   const title = `교사_필기_전체`;
                   // Fetch all teacher notes for this assignment
                   const { data: teacherNotes } = await supabase
                     .from('assignment_teacher_notes')
                     .select('page_id, excalidraw_data')
                     .in('page_id', page.assignment_pages.map(p => p.id)); // Assuming page.assignment_pages is available and contains all pages for the assignment
                   const teacherNotesMap = Object.fromEntries((teacherNotes || []).map(n => [n.page_id, n.excalidraw_data]));

                   const pageDataList = page.assignment_pages.map(pg => { // Assuming page.assignment_pages is available
                     const tNote = teacherNotesMap[pg.id] || { elements: [], files: {}, bgPosition: null };
                     return {
                       bgUrl: pg.image_url,
                       elements: tNote.elements || [],
                       files: tNote.files || {},
                       bgPosition: tNote.bgPosition,
                     };
                   });
                   downloadMultiplePages(title, pageDataList);
                }}
                isDownloading={isDownloading}
                label="PDF 다운로드"
                className="py-1 px-2 text-xs"
              />
            )}
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 cursor-pointer">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div ref={containerRef} className="flex-1 relative overflow-hidden bg-gray-50">
          {status === 'loading' && (
            <div className="flex items-center justify-center h-full text-gray-400">불러오는 중...</div>
          )}
          {status === 'empty' && (
            <div className="flex items-center justify-center h-full text-gray-400">
              이 페이지에 교사 필기가 없습니다.
            </div>
          )}
          {status === 'ok' && (
            <>
              <style>{ALWAYS_HIDE_CSS}{PANEL_HIDE_CSS}</style>
              <Excalidraw
                key={page.id + '_modal'}
                excalidrawAPI={handleMount}
                initialData={{
                  elements: noteElements,
                  appState: { viewBackgroundColor: 'transparent', scrollX: 0, scrollY: 0 },
                }}
                viewModeEnabled={true}
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const AssignmentStudyViewer = () => {
  const { assignmentId, pageId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [assignment, setAssignment]   = useState(null);
  const [pages, setPages]             = useState([]);
  const [currentPage, setCurrentPage] = useState(null);
  const [submission, setSubmission]   = useState(null);
  const [loading, setLoading]         = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [drawMode, setDrawMode]       = useState(false);
  const [noteElements, setNoteElements] = useState([]);
  const [saveStatus, setSaveStatus]   = useState('saved');
  const [showExcalidrawPanel, setShowExcalidrawPanel] = useState(false);
  const [showTeacherNotesModal, setShowTeacherNotesModal] = useState(false);
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const { isDownloading, downloadPage, downloadMultiplePages } = usePdfDownloader();

  const containerRef         = useRef(null);
  const saveTimerRef         = useRef(null);
  const excalidrawAPIRef     = useRef(null);
  const currentPageRef       = useRef(null);
  const noteElementsRef      = useRef([]);
  const bgPositionRef        = useRef(null);
  const savedFilesRef        = useRef({});
  const teacherCommentsRef   = useRef([]);
  const teacherCommentFilesRef = useRef({});
  const userRef              = useRef(user);
  const drawModeRef          = useRef(false);
  const lastSavedRef         = useRef(null);
  const activeSidebarItemRef = useRef(null);
  const sidebarScrollRef     = useRef(null);
  const lastZoomRef          = useRef(1);
  const lastScrollXRef       = useRef(0);
  const mountedRef           = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => { currentPageRef.current  = currentPage;  }, [currentPage]);
  useEffect(() => { noteElementsRef.current = noteElements; }, [noteElements]);
  useEffect(() => { userRef.current         = user;         }, [user]);
  useEffect(() => { drawModeRef.current     = drawMode;     }, [drawMode]);

  /* 잠금 여부: submitted/graded이면 편집 불가 */
  const isLocked = ['submitted', 'late_submitted', 'graded'].includes(submission?.status);

  useEffect(() => {
    if (drawMode && excalidrawAPIRef.current) {
      const api = excalidrawAPIRef.current;
      const savedTool  = localStorage.getItem('mc_active_tool') || 'freedraw';
      const savedColor = localStorage.getItem('mc_tool_color')  || '#e03131';
      const savedWidth = parseFloat(localStorage.getItem('mc_stroke_width') || '0.4');
      const validTools = ['freedraw', 'selection', 'text', 'line', 'rectangle', 'ellipse'];
      const excTool = savedTool === 'triangle' ? 'freedraw' : (validTools.includes(savedTool) ? savedTool : 'freedraw');
      api.updateScene({ appState: { currentItemStrokeColor: savedColor, currentItemStrokeWidth: savedWidth, currentItemRoundness: 'sharp' }, commitToHistory: false });
      api.setActiveTool({ type: excTool });
    }
  }, [drawMode]);

  /* 데이터 로드 */
  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      setLoading(true);
      bgPositionRef.current = null;
      lastSavedRef.current  = null;

      const [asnRes, pgsRes, subRes] = await Promise.all([
        supabase.from('assignments').select('id, title, classroom_id, deadline, max_score').eq('id', assignmentId).single(),
        supabase.from('assignment_pages').select('id, image_url, position').eq('assignment_id', assignmentId).order('position'),
        supabase.from('assignment_submissions').select('*')
          .eq('assignment_id', assignmentId).eq('student_id', user.id).maybeSingle(),
      ]);

      setAssignment(asnRes.data);
      const pgs = pgsRes.data || [];
      setPages(pgs);
      setSubmission(subRes.data);

      if (pgs.length > 0) {
        const found = pgs.find((p) => p.id === pageId);
        if (found) {
          setCurrentPage(found);
          const nk = `${user.id}_${pageId}`;
          const ck = `${user.id}_${pageId}`;

          const notePromise = _notesCache.has(nk)
            ? Promise.resolve(_notesCache.get(nk))
            : supabase.from('assignment_notes').select('excalidraw_data')
                .eq('student_id', user.id).eq('page_id', pageId).maybeSingle()
                .then(({ data: note }) => {
                  const nd = {
                    elements:   note?.excalidraw_data?.elements   || [],
                    bgPosition: note?.excalidraw_data?.bgPosition ?? null,
                    files:      note?.excalidraw_data?.files      ?? {},
                  };
                  _notesCache.set(nk, nd);
                  return nd;
                });

          const commentPromise = _commentsCache.has(ck)
            ? Promise.resolve(_commentsCache.get(ck))
            : supabase.from('assignment_teacher_comments').select('excalidraw_data')
                .eq('page_id', pageId).eq('student_id', user.id)
                .then(({ data: comments }) => {
                  const els = (comments || []).flatMap((n) =>
                    (n.excalidraw_data?.elements || []).map((el) => ({
                      ...el, id: TEACHER_COMMENT_PREFIX + el.id, locked: true, opacity: 60,
                    }))
                  );
                  const files = Object.assign({}, ...(comments || []).map((n) => n.excalidraw_data?.files ?? {}));
                  const cd = { elements: els, files };
                  _commentsCache.set(ck, cd);
                  return cd;
                });

          const [noteData, commentData] = await Promise.all([notePromise, commentPromise]);
          setNoteElements(noteData.elements);
          bgPositionRef.current          = noteData.bgPosition;
          savedFilesRef.current          = noteData.files;
          teacherCommentsRef.current     = commentData.elements;
          teacherCommentFilesRef.current = commentData.files;
        } else {
          navigate(`/student/assignments/${assignmentId}/page/${pgs[0].id}`, { replace: true });
          return;
        }
      }
      setLoading(false);
    };
    fetchData();
  }, [assignmentId, pageId, navigate, user]);

  /* 교사 코멘트 Realtime 구독 */
  useEffect(() => {
    if (!currentPage || !user) return;
    const channel = supabase
      .channel(`atc_${currentPage.id}_${user.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'assignment_teacher_comments',
        filter: `page_id=eq.${currentPage.id}`,
      }, (payload) => {
        const row = payload.new;
        if (!row || row.student_id !== user.id) return;
        const api = excalidrawAPIRef.current;
        if (!api) return;
        const newCommentEls = (row.excalidraw_data?.elements || []).map((el) => ({
          ...el, id: TEACHER_COMMENT_PREFIX + el.id, locked: true, opacity: 60,
        }));
        const newCommentFiles = row.excalidraw_data?.files ?? {};
        if (Object.keys(newCommentFiles).length > 0) {
          api.addFiles(Object.values(newCommentFiles));
          teacherCommentFilesRef.current = { ...teacherCommentFilesRef.current, ...newCommentFiles };
        }
        _commentsCache.set(`${user.id}_${currentPage.id}`, {
          elements: newCommentEls, files: teacherCommentFilesRef.current,
        });
        teacherCommentsRef.current = newCommentEls;
        const preserved = api.getSceneElements().filter((el) => !el.id.startsWith(TEACHER_COMMENT_PREFIX));
        api.updateScene({ elements: [...preserved, ...newCommentEls], commitToHistory: false });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentPage, user]);

  /* onChange: 저장 */
  const handleExcalidrawChange = useCallback((elements, appState) => {
    if (appState) {
      const isFreedraw = appState.activeTool.type === 'freedraw';
      if (isFreedraw) {
        if (appState.zoom.value !== lastZoomRef.current || appState.scrollX !== lastScrollXRef.current) {
          excalidrawAPIRef.current?.updateScene({
            appState: { zoom: { value: lastZoomRef.current }, scrollX: lastScrollXRef.current }
          });
        }
      } else {
        lastZoomRef.current = appState.zoom.value;
        lastScrollXRef.current = appState.scrollX;
      }
    }

    if (!drawModeRef.current) return;
    if (isLocked) return;
    const bgEl = elements.find((el) => el.id === BG_ELEMENT_ID);
    if (bgEl) bgPositionRef.current = { x: bgEl.x, y: bgEl.y, width: bgEl.width, height: bgEl.height };
    const page = currentPageRef.current;
    const cu   = userRef.current;
    if (!cu || !page) return;
    const userEls = elements.filter((el) =>
      el.id !== BG_ELEMENT_ID && !el.id.startsWith(TEACHER_COMMENT_PREFIX) && !el.isDeleted
    );
    const serialized = JSON.stringify(userEls.map((el) => ({ id: el.id, type: el.type, x: el.x, y: el.y, points: el.points, text: el.text, width: el.width, height: el.height, strokeColor: el.strokeColor, strokeWidth: el.strokeWidth })));
    if (serialized === lastSavedRef.current) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (!mountedRef.current) return;
      setSaveStatus('saving');
      const allFiles = excalidrawAPIRef.current?.getFiles() ?? {};
      const teacherFileIds = new Set(Object.keys(teacherCommentFilesRef.current));
      const userFiles = Object.fromEntries(
        Object.entries(allFiles).filter(([id]) => id !== BG_FILE_ID && !teacherFileIds.has(id))
      );
      await supabase.from('assignment_notes').upsert(
        {
          assignment_id:   assignmentId,
          page_id:         page.id,
          student_id:      cu.id,
          excalidraw_data: {
            elements:   userEls,
            bgPosition: bgPositionRef.current,
            ...(Object.keys(userFiles).length > 0 && { files: userFiles }),
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'assignment_id,page_id,student_id' }
      );
      _notesCache.set(`${cu.id}_${page.id}`, {
        elements: userEls, bgPosition: bgPositionRef.current, files: userFiles,
      });
      if (mountedRef.current) { lastSavedRef.current = serialized; setSaveStatus('saved'); }
    }, 1500);
  }, [assignmentId, isLocked]);

  /* Excalidraw 마운트 */
  const handleExcalidrawMount = useCallback(async (api) => {
    excalidrawAPIRef.current = api;
    const savedTool  = localStorage.getItem('mc_active_tool') || 'freedraw';
    const savedColor = localStorage.getItem('mc_tool_color')  || '#e03131';
    const savedWidth = parseFloat(localStorage.getItem('mc_stroke_width') || '0.4');
    const validTools = ['freedraw', 'selection', 'text', 'line', 'rectangle', 'ellipse'];
    const excTool = savedTool === 'triangle' ? 'freedraw' : (validTools.includes(savedTool) ? savedTool : 'freedraw');
    api.updateScene({ appState: { currentItemStrokeColor: savedColor, currentItemStrokeWidth: savedWidth, currentItemRoundness: 'sharp' }, commitToHistory: false });
    api.setActiveTool({ type: excTool });

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
        const W = containerRef.current.clientWidth  || 800;
        const H = containerRef.current.clientHeight || 1000;
        const scale = Math.min(W / iW, H / iH);
        bgW = iW * scale; bgH = iH * scale;
        bgX = (W - bgW) / 2; bgY = (H - bgH) / 2;
        bgPositionRef.current = { x: bgX, y: bgY, width: bgW, height: bgH };
      }
      await new Promise((r) => setTimeout(r, 0));
      api.addFiles([{ id: BG_FILE_ID, dataURL: dataUrl, mimeType, created: Date.now() }]);
      const userFilesList = Object.values(savedFilesRef.current);
      if (userFilesList.length > 0) api.addFiles(userFilesList);
      const teacherFilesList = Object.values(teacherCommentFilesRef.current);
      if (teacherFilesList.length > 0) api.addFiles(teacherFilesList);
      await new Promise((r) => requestAnimationFrame(r));
      const bgEl = createBgElement(bgX, bgY, bgW, bgH);
      api.updateScene({
        elements: [bgEl, ...noteElementsRef.current, ...teacherCommentsRef.current],
        commitToHistory: false,
      });
    } catch (err) {
      console.error('배경 이미지 로드 실패:', err);
      api.updateScene({ elements: noteElementsRef.current, commitToHistory: false });
    }
  }, []);

  /* 제출 처리 */
  const handleSubmit = async () => {
    if (!user || !assignment) return;
    if (!confirm('과제를 제출하시겠습니까? 제출 후에는 수정이 불가능합니다.')) return;
    setSubmitting(true);
    const now = new Date();
    const isLate = assignment.deadline ? now > new Date(assignment.deadline) : false;
    const { data } = await supabase.from('assignment_submissions').upsert(
      {
        assignment_id: assignmentId,
        student_id:    user.id,
        status:        isLate ? 'late_submitted' : 'submitted',
        submitted_at:  now.toISOString(),
        is_late:       isLate,
        max_score:     assignment.max_score,
        updated_at:    now.toISOString(),
      },
      { onConflict: 'assignment_id,student_id' }
    ).select().single();
    setSubmitting(false);
    if (data) setSubmission(data);
  };

  /* 파생 값 */
  const currentIndex = pages.findIndex((p) => p.id === currentPage?.id);
  const prevPage = currentIndex > 0                ? pages[currentIndex - 1] : null;
  const nextPage = currentIndex < pages.length - 1 ? pages[currentIndex + 1] : null;

  useEffect(() => {
    prefetchImages([prevPage?.image_url, nextPage?.image_url].filter(Boolean));
  }, [prevPage?.image_url, nextPage?.image_url]); // Include image URLs to fix lint warning

  /* ── body 스크롤 고정 (모바일에서 터치 시 UI 밀림 방지) ── */
  useEffect(() => {
    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none'; // 브라우저 기 터치 액션(스와이프 등) 차단
    return () => {
      document.body.style.overflow = originalStyle;
      document.body.style.touchAction = '';
    };
  }, []);

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
  }, [currentPage?.id, sidebarOpen, loading]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <p className="text-gray-500">로딩 중...</p>
    </div>
  );

  /* 상태 배너 */
  const renderStatusBanner = () => {
    const s = submission?.status;
    if (!s || s === 'draft') return null;
    const configs = {
      submitted:      { bg: 'bg-green-600',  text: '제출 완료. 교사의 채점을 기다리세요.' },
      late_submitted: { bg: 'bg-yellow-500', text: '지연 제출 완료. 교사의 채점을 기다리세요.' },
      rejected: {
        bg: 'bg-orange-500',
        text: `반려되었습니다.${submission.rejection_comment ? ` 사유: ${submission.rejection_comment}` : ''} 수정 후 다시 제출하세요.`,
      },
      graded: {
        bg: 'bg-blue-600',
        text: `채점 완료: ${submission.score != null ? `${submission.score}/${submission.max_score ?? assignment?.max_score}점` : '점수 없음'}`,
      },
    };
    const cfg = configs[s];
    if (!cfg) return null;
    return (
      <div className={`${cfg.bg} text-white text-xs font-medium px-4 py-2 flex-shrink-0`}>
        {cfg.text}
      </div>
    );
  };

  const canSubmit = !isLocked && submission?.status !== 'submitted';

  return (
    <div className="flex flex-col bg-gray-100" style={{ height: '100vh' }}>

      {/* 내비게이션 바 */}
      <div className="h-14 bg-white shadow-sm flex items-center justify-between px-4 border-b flex-shrink-0 sticky top-0 z-[60]">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(`/student/classrooms/${assignment?.classroom_id}`)}
            className="p-1.5 text-gray-500 hover:text-gray-700 cursor-pointer">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="font-semibold text-gray-900">{assignment?.title}</span>
        </div>

        <div className="flex items-center gap-2">
          {drawMode && !isLocked && (
            <span className={`text-xs ${saveStatus === 'saved' ? 'text-green-600' : 'text-gray-400'}`}>
              {saveStatus === 'saved' ? '저장됨' : '저장 중...'}
            </span>
          )}

          {/* PDF 다운로드 */}
          {currentPage && noteElements && (
            <PdfDownloadButton
              onClick={() => {
                const title = `${user?.name || '학생'}_${assignment?.title || '과제'}_${currentPage.position + 1}p`;
                downloadPage(title, noteElements, savedFilesRef.current, currentPage.image_url, bgPositionRef.current);
              }}
              onDownloadAll={async () => {
                const title = `${user?.name || '학생'}_${assignment?.title || '과제'}_전체`;
                // Fetch all notes for this student in this assignment
                const { data: notes } = await supabase
                  .from('assignment_notes')
                  .select('page_id, excalidraw_data')
                  .eq('student_id', user.id)
                  .in('page_id', pages.map(p => p.id));
                const notesMap = Object.fromEntries((notes || []).map(n => [n.page_id, n.excalidraw_data]));

                const pageDataList = pages.map(pg => {
                  const note = notesMap[pg.id] || { elements: [], files: {}, bgPosition: null };
                  return {
                    bgUrl: pg.image_url,
                    elements: note.elements || [],
                    files: note.files || {},
                    bgPosition: note.bgPosition,
                  };
                });
                downloadMultiplePages(title, pageDataList);
              }}
              isDownloading={isDownloading}
              className="mt-0 ml-1 py-1 px-2 text-[10px]"
            />
          )}

          {/* 제출 버튼 */}
          {canSubmit && (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              title={submitting ? '제출 중...' : '제출하기'}
              className="flex items-center justify-center p-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 cursor-pointer"
            >
              {submitting ? <Loader className="animate-spin h-5 w-5" /> : <Send className="h-5 w-5" />}
            </button>
          )}

          {/* 교사 필기 모달 */}
          <button
            onClick={() => setShowTeacherNotesModal((v) => !v)}
            title="교사 필기"
            className={`p-1.5 rounded-md transition-colors cursor-pointer ${
              showTeacherNotesModal
                ? 'bg-amber-100 text-amber-700'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <GraduationCap className="h-5 w-5" />
          </button>

          {/* 필기 모드 토글 (편집 가능할 때만) */}
          {!isLocked && (
            <button
              onClick={() => setDrawMode((v) => !v)}
              title={drawMode ? '뷰 모드로 전환' : '필기 모드로 전환'}
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${drawMode ? 'bg-blue-600 text-white hover:bg-blue-700' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}

          {drawMode && !isLocked && (
            <button onClick={() => setToolbarCollapsed((v) => !v)}
              className="p-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 cursor-pointer">
              {toolbarCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </button>
          )}

          <button
            onClick={() => prevPage && navigate(`/student/assignments/${assignmentId}/page/${prevPage.id}`)}
            disabled={!prevPage}
            className="p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-30 cursor-pointer">
            <ChevronLeft className="h-4 w-4" />
          </button>
          {pages.length > 0 && (
            <span className="text-sm text-gray-400 min-w-[3rem] text-center">
              {currentIndex + 1} / {pages.length}
            </span>
          )}
          <button
            onClick={() => nextPage && navigate(`/student/assignments/${assignmentId}/page/${nextPage.id}`)}
            disabled={!nextPage}
            className="p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-30 cursor-pointer">
            <ChevronRight className="h-4 w-4" />
          </button>

          <button onClick={() => setSidebarOpen((v) => !v)}
            className="p-1.5 text-gray-500 hover:text-gray-700 cursor-pointer">
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* 상태 배너 */}
      {renderStatusBanner()}

      {/* 필기 툴바 */}
      {drawMode && !toolbarCollapsed && !isLocked && (
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
                <button
                  key={pg.id}
                  ref={pg.id === currentPage?.id ? activeSidebarItemRef : null}
                  onClick={() => navigate(`/student/assignments/${assignmentId}/page/${pg.id}`)}
                  className={`block w-full rounded-md overflow-hidden border-2 transition-colors text-left ${pg.id === currentPage?.id ? 'border-blue-500' : 'border-transparent hover:border-gray-300'}`}
                >
                  <img src={pg.image_url} alt={`페이지 ${idx + 1}`} className="w-full aspect-[3/4] object-cover" loading="lazy" decoding="async" />
                  <div className="bg-gray-50 text-center text-xs py-1 text-gray-600">{idx + 1}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Excalidraw */}
        <div ref={containerRef} style={GRID_STYLE} className="flex-1 relative overflow-hidden">
          <style>{ALWAYS_HIDE_CSS}{(drawMode && showExcalidrawPanel) ? '' : PANEL_HIDE_CSS}</style>
          {currentPage ? (
            <Excalidraw
              key={currentPage.id}
              excalidrawAPI={handleExcalidrawMount}
              viewModeEnabled={!drawMode || isLocked}
              initialData={{
                elements: noteElements,
                appState: {
                  viewBackgroundColor:    'transparent',
                  currentItemStrokeColor: '#1e1e1e',
                  currentItemStrokeWidth: 2,
                  scrollX: 0, scrollY: 0,
                },
              }}
              onChange={handleExcalidrawChange}
              UIOptions={{
                canvasActions: { changeViewBackgroundColor: false, clearCanvas: false, export: false, loadScene: false, saveToActiveFile: false, toggleTheme: false, saveAsImage: false },
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

      {/* 교사 필기 모달 */}
      {showTeacherNotesModal && currentPage && (
        <TeacherNotesModal
          page={currentPage}
          onClose={() => setShowTeacherNotesModal(false)}
        />
      )}
    </div>
  );
};

export default AssignmentStudyViewer;
