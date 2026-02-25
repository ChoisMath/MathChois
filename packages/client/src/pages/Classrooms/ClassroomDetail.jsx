import { useState, useEffect, lazy, Suspense } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Users, BookOpen, Copy, Check, Trash2, FileText,
  Plus, Hash, ChevronDown, ChevronUp, Edit2, GripVertical,
  Newspaper, ClipboardList, LogOut, Loader, X, Save, Download
} from 'lucide-react';

const BoardTab      = lazy(() => import('../../components/board/BoardTab'));
const AssignmentTab = lazy(() => import('../../components/assignment/AssignmentTab'));
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, rectSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { api } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { usePdfDownloader } from '../../lib/pdfDownloader';
import { PdfDownloadButton } from '../../components/common/PdfDownloadButton';

/* ─── 정렬 가능한 챕터 카드 ─── */
function SortableChapterCard({ ch, isTeacher, onDelete, onCardClick, onDownloadPdf, downloadingId }) {
  const {
    attributes, listeners, setNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id: ch.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity:   isDragging ? 0.4 : 1,
    zIndex:    isDragging ? 10 : undefined,
  };

  const clickable = isTeacher || !!ch.firstPage;

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={clickable ? () => onCardClick(ch) : undefined}
      className={`group bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col gap-2 transition-all select-none ${
        clickable ? 'cursor-pointer hover:shadow-md hover:border-blue-300' : 'cursor-default opacity-70'
      } ${isDragging ? 'shadow-xl border-blue-400' : ''}`}
    >
      {/* 제목 행 */}
      <div className="flex items-start gap-2">
        {/* 드래그 핸들 (교사 전용) */}
        {isTeacher && (
          <button
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            className="touch-none cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 p-0.5 flex-shrink-0 mt-0.5"
            title="드래그하여 순서 변경"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}

        <p className="font-semibold text-gray-900 leading-snug flex-1">{ch.title}</p>

        {/* 편집/삭제 버튼 (교사 전용) */}
        {isTeacher && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            <Link
              to={`/teacher/chapters/${ch.id}/edit`}
              onClick={(e) => e.stopPropagation()}
              title="편집"
              className="p-1.5 text-gray-400 hover:text-blue-600 rounded-md hover:bg-blue-50 transition-colors cursor-pointer"
            >
              <Edit2 className="h-4 w-4" />
            </Link>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete({ id: ch.id, title: ch.title }); }}
              title="삭제"
              className="p-1.5 text-gray-400 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors cursor-pointer"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* 설명 */}
      {ch.description && (
        <p className="text-xs text-gray-500 line-clamp-2">{ch.description}</p>
      )}

      {/* 페이지 수 및 다운로드 버튼 */}
      <div className="flex items-center justify-between mt-auto pt-1">
        <p className="text-xs text-gray-400 flex items-center gap-1">
          <FileText className="h-3 w-3" />
          {ch.pageCount}페이지
        </p>
        
        {!isTeacher && ch.firstPage && (
          <PdfDownloadButton
            onClick={(e) => {
              e.stopPropagation();
              onDownloadPdf && onDownloadPdf(ch);
            }}
            isDownloading={downloadingId === ch.id}
            className="p-1 px-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
          />
        )}
      </div>

      {!isTeacher && !ch.firstPage && (
        <span className="text-xs text-gray-400 mt-1">페이지 없음</span>
      )}
    </div>
  );
}

/* ─── 메인 컴포넌트 ─── */
const ClassroomDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const isTeacher = profile?.role === 'teacher';

  const [classroom, setClassroom]   = useState(null);
  const [members, setMembers]       = useState([]);
  const [chapters, setChapters]     = useState([]);
  const [loading, setLoading]       = useState(true);

  const [showCode, setShowCode]     = useState(false);
  const [copied, setCopied]         = useState(false);

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput]     = useState('');
  const [savingName, setSavingName]   = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createTab, setCreateTab]   = useState('new'); // 'new' | 'import'
  const [newTitle, setNewTitle]     = useState('');
  const [newDesc, setNewDesc]       = useState('');
  const [creating, setCreating]     = useState(false);

  /* 가져오기 */
  const [importClassrooms, setImportClassrooms]   = useState([]);
  const [importSrcCid, setImportSrcCid]           = useState('');
  const [importChapters, setImportChapters]       = useState([]);
  const [importSelectedChid, setImportSelectedChid] = useState('');
  const [importing, setImporting]                 = useState(false);

  const [activeTab, setActiveTab]   = useState('chapters'); // 'chapters' | 'board' | 'assignments' | 'students'

  const [deleteTarget, setDeleteTarget]         = useState(null);
  const [showDeleteClassroom, setShowDeleteClassroom] = useState(false);
  const [deleting, setDeleting]     = useState(false);
  const [unsubmittedCount, setUnsubmittedCount] = useState(0);

  /* PDF 다운로드 */
  const { downloadMultiplePages } = usePdfDownloader();
  const [downloadingChapterId, setDownloadingChapterId] = useState(null);

  /* ── dnd-kit sensors ── */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /* ── 데이터 로드 ── */
  const fetchData = async () => {
    setLoading(true);
    try {
      const [cls, mems, chaps] = await Promise.all([
        api.get(`/api/classrooms/${id}`),
        api.get(`/api/classrooms/${id}/members`),
        api.get(`/api/classrooms/${id}/chapters`),
      ]);

      setClassroom(cls);
      setMembers(mems || []);
      setChapters(
        (chaps || []).map((ch) => ({
          ...ch,
          pageCount: ch.pages?.length || 0,
          firstPage: ch.pages?.sort((a, b) => a.position - b.position)[0] || null,
        }))
      );

      /* 학생: 미제출 과제 수 (탭 배지용, 페이지 로드 시 즉시 계산) */
      if (!isTeacher && user) {
        const asns = await api.get(`/api/classrooms/${id}/assignments`);
        if (asns?.length > 0) {
          const asnIds = asns.map((a) => a.id).join(',');
          const subs = await api.get(`/api/submissions/student?assignmentIds=${asnIds}`);
          const submittedIds = new Set(
            (subs || []).filter((s) => s.assignmentId && s.status !== 'rejected').map((s) => s.assignmentId)
          );
          setUnsubmittedCount(asns.filter((a) => !submittedIds.has(a.id)).length);
        }
      }
    } catch (err) {
      console.error('[ClassroomDetail] 데이터 로드 오류:', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    const timer = setTimeout(fetchData, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  /* 가져오기 탭 전환 시 다른 클래스 목록 로드 */
  useEffect(() => {
    if (createTab !== 'import' || !user) return;
    api.get(`/api/classrooms/other/${id}`)
      .then((data) => {
        setImportClassrooms(data || []);
        setImportSrcCid('');
        setImportChapters([]);
        setImportSelectedChid('');
      })
      .catch((err) => console.error('[ClassroomDetail] 가져오기 클래스 목록 오류:', err));
  }, [createTab, user, id]);

  /* ── 모달 닫기 (상태 초기화 포함) ── */
  const closeCreateModal = () => {
    setShowCreateModal(false);
    setCreateTab('new');
    setNewTitle(''); setNewDesc('');
    setImportSrcCid(''); setImportChapters([]); setImportSelectedChid('');
  };

  /* ── 가져오기: 클래스 선택 → 챕터 목록 로드 ── */
  const handleImportClassroomChange = async (cid) => {
    setImportSrcCid(cid);
    setImportSelectedChid('');
    if (!cid) { setImportChapters([]); return; }
    try {
      const data = await api.get(`/api/classrooms/${cid}/chapters`);
      setImportChapters(data || []);
    } catch (err) {
      console.error('[ClassroomDetail] 챕터 목록 로드 오류:', err);
      setImportChapters([]);
    }
  };

  /* ── 가져오기 실행 ── */
  const handleImportChapter = async () => {
    if (!importSelectedChid) return;
    setImporting(true);
    try {
      await api.post(`/api/chapters/${importSelectedChid}/import`, { targetClassroomId: id });
      closeCreateModal();
      fetchData();
    } catch (err) {
      console.error('[ClassroomDetail] 챕터 가져오기 오류:', err);
    }
    setImporting(false);
  };

  /* ── 클래스 이름 인라인 편집 ── */
  const handleNameClick = () => {
    if (!isTeacher) return;
    setNameInput(classroom.name);
    setEditingName(true);
  };

  const handleNameSave = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === classroom.name) { setEditingName(false); return; }
    setSavingName(true);
    try {
      await api.patch(`/api/classrooms/${id}`, { name: trimmed });
      setClassroom((prev) => ({ ...prev, name: trimmed }));
    } catch (err) {
      console.error('[ClassroomDetail] 이름 수정 오류:', err);
    }
    setSavingName(false);
    setEditingName(false);
  };

  const handleNameKeyDown = (e) => {
    if (e.key === 'Enter')  { e.preventDefault(); handleNameSave(); }
    if (e.key === 'Escape') { setEditingName(false); }
  };

  /* ── 핸들러 ── */
  const handleCopyCode = async () => {
    if (!classroom?.classCode) return;
    await navigator.clipboard.writeText(classroom.classCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLeave = async () => {
    if (!confirm('이 클래스룸에서 나가시겠습니까?')) return;
    try {
      await api.delete(`/api/classrooms/${id}/members/${user.id}`);
      navigate('/student/classrooms', { replace: true });
    } catch (err) {
      console.error('[ClassroomDetail] 나가기 오류:', err);
    }
  };

  const handleDeleteClassroom = async () => {
    setDeleting(true);
    try {
      await api.delete(`/api/classrooms/${id}`);
      navigate('/teacher/classrooms', { replace: true });
    } catch (err) {
      window.alert(`삭제 실패: ${err.message}`);
      setShowDeleteClassroom(false);
    }
    setDeleting(false);
  };

  const handleCreateChapter = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const maxPos = chapters.length > 0 ? Math.max(...chapters.map((c) => c.position)) + 1 : 0;
      await api.post(`/api/classrooms/${id}/chapters`, {
        title:       newTitle.trim(),
        description: newDesc.trim() || null,
        position:    maxPos,
      });
      setNewTitle(''); setNewDesc(''); setShowCreateModal(false); fetchData();
    } catch (err) {
      console.error('[ClassroomDetail] 챕터 생성 오류:', err);
    }
    setCreating(false);
  };

  const handleDeleteChapter = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      /* 서버가 Storage orphan 이미지 정리 + DB 삭제(CASCADE)를 모두 처리 */
      await api.delete(`/api/chapters/${deleteTarget.id}`);
      setDeleteTarget(null);
      fetchData();
    } catch (err) {
      console.error('[ClassroomDetail] 챕터 삭제 오류:', err);
    }
    setDeleting(false);
  };

  const handleCardClick = (ch) => {
    if (isTeacher) {
      navigate(`/teacher/classrooms/${id}/chapters/${ch.id}/monitor`);
    } else if (ch.firstPage) {
      /* 마지막 방문 페이지가 있으면 이어보기, 없으면 첫 페이지 */
      const savedPageId = localStorage.getItem(`mc_lastPage_${ch.id}`);
      const savedPageValid = savedPageId && ch.pages?.some((p) => p.id === savedPageId);
      navigate(`/student/study/${ch.id}/page/${savedPageValid ? savedPageId : ch.firstPage.id}`);
    }
  };

  /* ── 챕터 순서 변경 ── */
  const handleDragEnd = async ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const oldIdx = chapters.findIndex((c) => c.id === active.id);
    const newIdx = chapters.findIndex((c) => c.id === over.id);
    const newOrder = arrayMove(chapters, oldIdx, newIdx);
    setChapters(newOrder); // optimistic update
    try {
      await api.put('/api/chapters/reorder', {
        items: newOrder.map((ch, i) => ({ id: ch.id, position: i })),
      });
    } catch (err) {
      console.error('[ClassroomDetail] 순서 변경 오류:', err);
    }
  };

  /* ── 학생 챕터 PDF 일괄 다운로드 ── */
  const handleDownloadStudentChapterPdf = async (ch) => {
    if (!profile || !user) return;
    setDownloadingChapterId(ch.id);
    try {
      const title = `${profile.name || '학생'}_${ch.title}_전체`;
      const pgs = await api.get(`/api/chapters/${ch.id}/pages`);

      if (!pgs || pgs.length === 0) return;

      const pageIds = pgs.map(p => p.id).join(',');
      const notes = await api.get(`/api/notes/student-bulk?pageIds=${pageIds}`);

      const notesMap = Object.fromEntries((notes || []).map(n => [n.pageId, n.excalidrawData]));

      const pageDataList = pgs.map(pg => {
        const note = notesMap[pg.id] || { elements: [], files: {}, bgPosition: null };
        return {
          bgUrl: pg.imageUrl,
          elements: note.elements || [],
          files: note.files || {},
          bgPosition: note.bgPosition,
        };
      });
      await downloadMultiplePages(title, pageDataList);
    } finally {
      setDownloadingChapterId(null);
    }
  };

  if (loading) return <p className="text-gray-500">로딩 중...</p>;
  if (!classroom) return <p className="text-gray-500">클래스룸을 찾을 수 없습니다.</p>;

  return (
    <>
      <div className="max-w-5xl mx-auto space-y-6">

        {/* ── 헤더 ── */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {isTeacher && editingName ? (
                <input
                  autoFocus
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onBlur={handleNameSave}
                  onKeyDown={handleNameKeyDown}
                  disabled={savingName}
                  className="text-2xl font-bold text-gray-900 leading-tight border-b-2 border-blue-500 outline-none bg-transparent w-72"
                />
              ) : (
                <h2
                  onClick={isTeacher ? handleNameClick : undefined}
                  title={isTeacher ? '클릭하여 이름 수정' : undefined}
                  className={`text-2xl font-bold text-gray-900 leading-tight ${
                    isTeacher ? 'cursor-text hover:text-blue-600 transition-colors' : ''
                  }`}
                >
                  {classroom.name}
                </h2>
              )}
              {isTeacher && (
                <button
                  onClick={() => setShowCode((v) => !v)}
                  title={showCode ? '코드 숨기기' : '클래스 코드 보기'}
                  className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                    showCode ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  <Hash className="h-4 w-4" />
                </button>
              )}
            </div>

            {isTeacher && showCode && (
              <div className="flex items-center gap-2 mt-2">
                <span className="font-mono font-bold text-blue-600 text-xl tracking-widest">
                  {classroom.classCode}
                </span>
                <button
                  onClick={handleCopyCode} title="코드 복사"
                  className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                >
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </button>
                <span className="text-xs text-gray-400">학생에게 공유하세요</span>
              </div>
            )}

          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {isTeacher ? (
              <>
                {activeTab === 'chapters' && (
                  <button
                    onClick={() => setShowCreateModal(true)} title="새 챕터"
                    className="inline-flex items-center justify-center p-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 cursor-pointer"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                )}
                {activeTab === 'board' && (
                  <button
                    onClick={() => navigate('/teacher/board/new')} title="새 게시글"
                    className="inline-flex items-center justify-center p-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 cursor-pointer"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                )}
                <button
                  onClick={() => setShowDeleteClassroom(true)} title="클래스룸 삭제"
                  className="p-2 text-gray-400 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors cursor-pointer"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </>
            ) : (
              <button
                onClick={handleLeave} title="나가기"
                className="inline-flex items-center justify-center p-2 border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50 cursor-pointer"
              >
                <LogOut className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        {/* ── 탭 네비게이션 ── */}
        <div className="flex border-b border-gray-200 mb-5">
          {[
            { key: 'chapters',    label: '챕터',  Icon: BookOpen },
            { key: 'board',       label: '게시판', Icon: Newspaper },
            { key: 'assignments', label: '과제',  Icon: ClipboardList },
            { key: 'students',    label: '학생',  Icon: Users },
          ].map((item) => {
            const TabIcon = item.Icon;
            return (
              <button
                key={item.key}
                onClick={() => setActiveTab(item.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium -mb-px border-b-2 transition-colors cursor-pointer ${
                  activeTab === item.key
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <TabIcon className="h-4 w-4" />
                {item.label}
                {item.key === 'assignments' && !isTeacher && unsubmittedCount > 0 && (
                  <span className="ml-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full leading-none">
                    {unsubmittedCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── 챕터 탭 ── */}
        {activeTab === 'chapters' && (
        <div>

          {chapters.length === 0 ? (
            <div
              onClick={isTeacher ? () => setShowCreateModal(true) : undefined}
              className={`border-2 border-dashed border-gray-300 rounded-xl h-40 flex flex-col items-center justify-center text-gray-400 text-sm gap-2 ${
                isTeacher ? 'cursor-pointer hover:border-blue-300 hover:text-blue-400 transition-colors' : ''
              }`}
            >
              {isTeacher
                ? <><Plus className="h-8 w-8" /><span>새 챕터 추가</span></>
                : <span>등록된 챕터가 없습니다.</span>}
            </div>
          ) : isTeacher ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={chapters.map((c) => c.id)}
                strategy={rectSortingStrategy}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {chapters.map((ch) => (
                    <SortableChapterCard
                      key={ch.id}
                      ch={ch}
                      isTeacher={true}
                      onDelete={setDeleteTarget}
                      onCardClick={handleCardClick}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {chapters.map((ch) => (
                <SortableChapterCard
                  key={ch.id}
                  ch={ch}
                  isTeacher={false}
                  onDelete={() => {}}
                  onCardClick={handleCardClick}
                  onDownloadPdf={handleDownloadStudentChapterPdf}
                  downloadingId={downloadingChapterId}
                />
              ))}
            </div>
          )}
        </div>
        )}

        {/* ── 게시판 탭 ── */}
        {activeTab === 'board' && (
          <Suspense fallback={<p className="text-gray-400 text-sm">로딩 중...</p>}>
            <BoardTab classroomId={id} isTeacher={isTeacher} />
          </Suspense>
        )}

        {/* ── 과제 탭 ── */}
        {activeTab === 'assignments' && (
          <Suspense fallback={<p className="text-gray-400 text-sm">로딩 중...</p>}>
            <AssignmentTab
              classroomId={id}
              isTeacher={isTeacher}
              onUnsubmittedCount={!isTeacher ? setUnsubmittedCount : undefined}
            />
          </Suspense>
        )}

        {/* ── 학생 탭 ── */}
        {activeTab === 'students' && (
          <div>
            {members.length === 0 ? (
              <div className="border-2 border-dashed border-gray-200 rounded-xl h-40 flex flex-col items-center justify-center text-gray-400 text-sm gap-2">
                <Users className="h-8 w-8" />
                <span>아직 참여한 학생이 없습니다.</span>
              </div>
            ) : (
              <div className="space-y-2">
                {members.map((m) => (
                  <div key={m.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 flex items-center gap-3">
                    {m.student?.avatarUrl ? (
                      <img src={m.student.avatarUrl} alt={m.student.name}
                        className="h-9 w-9 rounded-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="h-9 w-9 rounded-full bg-gray-200 flex items-center justify-center text-sm text-gray-500 font-medium">
                        {m.student?.name?.charAt(0)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{m.student?.name}</p>
                      <p className="text-xs text-gray-400 truncate">{m.student?.email}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 모달: 새 챕터 ── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold text-gray-900 mb-4">새 챕터</h2>

            {/* 탭 */}
            <div className="flex border-b mb-4">
              {[['new', '직접 만들기'], ['import', '가져오기']].map(([tab, label]) => (
                <button key={tab} type="button" onClick={() => setCreateTab(tab)}
                  className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors cursor-pointer ${
                    createTab === tab
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}>
                  {label}
                </button>
              ))}
            </div>

            {/* 직접 만들기 */}
            {createTab === 'new' && (
              <form onSubmit={handleCreateChapter} className="flex flex-col">
                <input autoFocus type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="챕터 제목"
                  className="w-full px-4 py-2 border border-gray-300 rounded-md mb-3 focus:ring-blue-500 focus:border-blue-500" />
                <textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="설명 (선택)" rows={2}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md mb-4 focus:ring-blue-500 focus:border-blue-500 resize-none whitespace-normal break-keep" />
                <div className="flex justify-end gap-3 mt-auto">
                  <button type="button" onClick={closeCreateModal} title="취소"
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md cursor-pointer flex items-center justify-center"><X className="h-5 w-5" /></button>
                  <button type="submit" disabled={creating || !newTitle.trim()} title={creating ? '생성 중...' : '만들기'}
                    className="p-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 cursor-pointer flex items-center justify-center">
                    {creating ? <Loader className="animate-spin h-5 w-5" /> : <Plus className="h-5 w-5" />}
                  </button>
                </div>
              </form>
            )}

            {/* 가져오기 */}
            {createTab === 'import' && (
              <div>
                {importClassrooms.length === 0 ? (
                  <p className="text-sm text-gray-400 py-6 text-center">가져올 수 있는 다른 클래스가 없습니다.</p>
                ) : (
                  <>
                    <div className="mb-3">
                      <label className="block text-xs font-medium text-gray-500 mb-1">클래스 선택</label>
                      <select value={importSrcCid}
                        onChange={(e) => handleImportClassroomChange(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500">
                        <option value="">-- 클래스를 선택하세요 --</option>
                        {importClassrooms.map((cls) => (
                          <option key={cls.id} value={cls.id}>{cls.name}</option>
                        ))}
                      </select>
                    </div>

                    {importSrcCid && (
                      <div className="mb-4">
                        <label className="block text-xs font-medium text-gray-500 mb-1">챕터 선택</label>
                        {importChapters.length === 0 ? (
                          <p className="text-sm text-gray-400 py-2">이 클래스에 챕터가 없습니다.</p>
                        ) : (
                          <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-md divide-y">
                            {importChapters.map((ch) => (
                              <button key={ch.id} type="button"
                                onClick={() => setImportSelectedChid(ch.id)}
                                className={`w-full text-left px-3 py-2.5 text-sm transition-colors cursor-pointer ${
                                  importSelectedChid === ch.id
                                    ? 'bg-blue-50 text-blue-700 font-medium'
                                    : 'hover:bg-gray-50 text-gray-700'
                                }`}>
                                {ch.title}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                <div className="flex justify-end gap-3 mt-2">
                  <button type="button" onClick={closeCreateModal} title="취소"
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md cursor-pointer flex items-center justify-center"><X className="h-5 w-5" /></button>
                  <button type="button" onClick={handleImportChapter}
                    disabled={!importSelectedChid || importing} title={importing ? '가져오는 중...' : '가져오기'}
                    className="p-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 cursor-pointer flex items-center justify-center">
                    {importing ? <Loader className="animate-spin h-5 w-5" /> : <Download className="h-5 w-5" />}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 모달: 챕터 삭제 확인 ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-2">챕터 삭제</h2>
            <p className="text-sm text-gray-600 mb-6 whitespace-normal break-keep">
              <span className="font-medium text-gray-900">{deleteTarget.title}</span>을(를) 삭제하면
              해당 챕터의 모든 페이지·학생 필기·교사 필기가 영구 삭제됩니다. 계속하시겠습니까?
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)} disabled={deleting} title="취소"
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md cursor-pointer flex items-center justify-center disabled:opacity-50"><X className="h-5 w-5" /></button>
              <button onClick={handleDeleteChapter} disabled={deleting} title={deleting ? '삭제 중...' : '삭제'}
                className="p-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 cursor-pointer flex items-center justify-center">
                {deleting ? <Loader className="animate-spin h-5 w-5" /> : <Trash2 className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 모달: 클래스룸 삭제 확인 ── */}
      {showDeleteClassroom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-2">클래스룸 삭제</h2>
            <p className="text-sm text-gray-600 mb-6 whitespace-normal break-keep">
              <span className="font-medium text-gray-900">{classroom.name}</span>을(를) 삭제하면
              모든 챕터·페이지·학생 필기·교사 필기·멤버 정보가 영구 삭제됩니다. 계속하시겠습니까?
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowDeleteClassroom(false)} disabled={deleting} title="취소"
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md cursor-pointer flex items-center justify-center disabled:opacity-50"><X className="h-5 w-5" /></button>
              <button onClick={handleDeleteClassroom} disabled={deleting} title={deleting ? '삭제 중...' : '삭제'}
                className="p-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 cursor-pointer flex items-center justify-center">
                {deleting ? <Loader className="animate-spin h-5 w-5" /> : <Trash2 className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ClassroomDetail;
