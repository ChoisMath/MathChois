import { useEffect, useState, useCallback, useRef } from 'react';
import ProblemView from '../common/ProblemView';
import CoachingPanel from '../common/CoachingPanel';

const fmt = (d) => d.toISOString().slice(0, 10);
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return fmt(d);
}

/**
 * 코칭 기록 카드 리스트 + 기간 필터 + 인라인 펼침.
 * @param {{ fetchHistory: (params:object)=>Promise<{items,total,page,pageSize}>, showTeacherNotes?: boolean }} props
 */
export default function CoachingHistoryView({ fetchHistory, showTeacherNotes = false }) {
  const [from, setFrom] = useState(() => daysAgo(7));
  const [to, setTo] = useState(() => fmt(new Date()));
  const [result, setResult] = useState({ items: [], total: 0, page: 1, pageSize: 20 });
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [showImageId, setShowImageId] = useState(null);

  const fetchHistoryRef = useRef(fetchHistory);
  useEffect(() => { fetchHistoryRef.current = fetchHistory; });

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    try { setResult(await fetchHistoryRef.current({ from, to, page })); }
    finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { load(1); }, [load]);

  const preset = (kind) => {
    if (kind === 'week') { setFrom(daysAgo(7)); setTo(fmt(new Date())); }
    else if (kind === 'month') { setFrom(daysAgo(30)); setTo(fmt(new Date())); }
    else { setFrom(''); setTo(''); }
  };

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <div className="flex flex-col gap-3">
      {/* 기간 필터 */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => preset('week')} className="px-3 min-h-11 border rounded-md text-sm whitespace-nowrap">최근 1주</button>
        <button onClick={() => preset('month')} className="px-3 min-h-11 border rounded-md text-sm whitespace-nowrap">최근 1개월</button>
        <button onClick={() => preset('all')} className="px-3 min-h-11 border rounded-md text-sm whitespace-nowrap">전체</button>
        <span className="text-gray-300">|</span>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
          className="border rounded px-2 min-h-11 text-sm w-[7.5rem] shrink-0" />
        <span className="text-gray-400">~</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
          className="border rounded px-2 min-h-11 text-sm w-[7.5rem] shrink-0" />
        <button onClick={() => load(1)} className="px-3 min-h-11 bg-blue-600 text-white rounded-md text-sm whitespace-nowrap">조회</button>
      </div>

      <p className="text-xs text-gray-500">{loading ? '불러오는 중…' : `총 ${result.total}건`}</p>

      {/* 카드 리스트 */}
      {!loading && result.items.length === 0 ? (
        <div className="border-2 border-dashed border-gray-200 rounded-xl h-32 flex items-center justify-center text-gray-400 text-sm">
          기록이 없습니다.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {result.items.map((a) => {
            const open = openId === a.id;
            return (
              <div key={a.id} className="border rounded-xl bg-white">
                <button onClick={() => setOpenId(open ? null : a.id)}
                  className="w-full flex flex-wrap items-center gap-2 p-3 text-left">
                  <span className="text-xs text-gray-500 whitespace-nowrap">{(a.createdAt || '').slice(0, 10)}</span>
                  <span title={a.problemTitle || ''} className="font-medium whitespace-nowrap truncate max-w-40 sm:max-w-60">{a.problemTitle || '(제목 없음)'}</span>
                  {a.subject && <span className="text-xs text-gray-500 whitespace-nowrap">{a.subject}{a.difficulty ? ` · ${a.difficulty}` : ''}</span>}
                  {a.chapterTitle && <span title={a.chapterTitle || ''} className="text-xs text-gray-400 whitespace-nowrap truncate max-w-28 sm:max-w-40">{a.chapterTitle}</span>}
                  <span className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${
                    a.isCorrect ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                    {a.isCorrect ? '정답' : '오답'}
                  </span>
                </button>

                {open && (
                  <div className="border-t p-3 flex flex-col gap-3">
                    {a.problemLatex && (
                      <div>
                        <p className="text-xs text-gray-400 mb-1">문제</p>
                        <ProblemView latex={a.problemLatex} figures={a.figures} />
                      </div>
                    )}
                    {a.solutionLatex && (
                      <div>
                        <p className="text-xs text-gray-400 mb-1">변환된 풀이</p>
                        <div className="border rounded-lg p-2"><ProblemView latex={a.solutionLatex} figures={[]} /></div>
                      </div>
                    )}
                    <CoachingPanel attempt={a} showTeacherNotes={showTeacherNotes} />
                    {a.workImageUrl && (
                      <div>
                        <button onClick={() => setShowImageId(showImageId === a.id ? null : a.id)}
                          className="text-xs text-gray-500 underline">
                          {showImageId === a.id ? '필기 이미지 숨기기' : '필기 이미지 보기'}
                        </button>
                        {showImageId === a.id && <img src={a.workImageUrl} alt="필기" className="mt-2 max-w-full rounded border" />}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 페이지네이션 */}
      {result.total > result.pageSize && (
        <div className="flex gap-2 justify-center">
          <button disabled={result.page <= 1} onClick={() => load(result.page - 1)}
            className="px-3 min-h-11 border rounded disabled:opacity-40 whitespace-nowrap">이전</button>
          <span className="px-2 text-sm flex items-center">{result.page} / {totalPages}</span>
          <button disabled={result.page >= totalPages} onClick={() => load(result.page + 1)}
            className="px-3 min-h-11 border rounded disabled:opacity-40 whitespace-nowrap">다음</button>
        </div>
      )}
    </div>
  );
}
