import { useEffect, useState, useCallback } from 'react';
import { Plus, Check, X } from 'lucide-react';
import { listVisualizations, getFacets } from '../../lib/visualizations';
import VisualizationForm from './VisualizationForm';
import IconButton from '../common/IconButton';

const FILTER_FIELDS = [
  ['subject', '과목'], ['majorUnit', '대단원'], ['minorUnit', '소단원'],
];

/** 시각화자료 선택/등록 모달. onSelect(visualization) / onClose() */
export default function VisualizationPickerModal({ onSelect, onClose }) {
  const [mode, setMode] = useState('list'); // 'list' | 'register'
  const [facets, setFacets] = useState({});
  const [filters, setFilters] = useState({});
  const [q, setQ] = useState('');
  const [result, setResult] = useState({ items: [], total: 0, page: 1, pageSize: 20 });
  const [loading, setLoading] = useState(false);

  useEffect(() => { getFacets().then(setFacets).catch(() => {}); }, []);

  const fetchList = useCallback(async (page = 1) => {
    setLoading(true);
    try { setResult(await listVisualizations({ ...filters, q, page })); }
    finally { setLoading(false); }
  }, [filters, q]);

  useEffect(() => { if (mode === 'list') fetchList(1); }, [fetchList, mode]);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-2" onClick={onClose}>
      <div className="bg-white rounded-lg w-full max-w-3xl max-h-[90dvh] flex flex-col p-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2 gap-2">
          <h3 className="font-bold whitespace-nowrap">{mode === 'list' ? '시각화자료 선택' : '새 HTML 등록'}</h3>
          <div className="flex items-center gap-2">
            {mode === 'list' && (
              <IconButton icon={Plus} label="새 html 등록" onClick={() => setMode('register')} />
            )}
            <IconButton icon={X} label="닫기" onClick={onClose} />
          </div>
        </div>

        {mode === 'register' ? (
          <div className="overflow-y-auto">
            <VisualizationForm
              onSaved={(vis) => onSelect(vis)}
              onCancel={() => setMode('list')}
            />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 mb-2">
              {FILTER_FIELDS.map(([key, label]) => (
                <select key={key} className="border rounded px-2 min-h-11 text-sm"
                  value={filters[key] ?? ''}
                  onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.value || undefined }))}>
                  <option value="">{label} 전체</option>
                  {(facets[key] || []).map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              ))}
              <input className="border rounded px-2 min-h-11 text-sm flex-1 min-w-40" placeholder="제목·설명 검색"
                value={q} onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchList(1)} />
            </div>

            <p className="text-xs text-gray-500 mb-1">{loading ? '불러오는 중…' : `총 ${result.total}개`}</p>
            <div className="flex-1 overflow-y-auto flex flex-col gap-2">
              {result.items.map((v) => (
                <div key={v.id} className="border rounded-md p-2">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-medium whitespace-nowrap truncate">{v.title}</span>
                    <IconButton icon={Check} label="삽입" variant="primary" size="sm" onClick={() => onSelect(v)} />
                  </div>
                  <p className="text-xs text-gray-500 whitespace-nowrap truncate">
                    {[v.subject, v.majorUnit, v.minorUnit].filter(Boolean).join(' · ')}
                  </p>
                  {v.description && <p className="text-xs text-gray-400 truncate">{v.description}</p>}
                </div>
              ))}
              {!loading && result.items.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">등록된 시각화자료가 없습니다.</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
