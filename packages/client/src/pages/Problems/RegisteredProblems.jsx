import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import ProblemView from '../../components/common/ProblemView';
import ProblemRegister from './ProblemRegister';
import { listProblems, getFacets, deleteProblem } from '../../lib/problems';

const FILTER_FIELDS = [
  ['subject', '과목'], ['majorUnit', '대단원'], ['minorUnit', '소단원'],
  ['difficulty', '난이도'], ['problemType', '유형'],
];

export default function RegisteredProblems() {
  const { profile } = useAuth();
  const [facets, setFacets] = useState({});
  const [filters, setFilters] = useState({});
  const [q, setQ] = useState('');
  const [result, setResult] = useState({ items: [], total: 0, page: 1, pageSize: 20 });
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState(null);
  const [editing, setEditing] = useState(null);

  useEffect(() => { getFacets().then(setFacets).catch(() => {}); }, []);

  const fetchList = useCallback(async (page = 1) => {
    setLoading(true);
    try { setResult(await listProblems({ ...filters, q, page })); }
    finally { setLoading(false); }
  }, [filters, q]);

  useEffect(() => { fetchList(1); }, [fetchList]);

  const canManage = (p) => p.createdBy === profile?.id || profile?.isAdmin;

  const handleDelete = async (p) => {
    if (!confirm('이 문항을 삭제할까요?')) return;
    try {
      await deleteProblem(p.id);
      fetchList(result.page);
    } catch (err) {
      alert(err.message ?? '삭제에 실패했습니다.');
    }
  };

  if (editing) {
    return (
      <ProblemRegister
        initial={{ ...editing, keywords: editing.keywords || [] }}
        onSaved={() => { setEditing(null); fetchList(result.page); }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 필터바 */}
      <div className="flex flex-wrap gap-2">
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
        <button onClick={() => fetchList(1)} className="px-3 py-1 bg-blue-600 text-white rounded text-sm whitespace-nowrap">검색</button>
      </div>

      <p className="text-xs text-gray-500">{loading ? '불러오는 중…' : `총 ${result.total}개`}</p>

      {/* 표 */}
      <div className="overflow-x-auto border rounded-md max-h-[70dvh] overflow-y-auto">
        <table className="min-w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100">
              {['제목', '과목', '대단원', '소단원', '난이도', '유형', '세부유형', '키워드', '작성일', ''].map((h, i) => (
                <th key={h || i}
                  className={`px-3 py-2 text-left whitespace-nowrap sticky top-0 bg-gray-100 z-20 ${i === 0 ? 'left-0 z-30' : ''}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.items.map((p) => (
              <tr key={p.id} className="border-t hover:bg-blue-50 cursor-pointer" onClick={() => setDetail(p)}>
                <td className="px-3 py-2 whitespace-nowrap sticky left-0 bg-white z-10 max-w-60 truncate">{p.title || '(제목 없음)'}</td>
                <td className="px-3 py-2 whitespace-nowrap">{p.subject}</td>
                <td className="px-3 py-2 whitespace-nowrap">{p.majorUnit}</td>
                <td className="px-3 py-2 whitespace-nowrap">{p.minorUnit}</td>
                <td className="px-3 py-2 whitespace-nowrap">{p.difficulty}</td>
                <td className="px-3 py-2 whitespace-nowrap">{p.problemType}</td>
                <td className="px-3 py-2 whitespace-nowrap">{p.detailType}</td>
                <td className="px-3 py-2 whitespace-nowrap max-w-60 truncate">{(p.keywords || []).join(', ')}</td>
                <td className="px-3 py-2 whitespace-nowrap">{(p.createdAt || '').slice(0, 10)}</td>
                <td className="px-3 py-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                  {canManage(p) && (
                    <span className="flex gap-3">
                      <button className="text-blue-600 inline-flex items-center min-h-11 px-2 whitespace-nowrap" onClick={() => setEditing(p)}>수정</button>
                      <button className="text-red-600 inline-flex items-center min-h-11 px-2 whitespace-nowrap" onClick={() => handleDelete(p)}>삭제</button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      {result.total > result.pageSize && (
        <div className="flex gap-2 justify-center">
          <button disabled={result.page <= 1} onClick={() => fetchList(result.page - 1)}
            className="px-3 min-h-11 border rounded disabled:opacity-40 whitespace-nowrap">이전</button>
          <span className="px-2 py-1 text-sm flex items-center">{result.page} / {Math.ceil(result.total / result.pageSize)}</span>
          <button disabled={result.page >= Math.ceil(result.total / result.pageSize)} onClick={() => fetchList(result.page + 1)}
            className="px-3 min-h-11 border rounded disabled:opacity-40 whitespace-nowrap">다음</button>
        </div>
      )}

      {/* 상세 패널 */}
      {detail && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-2" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90dvh] overflow-y-auto p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-bold whitespace-nowrap">{detail.title || '(제목 없음)'}</h3>
              <button onClick={() => setDetail(null)} className="min-h-11 min-w-11 flex items-center justify-center">✕</button>
            </div>
            <ProblemView latex={detail.problemLatex} figures={detail.figures} />
            {detail.originalImageUrl && (
              <details className="mt-2">
                <summary className="text-xs text-gray-500 cursor-pointer">원본 이미지 보기</summary>
                <img src={detail.originalImageUrl} alt="원본" className="mt-2 max-w-full" />
              </details>
            )}
            {detail.answer && <p className="mt-3"><b>정답:</b> {detail.answer}</p>}
            {detail.solution && (<><hr className="my-2" /><p className="text-xs text-gray-400">해설</p><ProblemView latex={detail.solution} figures={[]} /></>)}
          </div>
        </div>
      )}
    </div>
  );
}
