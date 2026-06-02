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
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold whitespace-nowrap">문항 선택</h3>
          <button onClick={onClose} className="min-h-11 min-w-11 flex items-center justify-center">✕</button>
        </div>

        <div className="flex flex-wrap gap-2 mb-2">
          {FILTER_FIELDS.map(([key, label]) => (
            <select key={key} className="border rounded px-2 py-1 text-sm"
              value={filters[key] ?? ''}
              onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.value || undefined }))}>
              <option value="">{label} 전체</option>
              {(facets[key] || []).map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          ))}
          <input className="border rounded px-2 py-1 text-sm flex-1 min-w-40" placeholder="키워드 검색"
            value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchList(1)} />
        </div>

        <p className="text-xs text-gray-500 mb-1">{loading ? '불러오는 중…' : `총 ${result.total}개`}</p>
        <div className="flex-1 overflow-y-auto flex flex-col gap-2">
          {result.items.map((p) => (
            <div key={p.id} className="border rounded-md p-2">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-medium whitespace-nowrap truncate">{p.title || '(제목 없음)'}</span>
                <button onClick={() => onSelect(p)}
                  className="px-3 min-h-11 bg-blue-600 text-white rounded text-sm whitespace-nowrap">선택</button>
              </div>
              <p className="text-xs text-gray-500 whitespace-nowrap truncate">
                {[p.subject, p.majorUnit, p.difficulty, p.problemType].filter(Boolean).join(' · ')}
              </p>
              <div className="max-h-24 overflow-hidden mt-1">
                <ProblemView latex={p.problemLatex} figures={p.figures} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
