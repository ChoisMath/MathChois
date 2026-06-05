import { useEffect, useState, useCallback } from 'react';
import ProblemView from '../common/ProblemView';
import { listProblems, getFacets } from '../../lib/problems';

const FILTER_FIELDS = [
  ['subject', '과목'], ['majorUnit', '대단원'], ['difficulty', '난이도'], ['problemType', '유형'],
];

/** 문제은행에서 1개 선택. onSelect(problem) / onClose() */
export default function ProblemPickerModal({ onSelect, onClose }) {
  const [facets, setFacets] = useState({});
  const [filters, setFilters] = useState({});
  const [q, setQ] = useState('');
  const [result, setResult] = useState({ items: [], total: 0, page: 1, pageSize: 20 });
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState(null);

  useEffect(() => { getFacets().then(setFacets).catch(() => {}); }, []);

  const fetchList = useCallback(async (page = 1) => {
    setLoading(true);
    try { setResult(await listProblems({ ...filters, q, page })); }
    finally { setLoading(false); }
  }, [filters, q]);

  useEffect(() => { fetchList(1); }, [fetchList]);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-2" onClick={onClose}>
      <div className="bg-white rounded-lg w-full max-w-3xl max-h-[90dvh] flex flex-col p-3" onClick={(e) => e.stopPropagation()}>
        {detail ? (
          <>
            <div className="flex items-center justify-between gap-2 mb-2">
              <button onClick={() => setDetail(null)} aria-label="문항 목록으로"
                className="min-h-11 min-w-11 shrink-0 flex items-center justify-center text-xl">←</button>
              <h3 className="font-bold whitespace-nowrap overflow-hidden text-ellipsis flex-1 text-center"
                title={detail.title || '(제목 없음)'}>{detail.title || '(제목 없음)'}</h3>
              <button onClick={() => onSelect(detail)}
                className="px-4 min-h-11 shrink-0 bg-blue-600 text-white rounded text-sm whitespace-nowrap">선택</button>
            </div>

            <div className="flex-1 overflow-y-auto">
              <p className="text-xs text-gray-500 whitespace-nowrap truncate mb-2">
                {[detail.subject, detail.majorUnit, detail.minorUnit, detail.difficulty, detail.problemType].filter(Boolean).join(' · ')}
              </p>
              <ProblemView latex={detail.problemLatex} figures={detail.figures} />
              {detail.answer && <p className="mt-3"><b>정답:</b> {detail.answer}</p>}
              {detail.solution && (
                <>
                  <hr className="my-2" />
                  <p className="text-xs text-gray-400">해설</p>
                  <ProblemView latex={detail.solution} figures={[]} />
                </>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold whitespace-nowrap">문항 선택</h3>
              <button onClick={onClose} className="min-h-11 min-w-11 shrink-0 flex items-center justify-center">✕</button>
            </div>

            <div className="flex flex-wrap gap-2 mb-2">
              {FILTER_FIELDS.map(([key, label]) => (
                <select key={key} className="border rounded px-2 min-h-11 text-sm"
                  value={filters[key] ?? ''}
                  onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.value || undefined }))}>
                  <option value="">{label} 전체</option>
                  {(facets[key] || []).map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              ))}
              <input className="border rounded px-2 min-h-11 text-sm flex-1 min-w-40" placeholder="키워드 검색"
                value={q} onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchList(1)} />
            </div>

            <p className="text-xs text-gray-500 mb-1">{loading ? '불러오는 중…' : `총 ${result.total}개`}</p>
            <div className="flex-1 overflow-y-auto flex flex-col gap-2">
              {result.items.map((p) => (
                <button key={p.id} type="button" onClick={() => setDetail(p)}
                  className="border rounded-md p-2 text-left hover:bg-blue-50">
                  <span className="font-medium whitespace-nowrap truncate block mb-1">{p.title || '(제목 없음)'}</span>
                  <p className="text-xs text-gray-500 whitespace-nowrap truncate">
                    {[p.subject, p.majorUnit, p.difficulty, p.problemType].filter(Boolean).join(' · ')}
                  </p>
                  <div className="max-h-24 overflow-hidden mt-1 pointer-events-none">
                    <ProblemView latex={p.problemLatex} figures={p.figures} />
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
