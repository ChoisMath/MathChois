import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Loader } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const ChapterEditor = () => {
  const { id } = useParams(); // chapterId
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [chapter, setChapter] = useState(null);
  const [pages, setPages] = useState([]);
  const [selectedPage, setSelectedPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `chapters/${id}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('chapter-pages')
      .upload(path, file);

    if (uploadError) {
      console.error('업로드 실패:', uploadError.message);
      setUploading(false);
      e.target.value = '';
      return;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('chapter-pages')
      .getPublicUrl(path);

    const nextPosition = pages.length > 0 ? Math.max(...pages.map((p) => p.position)) + 1 : 0;
    const { data: newPage } = await supabase
      .from('pages')
      .insert({ chapter_id: id, image_url: publicUrl, position: nextPosition })
      .select()
      .single();

    setUploading(false);
    e.target.value = '';

    await fetchData();
    if (newPage) setSelectedPage(newPage);
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
          <h1 className="text-xl font-bold text-gray-900">{chapter?.title}</h1>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
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
                업로드 중...
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
    </div>
  );
};

export default ChapterEditor;
