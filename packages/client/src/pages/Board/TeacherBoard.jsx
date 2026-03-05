import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Pencil, Newspaper, Paperclip, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/* ─── 게시글 카드 (펼치기/접기 지원) ─── */
function PostCard({ post, navigate, deleting, onDelete }) {
  const [open, setOpen] = useState(false);
  const classroomNameList = post.classroomNames || [];

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      {/* 접힌 헤더 (클릭하면 펼침) */}
      <button
        className="w-full text-left px-4 py-3 flex items-center justify-between gap-4 hover:bg-gray-50 transition-colors cursor-pointer"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate">{post.title}</p>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs text-gray-400">{formatDate(post.createdAt)}</span>
            {classroomNameList.length > 0 && (
              <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                {classroomNameList.join(', ')}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {post.files?.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Paperclip className="h-3.5 w-3.5" />
              {post.files.length}
            </span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); navigate(`/teacher/board/${post.id}/edit`); }}
            className="p-1.5 text-gray-400 hover:text-blue-600 rounded-md hover:bg-blue-50 transition-colors cursor-pointer"
            title="수정"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(post); }}
            disabled={deleting === post.id}
            className="p-1.5 text-gray-400 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-50"
            title="삭제"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          {open
            ? <ChevronUp className="h-4 w-4 text-gray-400" />
            : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </div>
      </button>

      {/* 펼쳐진 본문 + 첨부파일 */}
      {open && (
        <div className="px-4 pb-4 border-t border-gray-100">
          {post.content ? (
            <p className="text-sm text-gray-700 mt-3 whitespace-pre-wrap">{post.content}</p>
          ) : (
            <p className="text-sm text-gray-400 mt-3 italic">내용 없음</p>
          )}

          {post.files?.length > 0 && (
            <div className="mt-3 space-y-1.5">
              <p className="text-xs font-medium text-gray-500 mb-1">첨부파일</p>
              {post.files.map((f) => (
                <a
                  key={f.id}
                  href={f.fileUrl + '?download=true'}
                  download={f.fileName}
                  className="flex items-center gap-2 p-2 bg-gray-50 rounded-md hover:bg-blue-50 transition-colors"
                >
                  <Paperclip className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  <span className="text-sm text-blue-600 hover:underline truncate flex-1">{f.fileName}</span>
                  <span className="text-xs text-gray-400 flex-shrink-0">{formatFileSize(f.fileSize)}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── 메인 컴포넌트 ─── */
const TeacherBoard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [posts, setPosts]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);

  const fetchPosts = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await api.get('/api/posts');
      setPosts(data || []);
    } catch (err) {
      console.error('[TeacherBoard] fetchPosts error:', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    const timer = setTimeout(fetchPosts, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleDelete = async (post) => {
    if (!confirm(`"${post.title}" 게시글을 삭제하시겠습니까?\n첨부파일도 함께 삭제됩니다.`)) return;
    setDeleting(post.id);

    try {
      // Server handles Storage file cleanup on DELETE /api/posts/:id
      await api.delete(`/api/posts/${post.id}`);
    } catch (err) {
      console.error('[TeacherBoard] delete error:', err);
    }

    setDeleting(null);
    fetchPosts();
  };

  if (loading) return <p className="text-gray-500">로딩 중...</p>;

  return (
    <div className="max-w-4xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Newspaper className="h-6 w-6 text-blue-500" />
          게시판
        </h1>
        <button
          onClick={() => navigate('/teacher/board/new')}
          title="새 게시글"
          className="inline-flex items-center justify-center p-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 cursor-pointer"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      {posts.length === 0 ? (
        <div
          onClick={() => navigate('/teacher/board/new')}
          title="첫 게시글 작성하기"
          className="border-2 border-dashed border-gray-300 rounded-xl h-40 flex flex-col items-center justify-center text-gray-400 gap-2 cursor-pointer hover:border-blue-300 hover:text-blue-400 transition-colors"
        >
          <Plus className="h-10 w-10" />
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              navigate={navigate}
              deleting={deleting}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default TeacherBoard;
