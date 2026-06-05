import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Pencil, ChevronUp, ChevronDown, Menu } from 'lucide-react';
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { api } from '../../lib/api';
import { subscribeToRoom } from '../../lib/socket';
import { useAuth } from '../../contexts/AuthContext';
import DrawingToolbar from '../../components/study/DrawingToolbar';
import PageNavOverlay from '../../components/study/PageNavOverlay';
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
  waitForLayout,
  clearImageCacheForUrl,
} from '../../lib/excalidrawUtils';
import { useExcalidrawTouch } from '../../hooks/useExcalidrawTouch';
import HtmlToolOverlay from '../../components/study/HtmlToolOverlay';
import { HTML_OVERLAY_LOCK_BASE } from '../../lib/htmlOverlay';
import { useScribbleErase } from '../../hooks/useScribbleErase';
import { useFreedrawSmoothing } from '../../hooks/useFreedrawSmoothing';
import { useExcalidrawUndo } from '../../hooks/useExcalidrawUndo';
import { useIntervalRefresh } from '../../hooks/useIntervalRefresh';
import ExcalidrawErrorBoundary from '../../components/ExcalidrawErrorBoundary';
import { extractYouTubeId, getYouTubeEmbedUrl, getYouTubeThumbnail } from '../../lib/youtubeUtils';
import CoachingViewer from '../Study/CoachingViewer';

const STUDENT_NOTE_PREFIX = '__sn_';

const StudentWorkViewer = () => {
  const { classroomId, chapterId, studentId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const initialPageIdRef = useRef(location.state?.initialPageId ?? null);

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
  const autoEnabledRef        = useRef(false); // 펜 입력으로 자동 ON 된 경우 — 모드 effect 펜 리셋 생략
  const lastSavedRef          = useRef(null); // 마지막 저장 내용 (JSON) — 변경 감지용
  const pendingSaveDataRef    = useRef(null);
  const savedStudentFilesRef  = useRef({});   // 학생이 삽입한 이미지 파일
  const savedTeacherFilesRef  = useRef({});   // 교사가 삽입한 이미지 파일
  const activeSidebarItemRef  = useRef(null); // 사이드바 현재 페이지 요소
  const sidebarScrollRef      = useRef(null); // 사이드바 스크롤 컨테이너

  /* scene data refs — avoid re-render loops */
  const studentEls = useRef([]);
  const teacherEls = useRef([]);
  const noteDebounceRef      = useRef(null);
  const lastStudentSyncRef   = useRef(null); // 마지막으로 반영한 학생 필기 — 동일하면 updateScene 생략(깜빡임 방지)

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const currentPage = pages[currentPageIndex] || null;
  useEffect(() => {
    currentPageRef.current = currentPage;
    commentModeRef.current = commentMode;
  }, [currentPage, commentMode]);

  /* 코멘트 모드 전환 시 펜+검정으로 초기화 (자동 ON은 그리는 도중이라 도구 리셋 생략) */
  useEffect(() => {
    if (commentMode && !autoEnabledRef.current) {
      triggerPalmRejectionWarmup();
      if (excalidrawAPIRef.current) {
        const excApi = excalidrawAPIRef.current;
        const savedWidth = parseFloat(localStorage.getItem('mc_stroke_width') || '0.2');
        baseStrokeWidthRef.current = savedWidth;
        const zoom = excApi.getAppState()?.zoom?.value || 1;
        lastZoomRef.current = zoom;
        excApi.updateScene({ appState: { currentItemStrokeColor: '#000000', currentItemStrokeWidth: Math.max(savedWidth / zoom, 0.05), currentItemRoundness: 'sharp' }, commitToHistory: false });
        excApi.setActiveTool({ type: 'freedraw' });
      }
    }
    autoEnabledRef.current = false;
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

        if (initialPageIdRef.current && pgs?.length > 0) {
          const idx = pgs.findIndex(p => p.id === initialPageIdRef.current);
          if (idx >= 0) setCurrentPageIndex(idx);
          initialPageIdRef.current = null;
        }
      } catch (err) {
        console.error('StudentWorkViewer fetchData error:', err);
      }

      setLoading(false);
    };
    fetchData();
  }, [chapterId, studentId]);

  /* ── 학생 필기 최신화 (소켓 이벤트 + 주기 폴링 공용) ── */
  const refreshStudentNotes = useCallback(async () => {
    const excApi = excalidrawAPIRef.current;
    const page = currentPageRef.current;
    if (!excApi || !page) return;
    try {
      const note = await api.get(`/api/notes/student-notes-for/${studentId}?pageIds=${page.id}`);
      const noteData = Array.isArray(note) ? note[0] : note;

      const newStudentEls = (noteData?.excalidrawData?.elements || []).map((el) => ({
        ...el, id: STUDENT_NOTE_PREFIX + el.id, locked: true, opacity: 60,
      }));

      /* 직전 반영분과 동일하면 화면 갱신 생략 (폴링 깜빡임·불필요 렌더 방지) */
      const sig = JSON.stringify(newStudentEls.map((el) => ({ id: el.id, x: el.x, y: el.y, n: el.points?.length })));
      if (sig === lastStudentSyncRef.current) return;
      lastStudentSyncRef.current = sig;

      if (noteData?.excalidrawData?.bgPosition) {
        bgPositionRef.current = noteData.excalidrawData.bgPosition;
      }
      studentEls.current = newStudentEls;

      const newStudentFiles = noteData?.excalidrawData?.files ?? {};
      if (Object.keys(newStudentFiles).length > 0) {
        excApi.addFiles(Object.values(newStudentFiles));
        savedStudentFilesRef.current = { ...savedStudentFilesRef.current, ...newStudentFiles };
      }

      /* BG + 교사 코멘트(진행 중 획 포함)는 유지, 학생 필기 레이어만 교체 */
      const preserved = excApi.getSceneElements().filter(
        (el) => !el.id.startsWith(STUDENT_NOTE_PREFIX)
      );
      excApi.updateScene({ elements: [...preserved, ...newStudentEls], commitToHistory: false });
    } catch (err) {
      console.error('학생 필기 갱신 실패:', err);
    }
  }, [studentId]);

  /* 소켓: 학생 필기 변경 즉시 반영 */
  useEffect(() => {
    if (!currentPage) return;
    return subscribeToRoom(
      `work:${currentPage.id}:${studentId}`,
      'student-note:updated',
      () => {
        clearTimeout(noteDebounceRef.current);
        noteDebounceRef.current = setTimeout(() => { refreshStudentNotes(); }, 300);
      }
    );
  }, [currentPage, studentId, refreshStudentNotes]);

  /* 폴링 백스톱: 소켓이 놓친 변경을 4초마다 보충 (탭 절전·네트워크 단절 대비) */
  useIntervalRefresh(refreshStudentNotes, 4000, !!currentPage);

  const [screenLocked, setScreenLocked] = useState(false);
  const screenLockedRef   = useRef(false);
  const screenLockBaseRef = useRef({ zoom: 1, scrollX: 0, scrollY: 0 });
  const isRestoringRef       = useRef(false);
  const baseStrokeWidthRef   = useRef(parseFloat(localStorage.getItem('mc_stroke_width') || '0.2'));
  const lastZoomRef          = useRef(1);
  const isAdjustingWidthRef  = useRef(false);
  const lockActiveRef = useRef(false);
  useEffect(() => {
    screenLockedRef.current = screenLocked;
    lockActiveRef.current = screenLocked || !!currentPage?.htmlUrl;
  }, [screenLocked, currentPage?.htmlUrl]);

  /* 펜으로 그리기 시작 → 코멘트 모드 자동 ON (게이트를 즉시 통과시켜 그 획부터 저장) */
  const handleUserDrawStart = useCallback(() => {
    if (commentModeRef.current) return;
    autoEnabledRef.current = true;
    commentModeRef.current = true;
    setCommentMode(true);
  }, []);

  const { triggerPalmRejectionWarmup } = useExcalidrawTouch({ excalidrawAPIRef, containerRef, screenLockedRef: lockActiveRef, baseStrokeWidthRef, onUserDrawStart: handleUserDrawStart });
  const { checkForScribble } = useScribbleErase({ excalidrawAPIRef, excludePrefixes: [STUDENT_NOTE_PREFIX] });
  const { checkForSmoothing } = useFreedrawSmoothing({ excalidrawAPIRef, excludePrefixes: [STUDENT_NOTE_PREFIX] });
  const { recordHistory, undo, redo, canUndo, canRedo } = useExcalidrawUndo({ excalidrawAPIRef });

  /* ── 페이지 변경 시 scene 데이터 로드 ── */
  /* ── 페이지 이동 시 pending 저장 flush ── */
  useEffect(() => {
    pendingSaveDataRef.current = null;
    return () => {
      clearTimeout(saveTimerRef.current);
      const pending = pendingSaveDataRef.current;
      if (!pending) return;
      pendingSaveDataRef.current = null;
      api.put(pending.endpoint, pending.payload).catch((err) => {
        console.error('페이지 이동 시 저장 실패:', err);
      });
    };
  }, [currentPage?.id]);

  useEffect(() => {
    if (!currentPage) return;

    const loadPageData = async () => {
      bgPositionRef.current = null;
      studentEls.current  = [];
      teacherEls.current  = [];
      lastSavedRef.current  = null; // 페이지 변경 시 저장 기준점 초기화
      lastStudentSyncRef.current = null; // 페이지 변경 시 학생 필기 동기화 기준점 초기화

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
      if (saved && saved.width > 10 && saved.height > 10) {
        ({ x: bgX, y: bgY, width: bgW, height: bgH } = saved);
      } else {
        const { width: W, height: H } = await waitForLayout(containerRef.current);
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

  /* ── 이미지 리로드 (원본 비율로 재배치) ── */
  const handleReloadImage = useCallback(async () => {
    const excApi = excalidrawAPIRef.current;
    if (!currentPageRef.current?.imageUrl || !excApi || !containerRef.current) return;
    bgPositionRef.current = null;
    clearImageCacheForUrl(currentPageRef.current.imageUrl);
    try {
      const { dataUrl, mimeType } = await fetchAsDataUrl(currentPageRef.current.imageUrl);
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

    const savedWidth = parseFloat(localStorage.getItem('mc_stroke_width') || '0.4');
    baseStrokeWidthRef.current = savedWidth;
    const zoom = excApi.getAppState()?.zoom?.value || 1;
    lastZoomRef.current = zoom;

    /* 캐시된 DataURL은 즉시 반환되어 Excalidraw 초기 렌더 전에 addFiles가 호출될 수 있음.
       한 이벤트 루프 후에 실행하여 Excalidraw가 렌더링 준비를 완료하도록 보장 */
    await new Promise((r) => setTimeout(r, 0));
    await rebuildScene();

    /* 펜+검정으로 초기화 — rebuildScene 이후 + 렌더 사이클 충돌 방지 (도구가 selection 으로 덮이지 않도록) */
    setTimeout(() => {
      excApi.updateScene({ appState: { currentItemStrokeColor: '#000000', currentItemStrokeWidth: Math.max(savedWidth / zoom, 0.05), currentItemRoundness: 'sharp' }, commitToHistory: false });
      excApi.setActiveTool({ type: 'freedraw' });
    }, 0);
  }, [rebuildScene]);

  /* ── HTML 오버레이 마운트: 배경 없이 학생 필기(읽기) + 교사 코멘트 ── */
  const handleHtmlOverlayMount = useCallback(async (excApi) => {
    excalidrawAPIRef.current = excApi;
    const savedWidth = parseFloat(localStorage.getItem('mc_stroke_width') || '0.4');
    baseStrokeWidthRef.current = savedWidth;
    const zoom = excApi.getAppState()?.zoom?.value || 1;
    lastZoomRef.current = zoom;

    await new Promise((r) => setTimeout(r, 0));
    if (!mountedRef.current) return;
    const studentFilesList = Object.values(savedStudentFilesRef.current);
    const teacherFilesList = Object.values(savedTeacherFilesRef.current);
    if (studentFilesList.length > 0 || teacherFilesList.length > 0) {
      excApi.addFiles([...studentFilesList, ...teacherFilesList]);
    }
    await new Promise((r) => requestAnimationFrame(r));
    if (!mountedRef.current) return;
    excApi.updateScene({ elements: [...studentEls.current, ...teacherEls.current], commitToHistory: false });

    setTimeout(() => {
      if (!mountedRef.current) return;
      excApi.updateScene({ appState: { currentItemStrokeColor: '#000000', currentItemStrokeWidth: Math.max(savedWidth / zoom, 0.05), currentItemRoundness: 'sharp' }, commitToHistory: false });
      excApi.setActiveTool({ type: 'freedraw' });
    }, 0);
  }, []);

  /* ── onChange: 코멘트 모드 + 실제 변경 시에만 저장 ── */
  const handleExcalidrawChange = useCallback((elements, appState) => {
    if (isRestoringRef.current || isAdjustingWidthRef.current) return;

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

    if (appState && lockActiveRef.current) {
      const base = currentPageRef.current?.htmlUrl ? HTML_OVERLAY_LOCK_BASE : screenLockBaseRef.current;
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

    if (!commentModeRef.current) return;

    /* 문지르기 지우개 감지 */
    checkForScribble(elements, appState);
    checkForSmoothing(elements, appState);
    recordHistory(elements);

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

    /* 페이지 이동 시 flush용 데이터 즉시 캡처 */
    const allFilesSnap = excalidrawAPIRef.current?.getFiles() ?? {};
    const teacherFilesSnap = Object.fromEntries(
      Object.entries(allFilesSnap).filter(([id]) => id !== BG_FILE_ID && !savedStudentFilesRef.current[id])
    );
    pendingSaveDataRef.current = {
      endpoint: `/api/comments/${page.id}/${studentId}`,
      payload: {
        excalidrawData: {
          elements: filtered,
          ...(Object.keys(teacherFilesSnap).length > 0 && { files: teacherFilesSnap }),
        },
      },
    };

    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (mountedRef.current) setSaveStatus('saving');
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
        lastSavedRef.current = serialized;
        pendingSaveDataRef.current = null;
      } catch (err) {
        console.error('교사 코멘트 저장 실패:', err);
      }
      if (mountedRef.current) setSaveStatus('saved');
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

  // AI 코칭 페이지: 빈 Excalidraw 대신 학생이 받은 코칭 화면을 읽기 전용으로 표시
  if (currentPage?.aiProblemId) {
    return (
      <CoachingViewer
        readOnly
        chapterId={chapterId}
        pages={pages}
        currentPage={currentPage}
        viewStudentId={studentId}
        classroomId={classroomId}
        onNavigate={(p) => goPage(pages.findIndex((x) => x.id === p.id))}
        onExit={() => navigate(`/teacher/classrooms/${classroomId}/chapters/${chapterId}/monitor`)}
      />
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
          {commentMode && !currentPage?.videoUrl && (
            <span className={`text-xs ${saveStatus === 'saved' ? 'text-green-600' : 'text-gray-400'}`}>
              {saveStatus === 'saved' ? '저장됨' : '저장 중...'}
            </span>
          )}
          {/* PDF 다운로드 */}
          {currentPage && studentEls.current && !currentPage?.videoUrl && !currentPage?.htmlUrl && (
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

      {/* ── 필기 툴바 (코멘트 모드 + 펼침 상태 + 영상/HTML 페이지 아닐 때만) ── */}
      {commentMode && !toolbarCollapsed && !currentPage?.videoUrl && (
        currentPage?.htmlUrl ? (
          <DrawingToolbar
            apiRef={excalidrawAPIRef}
            pageId={currentPage?.id}
            showPanel={showExcalidrawPanel}
            onTogglePanel={() => setShowExcalidrawPanel((v) => !v)}
            onBaseWidthChange={(w) => { baseStrokeWidthRef.current = w; }}
            onUndo={undo} onRedo={redo} canUndo={canUndo} canRedo={canRedo}
            htmlMode
          />
        ) : (
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
        )
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
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 캔버스 / YouTube / HTML 도구 */}
        <div className="flex-1 relative overflow-hidden">
        {currentPage?.htmlUrl ? (
          <HtmlToolOverlay
            htmlUrl={currentPage.htmlUrl}
            drawing={commentMode}
            containerRef={containerRef}
            excalidrawAPI={handleHtmlOverlayMount}
            onChange={handleExcalidrawChange}
            showPanel={showExcalidrawPanel}
          />
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
                elements: [],
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
          onPrev={() => currentPageIndex > 0 && goPage(currentPageIndex - 1)}
          onNext={() => currentPageIndex < pages.length - 1 && goPage(currentPageIndex + 1)}
          hasPrev={currentPageIndex > 0}
          hasNext={currentPageIndex < pages.length - 1}
        />
        </div>
      </div>
    </div>
  );
};

export default StudentWorkViewer;
