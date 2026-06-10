import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Sparkles, Menu, RotateCcw, Loader } from 'lucide-react';
import { extractYouTubeId, getYouTubeThumbnail } from '../../lib/youtubeUtils';
import ProblemView from '../../components/common/ProblemView';
import AttemptStack from '../../components/coaching/AttemptStack';
import { getProblemForCoaching } from '../../lib/problems';
import { getPageStudents, getStudentPageAttempts, resetStudentQuota } from '../../lib/coaching';

/**
 * 교사 챕터 필기 경로의 AI 코칭 문항 화면.
 * 사이드바: 문항(페이지) 네비. 메인: 시도한 학생 카드(횟수 + 리셋 + 펼치면 누적 코칭).
 */
export default function TeacherCoachingReview({ classroomId, pages, currentPage, onNavigate, onExit }) {
  const pageId = currentPage.id;
  const [problem, setProblem] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const [attemptsById, setAttemptsById] = useState({});
  const [resettingId, setResettingId] = useState(null);
  const [error, setError] = useState('');
  const aliveRef = useRef(true);

  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches);

  const idx = pages.findIndex((p) => p.id === pageId);
  const prevPage = idx > 0 ? pages[idx - 1] : null;
  const nextPage = idx >= 0 && idx < pages.length - 1 ? pages[idx + 1] : null;
  const go = (p) => p && onNavigate(p);

  useEffect(() => {
    aliveRef.current = true;
    (async () => {
      setProblem(null); setStudents([]); setOpenId(null); setAttemptsById({}); setLoading(true); setError('');
      try {
        const [prob, list] = await Promise.all([
          getProblemForCoaching(currentPage.aiProblemId),
          getPageStudents(classroomId, pageId),
        ]);
        if (!aliveRef.current) return;
        setProblem(prob);
        setStudents(list || []);
      } catch (err) { if (aliveRef.current) setError(err.message); }
      if (aliveRef.current) setLoading(false);
    })();
    return () => { aliveRef.current = false; };
  }, [classroomId, pageId, currentPage.aiProblemId]);

  const toggleStudent = async (studentId) => {
    if (openId === studentId) { setOpenId(null); return; }
    setOpenId(studentId);
    if (!attemptsById[studentId]) {
      try {
        const data = await getStudentPageAttempts(classroomId, studentId, pageId);
        setAttemptsById((prev) => ({ ...prev, [studentId]: data.attempts || [] }));
      } catch (err) { setError(err.message); }
    }
  };

  const handleReset = async (studentId) => {
    if (!window.confirm('이 학생의 AI 코칭 횟수를 리셋할까요? (기록은 보존됩니다)')) return;
    setResettingId(studentId);
    try {
      const res = await resetStudentQuota(classroomId, studentId, pageId);
      setStudents((prev) => prev.map((s) => (s.studentId === studentId ? { ...s, used: res.used, resetAt: res.resetAt } : s)));
    } catch (err) { setError(err.message); }
    setResettingId(null);
  };

  const header = (
    <header className="flex shrink-0 items-center gap-2 overflow-x-auto border-b bg-white px-2 py-2">
      <button onClick={onExit} aria-label="나가기" className="min-h-11 min-w-11 flex items-center justify-center border rounded-md"><ArrowLeft size={18} /></button>
      <Sparkles size={16} className="text-indigo-500 shrink-0" />
      <h2 className="font-bold whitespace-nowrap">AI 코칭 · 학생별{problem ? ` · ${problem.subject ?? ''} ${problem.difficulty ?? ''}` : ''}</h2>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {error && <span className="text-sm text-rose-600 whitespace-nowrap">{error}</span>}
        <button onClick={() => go(prevPage)} disabled={!prevPage} aria-label="이전 페이지" className="min-h-11 min-w-11 flex items-center justify-center border rounded-md disabled:opacity-40"><ChevronLeft size={18} /></button>
        {pages.length > 0 && <span className="text-sm text-gray-400 min-w-[3rem] text-center whitespace-nowrap">{idx + 1} / {pages.length}</span>}
        <button onClick={() => go(nextPage)} disabled={!nextPage} aria-label="다음 페이지" className="min-h-11 min-w-11 flex items-center justify-center border rounded-md disabled:opacity-40"><ChevronRight size={18} /></button>
        <button onClick={() => setSidebarOpen((v) => !v)} title={sidebarOpen ? '페이지 목록 숨기기' : '페이지 목록 펼치기'} className="min-h-11 min-w-11 flex items-center justify-center border rounded-md"><Menu size={18} /></button>
      </div>
    </header>
  );

  const pageListSidebar = sidebarOpen && (
    <div className="w-44 shrink-0 overflow-y-auto border-r bg-white">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">페이지</span>
        <button onClick={() => setSidebarOpen(false)} title="목록 숨기기" className="cursor-pointer text-gray-400 hover:text-gray-600"><ChevronRight className="h-4 w-4" /></button>
      </div>
      <div className="space-y-2 p-2">
        {pages.map((pg, i) => (
          <button key={pg.id} onClick={() => pg.id !== pageId && go(pg)}
            className={`relative block w-full overflow-hidden rounded-md text-left transition-colors ${
              pg.id === pageId ? 'border-4 border-indigo-500' : 'border-4 border-transparent hover:border-gray-300'}`}>
            {pg.aiProblemId ? (
              <div className="flex aspect-video w-full items-center justify-center bg-indigo-50 text-xs font-medium text-indigo-600">AI 코칭</div>
            ) : pg.htmlUrl ? (
              <div className="flex aspect-video w-full items-center justify-center bg-emerald-50 text-xs font-medium text-emerald-600">HTML</div>
            ) : pg.videoUrl ? (
              <img src={getYouTubeThumbnail(extractYouTubeId(pg.videoUrl))} alt={`영상 ${i + 1}`} className="h-auto w-full bg-gray-900 object-cover" loading="lazy" />
            ) : (
              <img src={pg.imageUrl} alt={`페이지 ${i + 1}`} className="h-auto w-full bg-white object-contain" loading="lazy" />
            )}
            <div className="absolute bottom-0 inset-x-0 bg-black/50 py-0.5 text-center text-xs text-white">{i + 1}</div>
          </button>
        ))}
      </div>
    </div>
  );

  const main = (
    <div className="min-w-0 flex-1 overflow-y-auto p-3">
      {problem && (
        <section className="mb-4">
          <p className="mb-1 text-xs text-gray-500 whitespace-nowrap truncate">
            {[problem.subject, problem.majorUnit, problem.difficulty, problem.problemType].filter(Boolean).join(' · ')}
          </p>
          <ProblemView latex={problem.problemLatex} figures={problem.figures} />
        </section>
      )}

      <h3 className="mb-2 font-bold whitespace-nowrap">학생별 AI 코칭 {students.length > 0 && `(${students.length}명)`}</h3>
      {loading ? (
        <p className="text-sm text-gray-400">불러오는 중…</p>
      ) : students.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-xl border-2 border-dashed border-gray-200 text-sm text-gray-400">
          아직 이 문항에 AI 코칭을 시도한 학생이 없습니다.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {students.map((s) => {
            const open = openId === s.studentId;
            return (
              <div key={s.studentId} className="rounded-xl border bg-white">
                <div className="flex flex-wrap items-center gap-2 p-3">
                  <button onClick={() => toggleStudent(s.studentId)} className="flex flex-1 items-center gap-2 text-left">
                    <ChevronRight size={16} className={`shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
                    <span className="font-medium whitespace-nowrap">{s.name || '(이름 없음)'}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${
                      s.used >= s.limit ? 'bg-rose-100 text-rose-700' : 'bg-indigo-50 text-indigo-600'}`}>
                      {s.used} / {s.limit}회
                    </span>
                  </button>
                  <button onClick={() => handleReset(s.studentId)} disabled={resettingId === s.studentId}
                    className="flex min-h-11 items-center gap-1 rounded-md border px-3 text-sm text-gray-600 disabled:opacity-50 whitespace-nowrap">
                    {resettingId === s.studentId ? <Loader size={14} className="animate-spin" /> : <RotateCcw size={14} />} 리셋
                  </button>
                </div>
                {open && (
                  <div className="border-t p-2">
                    {attemptsById[s.studentId]
                      ? <AttemptStack attempts={attemptsById[s.studentId]} showTeacherNotes />
                      : <p className="p-2 text-sm text-gray-400">불러오는 중…</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-gray-50" style={{ height: '100dvh' }}>
      {header}
      <div className="flex min-h-0 flex-1">
        {pageListSidebar}
        {main}
      </div>
    </div>
  );
}
