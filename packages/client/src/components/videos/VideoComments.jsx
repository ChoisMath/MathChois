import { useCallback, useEffect, useState } from 'react';
import { Lock, Reply, Pencil, Trash2, Clock, MessageSquare } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { subscribeToRoom } from '../../lib/socket';
import {
  listVideoComments, createVideoComment, updateVideoComment, deleteVideoComment, markVideoCommentsSeen,
} from '../../lib/videos';
import { refreshSidebar } from '../../lib/sidebarRefresh';
import { formatTime } from '../../lib/videoPlayer';

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('ko-KR', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/* ─── 작성/수정 입력란 ─── */
function CommentComposer({
  placeholder, initial = '', submitLabel = '등록', allowPrivate = false, allowTimestamp = false,
  getCurrentTime, onSubmit, onCancel, autoFocus = false,
}) {
  const [content, setContent] = useState(initial);
  const [isPrivate, setIsPrivate] = useState(false);
  const [timestampSec, setTimestampSec] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!content.trim()) return;
    setBusy(true);
    setError('');
    try {
      await onSubmit({ content: content.trim(), isPrivate, timestampSec });
      setContent('');
      setIsPrivate(false);
      setTimestampSec(null);
    } catch (err) {
      setError(err.message ?? '저장에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={placeholder}
        rows={3}
        autoFocus={autoFocus}
        className="w-full border rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
      />
      <div className="flex flex-wrap items-center gap-2">
        {allowTimestamp && (
          timestampSec == null ? (
            <button type="button"
              onClick={() => setTimestampSec(Math.floor(getCurrentTime?.() ?? 0))}
              className="inline-flex items-center gap-1 px-2 min-h-9 border rounded text-xs text-gray-700 hover:bg-gray-50">
              <Clock className="h-3.5 w-3.5" /> 현재 시각 첨부
            </button>
          ) : (
            <button type="button" onClick={() => setTimestampSec(null)}
              className="inline-flex items-center gap-1 px-2 min-h-9 border rounded text-xs bg-blue-50 border-blue-200 text-blue-700"
              title="클릭하면 첨부 해제">
              <Clock className="h-3.5 w-3.5" /> {formatTime(timestampSec)} ✕
            </button>
          )
        )}
        {allowPrivate && (
          <label className="inline-flex items-center gap-1 text-xs text-gray-700 cursor-pointer select-none">
            <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
            <Lock className="h-3.5 w-3.5" /> 교사만 확인
          </label>
        )}
        <div className="flex-1" />
        {onCancel && (
          <button type="button" onClick={onCancel} className="px-3 min-h-9 border rounded text-xs">취소</button>
        )}
        <button type="submit" disabled={busy || !content.trim()}
          className="px-3 min-h-9 bg-blue-600 text-white rounded text-xs disabled:opacity-50">
          {busy ? '저장 중…' : submitLabel}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}

/* ─── 댓글 한 개 ─── */
function CommentItem({ c, isRoot, canModerate, myId, onReply, onEdit, onDelete, onSeek }) {
  const [editing, setEditing] = useState(false);
  const mine = c.authorId === myId;
  const isTeacher = c.author?.role === 'teacher';

  return (
    <div className="flex gap-2">
      {c.author?.avatarUrl ? (
        <img src={c.author.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover shrink-0" referrerPolicy="no-referrer" />
      ) : (
        <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-medium shrink-0 ${
          isTeacher ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'}`}>
          {c.author?.name?.charAt(0) ?? '?'}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
          <span className="font-medium text-gray-900">{c.author?.name ?? '알 수 없음'}</span>
          {isTeacher && <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-semibold">교사</span>}
          <span className="text-gray-400">{formatDate(c.createdAt)}</span>
          {c.updatedAt && c.createdAt && c.updatedAt !== c.createdAt && <span className="text-gray-400">(수정됨)</span>}
          {isRoot && c.isPrivate && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-semibold">
              <Lock className="h-3 w-3" /> 교사만 확인
            </span>
          )}
        </div>
        {editing ? (
          <div className="mt-1">
            <CommentComposer
              initial={c.content} submitLabel="수정" autoFocus
              onSubmit={async ({ content }) => { await onEdit(c, content); setEditing(false); }}
              onCancel={() => setEditing(false)}
            />
          </div>
        ) : (
          <p className="text-sm text-gray-800 mt-0.5 whitespace-pre-wrap break-words">
            {c.timestampSec != null && (
              <button type="button" onClick={() => onSeek?.(c.timestampSec)}
                className="inline-flex items-center gap-0.5 mr-1 text-blue-600 hover:underline font-medium tabular-nums">
                <Clock className="h-3 w-3" />{formatTime(c.timestampSec)}
              </button>
            )}
            {c.content}
          </p>
        )}
        {!editing && (
          <div className="flex items-center gap-1 mt-1 -ml-1">
            {isRoot && onReply && (
              <button onClick={() => onReply(c)} className="inline-flex items-center gap-1 px-2 min-h-8 rounded text-xs text-gray-500 hover:bg-gray-100">
                <Reply className="h-3.5 w-3.5" /> 답글
              </button>
            )}
            {mine && (
              <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1 px-2 min-h-8 rounded text-xs text-gray-500 hover:bg-gray-100">
                <Pencil className="h-3.5 w-3.5" /> 수정
              </button>
            )}
            {(mine || canModerate) && (
              <button onClick={() => onDelete(c)} className="inline-flex items-center gap-1 px-2 min-h-8 rounded text-xs text-red-500 hover:bg-red-50">
                <Trash2 className="h-3.5 w-3.5" /> 삭제
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 학급 영상 댓글 영역 (YouTube 식: 작성란 + 스레드 목록).
 * props: classroomVideoId, isTeacher(교실 소유 교사), getCurrentTime(), onSeek(sec)
 *
 * - 학생은 루트 댓글에 "교사만 확인"을 체크해 교사와 1:1 로 질의응답할 수 있다.
 * - 서버가 권한에 맞게 필터링해 주므로 소켓 이벤트(`video-comment:changed`)에서는 재조회만 한다.
 */
export default function VideoComments({ classroomVideoId, isTeacher, getCurrentTime, onSeek }) {
  const { user } = useAuth();
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState('newest'); // 'newest' | 'oldest'
  const [replyTo, setReplyTo] = useState(null);

  const fetchThreads = useCallback(async () => {
    try {
      setThreads(await listVideoComments(classroomVideoId));
      // 목록을 봤으므로 읽음 처리 → 사이드바/학급 탭의 미읽음 배지 갱신. 실패해도 무시.
      markVideoCommentsSeen(classroomVideoId).then(() => refreshSidebar()).catch(() => {});
    } catch { /* 유지 */ } finally {
      setLoading(false);
    }
  }, [classroomVideoId]);

  useEffect(() => { setLoading(true); fetchThreads(); }, [fetchThreads]);

  useEffect(() => subscribeToRoom(`video:${classroomVideoId}`, 'video-comment:changed', (data) => {
    if (data?.classroomVideoId === classroomVideoId) fetchThreads();
  }), [classroomVideoId, fetchThreads]);

  const handleCreate = async ({ content, isPrivate, timestampSec }, parentId = null) => {
    await createVideoComment(classroomVideoId, { content, isPrivate, timestampSec, parentId });
    setReplyTo(null);
    fetchThreads();
  };

  const handleEdit = async (c, content) => {
    await updateVideoComment(c.id, content);
    fetchThreads();
  };

  const handleDelete = async (c) => {
    const msg = c.parentId ? '이 답글을 삭제할까요?' : '이 댓글과 답글을 모두 삭제할까요?';
    if (!confirm(msg)) return;
    try {
      await deleteVideoComment(c.id);
      fetchThreads();
    } catch (err) {
      alert(err.message ?? '삭제에 실패했습니다.');
    }
  };

  const sorted = [...threads].sort((a, b) =>
    order === 'newest'
      ? new Date(b.createdAt) - new Date(a.createdAt)
      : new Date(a.createdAt) - new Date(b.createdAt));
  const total = threads.reduce((n, t) => n + 1 + (t.replies?.length ?? 0), 0);

  return (
    <section className="mt-5">
      <div className="flex items-center gap-3 mb-3">
        <h3 className="font-semibold text-gray-900 flex items-center gap-1.5">
          <MessageSquare className="h-4 w-4" /> 댓글 <span className="text-gray-500 font-normal">{total}</span>
        </h3>
        <div className="flex-1" />
        <select value={order} onChange={(e) => setOrder(e.target.value)} className="border rounded px-2 min-h-9 text-xs">
          <option value="newest">최신순</option>
          <option value="oldest">오래된순</option>
        </select>
      </div>

      <CommentComposer
        placeholder={isTeacher ? '학생들에게 안내할 내용이나 답변을 남겨 보세요.' : '영상에 대해 질문해 보세요. "교사만 확인"을 켜면 선생님만 볼 수 있어요.'}
        allowPrivate={!isTeacher}
        allowTimestamp
        getCurrentTime={getCurrentTime}
        onSubmit={(v) => handleCreate(v, null)}
      />

      <div className="mt-5 flex flex-col gap-5">
        {loading && <p className="text-sm text-gray-400">댓글 불러오는 중…</p>}
        {!loading && sorted.length === 0 && (
          <p className="text-sm text-gray-400">아직 댓글이 없습니다.</p>
        )}
        {sorted.map((t) => (
          <div key={t.id} className={`rounded-lg p-3 ${t.isPrivate ? 'bg-amber-50/60 border border-amber-100' : ''}`}>
            <CommentItem
              c={t} isRoot canModerate={isTeacher} myId={user?.id}
              onReply={setReplyTo} onEdit={handleEdit} onDelete={handleDelete} onSeek={onSeek}
            />
            {(t.replies?.length > 0 || replyTo?.id === t.id) && (
              <div className="ml-10 mt-3 flex flex-col gap-3 border-l-2 border-gray-100 pl-3">
                {t.replies.map((r) => (
                  <CommentItem
                    key={r.id} c={r} isRoot={false} canModerate={isTeacher} myId={user?.id}
                    onEdit={handleEdit} onDelete={handleDelete} onSeek={onSeek}
                  />
                ))}
                {replyTo?.id === t.id && (
                  <CommentComposer
                    placeholder={`${t.author?.name ?? ''}님에게 답글…`}
                    submitLabel="답글 등록" autoFocus allowTimestamp getCurrentTime={getCurrentTime}
                    onSubmit={(v) => handleCreate(v, t.id)}
                    onCancel={() => setReplyTo(null)}
                  />
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
