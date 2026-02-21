import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Loader, Upload } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

const ChapterEditor = () => {
  const { id } = useParams(); // chapterId
  const navigate = useNavigate();
  const { user } = useAuth();
  const fileInputRef = useRef(null);

  const [chapter, setChapter] = useState(null);
  const [pages, setPages] = useState([]);
  const [selectedPage, setSelectedPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading]       = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const [deleting, setDeleting] = useState(false);

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput]     = useState('');
  const [savingTitle, setSavingTitle]   = useState(false);

  /* 내보내기 */
  const [showExportModal, setShowExportModal]   = useState(false);
  const [exportClassrooms, setExportClassrooms] = useState([]);
  const [exportTargetIds, setExportTargetIds]   = useState(new Set());
  const [exporting, setExporting]               = useState(false);
  const [exportDone, setExportDone]             = useState(false);

  const fetchData = async () => {
    setLoading(true);

    const { data: chap } = await supabase
      .from('chapters')
      .select('id, title, classroom_id')
      .eq('id', id)
      .single();
    setChapter(chap);

    const { data: pgs } = await supabase
      .from('pages')
      .select('id, image_url, position')
      .eq('chapter_id', id)
      .order('position');
    setPages(pgs || []);
    if (pgs && pgs.length > 0) {
      setSelectedPage((prev) => pgs.find((p) => p.id === prev?.id) || pgs[0]);
    } else {
      setSelectedPage(null);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    // 파일명 기준으로 정렬 (선택 순서 유지)
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    setUploading(true);
    setUploadProgress({ done: 0, total: files.length });

    const basePosition = pages.length > 0 ? Math.max(...pages.map((p) => p.position)) + 1 : 0;
    let lastPage = null;

    // 순서를 보장하기 위해 순차 업로드
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext  = file.name.split('.').pop();
      const path = `chapters/${id}/${Date.now()}_${i}.${ext}`;

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
        .from('pages')
        .insert({ chapter_id: id, image_url: publicUrl, position: basePosition + i })
        .select()
        .single();

      if (newPage) lastPage = newPage;
      setUploadProgress((prev) => ({ ...prev, done: prev.done + 1 }));
    }

    e.target.value = '';
    setUploading(false);
    setUploadProgress({ done: 0, total: 0 });

    await fetchData();
    if (lastPage) setSelectedPage(lastPage);
  };

  /* ── 내보내기: 모달 열릴 때 다른 클래스 목록 로드 ── */
  useEffect(() => {
    if (!showExportModal || !user || !chapter) return;
    setExportTargetIds(new Set());
    setExportDone(false);
    supabase
      .from('classrooms')
      .select('id, name')
      .eq('teacher_id', user.id)
      .neq('id', chapter.classroom_id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setExportClassrooms(data || []));
  }, [showExportModal, user?.id, chapter?.classroom_id]);

  /* ── 내보내기 실행 ── */
  const handleExport = async () => {
    if (exportTargetIds.size === 0) return;
    setExporting(true);

    const { data: pagesData } = await supabase
      .from('pages').select('image_url, position').eq('chapter_id', id).order('position');

    // 선택된 각 클래스에 순차 내보내기
    for (const targetId of exportTargetIds) {
      const { data: targetChaps } = await supabase
        .from('chapters').select('position')
        .eq('classroom_id', targetId)
        .order('position', { ascending: false }).limit(1);

      const maxPos = targetChaps?.[0]?.position ?? -1;
      const { data: newChap } = await supabase
        .from('chapters')
        .insert({
          classroom_id: targetId,
          title:        chapter.title,
          description:  chapter.description ?? null,
          position:     maxPos + 1,
        })
        .select().single();

      if (newChap && pagesData?.length > 0) {
        await supabase.from('pages').insert(
          pagesData.map((pg) => ({
            chapter_id: newChap.id,
            image_url:  pg.image_url,
            position:   pg.position,
          }))
        );
      }
    }

    setExporting(false);
    setExportDone(true);
  };

  const handleTitleSave = async () => {
    const trimmed = titleInput.trim();
    if (!trimmed || trimmed === chapter.title) { setEditingTitle(false); return; }
    setSavingTitle(true);
    const { error } = await supabase.from('chapters').update({ title: trimmed }).eq('id', id);
    setSavingTitle(false);
    if (!error) setChapter((prev) => ({ ...prev, title: trimmed }));
    setEditingTitle(false);
  };

  const handleTitleKeyDown = (e) => {
    if (e.key === 'Enter')  { e.preventDefault(); handleTitleSave(); }
    if (e.key === 'Escape') { setEditingTitle(false); }
  };

  const handleDeletePage = async (page) => {
    if (!confirm('이 페이지를 삭제하시겠습니까?')) return;
    setDeleting(true);

    // Storage 파일 경로 추출 후 삭제
    try {
      const url = new URL(page.image_url);
      const marker = '/object/public/chapter-pages/';
      const idx = url.pathname.indexOf(marker);
      if (idx !== -1) {
        const storagePath = url.pathname.slice(idx + marker.length);
        await supabase.storage.from('chapter-pages').remove([storagePath]);
      }
    } catch {
      // URL 파싱 실패 시 DB 레코드만 삭제
    }

    await supabase.from('pages').delete().eq('id', page.id);
    setDeleting(false);
    await fetchData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">로딩 중...</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="text-gray-400 hover:text-gray-600 cursor-pointer"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          {editingTitle ? (
            <input
              autoFocus
              type="text"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={handleTitleKeyDown}
              disabled={savingTitle}
              className="text-xl font-bold text-gray-900 border-b-2 border-blue-500 outline-none bg-transparent w-72"
            />
          ) : (
            <h1
              onClick={() => { setTitleInput(chapter?.title || ''); setEditingTitle(true); }}
              title="클릭하여 제목 수정"
              className="text-xl font-bold text-gray-900 cursor-text hover:text-blue-600 transition-colors"
            >
              {chapter?.title}
            </h1>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowExportModal(true)}
            className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 cursor-pointer"
          >
            <Upload className="h-4 w-4 mr-1.5" />
            내보내기
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
          >
            {uploading ? (
              <>
                <Loader className="animate-spin h-4 w-4 mr-2" />
                {uploadProgress.total > 1
                  ? `업로드 중... (${uploadProgress.done}/${uploadProgress.total})`
                  : '업로드 중...'}
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                페이지 추가
              </>
            )}
          </button>
        </div>
      </div>

      <div className="flex gap-6" style={{ height: 'calc(100vh - 16rem)' }}>
        {/* Sidebar — 페이지 썸네일 */}
        <div className="w-44 flex-shrink-0 bg-white rounded-lg shadow overflow-y-auto">
          <div className="px-3 py-2 border-b">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              페이지 ({pages.length})
            </span>
          </div>
          {pages.length === 0 ? (
            <p className="p-4 text-sm text-gray-400 text-center">페이지 없음</p>
          ) : (
            <div className="space-y-2 p-2">
              {pages.map((pg, idx) => (
                <div
                  key={pg.id}
                  onClick={() => setSelectedPage(pg)}
                  className={`relative group rounded-md overflow-hidden cursor-pointer border-2 transition-colors ${
                    selectedPage?.id === pg.id
                      ? 'border-blue-500'
                      : 'border-transparent hover:border-gray-300'
                  }`}
                >
                  <img
                    src={pg.image_url}
                    alt={`페이지 ${idx + 1}`}
                    className="w-full aspect-[3/4] object-cover"
                  />
                  <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-xs text-center py-0.5">
                    {idx + 1}
                  </div>
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

        {/* Main — 선택된 페이지 미리보기 */}
        <div className="flex-1 bg-white rounded-lg shadow flex items-center justify-center overflow-hidden">
          {selectedPage ? (
            <img
              src={selectedPage.image_url}
              alt="선택된 페이지"
              className="max-w-full max-h-full object-contain"
            />
          ) : (
            <div className="text-center text-gray-400">
              <p className="text-lg">페이지를 추가하세요</p>
              <p className="text-sm mt-1">JPG, PNG 이미지를 업로드할 수 있습니다</p>
            </div>
          )}
        </div>
      </div>

      {/* ── 내보내기 모달 ── */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-1">챕터 내보내기</h2>
            <p className="text-sm text-gray-500 mb-4">
              <span className="font-medium text-gray-700">"{chapter?.title}"</span>을(를) 복사할 클래스를 선택하세요.
            </p>

            {exportDone ? (
              <div className="text-center py-4">
                <p className="text-green-600 font-semibold mb-1">내보내기 완료!</p>
                <p className="text-sm text-gray-500 mb-4">
                  {exportTargetIds.size}개 클래스에 챕터가 추가되었습니다.
                </p>
                <button onClick={() => setShowExportModal(false)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 cursor-pointer">
                  닫기
                </button>
              </div>
            ) : exportClassrooms.length === 0 ? (
              <>
                <p className="text-sm text-gray-400 py-4 text-center">내보낼 수 있는 다른 클래스가 없습니다.</p>
                <div className="flex justify-end">
                  <button onClick={() => setShowExportModal(false)}
                    className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 cursor-pointer">닫기</button>
                </div>
              </>
            ) : (
              <>
                {/* 전체 선택 */}
                <label className="flex items-center gap-2 px-1 mb-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={exportTargetIds.size === exportClassrooms.length}
                    onChange={(e) => setExportTargetIds(
                      e.target.checked ? new Set(exportClassrooms.map((c) => c.id)) : new Set()
                    )}
                    className="w-4 h-4 accent-blue-600 cursor-pointer"
                  />
                  <span className="text-sm text-gray-500">전체 선택</span>
                </label>

                <div className="max-h-56 overflow-y-auto border border-gray-200 rounded-md divide-y mb-4">
                  {exportClassrooms.map((cls) => (
                    <label key={cls.id}
                      className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={exportTargetIds.has(cls.id)}
                        onChange={(e) => {
                          setExportTargetIds((prev) => {
                            const next = new Set(prev);
                            e.target.checked ? next.add(cls.id) : next.delete(cls.id);
                            return next;
                          });
                        }}
                        className="w-4 h-4 accent-blue-600 cursor-pointer flex-shrink-0"
                      />
                      <span className="text-sm text-gray-700">{cls.name}</span>
                    </label>
                  ))}
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">
                    {exportTargetIds.size > 0 ? `${exportTargetIds.size}개 선택됨` : ''}
                  </span>
                  <div className="flex gap-3">
                    <button onClick={() => setShowExportModal(false)}
                      className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 cursor-pointer">취소</button>
                    <button onClick={handleExport} disabled={exportTargetIds.size === 0 || exporting}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 cursor-pointer">
                      {exporting ? '내보내는 중...' : `내보내기${exportTargetIds.size > 1 ? ` (${exportTargetIds.size})` : ''}`}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ChapterEditor;
