import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Excalidraw, exportToBlob } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { ArrowLeft, ChevronLeft, ChevronRight, Image as ImageIcon, Loader, Wand2, Sparkles } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../lib/api';
import ProblemView from '../../components/common/ProblemView';
import CoachingPanel from '../../components/common/CoachingPanel';
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

  const handleChange = useCallback((elements) => {
    if (readOnly) return;
    const userEls = elements.filter((el) => !el.isDeleted);
    const serialized = JSON.stringify(userEls.map((el) => ({ id: el.id, type: el.type, x: el.x, y: el.y, points: el.points })));
    if (serialized === lastSavedRef.current) return;
    clearTimeout(saveTimerRef.current);
    setSaveStatus('saving');
    saveTimerRef.current = setTimeout(() => {
      const files = excalidrawAPIRef.current?.getFiles?.() ?? {};
      api.put(`/api/notes/student/${pageId}`, { excalidrawData: { elements: userEls, files }, chapterId })
        .then(() => { lastSavedRef.current = serialized; setSaveStatus('saved'); })
        .catch(() => setSaveStatus('saved'));
    }, 1500);
  }, [pageId, chapterId, readOnly]);

  const handleMount = useCallback(async (api2) => {
    excalidrawAPIRef.current = api2;
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
      }
    } catch { /* 빈 캔버스 */ }
  }, [pageId, readOnly, viewStudentId]);

  // 언마운트/페이지 이동 시 디바운스 대기 중인 필기를 즉시 저장 (StudyViewer 패턴)
  useEffect(() => {
    if (readOnly) return undefined;
    return () => {
      clearTimeout(saveTimerRef.current);
      const excApi = excalidrawAPIRef.current;
      if (!excApi) return;
      const userEls = excApi.getSceneElements().filter((el) => !el.isDeleted);
      const serialized = JSON.stringify(userEls.map((el) => ({ id: el.id, type: el.type, x: el.x, y: el.y, points: el.points })));
      if (serialized === lastSavedRef.current) return;
      const files = excApi.getFiles?.() ?? {};
      api.put(`/api/notes/student/${pageId}`, { excalidrawData: { elements: userEls, files }, chapterId }).catch(() => {});
    };
  }, [pageId, chapterId, readOnly]);

  const startResize = useCallback((e) => {
    e.preventDefault();
    let current = rightWidth;
    const onMove = (ev) => {
      current = Math.min(window.innerWidth * 0.6, Math.max(MIN_W, window.innerWidth - ev.clientX));
      setRightWidth(current);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      localStorage.setItem(PANEL_KEY, String(current));
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
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
      <button onClick={() => go(prevPage)} disabled={!prevPage} aria-label="이전"
        className="min-h-11 min-w-11 flex items-center justify-center border rounded-md disabled:opacity-40"><ChevronLeft size={18} /></button>
      <button onClick={() => go(nextPage)} disabled={!nextPage} aria-label="다음"
        className="min-h-11 min-w-11 flex items-center justify-center border rounded-md disabled:opacity-40"><ChevronRight size={18} /></button>
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
      </div>
    </header>
  );

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-gray-50" style={{ height: '100dvh' }}>
      {header}
      {isWide ? (
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1 border-r">
            <Excalidraw excalidrawAPI={handleMount} onChange={handleChange} viewModeEnabled={readOnly} />
          </div>
          <div onPointerDown={startResize} role="separator"
            className="w-1.5 shrink-0 cursor-col-resize bg-gray-200 hover:bg-blue-400" />
          <div className="shrink-0 overflow-y-auto p-3" style={{ width: rightWidth }}>{rightPanel}</div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="h-[55dvh] shrink-0 border-b">
            <Excalidraw excalidrawAPI={handleMount} onChange={handleChange} viewModeEnabled={readOnly} />
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
