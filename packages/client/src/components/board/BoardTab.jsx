import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Paperclip, Newspaper, Pencil } from 'lucide-react';
import { api } from '../../lib/api';
import { splitLinkSegments } from '../../lib/linkify';
import { formatYmd, formatMd } from '../../lib/formatDate';
import IconButton from '../common/IconButton';

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/* ─────────── 펼친 글: 내용 + 첨부 목록 ─────────── */
function PostDetail({ post }) {
  return (
    <>
      {post.content ? (
        <p className="text-sm text-gray-700 whitespace-pre-wrap">
          {splitLinkSegments(post.content).map((seg, i) =>
            seg.type === 'link' ? (
              <a key={i} href={seg.href} target="_blank" rel="noopener noreferrer"
                className="text-blue-600 hover:underline break-all">
                {seg.value}
              </a>
            ) : (
              seg.value
            )
          )}
        </p>
      ) : (
        <p className="text-sm text-gray-400 italic">내용 없음</p>
      )}
      {post.files?.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <p className="text-xs font-medium text-gray-500 mb-1">첨부파일</p>
          {post.files.map((f) => (
            <a
              key={f.id}
              href={f.fileUrl + '?download=true'}
              download={f.fileName}
              className="flex items-center gap-2 p-2 bg-white border border-gray-200 rounded-md hover:bg-blue-50 transition-colors"
            >
              <Paperclip className="h-4 w-4 text-gray-400 flex-shrink-0" />
              <span className="text-sm text-blue-600 hover:underline truncate flex-1">{f.fileName}</span>
              <span className="text-xs text-gray-400 flex-shrink-0 tabular-nums">{formatFileSize(f.fileSize)}</span>
            </a>
          ))}
        </div>
      )}
    </>
  );
}

/* ─────────── 게시판 탭: 한 줄 한 글의 장부 표 ─────────── */
const BoardTab = ({ classroomId, isTeacher }) => {
  const navigate = useNavigate();
  const [posts, setPosts]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [openIds, setOpenIds] = useState(() => new Set()); // 여러 글을 동시에 펼 수 있다

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

  const toggle = (id) => setOpenIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  if (loading) return <p className="text-gray-400 text-sm">로딩 중...</p>;

  if (posts.length === 0) {
    return (
      <div className="border-2 border-dashed border-gray-200 rounded-xl h-40 flex flex-col items-center justify-center text-gray-400 text-sm gap-2">
        <Newspaper className="h-8 w-8" />
        <span>이 클래스에 게시된 글이 없습니다.</span>
      </div>
    );
  }

  return (
    <div className="ledger-wrap">
      <table className="ledger">
        <thead>
          <tr>
            <th scope="col">제목</th>
            <th scope="col" className="tight">첨부</th>
            <th scope="col" className="tight">게시일</th>
            {isTeacher && <th scope="col" className="act"><span className="sr-only">수정</span></th>}
            <th scope="col" className="act"><span className="sr-only">펼침</span></th>
          </tr>
        </thead>
        <tbody>
          {posts.map((post) => {
            const open = openIds.has(post.id);
            const detailId = `post-detail-${post.id}`;
            const fileCount = post.files?.length ?? 0;
            return [
              <tr key={post.id} className="row-btn" aria-expanded={open} onClick={() => toggle(post.id)}>
                <td className="grow">
                  <button
                    type="button"
                    className="title-btn font-medium"
                    aria-expanded={open}
                    aria-controls={detailId}
                    onClick={(e) => { e.stopPropagation(); toggle(post.id); }}
                  >
                    {post.title}
                  </button>
                </td>
                <td className="tight num">
                  {fileCount > 0 && (
                    <span className="inline-flex items-center gap-1" title={`첨부파일 ${fileCount}개`}>
                      <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
                      {fileCount}
                      <span className="sr-only">개</span>
                    </span>
                  )}
                </td>
                <td className="tight num">
                  <time dateTime={post.createdAt}>
                    <span className="hidden sm:inline">{formatYmd(post.createdAt)}</span>
                    <span className="sm:hidden">{formatMd(post.createdAt)}</span>
                  </time>
                </td>
                {isTeacher && (
                  <td className="act" onClick={(e) => e.stopPropagation()}>
                    <IconButton
                      icon={Pencil} label="수정" size="sm"
                      onClick={() => navigate(`/teacher/board/${post.id}/edit`)}
                    />
                  </td>
                )}
                <td className="act">
                  <span className="inline-flex items-center justify-center w-9 h-11">
                    <ChevronDown className="h-4 w-4 chev" aria-hidden="true" />
                  </span>
                </td>
              </tr>,
              open && (
                <tr key={`${post.id}-detail`} className="ledger-detail">
                  <td id={detailId} colSpan={isTeacher ? 5 : 4}>
                    <PostDetail post={post} />
                  </td>
                </tr>
              ),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
};

export default BoardTab;
