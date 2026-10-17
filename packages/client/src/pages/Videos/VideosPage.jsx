import { useEffect, useState, useCallback } from 'react';
import { Clapperboard } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { listVideos, getVideoFacets, deleteVideo, formatDuration, formatBytes } from '../../lib/videos';
import VideoForm from '../../components/videos/VideoForm';
import VideoPreviewModal from '../../components/videos/VideoPreviewModal';

const FILTER_FIELDS = [
  ['subject', '과목'], ['majorUnit', '대단원'], ['minorUnit', '소단원'],
];

/**
 * 영상자료 라이브러리 관리 (`/teacher/videos`).
 * 기본은 내 자료, 토글로 모든 교사의 공유 자료를 볼 수 있다(수정·삭제는 등록자만).
 */
export default function VideosPage() {
  const { user } = useAuth();
  const [facets, setFacets] = useState({});
  const [filters, setFilters] = useState({});
  const [q, setQ] = useState('');
  const [scope, setScope] = useState('mine'); // 'mine' | 'all'
  const [result, setResult] = useState({ items: [], total: 0, page: 1, pageSize: 20 });
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);   // 레코드 또는 'new'
  const [preview, setPreview] = useState(null);

  useEffect(() => { getVideoFacets().then(setFacets).catch(() => {}); }, []);

  const fetchList = useCallback(async (page = 1) => {
    setLoading(true);
    try { setResult(await listVideos({ ...filters, q, mine: scope === 'mine' ? 1 : undefined, page })); }
    finally { setLoading(false); }
  }, [filters, q, scope]);

  useEffect(() => { if (!editing) fetchList(1); }, [fetchList, editing]);

  const handleDelete = async (v) => {
    if (!confirm(`"${v.title}" 영상을 삭제할까요? 파일도 함께 삭제됩니다.`)) return;
    try {
      await deleteVideo(v.id);
      fetchList(result.page);
    } catch (err) {
      const usage = err?.status === 409 ? err.body?.usage?.classrooms : null;
      if (!usage?.length) {
        alert(err.message ?? '삭제에 실패했습니다.');
        return;
      }
      // 배정 해제 후 삭제 원클릭
      const names = usage.map((c) => c.classroomName).join(', ');
      if (!confirm(`다음 학급에 배정되어 있습니다: ${names}\n배정을 모두 해제하고 삭제할까요? (해당 학급의 댓글·시청 기록도 삭제됩니다)`)) return;
      try {
        await deleteVideo(v.id, { force: true });
        fetchList(result.page);
      } catch (err2) {
        alert(err2.message ?? '삭제에 실패했습니다.');
      }
    }
  };

  if (editing) {
    return (
      <div className="max-w-2xl">
        <h2 className="font-bold mb-3">{editing === 'new' ? '새 영상자료 등록' : '영상자료 수정'}</h2>
        <VideoForm
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
        <h2 className="font-bold whitespace-nowrap flex items-center gap-2"><Clapperboard className="h-5 w-5 text-blue-600" />영상자료</h2>
        <button onClick={() => setEditing('new')}
          className="px-3 min-h-11 bg-emerald-600 text-white rounded text-sm whitespace-nowrap">새 영상 등록</button>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="inline-flex rounded border overflow-hidden text-sm">
          {[['mine', '내 자료'], ['all', '전체 교사 자료']].map(([k, label]) => (
            <button key={k} onClick={() => setScope(k)}
              className={`px-3 min-h-11 whitespace-nowrap ${scope === k ? 'bg-blue-600 text-white' : 'bg-white text-gray-700'}`}>
              {label}
            </button>
          ))}
        </div>
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
        <button onClick={() => fetchList(1)} className="px-3 min-h-11 bg-blue-600 text-white rounded text-sm whitespace-nowrap">검색</button>
      </div>

      <p className="text-xs text-gray-500">{loading ? '불러오는 중…' : `총 ${result.total}개`}</p>

      <div className="overflow-x-auto border rounded-md max-h-[70dvh] overflow-y-auto">
        <table className="min-w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100">
              {['', '제목', '과목', '대단원', '소단원', '길이', '용량', '등록자', '등록일', ''].map((h, i) => (
                <th key={h || i}
                  className={`px-3 py-2 text-left whitespace-nowrap sticky top-0 bg-gray-100 z-20 ${i === 1 ? 'left-0 z-30' : ''}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.items.map((v) => {
              const own = v.createdBy === user?.id;
              return (
                <tr key={v.id} className="border-t hover:bg-blue-50">
                  <td className="px-2 py-1">
                    <button onClick={() => setPreview(v)} className="block w-20 aspect-video bg-gray-100 rounded overflow-hidden" title="미리보기">
                      {v.thumbnailUrl
                        ? <img src={v.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                        : <span className="w-full h-full flex items-center justify-center"><Clapperboard className="h-5 w-5 text-gray-300" /></span>}
                    </button>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap sticky left-0 bg-white z-10 max-w-60 truncate">
                    <span className="font-medium">{v.title}</span>
                    {v.description && <p className="text-xs text-gray-400 truncate">{v.description}</p>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{v.subject}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{v.majorUnit}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{v.minorUnit}</td>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">{formatDuration(v.durationSec)}</td>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">{v.fileSize != null ? formatBytes(v.fileSize) : ''}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{v.createdByName}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{(v.createdAt || '').slice(0, 10)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="flex gap-2">
                      <button className="text-gray-600 inline-flex items-center min-h-11 px-2 whitespace-nowrap" onClick={() => setPreview(v)}>미리보기</button>
                      {(own || user?.isAdmin) && (
                        <>
                          <button className="text-blue-600 inline-flex items-center min-h-11 px-2 whitespace-nowrap" onClick={() => setEditing(v)}>수정</button>
                          <button className="text-red-600 inline-flex items-center min-h-11 px-2 whitespace-nowrap" onClick={() => handleDelete(v)}>삭제</button>
                        </>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
            {!loading && result.items.length === 0 && (
              <tr><td colSpan={10} className="px-3 py-8 text-center text-gray-400">등록된 영상자료가 없습니다.</td></tr>
            )}
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

      {preview && <VideoPreviewModal video={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
