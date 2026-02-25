import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Paperclip, X, Loader, Plus, Save, Send } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

const MAX_FILES = 3;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const BoardPostEditor = () => {
  const { postId } = useParams(); // undefined = 신규
  const navigate = useNavigate();
  const { user } = useAuth();
  const fileInputRef = useRef(null);

  const [title, setTitle]           = useState('');
  const [content, setContent]       = useState('');
  const [classrooms, setClassrooms] = useState([]); // 교사의 모든 클래스룸
  const [selectedIds, setSelectedIds] = useState(new Set()); // 선택된 classroom ids
  const [existingFiles, setExistingFiles] = useState([]); // 기존 첨부파일 (수정 시)
  const [newFiles, setNewFiles]     = useState([]); // 새로 추가할 파일 (File 객체)
  const [deletedFileIds, setDeletedFileIds] = useState(new Set()); // 삭제할 기존 파일 ids
  const [saving, setSaving]         = useState(false);
  const [loading, setLoading]       = useState(!!postId);
  const [fileError, setFileError]   = useState('');

  /* 교사의 클래스룸 목록 로드 */
  useEffect(() => {
    if (!user) return;
    supabase
      .from('classrooms')
      .select('id, name')
      .eq('teacher_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setClassrooms(data || []));
  }, [user]);

  /* 수정 시: 기존 게시글 데이터 로드 */
  useEffect(() => {
    if (!postId || !user) return;
    const fetchPost = async () => {
      setLoading(true);
      const [postRes, filesRes, pcsRes] = await Promise.all([
        supabase.from('posts').select('title, content').eq('id', postId).single(),
        supabase.from('post_files').select('*').eq('post_id', postId),
        supabase.from('post_classrooms').select('classroom_id').eq('post_id', postId),
      ]);
      if (postRes.data) {
        setTitle(postRes.data.title);
        setContent(postRes.data.content || '');
      }
      setExistingFiles(filesRes.data || []);
      setSelectedIds(new Set((pcsRes.data || []).map((pc) => pc.classroom_id)));
      setLoading(false);
    };
    fetchPost();
  }, [postId, user]);

  const toggleClassroom = (cid) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(cid) ? next.delete(cid) : next.add(cid);
      return next;
    });
  };

  const handleFileAdd = (e) => {
    setFileError('');
    const added = Array.from(e.target.files);
    e.target.value = '';

    const totalCount = (existingFiles.length - deletedFileIds.size) + newFiles.length + added.length;
    if (totalCount > MAX_FILES) {
      setFileError(`첨부파일은 최대 ${MAX_FILES}개까지 가능합니다.`);
      return;
    }
    const oversized = added.filter((f) => f.size > MAX_FILE_SIZE);
    if (oversized.length > 0) {
      setFileError(`파일 크기는 10MB 이하여야 합니다. (${oversized.map((f) => f.name).join(', ')})`);
      return;
    }
    setNewFiles((prev) => [...prev, ...added]);
  };

  const handleRemoveNewFile = (idx) => {
    setNewFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleRemoveExistingFile = (fileId) => {
    setDeletedFileIds((prev) => new Set([...prev, fileId]));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !user) return;
    setSaving(true);

    if (postId) {
      /* ── 수정 ── */
      await supabase.from('posts').update({
        title: title.trim(),
        content: content.trim(),
        updated_at: new Date().toISOString(),
      }).eq('id', postId);

      /* 삭제 대상 파일 Storage + DB 삭제 */
      if (deletedFileIds.size > 0) {
        const toDelete = existingFiles.filter((f) => deletedFileIds.has(f.id));
        const paths = toDelete.map((f) => {
          try {
            const url = new URL(f.file_url);
            const marker = '/object/public/post-files/';
            const idx = url.pathname.indexOf(marker);
            return idx !== -1 ? url.pathname.slice(idx + marker.length) : null;
          } catch { return null; }
        }).filter(Boolean);
        if (paths.length > 0) await supabase.storage.from('post-files').remove(paths);
        await supabase.from('post_files').delete().in('id', [...deletedFileIds]);
      }

      /* post_classrooms 업데이트 */
      await supabase.from('post_classrooms').delete().eq('post_id', postId);
      if (selectedIds.size > 0) {
        await supabase.from('post_classrooms').insert(
          [...selectedIds].map((cid) => ({ post_id: postId, classroom_id: cid }))
        );
      }
    } else {
      /* ── 신규 ── */
      const { data: newPost } = await supabase
        .from('posts')
        .insert({ teacher_id: user.id, title: title.trim(), content: content.trim() })
        .select().single();

      if (newPost && selectedIds.size > 0) {
        await supabase.from('post_classrooms').insert(
          [...selectedIds].map((cid) => ({ post_id: newPost.id, classroom_id: cid }))
        );
      }

      if (newPost) {
        for (const file of newFiles) {
          const ext  = file.name.split('.').pop();
          const path = `posts/${newPost.id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}.${ext}`;
          const { error: upErr } = await supabase.storage.from('post-files').upload(path, file);
          if (upErr) continue;
          const { data: { publicUrl } } = supabase.storage.from('post-files').getPublicUrl(path);
          await supabase.from('post_files').insert({
            post_id:   newPost.id,
            file_name: file.name,
            file_url:  publicUrl,
            file_size: file.size,
            mime_type: file.type || null,
          });
        }
      }
    }

    /* 수정 시 새 파일 추가 */
    if (postId && newFiles.length > 0) {
      for (const file of newFiles) {
        const ext  = file.name.split('.').pop();
        const path = `posts/${postId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}.${ext}`;
        const { error: upErr } = await supabase.storage.from('post-files').upload(path, file);
        if (upErr) continue;
        const { data: { publicUrl } } = supabase.storage.from('post-files').getPublicUrl(path);
        await supabase.from('post_files').insert({
          post_id:   postId,
          file_name: file.name,
          file_url:  publicUrl,
          file_size: file.size,
          mime_type: file.type || null,
        });
      }
    }

    setSaving(false);
    navigate('/teacher/board');
  };

  if (loading) return <p className="text-gray-500">로딩 중...</p>;

  const remainingSlots = MAX_FILES - (existingFiles.length - deletedFileIds.size) - newFiles.length;

  return (
    <div className="max-w-2xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/teacher/board')}
          className="text-gray-400 hover:text-gray-600 cursor-pointer">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">
          {postId ? '게시글 수정' : '새 게시글'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* 제목 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">제목</label>
          <input
            autoFocus
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="게시글 제목"
            required
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* 내용 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">내용</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="내용을 입력하세요 (선택)"
            rows={6}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 resize-y"
          />
        </div>

        {/* 첨부파일 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            첨부파일 <span className="text-gray-400 font-normal">(최대 3개, 각 10MB 이하)</span>
          </label>

          {/* 기존 파일 (수정 시) */}
          {existingFiles.filter((f) => !deletedFileIds.has(f.id)).map((f) => (
            <div key={f.id} className="flex items-center gap-2 mb-1 p-2 bg-gray-50 rounded-md">
              <Paperclip className="h-4 w-4 text-gray-400 flex-shrink-0" />
              <a href={f.file_url} target="_blank" rel="noreferrer"
                className="text-sm text-blue-600 hover:underline truncate flex-1">
                {f.file_name}
              </a>
              <span className="text-xs text-gray-400">{(f.file_size / 1024).toFixed(0)}KB</span>
              <button type="button" onClick={() => handleRemoveExistingFile(f.id)}
                className="p-0.5 text-gray-400 hover:text-red-500 cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}

          {/* 새 파일 */}
          {newFiles.map((f, idx) => (
            <div key={idx} className="flex items-center gap-2 mb-1 p-2 bg-blue-50 rounded-md">
              <Paperclip className="h-4 w-4 text-blue-400 flex-shrink-0" />
              <span className="text-sm text-blue-700 truncate flex-1">{f.name}</span>
              <span className="text-xs text-blue-400">{(f.size / 1024).toFixed(0)}KB</span>
              <button type="button" onClick={() => handleRemoveNewFile(idx)}
                className="p-0.5 text-gray-400 hover:text-red-500 cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}

          {remainingSlots > 0 && (
            <>
              <input ref={fileInputRef} type="file" multiple onChange={handleFileAdd} className="hidden" />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title={`파일 추가 (최대 ${remainingSlots}개 더)`}
                className="mt-1 flex items-center justify-center p-2 border border-dashed border-gray-300 rounded-md text-gray-500 hover:border-blue-300 hover:text-blue-500 transition-colors cursor-pointer"
              >
                <Plus className="h-5 w-5" />
              </button>
            </>
          )}
          {fileError && <p className="text-xs text-red-600 mt-1">{fileError}</p>}
        </div>

        {/* 클래스룸 선택 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            게시할 클래스룸 <span className="text-gray-400 font-normal">(복수 선택 가능)</span>
          </label>
          {classrooms.length === 0 ? (
            <p className="text-sm text-gray-400">생성된 클래스룸이 없습니다.</p>
          ) : (
            <div className="border border-gray-200 rounded-md divide-y max-h-48 overflow-y-auto">
              {classrooms.map((cls) => (
                <label key={cls.id}
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(cls.id)}
                    onChange={() => toggleClassroom(cls.id)}
                    className="w-4 h-4 accent-blue-600 cursor-pointer"
                  />
                  <span className="text-sm text-gray-700">{cls.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* 버튼 */}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={() => navigate('/teacher/board')} title="취소"
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md cursor-pointer flex items-center justify-center">
            <X className="h-5 w-5" />
          </button>
          <button
            type="submit"
            disabled={saving || !title.trim()}
            title={saving ? '저장 중...' : (postId ? '수정 완료' : '게시하기')}
            className="p-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 cursor-pointer flex items-center justify-center"
          >
            {saving ? <Loader className="animate-spin h-5 w-5" /> : (postId ? <Save className="h-5 w-5" /> : <Send className="h-5 w-5" />)}
          </button>
        </div>
      </form>
    </div>
  );
};

export default BoardPostEditor;
