import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Loader, Upload, Save, X } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { api } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { invalidatePagesCache } from '../../lib/dataCache';
import SortablePageItem from '../../components/common/SortablePageItem';


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

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (!over) return;

    if (active.id !== over.id) {
      const oldIndex = pages.findIndex((p) => p.id === active.id);
      const newIndex = pages.findIndex((p) => p.id === over.id);

      const newPages = arrayMove(pages, oldIndex, newIndex);

      const updatedPages = newPages.map((p, idx) => ({ ...p, position: idx }));
      setPages(updatedPages);

      const items = updatedPages.map((pg) => ({
        id: pg.id,
        position: pg.position,
      }));

      try {
        await api.put('/api/pages/reorder', { items });
        invalidatePagesCache(id);
      } catch (err) {
        console.error('순서 변경 실패:', err.message);
      }
    }
  };

  const fetchData = async () => {
    setLoading(true);

    try {
      const [chap, pgs] = await Promise.all([
        api.get(`/api/chapters/${id}`),
        api.get(`/api/chapters/${id}/pages`),
      ]);
      setChapter(chap);

      const pageList = pgs || [];
      setPages(pageList);
      if (pageList.length > 0) {
        setSelectedPage((prev) => pageList.find((p) => p.id === prev?.id) || pageList[0]);
      } else {
        setSelectedPage(null);
      }
    } catch (err) {
      console.error('데이터 로드 실패:', err.message);
    }

    setLoading(false);
  };

  useEffect(() => {
    const timer = setTimeout(fetchData, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

      try {
        const formData = new FormData();
        formData.append('file', file);

        const uploadResult = await api.upload(
          `/api/files/upload?bucket=chapter-pages&directory=chapters/${id}`,
          formData
        );

        const newPage = await api.post(`/api/chapters/${id}/pages`, {
          imageUrl: uploadResult.url,
          position: basePosition + i,
        });

        if (newPage) lastPage = newPage;
      } catch (err) {
        console.error(`업로드 실패 (${file.name}):`, err.message);
      }

      setUploadProgress((prev) => ({ ...prev, done: prev.done + 1 }));
    }

    e.target.value = '';
    setUploading(false);
    setUploadProgress({ done: 0, total: 0 });

    invalidatePagesCache(id);
    await fetchData();
    if (lastPage) setSelectedPage(lastPage);
  };

  /* ── 내보내기: 모달 열릴 때 다른 클래스 목록 로드 ── */
  useEffect(() => {
    if (!showExportModal || !user || !chapter) return;
    const timer = setTimeout(() => {
      setExportTargetIds(new Set());
      setExportDone(false);
    }, 0);

    api.get(`/api/classrooms/other/${chapter.classroomId}`)
      .then((data) => setExportClassrooms(data || []))
      .catch(() => setExportClassrooms([]));

    return () => clearTimeout(timer);
  }, [showExportModal, user, chapter]);

  /* ── 내보내기 실행 ── */
  const handleExport = async () => {
    if (exportTargetIds.size === 0) return;
    setExporting(true);

    try {
      // 선택된 각 클래스에 순차 내보내기
      for (const targetId of exportTargetIds) {
        await api.post(`/api/chapters/${id}/import`, {
          targetClassroomId: targetId,
        });
      }
    } catch (err) {
      console.error('내보내기 실패:', err.message);
    }

    setExporting(false);
    setExportDone(true);
  };

  const handleTitleSave = async () => {
    const trimmed = titleInput.trim();
    if (!trimmed || trimmed === chapter.title) { setEditingTitle(false); return; }
    setSavingTitle(true);
    try {
      await api.patch(`/api/chapters/${id}`, { title: trimmed });
      setChapter((prev) => ({ ...prev, title: trimmed }));
      invalidatePagesCache(id);
    } catch (err) {
      console.error('제목 저장 실패:', err.message);
    }
    setSavingTitle(false);
    setEditingTitle(false);
  };

  const handleTitleKeyDown = (e) => {
    if (e.key === 'Enter')  { e.preventDefault(); handleTitleSave(); }
    if (e.key === 'Escape') { setEditingTitle(false); }
  };

  const handleDeletePage = async (page) => {
    if (!confirm('이 페이지를 삭제하시겠습니까?')) return;
    setDeleting(true);

    // Storage 파일 삭제
    try {
      const imageUrl = page.imageUrl;
      if (imageUrl) {
        // URL에서 /api/files/ 이후 경로 추출
        const apiMarker = '/api/files/';
        const apiIdx = imageUrl.indexOf(apiMarker);
        if (apiIdx !== -1) {
          const filePath = imageUrl.slice(apiIdx);
          await api.delete(filePath);
        }
      }
    } catch {
      // Storage 삭제 실패 시 DB 레코드만 삭제
    }

    try {
      await api.delete(`/api/pages/${page.id}`);
      invalidatePagesCache(id);
    } catch (err) {
      console.error('페이지 삭제 실패:', err.message);
    }

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
            title="내보내기"
            className="inline-flex items-center justify-center p-2 border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50 cursor-pointer"
          >
            <Upload className="h-5 w-5" />
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
            title={uploading ? (uploadProgress.total > 1 ? `업로드 중... (${uploadProgress.done}/${uploadProgress.total})` : '업로드 중...') : '페이지 추가'}
            className="inline-flex items-center justify-center p-2 border border-transparent rounded-md shadow-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
          >
            {uploading ? <Loader className="animate-spin h-5 w-5" /> : <Plus className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <div className="flex gap-6" style={{ height: 'calc(100dvh - 16rem)' }}>
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
            <div className="space-y-2 p-2 hidden-scroll">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={pages.map((p) => p.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {pages.map((pg, idx) => (
                    <SortablePageItem
                      key={pg.id}
                      page={pg}
                      index={idx}
                      isSelected={selectedPage?.id === pg.id}
                      onSelectPage={setSelectedPage}
                      onDeletePage={handleDeletePage}
                      isDeleting={deleting}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </div>
          )}
        </div>

        {/* Main — 선택된 페이지 미리보기 */}
        <div className="flex-1 bg-gray-50 rounded-lg shadow overflow-y-auto p-4 relative">
          {selectedPage ? (
            <img
              src={selectedPage.imageUrl}
              alt="선택된 페이지"
              className="w-full h-auto block shadow-sm bg-white"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-gray-400">
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
            <p className="text-sm text-gray-500 mb-4 whitespace-normal break-keep">
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
                    <button onClick={() => setShowExportModal(false)} title="취소"
                      className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md cursor-pointer flex items-center justify-center"><X className="h-5 w-5" /></button>
                    <button onClick={handleExport} disabled={exportTargetIds.size === 0 || exporting} title={exporting ? '내보내는 중...' : `내보내기${exportTargetIds.size > 1 ? ` (${exportTargetIds.size})` : ''}`}
                      className="p-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 cursor-pointer flex items-center justify-center">
                      {exporting ? <Loader className="animate-spin h-5 w-5" /> : <Upload className="h-5 w-5" />}
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
