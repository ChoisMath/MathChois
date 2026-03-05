import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Paperclip, X, Loader, Plus, Save, Send } from 'lucide-react';
import { api } from '../../lib/api';
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
    api.get('/api/classrooms')
      .then((data) => setClassrooms(data || []))
      .catch(() => setClassrooms([]));
  }, [user]);

  /* 수정 시: 기존 게시글 데이터 로드 */
  useEffect(() => {
    if (!postId || !user) return;
    const fetchPost = async () => {
      setLoading(true);
      try {
        const postData = await api.get(`/api/posts/${postId}`);
        if (postData) {
          setTitle(postData.title);
          setContent(postData.content || '');
          // 서버에서 camelCase로 반환: files 배열, classroomIds 배열
          setExistingFiles((postData.files || []).map((f) => ({
            id: f.id,
            fileName: f.fileName,
            fileUrl: f.fileUrl,
            fileSize: f.fileSize,
            mimeType: f.mimeType,
          })));
          setSelectedIds(new Set(postData.classroomIds || []));
        }
      } catch (err) {
        console.error('게시글 로드 실패:', err.message);
      }
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

  /** 새 파일들을 Storage에 업로드하고 메타데이터 배열을 반환 */
  const uploadNewFiles = async (targetPostId) => {
    const uploaded = [];
    for (const file of newFiles) {
      try {
        const formData = new FormData();
        formData.append('file', file);

        const result = await api.upload(
          `/api/files/upload?bucket=post-files&directory=posts/${targetPostId}`,
          formData
        );

        uploaded.push({
          fileName: file.name,
          fileUrl: result.url,
          fileSize: result.fileSize ?? file.size,
          mimeType: result.mimeType ?? (file.type || null),
        });
      } catch (err) {
        console.error(`파일 업로드 실패 (${file.name}):`, err.message);
      }
    }
    return uploaded;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !user) return;
    setSaving(true);

    try {
      if (postId) {
        /* ── 수정 ── */

        // 삭제 대상 파일 Storage 삭제
        if (deletedFileIds.size > 0) {
          const toDelete = existingFiles.filter((f) => deletedFileIds.has(f.id));
          for (const f of toDelete) {
            try {
              const fileUrl = f.fileUrl;
              if (fileUrl) {
                const apiMarker = '/api/files/';
                const apiIdx = fileUrl.indexOf(apiMarker);
                if (apiIdx !== -1) {
                  await api.delete(fileUrl.slice(apiIdx));
                }
              }
            } catch { /* Storage 삭제 실패 무시 */ }
          }
        }

        // 새 파일 업로드
        const uploadedFiles = await uploadNewFiles(postId);

        // 남은 기존 파일 + 새 파일 합쳐서 files 배열 구성
        const keptFiles = existingFiles
          .filter((f) => !deletedFileIds.has(f.id))
          .map((f) => ({
            fileName: f.fileName,
            fileUrl: f.fileUrl,
            fileSize: f.fileSize,
            mimeType: f.mimeType,
          }));

        const allFiles = [...keptFiles, ...uploadedFiles];

        await api.patch(`/api/posts/${postId}`, {
          title: title.trim(),
          content: content.trim(),
          classroomIds: [...selectedIds],
          files: allFiles,
        });

      } else {
        /* ── 신규: 먼저 게시글 생성 (파일 없이), 그 후 파일 업로드 후 업데이트 ── */

        if (newFiles.length > 0) {
          // 파일이 있으면: 먼저 게시글 생성 → postId 획득 → 파일 업로드 → 파일 메타 업데이트
          const newPost = await api.post('/api/posts', {
            title: title.trim(),
            content: content.trim(),
            classroomIds: [...selectedIds],
          });

          if (newPost) {
            const uploadedFiles = await uploadNewFiles(newPost.id);
            if (uploadedFiles.length > 0) {
              await api.patch(`/api/posts/${newPost.id}`, {
                files: uploadedFiles,
              });
            }
          }
        } else {
          // 파일 없으면 한번에 생성
          await api.post('/api/posts', {
            title: title.trim(),
            content: content.trim(),
            classroomIds: [...selectedIds],
          });
        }
      }
    } catch (err) {
      console.error('저장 실패:', err.message);
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
              <a href={f.fileUrl + '?download=true'} download={f.fileName}
                className="text-sm text-blue-600 hover:underline truncate flex-1">
                {f.fileName}
              </a>
              <span className="text-xs text-gray-400">{(f.fileSize / 1024).toFixed(0)}KB</span>
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
