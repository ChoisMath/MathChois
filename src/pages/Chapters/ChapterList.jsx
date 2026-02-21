import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Plus, Book, Trash2, Edit2, ArrowLeft, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const ChapterList = () => {
  const { classroomId } = useParams();

  const [classroom, setClassroom] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchData = async () => {
    setLoading(true);

    const { data: cls } = await supabase
      .from('classrooms')
      .select('id, name')
      .eq('id', classroomId)
      .single();
    setClassroom(cls);

    const { data: chaps } = await supabase
      .from('chapters')
      .select('id, title, description, position, pages(count)')
      .eq('classroom_id', classroomId)
      .order('position');
    setChapters(chaps || []);

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [classroomId]);

  const getPageCount = (ch) => {
    if (Array.isArray(ch.pages) && ch.pages.length > 0) return ch.pages[0].count;
    return 0;
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    const maxPosition = chapters.length > 0 ? Math.max(...chapters.map((c) => c.position)) + 1 : 0;
    const { error } = await supabase.from('chapters').insert({
      classroom_id: classroomId,
      title: newTitle.trim(),
      description: newDesc.trim() || null,
      position: maxPosition,
    });
    setCreating(false);
    if (!error) {
      setNewTitle('');
      setNewDesc('');
      setShowModal(false);
      fetchData();
    }
  };

  const handleDelete = async (chapterId) => {
    if (!confirm('이 챕터를 삭제하시겠습니까? 포함된 모든 페이지도 삭제됩니다.')) return;
    await supabase.from('chapters').delete().eq('id', chapterId);
    fetchData();
  };

  if (loading) return <p className="text-gray-500">로딩 중...</p>;

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link to={`/teacher/classrooms/${classroomId}`} className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">
          {classroom?.name} — 챕터 관리
        </h1>
      </div>

      <div className="flex justify-end mb-4">
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 cursor-pointer"
        >
          <Plus className="-ml-1 mr-2 h-5 w-5" />
          새 챕터
        </button>
      </div>

      {chapters.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow-sm">
          <Book className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-4 text-gray-500">아직 챕터가 없습니다.</p>
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg divide-y divide-gray-200">
          {chapters.map((ch) => (
            <div key={ch.id} className="flex items-center px-6 py-4 gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{ch.title}</p>
                {ch.description && (
                  <p className="text-sm text-gray-500 truncate">{ch.description}</p>
                )}
                <div className="flex items-center gap-1 mt-1 text-xs text-gray-400">
                  <FileText className="h-3 w-3" />
                  <span>{getPageCount(ch)}페이지</span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Link
                  to={`/teacher/chapters/${ch.id}/edit`}
                  className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  <Edit2 className="h-4 w-4 mr-1" />
                  편집
                </Link>
                <button
                  onClick={() => handleDelete(ch.id)}
                  className="p-1.5 text-gray-400 hover:text-red-600 cursor-pointer"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <form onSubmit={handleCreate} className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold text-gray-900 mb-4">새 챕터 만들기</h2>
            <input
              autoFocus
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="챕터 제목"
              className="w-full px-4 py-2 border border-gray-300 rounded-md mb-3 focus:ring-blue-500 focus:border-blue-500"
            />
            <textarea
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="설명 (선택)"
              rows={2}
              className="w-full px-4 py-2 border border-gray-300 rounded-md mb-4 focus:ring-blue-500 focus:border-blue-500 resize-none"
            />
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => { setShowModal(false); setNewTitle(''); setNewDesc(''); }}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 cursor-pointer"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={creating || !newTitle.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
              >
                {creating ? '생성 중...' : '만들기'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default ChapterList;
