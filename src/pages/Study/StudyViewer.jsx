import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, Menu, Pencil, X, GraduationCap,
  ChevronUp, ChevronDown,
} from 'lucide-react';
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import DrawingToolbar from '../../components/study/DrawingToolbar';
import { BG_ELEMENT_ID, BG_FILE_ID, ALWAYS_HIDE_CSS, PANEL_HIDE_CSS, GRID_STYLE, fetchAsDataUrl, getImageNaturalSize, createBgElement, prefetchImages } from '../../lib/excalidrawUtils';
import { getCachedChapterAndPages } from '../../lib/dataCache';
import { usePdfDownloader } from '../../lib/pdfDownloader';
import { PdfDownloadButton } from '../../components/common/PdfDownloadButton';

/* ── 세션 내 캐시 (컴포넌트 unmount 후에도 유지) ── */
const _notesCache    = new Map(); // `${userId}_${pageId}` → { elements, bgPosition, files }
const _commentsCache = new Map(); // `${userId}_${pageId}` → commentEls[]

const TEACHER_NOTE_PREFIX = '__tn_';

/* ─────────── 교사 필기 모달 ─────────── */
function TeacherNotesModal({ page, pages, onClose }) {
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
        .from('teacher_notes')
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
                   // Fetch all teacher notes for this chapter
                   const { data: teacherNotes } = await supabase
                     .from('teacher_notes')
                     .select('page_id, excalidraw_data')
                     .in('page_id', pages.map(p => p.id));
                   const teacherNotesMap = Object.fromEntries((teacherNotes || []).map(n => [n.page_id, n.excalidraw_data]));

                   const pageDataList = pages.map(pg => {
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

/* ─────────── 메인 컴포넌트 ─────────── */
const StudyViewer = () => {
  const { chapterId, pageId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [chapter, setChapter]           = useState(null);
  const [pages, setPages]               = useState([]);
  const [currentPage, setCurrentPage]   = useState(null);
  const [loading, setLoading]           = useState(true);
  const [sidebarOpen, setSidebarOpen]   = useState(true);
  const [drawMode, setDrawMode]         = useState(false);
  const [noteElements, setNoteElements] = useState([]);
  const [saveStatus, setSaveStatus]     = useState('saved');
  const [showExcalidrawPanel, setShowExcalidrawPanel] = useState(false);
  const [showTeacherNotesModal, setShowTeacherNotesModal] = useState(false);
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false);
  const { isDownloading, downloadPage, downloadMultiplePages } = usePdfDownloader();

  const containerRef          = useRef(null);
  const saveTimerRef          = useRef(null);
  const excalidrawAPIRef      = useRef(null);
  const currentPageRef        = useRef(null);
  const noteElementsRef       = useRef([]);
  const bgPositionRef         = useRef(null);
  const savedFilesRef         = useRef({}); // 저장된 사용자 삽입 이미지 파일
  const teacherCommentsRef      = useRef([]); // 교사 코멘트 elements
  const teacherCommentFilesRef  = useRef({}); // 교사 코멘트 이미지 파일
  const userRef               = useRef(user);
  const drawModeRef           = useRef(false);
  const lastSavedRef          = useRef(null); // 마지막 저장 내용 (JSON) — 변경 감지용
  const activeSidebarItemRef  = useRef(null); // 사이드바 현재 페이지 요소
  const sidebarScrollRef      = useRef(null); // 사이드바 스크롤 컨테이너
  const lastZoomRef           = useRef(1);
  const lastScrollXRef        = useRef(0);
  const isTouchingRef         = useRef(false);

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

  /* ── 팜 리젝션 (넓은 면적 터치 무시) ── */
  useEffect(() => {
    const handlePalmReject = (e) => {
      const isExcalidraw = e.target.closest('.excalidraw');
      if (!isExcalidraw) return;

      if (e.type === 'pointerdown' || e.type === 'pointermove') {
        if (e.pointerType === 'touch' && (e.width > 25 || e.height > 25)) {
          e.stopPropagation();
        }
      } else if (e.type === 'touchstart' || e.type === 'touchmove') {
        let isPalm = false;
        for (let i = 0; i < e.touches.length; i++) {
          if (e.touches[i].radiusX > 25 || e.touches[i].radiusY > 25) {
            isPalm = true;
            break;
          }
        }
        if (isPalm) {
          e.stopPropagation();
          if (e.cancelable) e.preventDefault();
        }
      }
    };

    document.addEventListener('pointerdown', handlePalmReject, { capture: true, passive: false });
    document.addEventListener('pointermove', handlePalmReject, { capture: true, passive: false });
    document.addEventListener('touchstart', handlePalmReject, { capture: true, passive: false });
    document.addEventListener('touchmove', handlePalmReject, { capture: true, passive: false });

    return () => {
      document.removeEventListener('pointerdown', handlePalmReject, { capture: true });
      document.removeEventListener('pointermove', handlePalmReject, { capture: true });
      document.removeEventListener('touchstart', handlePalmReject, { capture: true });
      document.removeEventListener('touchmove', handlePalmReject, { capture: true });
    };
  }, []);

  /* ── 인접 페이지 이미지 백그라운드 프리패치 ── */
  useEffect(() => { currentPageRef.current  = currentPage;  }, [currentPage]);
  useEffect(() => { noteElementsRef.current = noteElements; }, [noteElements]);
  useEffect(() => { userRef.current         = user;         }, [user]);
  useEffect(() => { drawModeRef.current     = drawMode;     }, [drawMode]);

  /* 필기 모드 전환 시 저장된 도구/색상/굵기 복원 */
  useEffect(() => {
    if (drawMode && excalidrawAPIRef.current) {
      const api = excalidrawAPIRef.current;
      const savedTool  = localStorage.getItem('mc_active_tool') || 'freedraw';
      const savedColor = localStorage.getItem('mc_tool_color')  || '#e03131';
      const savedWidth = parseFloat(localStorage.getItem('mc_stroke_width') || '0.2');
      const validExcalidrawTools = ['freedraw', 'selection', 'text', 'line', 'rectangle', 'ellipse'];
      const excalidrawTool = savedTool === 'triangle' ? 'freedraw' :
        (validExcalidrawTools.includes(savedTool) ? savedTool : 'freedraw');
      api.updateScene({ appState: { currentItemStrokeColor: savedColor, currentItemStrokeWidth: savedWidth, currentItemRoundness: 'sharp' }, commitToHistory: false });
      api.setActiveTool({ type: excalidrawTool });
    }
  }, [drawMode]);

  /* ── 데이터 로드 ── */
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      bgPositionRef.current = null;
      lastSavedRef.current  = null;
      setShowTeacherNotesModal(false);

      /* 챕터·페이지 목록: 캐시 우선 → 없으면 병렬 fetch */
      const { chapter: chap, pages: pgs } = await getCachedChapterAndPages(chapterId, supabase);
      setChapter(chap);
      setPages(pgs);

      if (pgs && pgs.length > 0) {
        const found = pgs.find((p) => p.id === pageId);
        if (found) {
          setCurrentPage(found);
          /* 마지막 방문 페이지 저장 (재접속 시 이어보기에 사용) */
          localStorage.setItem(`mc_lastPage_${chapterId}`, found.id);
          if (user) {
            const nk = `${user.id}_${pageId}`;
            const ck = `${user.id}_${pageId}`;

            /* 학생 노트 + 교사 코멘트 — 캐시 히트면 0 round-trips, 미스면 병렬 fetch */
            const notePromise = _notesCache.has(nk)
              ? Promise.resolve(_notesCache.get(nk))
              : supabase.from('student_notes').select('excalidraw_data')
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
              : supabase.from('teacher_student_comments').select('excalidraw_data')
                  .eq('page_id', pageId).eq('student_id', user.id)
                  .then(({ data: comments }) => {
                    const els = (comments || []).flatMap((n) =>
                      (n.excalidraw_data?.elements || []).map((el) => ({
                        ...el, id: TEACHER_NOTE_PREFIX + el.id, locked: true, opacity: 60,
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
          }
        } else {
          navigate(`/student/study/${chapterId}/page/${pgs[0].id}`, { replace: true });
          return;
        }
      }
      setLoading(false);
    };
    fetchData();
  }, [chapterId, pageId, navigate, user]);

  /* ── 교사 코멘트 Realtime 구독 ── */
  useEffect(() => {
    if (!currentPage || !user) return;

    const channel = supabase
      .channel(`tsc_${currentPage.id}_${user.id}`)
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'teacher_student_comments',
          filter: `page_id=eq.${currentPage.id}`,
        },
        (payload) => {
          const row = payload.new;
          if (!row || row.student_id !== user.id) return;

          const api = excalidrawAPIRef.current;
          if (!api) return;

          const newCommentEls = (row.excalidraw_data?.elements || []).map((el) => ({
            ...el, id: TEACHER_NOTE_PREFIX + el.id, locked: true, opacity: 60,
          }));
          const newCommentFiles = row.excalidraw_data?.files ?? {};
          /* 교사 코멘트 이미지 파일 — Excalidraw에 즉시 등록 */
          if (Object.keys(newCommentFiles).length > 0) {
            api.addFiles(Object.values(newCommentFiles));
            teacherCommentFilesRef.current = { ...teacherCommentFilesRef.current, ...newCommentFiles };
          }
          /* 코멘트 캐시 갱신 — 다음 방문 시 최신 데이터 즉시 표시 */
          _commentsCache.set(`${user.id}_${currentPage.id}`, {
            elements: newCommentEls, files: teacherCommentFilesRef.current,
          });
          teacherCommentsRef.current = newCommentEls;
          const preserved = api.getSceneElements().filter(
            (el) => !el.id.startsWith(TEACHER_NOTE_PREFIX)
          );
          api.updateScene({ elements: [...preserved, ...newCommentEls], commitToHistory: false });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentPage, user]);

  /* ── Excalidraw onChange & 스마트 좌우 패닝 잠금 ── */
  const handleExcalidrawChange = useCallback((elements, appState) => {
    if (appState) {
      const isFreedraw = appState.activeTool.type === 'freedraw';
      
      if (isFreedraw) {
        if (!isTouchingRef.current) {
          if (appState.zoom.value !== lastZoomRef.current || appState.scrollX !== lastScrollXRef.current) {
            excalidrawAPIRef.current?.updateScene({
              appState: { 
                zoom: { value: lastZoomRef.current }, 
                scrollX: lastScrollXRef.current 
              }
            });
          }
        }
      } else {
        // 펜이 아닐 때(커서 등): 줌 및 좌우 스크롤 허용 (기준점 갱신)
        lastZoomRef.current = appState.zoom.value;
        lastScrollXRef.current = appState.scrollX;
      }
    }
    /* 뷰 모드에서는 저장하지 않음 */
    if (!drawModeRef.current) return;

    const bgEl = elements.find((el) => el.id === BG_ELEMENT_ID);
    if (bgEl) {
      bgPositionRef.current = { x: bgEl.x, y: bgEl.y, width: bgEl.width, height: bgEl.height };
    }

    const page = currentPageRef.current;
    const cu   = userRef.current;
    if (!cu || !page) return;

    const userEls = elements.filter((el) =>
      el.id !== BG_ELEMENT_ID &&
      !el.id.startsWith(TEACHER_NOTE_PREFIX) &&
      !el.isDeleted
    );

    /* 직전 저장 내용과 동일하면 저장 스킵 */
    const serialized = JSON.stringify(userEls.map((el) => ({ id: el.id, type: el.type, x: el.x, y: el.y, points: el.points, text: el.text, width: el.width, height: el.height, strokeColor: el.strokeColor, strokeWidth: el.strokeWidth })));
    if (serialized === lastSavedRef.current) return;

    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus('saving');
      const allFiles = excalidrawAPIRef.current?.getFiles() ?? {};
      const teacherFileIds = new Set(Object.keys(teacherCommentFilesRef.current));
      const userFiles = Object.fromEntries(
        Object.entries(allFiles).filter(([id]) => id !== BG_FILE_ID && !teacherFileIds.has(id))
      );
      await supabase.from('student_notes').upsert(
        {
          student_id:      cu.id,
          page_id:         page.id,
          excalidraw_data: {
            elements:   userEls,
            bgPosition: bgPositionRef.current,
            ...(Object.keys(userFiles).length > 0 && { files: userFiles }),
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'student_id,page_id' }
      );
      /* 노트 캐시 갱신 — 다음 방문 시 즉시 표시 */
      _notesCache.set(`${cu.id}_${page.id}`, {
        elements:   userEls,
        bgPosition: bgPositionRef.current,
        files:      userFiles,
      });
      lastSavedRef.current = serialized;
      setSaveStatus('saved');
    }, 1500);
  }, []);

  /* ── Excalidraw 마운트: bg + 학생 필기 + 교사 코멘트 ── */
  const handleExcalidrawMount = useCallback(async (api) => {
    excalidrawAPIRef.current = api;

    /* 저장된 도구 설정 복원 (React 렌더 사이클 충돌 방지) */
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
      api.addFiles([{ id: BG_FILE_ID, dataURL: dataUrl, mimeType, created: Date.now() }]);
      /* 저장된 사용자 삽입 이미지 복원 */
      const userFilesList = Object.values(savedFilesRef.current);
      if (userFilesList.length > 0) api.addFiles(userFilesList);
      /* 교사 코멘트 이미지 파일 복원 */
      const teacherFilesList = Object.values(teacherCommentFilesRef.current);
      if (teacherFilesList.length > 0) api.addFiles(teacherFilesList);
      /* addFiles의 React 상태 커밋 후 updateScene — 별도 렌더 사이클에서 실행해야 이미지가 표시됨 */
      await new Promise((r) => requestAnimationFrame(r));
      const bgEl = createBgElement(bgX, bgY, bgW, bgH);

      /* 교사 코멘트: fetchData에서 미리 로드되어 ref에 저장됨 — 추가 Supabase 요청 없음 */
      api.updateScene({
        elements: [bgEl, ...noteElementsRef.current, ...teacherCommentsRef.current],
        commitToHistory: false,
      });

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

  /* ── 사이드바: 현재 페이지가 세로 중앙에 오도록 자동 스크롤 ──
     loading이 의존성에 포함된 이유:
     캐시에서 빠르게 로드될 때 setCurrentPage와 setLoading(false)가 별도 렌더에서
     실행되어, currentPage.id가 변해도 loading=true 상태에선 사이드바가 숨겨져 있음.
     loading=false로 전환되는 시점(사이드바가 나타나는 시점)에 스크롤을 실행해야 함. */
  useEffect(() => {
    if (loading) return; // 사이드바가 숨겨진 상태에서는 스크롤 불필요
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
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(`/student/classrooms/${chapter?.classroom_id}`)}
            className="p-1.5 text-gray-500 hover:text-gray-700 cursor-pointer">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="font-semibold text-gray-900">{chapter?.title}</span>
        </div>

        <div className="flex items-center gap-2">
          {/* 저장 상태: 필기 모드일 때만 */}
          {drawMode && (
            <span className={`text-xs ${saveStatus === 'saved' ? 'text-green-600' : 'text-gray-400'}`}>
              {saveStatus === 'saved'  && '저장됨'}
              {saveStatus === 'saving' && '저장 중...'}
            </span>
          )}

          {/* PDF 다운로드 */}
          {currentPage && noteElements && (
            <PdfDownloadButton
              onClick={() => {
                const title = `${user?.name || '학생'}_${chapter?.title || '챕터'}_${currentPage.position + 1}p`;
                downloadPage(title, noteElements, savedFilesRef.current, currentPage.image_url, bgPositionRef.current);
              }}
              onDownloadAll={async () => {
                const title = `${user?.name || '학생'}_${chapter?.title || '챕터'}_전체`;
                // Fetch all notes for this student in this chapter
                const { data: notes } = await supabase
                  .from('student_notes')
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

          {/* 필기 모드 토글 */}
          <button
            onClick={() => setDrawMode((v) => !v)}
            title={drawMode ? '뷰 모드로 전환' : '필기 모드로 전환'}
            className={`p-1.5 rounded-md transition-colors cursor-pointer ${
              drawMode
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Pencil className="h-4 w-4" />
          </button>

          {/* 툴바 접기/펼치기 (필기 모드에서만) */}
          {drawMode && (
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

          {/* 이전/다음 페이지 */}
          <button
            onClick={() => prevPage && navigate(`/student/study/${chapterId}/page/${prevPage.id}`)}
            disabled={!prevPage}
            title="이전 페이지"
            className="p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-30 cursor-pointer">
            <ChevronLeft className="h-4 w-4" />
          </button>
          {pages.length > 0 && (
            <span className="text-sm text-gray-400 min-w-[3rem] text-center">
              {currentIndex + 1} / {pages.length}
            </span>
          )}
          <button
            onClick={() => nextPage && navigate(`/student/study/${chapterId}/page/${nextPage.id}`)}
            disabled={!nextPage}
            title="다음 페이지"
            className="p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-30 cursor-pointer">
            <ChevronRight className="h-4 w-4" />
          </button>

          {/* 사이드바 토글 */}
          <button onClick={() => setSidebarOpen((v) => !v)}
            title={sidebarOpen ? '페이지 목록 숨기기' : '페이지 목록 펼치기'}
            className="p-1.5 text-gray-500 hover:text-gray-700 cursor-pointer">
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* ── 필기 툴바 (필기 모드 + 펼침 상태일 때만) ── */}
      {drawMode && !toolbarCollapsed && (
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
                  to={`/student/study/${chapterId}/page/${pg.id}`}
                  className={`block rounded-md overflow-hidden border-2 transition-colors ${
                    pg.id === currentPage?.id ? 'border-blue-500' : 'border-transparent hover:border-gray-300'
                  }`}
                >
                  <img src={pg.image_url} alt={`페이지 ${idx + 1}`} className="w-full max-h-64 object-contain" loading="lazy" decoding="async" />
                  <div className="bg-gray-50 text-center text-xs py-1 text-gray-600">{idx + 1}</div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ── Excalidraw (뷰/필기 모드 공통) ── */}
        <div
          ref={containerRef}
          style={GRID_STYLE}
          className="flex-1 relative overflow-hidden"
        >
          <style>{ALWAYS_HIDE_CSS}{(drawMode && showExcalidrawPanel) ? '' : PANEL_HIDE_CSS}</style>

          {currentPage ? (
            <Excalidraw
              key={currentPage.id}
              excalidrawAPI={handleExcalidrawMount}
              viewModeEnabled={false}
              initialData={{
                elements: noteElements,
                appState: {
                  viewBackgroundColor:    'transparent',
                  currentItemStrokeColor: '#1e1e1e',
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

      {/* ── 교사 필기 모달 ── */}
      {showTeacherNotesModal && currentPage && (
        <TeacherNotesModal
          page={currentPage}
          pages={pages}
          onClose={() => setShowTeacherNotesModal(false)}
        />
      )}
    </div>
  );
};

export default StudyViewer;
