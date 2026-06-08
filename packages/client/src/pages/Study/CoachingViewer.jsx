import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Excalidraw, exportToBlob } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { ArrowLeft, ChevronLeft, ChevronRight, Image as ImageIcon, Loader, Wand2, Sparkles, Menu } from 'lucide-react';
import { extractYouTubeId, getYouTubeThumbnail } from '../../lib/youtubeUtils';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../lib/api';
import ProblemView from '../../components/common/ProblemView';
import CoachingPanel from '../../components/common/CoachingPanel';
import DrawingToolbar from '../../components/study/DrawingToolbar';
import ExcalidrawErrorBoundary from '../../components/ExcalidrawErrorBoundary';
import { ALWAYS_HIDE_CSS, PANEL_HIDE_CSS, TOUCH_CSS, GRID_STYLE, EXCALIDRAW_UI_OPTIONS } from '../../lib/excalidrawUtils';
import { useExcalidrawTouch } from '../../hooks/useExcalidrawTouch';
import { useScribbleErase } from '../../hooks/useScribbleErase';
import { useFreedrawSmoothing } from '../../hooks/useFreedrawSmoothing';
import { useExcalidrawUndo } from '../../hooks/useExcalidrawUndo';
import { useIntervalRefresh } from '../../hooks/useIntervalRefresh';
import { getProblemForCoaching } from '../../lib/problems';
import { convertSolution, reviewSolution, listAttempts, getStudentPageAttempts, uploadWorkImage } from '../../lib/coaching';

const PANEL_KEY = 'coachingRightPanelWidth';
const MIN_W = 300;

/**
 * AI 코칭 뷰어. 학생은 직접 풀이/검토(쓰기), 교사는 readOnly 로 학생 화면을 그대로 열람.
 * @param {object} p
 * @param {boolean} [p.readOnly]      교사 열람 모드(필기·제출 비활성, 액션 숨김)
 * @param {string}  [p.viewStudentId] readOnly 시 해당 학생의 필기/코칭을 로드(③ 학생 코멘트)
 * @param {string}  [p.classroomId]   viewStudentId 검증/조회용
 * @param {(page:object)=>void} [p.onNavigate] 이전/다음 페이지 이동(기본: 학생 study 라우트)
 * @param {()=>void} [p.onExit]       나가기(기본: 학생 클래스 목록)
 */
export default function CoachingViewer({
  chapterId, pages, currentPage,
  readOnly = false, viewStudentId = null, classroomId = null,
  onNavigate, onExit,
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const pageId = currentPage.id;

  const excalidrawAPIRef = useRef(null);
  const saveTimerRef = useRef(null);
  const lastSavedRef = useRef(null);
  const noteLoadedRef = useRef(false); // 필기 로드 완료 전 빈 캔버스 onChange가 기존 필기를 덮어쓰는 것을 차단
  const pendingSaveRef = useRef(null);  // 실제 사용자 편집분만 담는다 — 로드 전/편집 없음이면 cleanup이 빈 배열로 덮어쓰는 것을 방지
  const lastRoNoteSigRef   = useRef(null); // readOnly 폴링: 마지막 반영한 학생 캔버스 서명 (동일하면 갱신 생략)
  const lastRoAttemptIdRef = useRef(null); // readOnly 폴링: 마지막 반영한 코칭 시도 id

  /* ── 펜 입력 인프라 (다른 필기 페이지와 동일) ── */
  const containerRef        = useRef(null);
  const [screenLocked, setScreenLocked] = useState(false);
  const screenLockedRef     = useRef(false);
  const screenLockBaseRef   = useRef({ zoom: 1, scrollX: 0, scrollY: 0 });
  const baseStrokeWidthRef  = useRef(parseFloat(localStorage.getItem('mc_stroke_width') || '0.2'));
  const lastZoomRef         = useRef(1);
  const isAdjustingWidthRef = useRef(false);
  const isRestoringRef      = useRef(false);
  const [showExcalidrawPanel, setShowExcalidrawPanel] = useState(false);
  useEffect(() => { screenLockedRef.current = screenLocked; }, [screenLocked]);

  const { triggerPalmRejectionWarmup, isGesturingRef } = useExcalidrawTouch({ excalidrawAPIRef, containerRef, screenLockedRef, baseStrokeWidthRef });
  const { checkForScribble } = useScribbleErase({ excalidrawAPIRef });
  const { checkForSmoothing } = useFreedrawSmoothing({ excalidrawAPIRef });
  const { recordHistory, undo, redo, canUndo, canRedo } = useExcalidrawUndo({ excalidrawAPIRef });

  const [problem, setProblem] = useState(null);
  const [solutionLatex, setSolutionLatex] = useState('');
  const [workImageUrl, setWorkImageUrl] = useState(null);
  const [coaching, setCoaching] = useState(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [saveStatus, setSaveStatus] = useState('saved');

  const [isWide, setIsWide] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches);
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const handler = (e) => setIsWide(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  const [rightWidth, setRightWidth] = useState(() => {
    const saved = Number(localStorage.getItem(PANEL_KEY));
    return saved >= MIN_W ? saved : 400;
  });

  const idx = pages.findIndex((p) => p.id === pageId);
  const prevPage = idx > 0 ? pages[idx - 1] : null;
  const nextPage = idx >= 0 && idx < pages.length - 1 ? pages[idx + 1] : null;
  const go = (p) => p && (onNavigate ? onNavigate(p) : navigate(`/student/study/${chapterId}/page/${p.id}`));
  const exit = () => (onExit ? onExit() : navigate('/student/classrooms'));

  useEffect(() => {
    let alive = true;
    noteLoadedRef.current = false;
    pendingSaveRef.current = null;
    lastSavedRef.current = null;
    lastRoNoteSigRef.current = null;
    lastRoAttemptIdRef.current = null;
    setProblem(null); setSolutionLatex(''); setWorkImageUrl(null); setCoaching(null); setError('');
    (async () => {
      try {
        const prob = await getProblemForCoaching(currentPage.aiProblemId);
        if (alive) setProblem(prob);
        // ②교사필기(readOnly·학생 미지정)는 시도 조회 생략, ③학생 코멘트는 해당 학생 시도 조회
        if (readOnly && !viewStudentId) return;
        const attempts = readOnly
          ? await getStudentPageAttempts(classroomId, viewStudentId, pageId)
          : await listAttempts(pageId);
        if (alive && attempts?.length) {
          setCoaching(attempts[0]);
          setSolutionLatex(attempts[0].solutionLatex || '');
          if (attempts[0].workImageUrl) setWorkImageUrl(attempts[0].workImageUrl);
        }
      } catch (err) { if (alive) setError(err.message); }
    })();
    return () => { alive = false; };
  }, [pageId, currentPage.aiProblemId, readOnly, viewStudentId, classroomId]);

  const handleChange = useCallback((elements, appState) => {
    if (readOnly) return;
    if (isRestoringRef.current || isAdjustingWidthRef.current) return;

    /* Excalidraw 내부 penMode 비활성화 — OS 레벨 팜 리젝션에 위임 */
    if (appState?.penMode) {
      excalidrawAPIRef.current?.updateScene({ appState: { penMode: false }, commitToHistory: false });
      return;
    }

    /* 핀치줌/팬 제스처 중에는 뷰포트만 바뀌므로 무거운 저장/지우개/히스토리 파이프라인을 건너뛴다 */
    if (isGesturingRef.current) return;

    /* 줌-독립 펜 두께 보정 */
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

    /* 화면 고정: 확대/축소·이동 차단 */
    if (appState && screenLockedRef.current) {
      const base = screenLockBaseRef.current;
      if (appState.zoom.value !== base.zoom || appState.scrollX !== base.scrollX || appState.scrollY !== base.scrollY) {
        isRestoringRef.current = true;
        excalidrawAPIRef.current?.updateScene({ appState: { zoom: { value: base.zoom }, scrollX: base.scrollX, scrollY: base.scrollY } });
        requestAnimationFrame(() => { isRestoringRef.current = false; });
        return;
      }
    }

    /* 문지르기 지우개 / freedraw 스무딩 / 자체 undo 히스토리 */
    checkForScribble(elements, appState);
    checkForSmoothing(elements, appState);
    recordHistory(elements);

    /* 필기 로드 완료 전에는 저장 금지 (마운트 직후 빈 캔버스 onChange로 인한 덮어쓰기 방지) */
    if (!noteLoadedRef.current) return;

    const userEls = elements.filter((el) => !el.isDeleted);
    const serialized = JSON.stringify(userEls.map((el) => ({ id: el.id, type: el.type, x: el.x, y: el.y, points: el.points })));
    if (serialized === lastSavedRef.current) {
      pendingSaveRef.current = null;
      clearTimeout(saveTimerRef.current);
      setSaveStatus('saved');
      return;
    }

    /* 변경분을 즉시 캡처 — 페이지 이동/언마운트 시 cleanup이 이 데이터만 flush한다 */
    const files = excalidrawAPIRef.current?.getFiles?.() ?? {};
    pendingSaveRef.current = { serialized, payload: { excalidrawData: { elements: userEls, files }, chapterId } };

    clearTimeout(saveTimerRef.current);
    setSaveStatus('saving');
    saveTimerRef.current = setTimeout(() => {
      const pending = pendingSaveRef.current;
      if (!pending) { setSaveStatus('saved'); return; }
      api.put(`/api/notes/student/${pageId}`, pending.payload)
        .then(() => { lastSavedRef.current = pending.serialized; pendingSaveRef.current = null; setSaveStatus('saved'); })
        .catch(() => setSaveStatus('saved'));
    }, 1500);
  }, [pageId, chapterId, readOnly, checkForScribble, checkForSmoothing, recordHistory]);

  const handleToggleScreenLock = useCallback(() => {
    const excApi = excalidrawAPIRef.current;
    setScreenLocked((prev) => {
      const next = !prev;
      if (next && excApi) {
        const st = excApi.getAppState();
        screenLockBaseRef.current = { zoom: st.zoom.value, scrollX: st.scrollX, scrollY: st.scrollY };
      }
      return next;
    });
  }, []);

  const handleMount = useCallback(async (api2) => {
    excalidrawAPIRef.current = api2;
    noteLoadedRef.current = false;
    try {
      let note;
      if (readOnly) {
        // 교사 열람: 해당 학생의 필기를 읽기 전용으로 표시(②는 학생 미지정 → 빈 캔버스)
        if (viewStudentId) {
          const bulk = await api.get(`/api/notes/student-notes-for/${viewStudentId}?pageIds=${pageId}`);
          note = (bulk || []).find((n) => n.pageId === pageId);
        }
      } else {
        note = await api.get(`/api/notes/student/${pageId}`);
      }
      const els = note?.excalidrawData?.elements ?? [];
      const files = note?.excalidrawData?.files ?? {};
      if (files && Object.keys(files).length) api2.addFiles(Object.values(files));
      api2.updateScene({ elements: els });
      if (!readOnly) {
        lastSavedRef.current = JSON.stringify(els.map((el) => ({ id: el.id, type: el.type, x: el.x, y: el.y, points: el.points })));
        recordHistory(els);
        triggerPalmRejectionWarmup?.();
      }
    } catch { /* 빈 캔버스 */ }
    finally { noteLoadedRef.current = true; }
  }, [pageId, readOnly, viewStudentId, recordHistory, triggerPalmRejectionWarmup]);

  // 언마운트/페이지 이동 시 디바운스 대기 중인 "사용자 편집분"만 즉시 저장 (StudyViewer 패턴).
  // pendingSaveRef 는 필기 로드 완료(noteLoadedRef) 후 실제 변경이 있을 때만 채워지므로,
  // 로드 전 빈 캔버스나 GET 실패 상태에서 기존 필기를 빈 배열로 덮어쓰는 일이 없다.
  useEffect(() => {
    if (readOnly) return undefined;
    return () => {
      clearTimeout(saveTimerRef.current);
      const pending = pendingSaveRef.current;
      if (!pending) return;
      pendingSaveRef.current = null;
      api.put(`/api/notes/student/${pageId}`, pending.payload).catch(() => {});
    };
  }, [pageId, chapterId, readOnly]);

  /* ── 교사 readOnly 열람: 학생 풀이·코칭을 주기적으로 보충 (소켓 미사용 화면이라 폴링이 유일한 실시간 경로) ── */
  const refreshReadOnly = useCallback(async () => {
    if (!readOnly || !viewStudentId) return;

    /* 학생 풀이 캔버스 */
    const excApi = excalidrawAPIRef.current;
    if (excApi) {
      try {
        const bulk = await api.get(`/api/notes/student-notes-for/${viewStudentId}?pageIds=${pageId}`);
        const note = (bulk || []).find((n) => n.pageId === pageId);
        const els = note?.excalidrawData?.elements ?? [];
        const sig = JSON.stringify(els.map((el) => ({ id: el.id, x: el.x, y: el.y, n: el.points?.length })));
        if (sig !== lastRoNoteSigRef.current) {
          lastRoNoteSigRef.current = sig;
          const files = note?.excalidrawData?.files ?? {};
          if (files && Object.keys(files).length) excApi.addFiles(Object.values(files));
          excApi.updateScene({ elements: els });
        }
      } catch { /* 빈 캔버스/일시 오류 무시 */ }
    }

    /* 코칭 시도(새 attempt) */
    try {
      const attempts = await getStudentPageAttempts(classroomId, viewStudentId, pageId);
      const latest = attempts?.[0];
      if (latest && latest.id !== lastRoAttemptIdRef.current) {
        lastRoAttemptIdRef.current = latest.id;
        setCoaching(latest);
        setSolutionLatex(latest.solutionLatex || '');
        if (latest.workImageUrl) setWorkImageUrl(latest.workImageUrl);
      }
    } catch { /* 무시 */ }
  }, [readOnly, viewStudentId, classroomId, pageId]);

  useIntervalRefresh(refreshReadOnly, 4000, readOnly && !!viewStudentId);

  const startResize = useCallback((e) => {
    e.preventDefault();
    // 핸들에 pointer capture — 터치/스타일러스에서 브라우저가 드래그를 스크롤로 가로채지 않게 하고
    // (touch-action:none 와 함께) 이후 move/up 이벤트를 핸들로 고정해 마우스·펜·손가락 모두 안정적으로 추적
    const el = e.currentTarget;
    try { el.setPointerCapture?.(e.pointerId); } catch { /* 일부 환경 미지원 */ }
    let current = rightWidth;
    const onMove = (ev) => {
      current = Math.min(window.innerWidth * 0.6, Math.max(MIN_W, window.innerWidth - ev.clientX));
      setRightWidth(current);
    };
    const onUp = (ev) => {
      try { el.releasePointerCapture?.(ev.pointerId); } catch { /* noop */ }
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      localStorage.setItem(PANEL_KEY, String(current));
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  }, [rightWidth]);

  async function exportWorkBlob() {
    const excApi = excalidrawAPIRef.current;
    if (!excApi) return null;
    const elements = excApi.getSceneElements().filter((el) => !el.isDeleted);
    if (elements.length === 0) return null;
    return exportToBlob({
      elements,
      appState: { viewBackgroundColor: '#ffffff', exportBackground: true, exportPadding: 8 },
      files: excApi.getFiles(),
      maxWidthOrHeight: 1280,
      mimeType: 'image/png',
    });
  }

  async function handleConvert() {
    setBusy('convert'); setError('');
    try {
      const blob = await exportWorkBlob();
      if (!blob) { setError('먼저 풀이를 작성하세요.'); setBusy(''); return; }
      const url = await uploadWorkImage(blob, `${user.id}/${pageId}`);
      setWorkImageUrl(url);
      const { latex } = await convertSolution(url);
      setSolutionLatex(latex);
    } catch (err) { setError(err.message); }
    setBusy('');
  }

  async function handleReview() {
    if (!solutionLatex) { setError('먼저 수식 전환을 완료하세요.'); return; }
    setBusy('review'); setError('');
    try {
      let url = workImageUrl;
      if (!url) {
        const blob = await exportWorkBlob();
        if (!blob) { setError('먼저 풀이를 작성하세요.'); setBusy(''); return; }
        url = await uploadWorkImage(blob, `${user.id}/${pageId}`);
        setWorkImageUrl(url);
      }
      const attempt = await reviewSolution(pageId, url, solutionLatex);
      setCoaching(attempt);
    } catch (err) { setError(err.message); }
    setBusy('');
  }

  const rightPanel = (
    <div className="flex flex-col gap-4">
      <section>
        <div className="mb-2 flex items-center gap-2">
          {problem?.originalImageUrl && (
            <button onClick={() => setShowOriginal(true)} aria-label="원본 이미지"
              className="min-h-11 min-w-11 flex items-center justify-center border rounded-md">
              <ImageIcon size={18} />
            </button>
          )}
          <h3 className="font-bold whitespace-nowrap">문항</h3>
        </div>
        {problem && (
          <>
            <p className="text-xs text-gray-500 mb-1 whitespace-nowrap truncate">
              {[problem.subject, problem.majorUnit, problem.difficulty, problem.problemType].filter(Boolean).join(' · ')}
            </p>
            <ProblemView latex={problem.problemLatex} figures={problem.figures} />
          </>
        )}
      </section>

      {readOnly && workImageUrl && (
        <section>
          <h3 className="mb-2 font-bold whitespace-nowrap">학생 제출 풀이</h3>
          <img src={workImageUrl} alt="학생 제출 풀이" className="w-full rounded-lg border" />
        </section>
      )}

      <section>
        <h3 className="mb-2 font-bold whitespace-nowrap">{readOnly ? '변환된 풀이' : '변환된 풀이 (수정 가능)'}</h3>
        {readOnly ? (
          solutionLatex
            ? <div className="border rounded-lg p-2"><ProblemView latex={solutionLatex} figures={[]} /></div>
            : <p className="text-sm text-gray-400">아직 학생이 제출한 풀이가 없습니다.</p>
        ) : (
          <>
            <textarea value={solutionLatex} onChange={(e) => setSolutionLatex(e.target.value)} rows={4}
              className="w-full rounded-lg border p-2 font-mono text-sm" placeholder="[수식전환]을 누르면 채워집니다" />
            {solutionLatex && (
              <div className="mt-2 border rounded-lg p-2"><ProblemView latex={solutionLatex} figures={[]} /></div>
            )}
          </>
        )}
      </section>

      <section>
        <h3 className="mb-2 font-bold whitespace-nowrap">AI 검토</h3>
        {coaching
          ? <CoachingPanel attempt={coaching} showTeacherNotes={readOnly} />
          : <p className="text-sm text-gray-400">{readOnly ? '아직 학생이 AI 검토를 받지 않았습니다.' : '[AI검토요청]을 누르면 코칭이 표시됩니다.'}</p>}
      </section>
    </div>
  );

  const header = (
    <header className="flex shrink-0 items-center gap-2 overflow-x-auto border-b bg-white px-2 py-2">
      <button onClick={exit} aria-label="나가기"
        className="min-h-11 min-w-11 flex items-center justify-center border rounded-md"><ArrowLeft size={18} /></button>
      <Sparkles size={16} className="text-indigo-500 shrink-0" />
      <h2 className="font-bold whitespace-nowrap">AI 코칭{problem ? ` · ${problem.subject ?? ''} ${problem.difficulty ?? ''}` : ''}</h2>
      {readOnly && (
        <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-600 whitespace-nowrap">
          학생별 AI 코칭 · 읽기 전용
        </span>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {error && <span className="text-sm text-rose-600 whitespace-nowrap">{error}</span>}
        {!readOnly && (
          <>
            <span className="text-xs text-gray-400 whitespace-nowrap">{saveStatus === 'saving' ? '저장 중…' : '저장됨'}</span>
            <button onClick={handleConvert} disabled={!!busy}
              className="flex items-center gap-1 px-3 min-h-11 border rounded-md disabled:opacity-50 whitespace-nowrap">
              {busy === 'convert' ? <Loader size={16} className="animate-spin" /> : <Wand2 size={16} />} 수식전환
            </button>
            <button onClick={handleReview} disabled={!!busy}
              className="flex items-center gap-1 px-3 min-h-11 bg-blue-600 text-white rounded-md disabled:opacity-50 whitespace-nowrap">
              {busy === 'review' ? <Loader size={16} className="animate-spin" /> : <Sparkles size={16} />} AI검토요청
            </button>
          </>
        )}
        {/* 페이지 넘김 — 다른 필기 페이지와 동일하게 우측 배치 */}
        <button onClick={() => go(prevPage)} disabled={!prevPage} aria-label="이전 페이지"
          className="min-h-11 min-w-11 flex items-center justify-center border rounded-md disabled:opacity-40"><ChevronLeft size={18} /></button>
        {pages.length > 0 && (
          <span className="text-sm text-gray-400 min-w-[3rem] text-center whitespace-nowrap">{idx + 1} / {pages.length}</span>
        )}
        <button onClick={() => go(nextPage)} disabled={!nextPage} aria-label="다음 페이지"
          className="min-h-11 min-w-11 flex items-center justify-center border rounded-md disabled:opacity-40"><ChevronRight size={18} /></button>
        {/* 페이지 목록 토글 */}
        <button onClick={() => setSidebarOpen((v) => !v)} title={sidebarOpen ? '페이지 목록 숨기기' : '페이지 목록 펼치기'}
          className="min-h-11 min-w-11 flex items-center justify-center border rounded-md"><Menu size={18} /></button>
      </div>
    </header>
  );

  const pageListSidebar = sidebarOpen && (
    <div className="w-44 shrink-0 overflow-y-auto border-r bg-white">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">페이지</span>
        <button onClick={() => setSidebarOpen(false)} title="목록 숨기기"
          className="cursor-pointer text-gray-400 hover:text-gray-600"><ChevronRight className="h-4 w-4" /></button>
      </div>
      <div className="space-y-2 p-2">
        {pages.map((pg, i) => (
          <button key={pg.id} onClick={() => pg.id !== pageId && go(pg)}
            className={`relative block w-full overflow-hidden rounded-md text-left transition-colors ${
              pg.id === pageId ? 'border-4 border-indigo-500' : 'border-4 border-transparent hover:border-gray-300'
            }`}>
            {pg.aiProblemId ? (
              <div className="flex aspect-video w-full items-center justify-center bg-indigo-50 text-xs font-medium text-indigo-600">AI 코칭</div>
            ) : pg.htmlUrl ? (
              <div className="flex aspect-video w-full items-center justify-center bg-emerald-50 text-xs font-medium text-emerald-600">HTML</div>
            ) : pg.videoUrl ? (
              <div className="relative">
                <img src={getYouTubeThumbnail(extractYouTubeId(pg.videoUrl))} alt={`영상 ${i + 1}`} className="h-auto w-full bg-gray-900 object-cover" loading="lazy" decoding="async" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="rounded-full bg-red-600 p-1"><svg className="h-3 w-3 fill-white text-white" viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21" /></svg></div>
                </div>
              </div>
            ) : (
              <img src={pg.imageUrl} alt={`페이지 ${i + 1}`} className="h-auto w-full bg-white object-contain" loading="lazy" decoding="async" />
            )}
            <div className="absolute bottom-0 inset-x-0 bg-black/50 py-0.5 text-center text-xs text-white">{i + 1}</div>
          </button>
        ))}
      </div>
    </div>
  );

  /* 좌측 필기 영역 — 다른 필기 페이지(StudyViewer)와 동일한 펜 인프라 */
  const toolbar = !readOnly && (
    <DrawingToolbar
      apiRef={excalidrawAPIRef}
      pageId={pageId}
      showPanel={showExcalidrawPanel}
      onTogglePanel={() => setShowExcalidrawPanel((v) => !v)}
      screenLocked={screenLocked}
      onToggleScreenLock={handleToggleScreenLock}
      onBaseWidthChange={(w) => { baseStrokeWidthRef.current = w; }}
      onUndo={undo} onRedo={redo} canUndo={canUndo} canRedo={canRedo}
    />
  );

  const canvas = (
    <div ref={containerRef} style={GRID_STYLE} className="w-full h-full relative overflow-hidden">
      <style>{ALWAYS_HIDE_CSS}{TOUCH_CSS}{(!readOnly && showExcalidrawPanel) ? '' : PANEL_HIDE_CSS}</style>
      <ExcalidrawErrorBoundary key={pageId}>
        <Excalidraw
          excalidrawAPI={handleMount}
          viewModeEnabled={readOnly}
          initialData={{
            elements: [],
            appState: {
              viewBackgroundColor: 'transparent',
              currentItemStrokeColor: '#000000',
              currentItemStrokeWidth: 2,
              scrollX: 0,
              scrollY: 0,
            },
          }}
          onChange={handleChange}
          UIOptions={EXCALIDRAW_UI_OPTIONS}
        />
      </ExcalidrawErrorBoundary>
    </div>
  );

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-gray-50" style={{ height: '100dvh' }}>
      {header}
      {isWide ? (
        <div className="flex min-h-0 flex-1">
          {pageListSidebar}
          <div className="flex min-w-0 flex-1 flex-col border-r">
            {toolbar}
            <div className="relative min-h-0 flex-1">{canvas}</div>
          </div>
          <div onPointerDown={startResize} role="separator" aria-orientation="vertical"
            className="group flex w-4 shrink-0 cursor-col-resize touch-none items-center justify-center bg-gray-200 hover:bg-blue-400 active:bg-blue-400">
            <div className="h-10 w-1 rounded-full bg-gray-400 group-hover:bg-white group-active:bg-white" />
          </div>
          <div className="shrink-0 overflow-y-auto p-3" style={{ width: rightWidth }}>{rightPanel}</div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="flex shrink-0" style={{ height: '55dvh' }}>
            {pageListSidebar}
            <div className="flex min-w-0 flex-1 flex-col border-b">
              {toolbar}
              <div className="relative min-h-0 flex-1">{canvas}</div>
            </div>
          </div>
          <div className="p-2 sm:p-3">{rightPanel}</div>
        </div>
      )}

      {showOriginal && problem?.originalImageUrl && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-2" onClick={() => setShowOriginal(false)}>
          <img src={problem.originalImageUrl} alt="원본 문제" className="max-h-[90dvh] max-w-full rounded" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
