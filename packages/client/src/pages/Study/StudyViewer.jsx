import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, Menu, Pencil, X, GraduationCap,
  ChevronUp, ChevronDown,
} from 'lucide-react';
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { api } from '../../lib/api';
import { toolUrl } from '../../lib/toolUrl';
import { subscribeToRoom, getSocket } from '../../lib/socket';
import { useAuth } from '../../contexts/AuthContext';
import DrawingToolbar from '../../components/study/DrawingToolbar';
import PageNavOverlay from '../../components/study/PageNavOverlay';
import { BG_ELEMENT_ID, BG_FILE_ID, ALWAYS_HIDE_CSS, PANEL_HIDE_CSS, TOUCH_CSS, GRID_STYLE, EXCALIDRAW_UI_OPTIONS, fetchAsDataUrl, getImageNaturalSize, createBgElement, prefetchImages, calculateBgPosition, waitForLayout, clearImageCacheForUrl } from '../../lib/excalidrawUtils';
import { useExcalidrawTouch } from '../../hooks/useExcalidrawTouch';
import { useScribbleErase } from '../../hooks/useScribbleErase';
import { useFreedrawSmoothing } from '../../hooks/useFreedrawSmoothing';
import { useExcalidrawUndo } from '../../hooks/useExcalidrawUndo';
import PenDiagnosticsOverlay from '../../components/study/PenDiagnosticsOverlay';
import { setToggle } from '../../lib/penToggles';
import ExcalidrawErrorBoundary from '../../components/ExcalidrawErrorBoundary';
import { getCachedChapterAndPages } from '../../lib/dataCache';
import { usePdfDownloader } from '../../lib/pdfDownloader';
import { PdfDownloadButton } from '../../components/common/PdfDownloadButton';
import { extractYouTubeId, getYouTubeEmbedUrl, getYouTubeThumbnail } from '../../lib/youtubeUtils';

/* ── 세션 내 캐시 (컴포넌트 unmount 후에도 유지) ── */
const _notesCache    = new Map(); // `${userId}_${pageId}` → { elements, bgPosition, files }
const _commentsCache = new Map(); // `${userId}_${pageId}` → commentEls[]

const TEACHER_NOTE_PREFIX = '__tn_';

/* ── 교사 필기 모달 세션 캐시 (모달 닫아도 유지) ── */
const _teacherNotesModalCache = new Map(); // pageId → { elements, files, bgPosition }

/* ─────────── 교사 필기 모달 (실시간 + 페이지 이동) ─────────── */
function TeacherNotesModal({ initialPageId, pages, onClose }) {
  const [currentPageIndex, setCurrentPageIndex] = useState(() =>
    Math.max(0, pages.findIndex((p) => p.id === initialPageId))
  );
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const containerRef = useRef(null);
  const excApiRef = useRef(null);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ok'
  const [noteElements, setNoteElements] = useState([]);
  const [noteFiles, setNoteFiles] = useState({});
  const { isDownloading, downloadPage, downloadMultiplePages } = usePdfDownloader();
  const bgPositionRef = useRef(null);
  const [dbBgPosition, setDbBgPosition] = useState(null);
  const noteElementsRef = useRef([]);
  const noteFilesRef = useRef({});

  const currentPage = pages[currentPageIndex];
  const hasPrev = currentPageIndex > 0;
  const hasNext = currentPageIndex < pages.length - 1;

  /* refs 동기화 */
  useEffect(() => { noteElementsRef.current = noteElements; }, [noteElements]);
  useEffect(() => { noteFilesRef.current = noteFiles; }, [noteFiles]);

  /* ESC 닫기 */
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /* 교사 필기 로드 (캐시 우선) */
  useEffect(() => {
    if (!currentPage) return;
    const pid = currentPage.id;

    const applyData = (d) => {
      setNoteElements(d.elements);
      setNoteFiles(d.files);
      setDbBgPosition(d.bgPosition);
      setStatus('ok');
    };

    if (_teacherNotesModalCache.has(pid)) {
      applyData(_teacherNotesModalCache.get(pid));
      return;
    }

    setStatus('loading');
    excApiRef.current = null;

    api.get(`/api/notes/teacher-for-page/${pid}`)
      .then((data) => {
        const els = (data || []).flatMap((n) => n.excalidrawData?.elements || []);
        const files = Object.assign({}, ...(data || []).map((n) => n.excalidrawData?.files ?? {}));
        const bgPos = (data || []).find((n) => n.excalidrawData?.bgPosition)?.excalidrawData.bgPosition || null;
        const d = { elements: els, files, bgPosition: bgPos };
        _teacherNotesModalCache.set(pid, d);
        applyData(d);
      })
      .catch((err) => {
        console.error('교사 필기 로드 실패:', err);
        applyData({ elements: [], files: {}, bgPosition: null });
      });
  }, [currentPage?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Socket.IO 실시간 구독: teacher-notes:{pageId} */
  useEffect(() => {
    if (!currentPage) return;

    return subscribeToRoom(
      `teacher-notes:${currentPage.id}`,
      'teacher-note:updated',
      async () => {
        try {
          const data = await api.get(`/api/notes/teacher-for-page/${currentPage.id}`);
          const els = (data || []).flatMap((n) => n.excalidrawData?.elements || []);
          const files = Object.assign({}, ...(data || []).map((n) => n.excalidrawData?.files ?? {}));
          const bgPos = (data || []).find((n) => n.excalidrawData?.bgPosition)?.excalidrawData.bgPosition || null;

          /* 캐시 갱신 */
          _teacherNotesModalCache.set(currentPage.id, { elements: els, files, bgPosition: bgPos });

          setNoteElements(els);
          setNoteFiles(files);
          setDbBgPosition(bgPos);

          /* Excalidraw가 마운트된 상태면 scene 실시간 업데이트 */
          const excApi = excApiRef.current;
          if (excApi) {
            const noteFilesList = Object.values(files);
            if (noteFilesList.length > 0) excApi.addFiles(noteFilesList);
            await new Promise((r) => requestAnimationFrame(r));
            const bgEl = excApi.getSceneElements().find((el) => el.id === BG_ELEMENT_ID);
            const preserved = bgEl ? [bgEl] : [];
            excApi.updateScene({ elements: [...preserved, ...els], commitToHistory: false });
          } else {
            /* Excalidraw 아직 미마운트 → status 변경으로 리렌더 트리거 */
            setStatus('ok');
          }
        } catch (err) {
          console.error('교사 필기 실시간 갱신 실패:', err);
        }
      }
    );
  }, [currentPage?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Excalidraw 마운트: bg + 교사 필기 elements */
  const handleMount = useCallback(async (excApi) => {
    excApiRef.current = excApi;
    if (!currentPage?.imageUrl || !containerRef.current) return;
    try {
      const { dataUrl, mimeType } = await fetchAsDataUrl(currentPage.imageUrl);
      const { w: iW, h: iH } = await getImageNaturalSize(dataUrl);

      let bgW, bgH, bgX, bgY;
      const savedBg = dbBgPosition;
      if (savedBg && savedBg.width > 10 && savedBg.height > 10) {
        ({ width: bgW, height: bgH, x: bgX, y: bgY } = savedBg);
      } else {
        const { width: W, height: H } = await waitForLayout(containerRef.current);
        const pos = calculateBgPosition(W, H, iW, iH);
        bgX = pos.x; bgY = pos.y; bgW = pos.width; bgH = pos.height;
      }

      bgPositionRef.current = { x: bgX, y: bgY, width: bgW, height: bgH };
      excApi.addFiles([{ id: '__bg_file__', dataURL: dataUrl, mimeType, created: Date.now() }]);
      const noteFilesList = Object.values(noteFilesRef.current);
      if (noteFilesList.length > 0) excApi.addFiles(noteFilesList);
      await new Promise((r) => requestAnimationFrame(r));
      const bgEl = createBgElement(bgX, bgY, bgW, bgH);
      excApi.updateScene({ elements: [bgEl, ...noteElementsRef.current] });
    } catch (err) {
      console.error('교사 필기 모달 bg 로드 실패:', err);
      excApi.updateScene({ elements: noteElementsRef.current });
    }
  }, [currentPage?.imageUrl, dbBgPosition]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── 헤더 ── */}
        <div className="h-12 flex items-center justify-between px-4 border-b flex-shrink-0">
          <span className="font-semibold text-gray-800">교사 필기</span>
          <div className="flex items-center gap-2">
            {status === 'ok' && (
              <PdfDownloadButton
                onClick={() => downloadPage('교사_필기', noteElements, noteFiles, currentPage.imageUrl, bgPositionRef.current)}
                onDownloadAll={async () => {
                   const title = `교사_필기_전체`;
                   const allNotesPerPage = await Promise.all(
                     pages.map(async (pg) => {
                       try {
                         const notes = await api.get(`/api/notes/teacher-for-page/${pg.id}`);
                         return { pageId: pg.id, notes: notes || [] };
                       } catch {
                         return { pageId: pg.id, notes: [] };
                       }
                     })
                   );
                   const teacherNotesMap = {};
                   for (const { pageId: pid, notes } of allNotesPerPage) {
                     const els = notes.flatMap(n => n.excalidrawData?.elements || []);
                     const files = Object.assign({}, ...notes.map(n => n.excalidrawData?.files ?? {}));
                     const bgPos = notes.find(n => n.excalidrawData?.bgPosition)?.excalidrawData.bgPosition;
                     teacherNotesMap[pid] = { elements: els, files, bgPosition: bgPos || null };
                   }
                   const pageDataList = pages.map(pg => {
                     const tNote = teacherNotesMap[pg.id] || { elements: [], files: {}, bgPosition: null };
                     return {
                       bgUrl: pg.imageUrl,
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
            {/* 이전/다음 페이지 */}
            <button
              onClick={() => hasPrev && setCurrentPageIndex((i) => i - 1)}
              disabled={!hasPrev}
              className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm text-gray-500 min-w-[3rem] text-center">
              {currentPageIndex + 1} / {pages.length}
            </span>
            <button
              onClick={() => hasNext && setCurrentPageIndex((i) => i + 1)}
              disabled={!hasNext}
              className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            {/* 사이드바 토글 */}
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              title="페이지 목록"
              className="p-1.5 text-gray-400 hover:text-gray-700 cursor-pointer"
            >
              <Menu className="h-4 w-4" />
            </button>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 cursor-pointer">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* ── 본문: 사이드바 + Excalidraw ── */}
        <div className="flex flex-1 overflow-hidden">
          {/* 페이지 썸네일 사이드바 */}
          {sidebarOpen && (
            <div className="w-28 bg-gray-50 border-r overflow-y-auto flex-shrink-0">
              <div className="space-y-1.5 p-1.5">
                {pages.map((pg, idx) => (
                  <button
                    key={pg.id}
                    onClick={() => setCurrentPageIndex(idx)}
                    className={`relative block w-full rounded overflow-hidden cursor-pointer ${
                      idx === currentPageIndex
                        ? 'ring-2 ring-blue-500'
                        : 'ring-1 ring-gray-200 hover:ring-gray-400'
                    }`}
                  >
                    {pg.htmlUrl ? (
                      <div className="w-full aspect-video flex items-center justify-center bg-emerald-50 text-emerald-600 text-xs font-medium">HTML</div>
                    ) : pg.videoUrl ? (
                      <div className="relative">
                        <img src={getYouTubeThumbnail(extractYouTubeId(pg.videoUrl))} alt={`영상 ${idx + 1}`} className="w-full h-auto object-cover bg-gray-900" loading="lazy" decoding="async" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="bg-red-600 rounded-full p-1"><svg className="h-3 w-3 text-white fill-white" viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21"/></svg></div>
                        </div>
                      </div>
                    ) : (
                      <img src={pg.imageUrl} alt={`p.${idx + 1}`} className="w-full h-auto object-contain bg-white" loading="lazy" decoding="async" />
                    )}
                    <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[10px] text-center py-0.5">
                      {idx + 1}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Excalidraw / YouTube / HTML 도구 영역 */}
          {currentPage?.htmlUrl ? (
            <div className="flex-1 flex items-center justify-center bg-white">
              <iframe
                src={toolUrl(currentPage.htmlUrl)}
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals"
                className="w-full h-full"
                title="HTML 도구"
              />
            </div>
          ) : currentPage?.videoUrl ? (
            <div className="flex-1 flex items-center justify-center bg-black">
              <iframe
                src={getYouTubeEmbedUrl(extractYouTubeId(currentPage.videoUrl))}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : (
          <div ref={containerRef} className="flex-1 relative overflow-hidden bg-gray-50">
            {status === 'loading' && (
              <div className="flex items-center justify-center h-full text-gray-400">불러오는 중...</div>
            )}
            {status === 'ok' && (
              <>
                <style>{ALWAYS_HIDE_CSS}{TOUCH_CSS}{PANEL_HIDE_CSS}</style>
                <ExcalidrawErrorBoundary key={currentPage.id + '_tmodal'}>
                <Excalidraw
                  excalidrawAPI={handleMount}
                  initialData={{
                    elements: noteElements,
                    appState: { viewBackgroundColor: 'transparent', scrollX: 0, scrollY: 0 },
                  }}
                  viewModeEnabled={true}
                  UIOptions={EXCALIDRAW_UI_OPTIONS}
                />
                </ExcalidrawErrorBoundary>
              </>
            )}
          </div>
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
  const mountedRef            = useRef(true);
  const commentDebounceRef    = useRef(null);

  const [screenLocked, setScreenLocked] = useState(false);
  const screenLockedRef      = useRef(false);
  const screenLockBaseRef    = useRef({ zoom: 1, scrollX: 0, scrollY: 0 });
  const isRestoringRef       = useRef(false);
  const baseStrokeWidthRef   = useRef(parseFloat(localStorage.getItem('mc_stroke_width') || '0.2'));
  const lastZoomRef          = useRef(1);
  const isAdjustingWidthRef  = useRef(false);
  const pendingSaveDataRef   = useRef(null);
  useEffect(() => { screenLockedRef.current = screenLocked; }, [screenLocked]);

  const { triggerPalmRejectionWarmup } = useExcalidrawTouch({ excalidrawAPIRef, containerRef, screenLockedRef, baseStrokeWidthRef });
  const { checkForScribble } = useScribbleErase({ excalidrawAPIRef, excludePrefixes: [TEACHER_NOTE_PREFIX] });
  const { checkForSmoothing } = useFreedrawSmoothing({ excalidrawAPIRef, excludePrefixes: [TEACHER_NOTE_PREFIX] });
  const { recordHistory, undo, redo, canUndo, canRedo } = useExcalidrawUndo({ excalidrawAPIRef });


  useEffect(() => () => { mountedRef.current = false; }, []);

  /* 펜 진단 오버레이: ?penlog=1 진입 시 활성화 */
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('penlog') === '1') setToggle('diagnostics', true);
  }, []);

  /* ── ref 동기화 (통합) ── */
  useEffect(() => {
    currentPageRef.current  = currentPage;
    noteElementsRef.current = noteElements;
    userRef.current         = user;
    drawModeRef.current     = drawMode;
  }, [currentPage, noteElements, user, drawMode]);

  /* 필기 모드 전환 시 펜+검정으로 초기화 */
  useEffect(() => {
    if (drawMode) triggerPalmRejectionWarmup();
    if (drawMode && excalidrawAPIRef.current) {
      const excApi = excalidrawAPIRef.current;
      const savedWidth = parseFloat(localStorage.getItem('mc_stroke_width') || '0.2');
      baseStrokeWidthRef.current = savedWidth;
      const zoom = excApi.getAppState()?.zoom?.value || 1;
      lastZoomRef.current = zoom;
      excApi.updateScene({ appState: { currentItemStrokeColor: '#000000', currentItemStrokeWidth: Math.max(savedWidth / zoom, 0.05), currentItemRoundness: 'sharp' }, commitToHistory: false });
      excApi.setActiveTool({ type: 'freedraw' });
    }
  }, [drawMode]);

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
      setLoading(true);
      bgPositionRef.current = null;
      lastSavedRef.current  = null;
      setShowTeacherNotesModal(false);

      /* 챕터·페이지 목록: 캐시 우선 → 없으면 병렬 fetch */
      const { chapter: chap, pages: pgs } = await getCachedChapterAndPages(chapterId);
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
              : api.get(`/api/notes/student/${pageId}`)
                  .then((note) => {
                    const nd = {
                      elements:   note?.excalidrawData?.elements   || [],
                      bgPosition: note?.excalidrawData?.bgPosition ?? null,
                      files:      note?.excalidrawData?.files      ?? {},
                    };
                    _notesCache.set(nk, nd);
                    return nd;
                  })
                  .catch(() => {
                    const nd = { elements: [], bgPosition: null, files: {} };
                    _notesCache.set(nk, nd);
                    return nd;
                  });

            const commentPromise = _commentsCache.has(ck)
              ? Promise.resolve(_commentsCache.get(ck))
              : api.get(`/api/comments/${pageId}/for-student`)
                  .then((comments) => {
                    const els = (comments || []).flatMap((n) =>
                      (n.excalidrawData?.elements || []).map((el) => ({
                        ...el, id: TEACHER_NOTE_PREFIX + el.id, locked: true, opacity: 60,
                      }))
                    );
                    const files = Object.assign({}, ...(comments || []).map((n) => n.excalidrawData?.files ?? {}));
                    const cd = { elements: els, files };
                    _commentsCache.set(ck, cd);
                    return cd;
                  })
                  .catch(() => {
                    const cd = { elements: [], files: {} };
                    _commentsCache.set(ck, cd);
                    return cd;
                  });

            const [noteData, commentData] = await Promise.all([notePromise, commentPromise]);
            if (!mountedRef.current) return;

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

  /* ── 학생 접속 상태(Presence) 전송 ── */
  useEffect(() => {
    if (!user || !chapterId || !currentPage) return;
    const sock = getSocket();
    if (!sock?.connected) return;

    sock.emit('presence:enter', {
      chapterId,
      pageId: currentPage.id,
      studentName: user.name || '이름 없음',
    });
  }, [chapterId, currentPage?.id, user]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Presence 생명주기: 언마운트 시 leave + 재연결 시 재전송 ── */
  useEffect(() => {
    if (!user || !chapterId) return;
    const sock = getSocket();
    if (!sock) return;

    const handleReconnect = () => {
      const cp = currentPageRef.current;
      if (cp) {
        sock.emit('presence:enter', {
          chapterId,
          pageId: cp.id,
          studentName: user.name || '이름 없음',
        });
      }
    };
    sock.on('connect', handleReconnect);

    return () => {
      sock.off('connect', handleReconnect);
      if (sock.connected) {
        sock.emit('presence:leave', { chapterId });
      }
    };
  }, [chapterId, user]);

  /* ── 교사 코멘트 Socket.IO 구독 ── */
  useEffect(() => {
    if (!currentPage || !user) return;

    return subscribeToRoom(
      `comments:${currentPage.id}:${user.id}`,
      'teacher-comment:updated',
      (data) => {
        clearTimeout(commentDebounceRef.current);
        commentDebounceRef.current = setTimeout(async () => {
          if (!mountedRef.current) return;
          // 교사 코멘트가 업데이트됨 → 최신 데이터를 API에서 다시 가져옴
          const excApi = excalidrawAPIRef.current;
          if (!excApi) return;

          try {
            const comments = await api.get(`/api/comments/${currentPage.id}/for-student`);

            const newCommentEls = (comments || []).flatMap((n) =>
              (n.excalidrawData?.elements || []).map((el) => ({
                ...el, id: TEACHER_NOTE_PREFIX + el.id, locked: true, opacity: 60,
              }))
            );
            const newCommentFiles = Object.assign({}, ...(comments || []).map((n) => n.excalidrawData?.files ?? {}));

            /* 교사 코멘트 이미지 파일 — Excalidraw에 즉시 등록 */
            if (Object.keys(newCommentFiles).length > 0) {
              excApi.addFiles(Object.values(newCommentFiles));
              teacherCommentFilesRef.current = { ...teacherCommentFilesRef.current, ...newCommentFiles };
            }
            /* 코멘트 캐시 갱신 — 다음 방문 시 최신 데이터 즉시 표시 */
            _commentsCache.set(`${user.id}_${currentPage.id}`, {
              elements: newCommentEls, files: teacherCommentFilesRef.current,
            });
            teacherCommentsRef.current = newCommentEls;
            const preserved = excApi.getSceneElements().filter(
              (el) => !el.id.startsWith(TEACHER_NOTE_PREFIX)
            );
            excApi.updateScene({ elements: [...preserved, ...newCommentEls], commitToHistory: false });
          } catch (err) {
            console.error('교사 코멘트 실시간 갱신 실패:', err);
          }
        }, 300);
      }
    );
  }, [currentPage, user]);

  /* ── Excalidraw onChange & 화면 고정 ── */
  const handleExcalidrawChange = useCallback((elements, appState) => {
    if (isRestoringRef.current || isAdjustingWidthRef.current) return;

    /* Excalidraw 내부 penMode 비활성화 — OS 레벨 팜 리젝션에 위임 */
    if (appState?.penMode) {
      excalidrawAPIRef.current?.updateScene({ appState: { penMode: false }, commitToHistory: false });
      return;
    }

    /* 줌-독립 펜 두께: 줌 변경 감지 시 자동 보정 (미세 부동소수점 변동 무시) */
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
    /* 뷰 모드에서는 저장하지 않음 */
    if (!drawModeRef.current) return;

    /* 문지르기 지우개 감지 */
    checkForScribble(elements, appState);
    checkForSmoothing(elements, appState);
    recordHistory(elements);

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

    /* 페이지 이동 시 flush용 데이터 즉시 캡처 */
    const allFilesSnap = excalidrawAPIRef.current?.getFiles() ?? {};
    const teacherFileIdsSnap = new Set(Object.keys(teacherCommentFilesRef.current));
    const userFilesSnap = Object.fromEntries(
      Object.entries(allFilesSnap).filter(([id]) => id !== BG_FILE_ID && !teacherFileIdsSnap.has(id))
    );
    pendingSaveDataRef.current = {
      endpoint: `/api/notes/student/${page.id}`,
      payload: {
        excalidrawData: {
          elements: userEls,
          bgPosition: bgPositionRef.current,
          ...(Object.keys(userFilesSnap).length > 0 && { files: userFilesSnap }),
        },
        chapterId,
      },
      cacheKey: `${cu.id}_${page.id}`,
      cacheData: { elements: userEls, bgPosition: bgPositionRef.current, files: userFilesSnap },
    };

    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (mountedRef.current) setSaveStatus('saving');
      const allFiles = excalidrawAPIRef.current?.getFiles() ?? {};
      const teacherFileIds = new Set(Object.keys(teacherCommentFilesRef.current));
      const userFiles = Object.fromEntries(
        Object.entries(allFiles).filter(([id]) => id !== BG_FILE_ID && !teacherFileIds.has(id))
      );
      try {
        await api.put(`/api/notes/student/${page.id}`, {
          excalidrawData: {
            elements:   userEls,
            bgPosition: bgPositionRef.current,
            ...(Object.keys(userFiles).length > 0 && { files: userFiles }),
          },
          chapterId,
        });
        /* 노트 캐시 갱신 — 저장 성공 시에만 */
        _notesCache.set(`${cu.id}_${page.id}`, {
          elements:   userEls,
          bgPosition: bgPositionRef.current,
          files:      userFiles,
        });
        lastSavedRef.current = serialized;
        pendingSaveDataRef.current = null;
      } catch (err) {
        console.error('학생 필기 저장 실패:', err);
      }
      if (mountedRef.current) setSaveStatus('saved');
    }, 1500);
  }, [chapterId]);

  const handleToggleScreenLock = useCallback(() => {
    setScreenLocked(prev => {
      if (!prev && excalidrawAPIRef.current) {
        const s = excalidrawAPIRef.current.getAppState();
        screenLockBaseRef.current = { zoom: s.zoom.value, scrollX: s.scrollX, scrollY: s.scrollY };
      }
      return !prev;
    });
  }, []);

  /* ── Excalidraw 마운트: bg + 학생 필기 + 교사 코멘트 ── */
  const handleExcalidrawMount = useCallback(async (excApi) => {
    excalidrawAPIRef.current = excApi;

    /* 펜+검정으로 초기화 (React 렌더 사이클 충돌 방지) */
    setTimeout(() => {
      const savedWidth = parseFloat(localStorage.getItem('mc_stroke_width') || '0.4');
      baseStrokeWidthRef.current = savedWidth;
      const zoom = excApi.getAppState()?.zoom?.value || 1;
      lastZoomRef.current = zoom;
      excApi.updateScene({ appState: { currentItemStrokeColor: '#000000', currentItemStrokeWidth: Math.max(savedWidth / zoom, 0.05), currentItemRoundness: 'sharp' }, commitToHistory: false });
      excApi.setActiveTool({ type: 'freedraw' });
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
      excApi.addFiles([{ id: BG_FILE_ID, dataURL: dataUrl, mimeType, created: Date.now() }]);
      /* 저장된 사용자 삽입 이미지 복원 */
      const userFilesList = Object.values(savedFilesRef.current);
      if (userFilesList.length > 0) excApi.addFiles(userFilesList);
      /* 교사 코멘트 이미지 파일 복원 */
      const teacherFilesList = Object.values(teacherCommentFilesRef.current);
      if (teacherFilesList.length > 0) excApi.addFiles(teacherFilesList);
      /* addFiles의 React 상태 커밋 후 updateScene — 별도 렌더 사이클에서 실행해야 이미지가 표시됨 */
      await new Promise((r) => requestAnimationFrame(r));
      const bgEl = createBgElement(bgX, bgY, bgW, bgH);

      /* 교사 코멘트: fetchData에서 미리 로드되어 ref에 저장됨 — 추가 API 요청 없음 */
      excApi.updateScene({
        elements: [bgEl, ...noteElementsRef.current, ...teacherCommentsRef.current],
        commitToHistory: false,
      });

    } catch (err) {
      console.error('배경 이미지 로드 실패:', err);
      excApi.updateScene({ elements: noteElementsRef.current, commitToHistory: false });
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
            onClick={() => navigate(`/student/classrooms/${chapter?.classroomId}`)}
            className="p-1.5 text-gray-500 hover:text-gray-700 cursor-pointer">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="font-semibold text-gray-900">{chapter?.title}</span>
        </div>

        <div className="flex items-center gap-2">
          {/* 저장 상태: 필기 모드 + 영상/HTML 아닐 때만 */}
          {drawMode && !currentPage?.videoUrl && !currentPage?.htmlUrl && (
            <span className={`text-xs ${saveStatus === 'saved' ? 'text-green-600' : 'text-gray-400'}`}>
              {saveStatus === 'saved'  && '저장됨'}
              {saveStatus === 'saving' && '저장 중...'}
            </span>
          )}

          {/* PDF 다운로드 */}
          {currentPage && noteElements && !currentPage?.videoUrl && !currentPage?.htmlUrl && (
            <PdfDownloadButton
              onClick={() => {
                const title = `${user?.name || '학생'}_${chapter?.title || '챕터'}_${currentPage.position + 1}p`;
                downloadPage(title, noteElements, savedFilesRef.current, currentPage.imageUrl, bgPositionRef.current);
              }}
              onDownloadAll={async () => {
                const title = `${user?.name || '학생'}_${chapter?.title || '챕터'}_전체`;
                const pageIds = pages.map(p => p.id).join(',');
                const notes = await api.get(`/api/notes/student-bulk?pageIds=${pageIds}`);
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

          {/* 툴바 접기/펼치기 (필기 모드 + 영상/HTML 아닐 때만) */}
          {drawMode && !currentPage?.videoUrl && !currentPage?.htmlUrl && (
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

      {/* ── 필기 툴바 (필기 모드 + 펼침 상태 + 영상/HTML 아닐 때만) ── */}
      {drawMode && !toolbarCollapsed && !currentPage?.videoUrl && !currentPage?.htmlUrl && (
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
                  to={`/student/study/${chapterId}/page/${pg.id}`}
                  className={`relative block rounded-md overflow-hidden transition-colors ${
                    pg.id === currentPage?.id ? 'border-4 border-blue-500' : 'border-4 border-transparent hover:border-gray-300'
                  }`}
                >
                  {pg.htmlUrl ? (
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

        {/* ── Excalidraw / YouTube / HTML 도구 (뷰/필기 모드 공통) ── */}
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
          <style>{ALWAYS_HIDE_CSS}{TOUCH_CSS}{(drawMode && showExcalidrawPanel) ? '' : PANEL_HIDE_CSS}</style>
          <PenDiagnosticsOverlay containerRef={containerRef} />

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
          onPrev={() => prevPage && navigate(`/student/study/${chapterId}/page/${prevPage.id}`)}
          onNext={() => nextPage && navigate(`/student/study/${chapterId}/page/${nextPage.id}`)}
          hasPrev={!!prevPage}
          hasNext={!!nextPage}
        />
        </div>
      </div>

      {/* ── 교사 필기 모달 ── */}
      {showTeacherNotesModal && currentPage && (
        <TeacherNotesModal
          initialPageId={currentPage.id}
          pages={pages}
          onClose={() => setShowTeacherNotesModal(false)}
        />
      )}
    </div>
  );
};

export default StudyViewer;
