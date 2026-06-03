import { useEffect, useState, useCallback } from 'react';
import { listVisualizations, getFacets, deleteVisualization } from '../../lib/visualizations';
import VisualizationForm from '../../components/visualizations/VisualizationForm';
import { toolUrl } from '../../lib/toolUrl';

const FILTER_FIELDS = [
  ['subject', '과목'], ['majorUnit', '대단원'], ['minorUnit', '소단원'],
];

export default function VisualizationsPage() {
  const [facets, setFacets] = useState({});
  const [filters, setFilters] = useState({});
  const [q, setQ] = useState('');
  const [result, setResult] = useState({ items: [], total: 0, page: 1, pageSize: 20 });
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);   // 레코드 또는 'new'
  const [preview, setPreview] = useState(null);

  useEffect(() => { getFacets().then(setFacets).catch(() => {}); }, []);

  const fetchList = useCallback(async (page = 1) => {
    setLoading(true);
    try { setResult(await listVisualizations({ ...filters, q, mine: 1, page })); }
    finally { setLoading(false); }
  }, [filters, q]);

  useEffect(() => { if (!editing) fetchList(1); }, [fetchList, editing]);

  const handleDelete = async (v) => {
    if (!confirm(`"${v.title}" 자료를 삭제할까요? (이미 삽입된 챕터 페이지는 유지됩니다)`)) return;
    try {
      await deleteVisualization(v.id);
      fetchList(result.page);
    } catch (err) {
      alert(err.message ?? '삭제에 실패했습니다.');
    }
  };

  if (editing) {
    return (
      <div className="max-w-2xl">
        <h2 className="font-bold mb-3">{editing === 'new' ? '새 시각화자료 등록' : '시각화자료 수정'}</h2>
        <VisualizationForm
          initial={editing === 'new' ? null : editing}
          onSaved={() => setEditing(null)}
          onCancel={() => setEditing(null)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold whitespace-nowrap">시각화자료</h2>
        <button onClick={() => setEditing('new')}
          className="px-3 min-h-11 bg-emerald-600 text-white rounded text-sm whitespace-nowrap">새 html 등록</button>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTER_FIELDS.map(([key, label]) => (
          <select key={key} className="border rounded px-2 py-1 text-sm"
            value={filters[key] ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.value || undefined }))}>
            <option value="">{label} 전체</option>
            {(facets[key] || []).map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        ))}
        <input className="border rounded px-2 py-1 text-sm flex-1 min-w-40" placeholder="제목·설명 검색"
          value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && fetchList(1)} />
        <button onClick={() => fetchList(1)} className="px-3 py-1 bg-blue-600 text-white rounded text-sm whitespace-nowrap">검색</button>
      </div>

      <p className="text-xs text-gray-500">{loading ? '불러오는 중…' : `총 ${result.total}개`}</p>

      <div className="overflow-x-auto border rounded-md max-h-[70dvh] overflow-y-auto">
        <table className="min-w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100">
              {['제목', '과목', '대단원', '소단원', '설명', '등록일', ''].map((h, i) => (
                <th key={h || i}
                  className={`px-3 py-2 text-left whitespace-nowrap sticky top-0 bg-gray-100 z-20 ${i === 0 ? 'left-0 z-30' : ''}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.items.map((v) => (
              <tr key={v.id} className="border-t hover:bg-blue-50">
                <td className="px-3 py-2 whitespace-nowrap sticky left-0 bg-white z-10 max-w-60 truncate">{v.title}</td>
                <td className="px-3 py-2 whitespace-nowrap">{v.subject}</td>
                <td className="px-3 py-2 whitespace-nowrap">{v.majorUnit}</td>
                <td className="px-3 py-2 whitespace-nowrap">{v.minorUnit}</td>
                <td className="px-3 py-2 whitespace-nowrap max-w-60 truncate">{v.description}</td>
                <td className="px-3 py-2 whitespace-nowrap">{(v.createdAt || '').slice(0, 10)}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className="flex gap-2">
                    <button className="text-gray-600 inline-flex items-center min-h-11 px-2 whitespace-nowrap" onClick={() => setPreview(v)}>미리보기</button>
                    <button className="text-blue-600 inline-flex items-center min-h-11 px-2 whitespace-nowrap" onClick={() => setEditing(v)}>수정</button>
                    <button className="text-red-600 inline-flex items-center min-h-11 px-2 whitespace-nowrap" onClick={() => handleDelete(v)}>삭제</button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {result.total > result.pageSize && (
        <div className="flex gap-2 justify-center">
          <button disabled={result.page <= 1} onClick={() => fetchList(result.page - 1)}
            className="px-3 min-h-11 border rounded disabled:opacity-40 whitespace-nowrap">이전</button>
          <span className="px-2 py-1 text-sm flex items-center">{result.page} / {Math.ceil(result.total / result.pageSize)}</span>
          <button disabled={result.page >= Math.ceil(result.total / result.pageSize)} onClick={() => fetchList(result.page + 1)}
            className="px-3 min-h-11 border rounded disabled:opacity-40 whitespace-nowrap">다음</button>
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-2" onClick={() => setPreview(null)}>
          <div className="bg-white rounded-lg w-full max-w-4xl h-[85dvh] flex flex-col p-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-bold whitespace-nowrap truncate">{preview.title}</h3>
              <button onClick={() => setPreview(null)} className="min-h-11 min-w-11 flex items-center justify-center">✕</button>
            </div>
            <iframe src={toolUrl(preview.htmlUrl)}
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals"
              className="flex-1 rounded bg-white border" title="시각화자료 미리보기" />
          </div>
        </div>
      )}
    </div>
  );
}
