import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ChevronDown, ChevronUp, Paperclip, Newspaper, Pencil } from 'lucide-react';
import { api } from '../../lib/api';
import { splitLinkSegments } from '../../lib/linkify';

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

/* ─────────── 게시글 카드 (인라인 확장) ─────────── */
function PostCard({ post, isTeacher, navigate }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        className="w-full text-left px-4 py-3 flex items-center justify-between gap-4 hover:bg-gray-50 transition-colors cursor-pointer"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 truncate">{post.title}</p>
          <p className="text-xs text-gray-400 mt-0.5">{formatDate(post.createdAt)}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {post.files?.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Paperclip className="h-3.5 w-3.5" />
              {post.files.length}
            </span>
          )}
          {isTeacher && (
            <button
              onClick={(e) => { e.stopPropagation(); navigate(`/teacher/board/${post.id}/edit`); }}
              title="수정"
              className="text-blue-500 hover:text-blue-700 p-1.5 rounded hover:bg-blue-50 cursor-pointer"
            >
              <Pencil className="w-4 h-4" />
            </button>
          )}
          {open
            ? <ChevronUp className="h-4 w-4 text-gray-400" />
            : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-gray-100">
          {post.content ? (
            <p className="text-sm text-gray-700 mt-3 whitespace-pre-wrap">
              {splitLinkSegments(post.content).map((seg, i) =>
                seg.type === 'link' ? (
                  <a
                    key={i}
                    href={seg.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline break-all"
                  >
                    {seg.value}
                  </a>
                ) : (
                  seg.value
                )
              )}
            </p>
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

/* ─────────── 메인 컴포넌트 ─────────── */
const BoardTab = ({ classroomId, isTeacher }) => {
  const navigate = useNavigate();
  const [posts, setPosts]     = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPosts = async () => {
      setLoading(true);
      try {
        const data = await api.get(`/api/classrooms/${classroomId}/posts`);
        setPosts(data || []);
      } catch (err) {
        console.error('[BoardTab] fetchPosts error:', err);
        setPosts([]);
      }
      setLoading(false);
    };
    fetchPosts();
  }, [classroomId]);

  if (loading) return <p className="text-gray-400 text-sm">로딩 중...</p>;

  return (
    <div>

      {posts.length === 0 ? (
        <div className="border-2 border-dashed border-gray-200 rounded-xl h-40 flex flex-col items-center justify-center text-gray-400 text-sm gap-2">
          <Newspaper className="h-8 w-8" />
          <span>이 클래스에 게시된 글이 없습니다.</span>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              isTeacher={isTeacher}
              navigate={navigate}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default BoardTab;
