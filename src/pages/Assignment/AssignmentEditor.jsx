import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Loader } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

const AssignmentEditor = () => {
  const { classroomId, assignmentId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const fileInputRef = useRef(null);

  const [assignment, setAssignment] = useState(null);
  const [pages, setPages]           = useState([]);
  const [selectedPage, setSelectedPage] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [uploading, setUploading]   = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const [deleting, setDeleting]     = useState(false);

  const [title, setTitle]           = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline]     = useState('');
  const [maxScore, setMaxScore]     = useState(100);
  const [savingMeta, setSavingMeta] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const [assignRes, pagesRes] = await Promise.all([
      supabase.from('assignments').select('*').eq('id', assignmentId).single(),
      supabase.from('assignment_pages').select('id, image_url, position')
        .eq('assignment_id', assignmentId).order('position'),
    ]);
    if (assignRes.data) {
      setAssignment(assignRes.data);
      setTitle(assignRes.data.title);
      setDescription(assignRes.data.description || '');
      setMaxScore(assignRes.data.max_score ?? 100);
      if (assignRes.data.deadline) {
        // datetime-local input format: YYYY-MM-DDTHH:mm
        setDeadline(assignRes.data.deadline.slice(0, 16));
      }
    }
    setPages(pagesRes.data || []);
    if (pagesRes.data?.length > 0) {
      setSelectedPage((prev) =>
        pagesRes.data.find((p) => p.id === prev?.id) || pagesRes.data[0]
      );
    } else {
      setSelectedPage(null);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [assignmentId]);

  const handleSaveMeta = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSavingMeta(true);
    await supabase.from('assignments').update({
      title:       title.trim(),
      description: description.trim() || null,
      deadline:    deadline || null,
      max_score:   maxScore,
      updated_at:  new Date().toISOString(),
    }).eq('id', assignmentId);
    setSavingMeta(false);
    setAssignment((prev) => ({ ...prev, title: title.trim() }));
  };

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    setUploading(true);
    setUploadProgress({ done: 0, total: files.length });

    const basePosition = pages.length > 0 ? Math.max(...pages.map((p) => p.position)) + 1 : 0;
    let lastPage = null;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext  = file.name.split('.').pop();
      const path = `assignments/${assignmentId}/${Date.now()}_${i}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('chapter-pages')
        .upload(path, file);

      if (uploadError) {
        console.error(`업로드 실패 (${file.name}):`, uploadError.message);
        setUploadProgress((prev) => ({ ...prev, done: prev.done + 1 }));
        continue;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('chapter-pages')
        .getPublicUrl(path);

      const { data: newPage } = await supabase
        .from('assignment_pages')
        .insert({ assignment_id: assignmentId, image_url: publicUrl, position: basePosition + i })
        .select().single();

      if (newPage) lastPage = newPage;
      setUploadProgress((prev) => ({ ...prev, done: prev.done + 1 }));
    }

    e.target.value = '';
    setUploading(false);
    setUploadProgress({ done: 0, total: 0 });
    await fetchData();
    if (lastPage) setSelectedPage(lastPage);
  };

  const handleDeletePage = async (page) => {
    if (!confirm('이 페이지를 삭제하시겠습니까?')) return;
    setDeleting(true);
    try {
      const url = new URL(page.image_url);
      const marker = '/object/public/chapter-pages/';
      const idx = url.pathname.indexOf(marker);
      if (idx !== -1) {
        const storagePath = url.pathname.slice(idx + marker.length);
        await supabase.storage.from('chapter-pages').remove([storagePath]);
      }
    } catch { /* URL 파싱 실패 시 DB만 삭제 */ }
    await supabase.from('assignment_pages').delete().eq('id', page.id);
    setDeleting(false);
    await fetchData();
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-gray-500">로딩 중...</p>
    </div>
  );

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(`/teacher/classrooms/${classroomId}`)}
          className="text-gray-400 hover:text-gray-600 cursor-pointer">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">과제 편집</h1>
      </div>

      {/* 메타데이터 폼 */}
      <form onSubmit={handleSaveMeta} className="bg-white rounded-xl border border-gray-200 p-4 mb-6 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">과제 제목 *</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">만점</label>
            <input type="number" min={1} max={9999} value={maxScore}
              onChange={(e) => setMaxScore(parseInt(e.target.value) || 100)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">마감일 (선택)</label>
            <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">설명 (선택)</label>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="과제 설명"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500" />
          </div>
        </div>
        <div className="flex justify-end">
          <button type="submit" disabled={savingMeta || !title.trim()}
            className="px-4 py-1.5 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 cursor-pointer flex items-center gap-1.5">
            {savingMeta && <Loader className="animate-spin h-3.5 w-3.5" />}
            {savingMeta ? '저장 중...' : '설정 저장'}
          </button>
        </div>
      </form>

      {/* 페이지 편집 (ChapterEditor 패턴) */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
          페이지 ({pages.length})
        </h2>
        <div>
          <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleUpload} className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
          >
            {uploading ? (
              <>
                <Loader className="animate-spin h-4 w-4 mr-2" />
                {uploadProgress.total > 1
                  ? `업로드 중... (${uploadProgress.done}/${uploadProgress.total})`
                  : '업로드 중...'}
              </>
            ) : (
              <><Plus className="h-4 w-4 mr-2" />페이지 추가</>
            )}
          </button>
        </div>
      </div>

      <div className="flex gap-6" style={{ height: 'calc(100vh - 22rem)' }}>
        {/* 사이드바 — 페이지 썸네일 */}
        <div className="w-44 flex-shrink-0 bg-white rounded-lg shadow overflow-y-auto">
          {pages.length === 0 ? (
            <p className="p-4 text-sm text-gray-400 text-center">페이지 없음</p>
          ) : (
            <div className="space-y-2 p-2">
              {pages.map((pg, idx) => (
                <div
                  key={pg.id}
                  onClick={() => setSelectedPage(pg)}
                  className={`relative group rounded-md overflow-hidden cursor-pointer border-2 transition-colors ${
                    selectedPage?.id === pg.id ? 'border-blue-500' : 'border-transparent hover:border-gray-300'
                  }`}
                >
                  <img src={pg.image_url} alt={`페이지 ${idx + 1}`} className="w-full aspect-[3/4] object-cover" />
                  <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-xs text-center py-0.5">{idx + 1}</div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeletePage(pg); }}
                    disabled={deleting}
                    className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 미리보기 */}
        <div className="flex-1 bg-white rounded-lg shadow flex items-center justify-center overflow-hidden">
          {selectedPage ? (
            <img src={selectedPage.image_url} alt="선택된 페이지" className="max-w-full max-h-full object-contain" />
          ) : (
            <div className="text-center text-gray-400">
              <p className="text-lg">페이지를 추가하세요</p>
              <p className="text-sm mt-1">JPG, PNG 이미지를 업로드할 수 있습니다</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AssignmentEditor;
