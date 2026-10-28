import { useEffect, useState, useCallback } from 'react';
import { Clapperboard, Plus, X, Check, CircleCheck, ChevronLeft, ChevronRight } from 'lucide-react';
import { listVideos, getVideoFacets, formatDuration } from '../../lib/videos';
import VideoForm from './VideoForm';
import IconButton from '../common/IconButton';

const FILTER_FIELDS = [
  ['subject', '과목'], ['majorUnit', '대단원'], ['minorUnit', '소단원'],
];

/**
 * 학급에 배정할 영상자료 선택/등록 모달 (모든 교사의 자료에서 검색).
 * onSelect(video) / onClose(). excludeIds: 이미 배정된 영상 id(배정됨 표시).
 * selectLabel: 선택 버튼 문구(기본 '배정', 챕터 편집기에서는 '삽입').
 * multiple: 여러 개를 이어서 고르는 창 — 골라도 닫지 않고, 바깥(배경)을 눌러도 닫히지 않아 X 로만 닫는다.
 *   onSelect 가 끝날 때까지 그 영상 버튼을 잠근다(두 번 눌러 중복 배정 방지). 새로 등록한 뒤엔 목록으로 돌아온다.
 */
export default function VideoPickerModal({ onSelect, onClose, excludeIds = [], selectLabel = '배정', multiple = false }) {
  const [mode, setMode] = useState('list'); // 'list' | 'register'
  const [facets, setFacets] = useState({});
  const [filters, setFilters] = useState({});
  const [q, setQ] = useState('');
  const [mine, setMine] = useState(false);
  const [result, setResult] = useState({ items: [], total: 0, page: 1, pageSize: 20 });
  const [loading, setLoading] = useState(false);
  const [pendingIds, setPendingIds] = useState(() => new Set()); // multiple: 처리 중인 영상 id
  const excluded = new Set(excludeIds);

  const select = async (video) => {
    if (!multiple) { onSelect(video); return; }
    setPendingIds((prev) => new Set(prev).add(video.id));
    try {
      await onSelect(video);
    } finally {
      setPendingIds((prev) => { const next = new Set(prev); next.delete(video.id); return next; });
    }
  };

  useEffect(() => { getVideoFacets().then(setFacets).catch(() => {}); }, []);

  const fetchList = useCallback(async (page = 1) => {
    setLoading(true);
    try { setResult(await listVideos({ ...filters, q, mine: mine ? 1 : undefined, page })); }
    finally { setLoading(false); }
  }, [filters, q, mine]);

  useEffect(() => { if (mode === 'list') fetchList(1); }, [fetchList, mode]);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-2" onClick={multiple ? undefined : onClose}>
      <div className="bg-white rounded-lg w-full max-w-3xl max-h-[90dvh] flex flex-col p-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2 gap-2">
          <h3 className="font-bold whitespace-nowrap">{mode === 'list' ? '영상자료 선택' : '새 영상 등록'}</h3>
          <div className="flex items-center gap-2">
            {mode === 'list' && (
              <IconButton icon={Plus} label="새 영상 등록" onClick={() => setMode('register')} />
            )}
            <IconButton icon={X} label="닫기" onClick={onClose} />
          </div>
        </div>

        {mode === 'register' ? (
          <div className="overflow-y-auto">
            <VideoForm
              onSaved={async (video) => {
                await select(video);
                if (multiple) setMode('list');
              }}
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
              <label className="flex items-center gap-1 text-sm whitespace-nowrap px-1">
                <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> 내 자료만
              </label>
            </div>

            <p className="text-xs text-gray-500 mb-1">{loading ? '불러오는 중…' : `총 ${result.total}개`}</p>
            <div className="flex-1 overflow-y-auto flex flex-col gap-2">
              {result.items.map((v) => {
                const already = excluded.has(v.id);
                const pending = pendingIds.has(v.id);
                return (
                  <div key={v.id} className="border rounded-md p-2 flex gap-3">
                    <div className="w-28 aspect-video bg-gray-100 rounded overflow-hidden shrink-0 relative flex items-center justify-center">
                      {v.thumbnailUrl
                        ? <img src={v.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                        : <Clapperboard className="h-6 w-6 text-gray-300" />}
                      {v.durationSec != null && (
                        <span className="absolute bottom-1 right-1 text-[10px] px-1 rounded bg-black/70 text-white">
                          {formatDuration(v.durationSec)}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-medium whitespace-nowrap truncate">{v.title}</span>
                        <IconButton icon={already ? CircleCheck : Check} variant="primary" label={already ? `${selectLabel}됨` : selectLabel}
                          onClick={() => select(v)} disabled={already || pending} />
                      </div>
                      <p className="text-xs text-gray-500 whitespace-nowrap truncate">
                        {[v.subject, v.majorUnit, v.minorUnit].filter(Boolean).join(' · ')}
                        {v.createdByName ? ` · ${v.createdByName}` : ''}
                      </p>
                      {v.description && <p className="text-xs text-gray-400 truncate">{v.description}</p>}
                    </div>
                  </div>
                );
              })}
              {!loading && result.items.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">등록된 영상자료가 없습니다.</p>
              )}
            </div>
            {result.total > result.pageSize && (
              <div className="flex gap-2 justify-center items-center mt-2">
                <IconButton icon={ChevronLeft} label="이전" disabled={result.page <= 1} onClick={() => fetchList(result.page - 1)} />
                <span className="px-2 py-1 text-sm flex items-center">{result.page} / {Math.ceil(result.total / result.pageSize)}</span>
                <IconButton icon={ChevronRight} label="다음" disabled={result.page >= Math.ceil(result.total / result.pageSize)} onClick={() => fetchList(result.page + 1)} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
