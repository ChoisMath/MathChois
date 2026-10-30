import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  FileText, Plus, Edit2, Trash2, GripVertical, Loader, X, Download, ListPlus,
} from 'lucide-react';
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
import { PdfDownloadButton } from '../common/PdfDownloadButton';
import IconButton from '../common/IconButton';
import SortOrderSelect from '../common/SortOrderSelect';
import { useSortOrder } from '../../hooks/useSortOrder';
import { sortItems, isManualOrder } from '../../lib/sortOrder';
import { CARD_GRID } from '../../lib/layout';
import { invalidatePagesCache } from '../../lib/dataCache';
import { addItemsToUnit } from '../../lib/units';
import { groupByUnit, hasSameChapterTitle } from '@mathchois/shared';
import UnitBrowser from '../units/UnitBrowser';
import UnitSelect from '../units/UnitSelect';
import UnitItemPickerModal from '../units/UnitItemPickerModal';

/** 단원 카드 그림: 챕터 첫 페이지 그림 */
const chapterCover = (ch) => ch.pages?.[0]?.imageUrl ?? null;

/* ─── 정렬 가능한 챕터 카드 ─── */
function SortableChapterCard({ ch, isTeacher, sortable = isTeacher, units = [], onUnitChange, onDelete, onCardClick, onDownloadPdf, downloadingId }) {
  const {
    attributes, listeners, setNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id: ch.id, disabled: !sortable });

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
        {/* 드래그 핸들 (교사 전용, 교사 지정순에서만) */}
        {sortable && (
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

        <p className="font-semibold text-gray-900 leading-snug flex-1">
          {ch.title}
          {ch.sourceChapterId && (
            <span className="ml-1.5 inline-block px-1.5 py-0.5 text-[10px] font-medium rounded bg-purple-100 text-purple-700 align-middle">
              공유
            </span>
          )}
        </p>

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

      {/* 단원 선택 (교사 전용, 단원이 있는 학급만) */}
      {isTeacher && units.length > 0 && onUnitChange && (
        <UnitSelect units={units} value={ch.unitId ?? null} onChange={(unitId) => onUnitChange(ch, unitId)} />
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

/**
 * 챕터 탭: 챕터 목록·정렬·드래그·생성(직접/가져오기)·삭제·학생 PDF + 단원 재생목록 화면(UnitBrowser).
 *
 * @param {object} props
 * @param {string} props.classroomId
 * @param {boolean} props.isTeacher
 * @param {object[]|null} props.units 학급 단원 목록(null = 아직 불러오는 중)
 * @param {string|null} props.unitParam 주소의 unit 값
 * @param {(next: string|null) => void} props.onUnitParamChange
 * @param {() => void} props.onUnitsChanged 단원 목록(개수 포함)을 다시 읽게 한다
 */
export default function ChapterTab({ classroomId, isTeacher, units, unitParam, onUnitParamChange, onUnitsChanged }) {
  const id = classroomId;
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const [chapters, setChapters]     = useState([]);
  const [loading, setLoading]       = useState(true);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createTab, setCreateTab]   = useState('new'); // 'new' | 'import'
  const [newTitle, setNewTitle]     = useState('');
  const [newDesc, setNewDesc]       = useState('');
  const [creating, setCreating]     = useState(false);
  const [createUnitId, setCreateUnitId] = useState(null); // 새 챕터·가져온 챕터가 들어갈 단원(null = 미분류)

  /* 기존 항목 가져오기(미분류 챕터 → 지금 단원) */
  const [pickerUnit, setPickerUnit] = useState(null);

  /* 가져오기 */
  const [importClassrooms, setImportClassrooms]   = useState([]);
  const [importSrcCid, setImportSrcCid]           = useState('');
  const [importChapters, setImportChapters]       = useState([]);
  const [importSelectedChid, setImportSelectedChid] = useState('');
  const [importing, setImporting]                 = useState(false);

  /* 챕터 정렬 순서(최신순/등록순/교사 지정순) — 사용자별 localStorage 유지. 드래그 정렬은 교사 지정순에서만 */
  const [chapterSort, setChapterSort] = useSortOrder('chapters', user?.id);
  const sortedChapters = useMemo(() => sortItems(chapters, chapterSort), [chapters, chapterSort]);
  const canReorder = isTeacher && isManualOrder(chapterSort);
  /* 피커에 보일 미분류 챕터 — 열려 있는 동안 목록이 바뀌어도 지금 것으로 */
  const unassignedChapters = useMemo(
    () => groupByUnit(units ?? [], sortedChapters).unassigned,
    [units, sortedChapters],
  );

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting]     = useState(false);

  /* PDF 다운로드 */
  const { downloadMultiplePages } = usePdfDownloader();
  const [downloadingChapterId, setDownloadingChapterId] = useState(null);

  /* ── dnd-kit sensors ── */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /* ── 데이터 로드 ── */
  const fetchChapters = async () => {
    try {
      const chaps = await api.get(`/api/classrooms/${id}/chapters`);
      setChapters(
        (chaps || []).map((ch) => ({
          ...ch,
          pageCount: ch.pages?.length || 0,
          firstPage: ch.pages?.sort((a, b) => a.position - b.position)[0] || null,
        }))
      );
    } catch (err) {
      console.error('[ChapterTab] 챕터 로드 오류:', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    const timer = setTimeout(fetchChapters, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  /* 다른 탭/앱에서 돌아오면 다시 읽는다 — 그 사이 교사가 단원을 숨겼을 수 있다(영상 탭과 같은 방식) */
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') fetchChapters(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
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
      .catch((err) => console.error('[ChapterTab] 가져오기 클래스 목록 오류:', err));
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
      console.error('[ChapterTab] 챕터 목록 로드 오류:', err);
      setImportChapters([]);
    }
  };

  /* ── 가져오기 실행 ── */
  const handleImportChapter = async () => {
    if (!importSelectedChid) return;
    setImporting(true);
    try {
      await api.post(`/api/chapters/${importSelectedChid}/import`, { targetClassroomId: id, unitId: createUnitId });
      closeCreateModal();
      fetchChapters();
    } catch (err) {
      console.error('[ChapterTab] 챕터 가져오기 오류:', err);
      window.alert(err?.message || '챕터를 가져오지 못했습니다.');
      if (err?.status === 409) { setImportSelectedChid(''); fetchChapters(); } // 다른 기기에서 같은 이름을 먼저 넣었다
      else onUnitsChanged(); // 단원이 다른 기기에서 지워졌을 수 있다
    }
    setImporting(false);
  };

  const handleCreateChapter = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      /* position 은 서버가 정한다 — 새 챕터는 맨 앞(0)에 들어가고 기존 챕터는 뒤로 밀린다 */
      await api.post(`/api/classrooms/${id}/chapters`, {
        title:       newTitle.trim(),
        description: newDesc.trim() || null,
        unitId:      createUnitId,
      });
      setNewTitle(''); setNewDesc(''); setShowCreateModal(false); fetchChapters();
    } catch (err) {
      console.error('[ChapterTab] 챕터 생성 오류:', err);
      window.alert(err?.message || '챕터를 만들지 못했습니다.');
      onUnitsChanged(); // 단원이 다른 기기에서 지워졌을 수 있다
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
      fetchChapters();
    } catch (err) {
      window.alert(err.message || '챕터 삭제에 실패했습니다.');
      console.error('[ChapterTab] 챕터 삭제 오류:', err);
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

  /* ── 챕터 순서 변경: 보이는 목록(단원 안이면 그 단원 챕터) 안에서만, 그 챕터들의 position 만 보낸다 ── */
  const handleDragEnd = async ({ active, over }, list) => {
    if (!canReorder || !over || active.id === over.id) return;
    const oldIdx = list.findIndex((c) => c.id === active.id);
    const newIdx = list.findIndex((c) => c.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const newOrder = arrayMove(list, oldIdx, newIdx).map((ch, i) => ({ id: ch.id, position: i }));
    const posById = new Map(newOrder.map((ch) => [ch.id, ch.position]));
    setChapters((prev) => prev.map((ch) => (posById.has(ch.id) ? { ...ch, position: posById.get(ch.id) } : ch))); // optimistic update
    try {
      await api.put('/api/chapters/reorder', { items: newOrder });
    } catch (err) {
      console.error('[ChapterTab] 순서 변경 오류:', err);
      fetchChapters();
    }
  };

  /* ── 교사: 카드의 단원 선택 — 먼저 옮겨 보이고, 실패하면 되돌린다 ── */
  const handleUnitChange = async (ch, unitId) => {
    const prevUnitId = ch.unitId ?? null;
    if (prevUnitId === unitId) return;
    const setUnitOf = (value) => setChapters((prev) => prev.map((c) => (c.id === ch.id ? { ...c, unitId: value } : c)));
    setUnitOf(unitId);
    try {
      await api.patch(`/api/chapters/${ch.id}`, { unitId });
      invalidatePagesCache(ch.id); // 뷰어의 '나가기'가 새 단원으로 돌아가도록
      onUnitsChanged();
    } catch (err) {
      setUnitOf(prevUnitId);
      window.alert(err?.message || '단원을 바꾸지 못했습니다.');
    }
  };

  /* ── 교사: 기존 항목 가져오기(미분류 챕터 → 이 단원) ── */
  const handlePickChapters = async (ids) => {
    await addItemsToUnit(pickerUnit.id, { chapterIds: ids }); // 실패하면 창에 오류 문구
    setPickerUnit(null);
    await fetchChapters();
    onUnitsChanged();
  };

  const openCreateModal = (unitId) => {
    setCreateUnitId(unitId ?? null);
    setShowCreateModal(true);
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
          bg: pg,
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

  /* 단원 목록도 읽은 뒤에 그린다 — 그 전에 그리면 평면 격자·단원 목록이 잠깐 번갈아 보인다 */
  if (loading || units == null) return <p className="text-gray-500">로딩 중...</p>;

  /* 툴바: 단원 없음 → 목록 위 줄, 단원 안 → 단원 머리 오른쪽. 보일 것이 없으면 null */
  const renderToolbar = (ctx) => {
    const hasChapters = chapters.length > 0;
    if (!isTeacher && !hasChapters) return null;
    return (
      <>
        {isTeacher && hasChapters && !canReorder && (
          <span className="text-xs text-gray-400">드래그 정렬은 ‘교사 지정순’에서 가능합니다</span>
        )}
        {hasChapters && (
          <SortOrderSelect value={chapterSort} onChange={setChapterSort} />
        )}
        {isTeacher && ctx.unitId && (
          <IconButton icon={ListPlus} label="기존 항목 가져오기" onClick={() => setPickerUnit(ctx.unit)} />
        )}
        {isTeacher && (
          <IconButton icon={Plus} label="새 챕터" variant="primary" onClick={() => openCreateModal(ctx.unitId)} />
        )}
      </>
    );
  };

  /* 챕터 격자 — list 는 보이는 챕터(단원 안이면 그 단원 것만), 정렬 순서 유지 */
  const renderChapters = (list) => (
    list.length === 0 ? (
      <div
        onClick={isTeacher ? () => openCreateModal(null) : undefined}
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
        onDragEnd={(e) => handleDragEnd(e, list)}
      >
        <SortableContext
          items={list.map((c) => c.id)}
          strategy={rectSortingStrategy}
        >
          <div className={CARD_GRID}>
            {list.map((ch) => (
              <SortableChapterCard
                key={ch.id}
                ch={ch}
                isTeacher={true}
                sortable={canReorder}
                units={units}
                onUnitChange={handleUnitChange}
                onDelete={setDeleteTarget}
                onCardClick={handleCardClick}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    ) : (
      <div className={CARD_GRID}>
        {list.map((ch) => (
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
    )
  );

  return (
    <>
      <div>
        <UnitBrowser
          classroomId={id}
          tab="chapters"
          units={units}
          items={sortedChapters}
          isTeacher={isTeacher}
          unitParam={unitParam}
          onUnitParamChange={onUnitParamChange}
          coverOfItem={chapterCover}
          onUnitsChanged={onUnitsChanged}
          renderItems={renderChapters}
          toolbar={renderToolbar}
        />
      </div>

      {/* ── 모달: 기존 항목 가져오기 ── */}
      {pickerUnit && (
        <UnitItemPickerModal
          title={`${pickerUnit.title}에 챕터 가져오기`}
          items={unassignedChapters}
          renderLabel={(ch) => ch.title}
          onSubmit={handlePickChapters}
          onClose={() => setPickerUnit(null)}
        />
      )}

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
                            {importChapters.map((ch) => {
                              /* 이 클래스에 같은 이름이 이미 있으면 고를 수 없다 — 서버도 409 로 거절 */
                              const taken = hasSameChapterTitle(chapters, ch.title);
                              return (
                                <button key={ch.id} type="button" disabled={taken}
                                  onClick={() => setImportSelectedChid(ch.id)}
                                  className={`w-full text-left px-3 py-2.5 text-sm transition-colors flex items-center justify-between gap-2 ${
                                    taken
                                      ? 'text-gray-400 cursor-not-allowed'
                                      : importSelectedChid === ch.id
                                        ? 'bg-blue-50 text-blue-700 font-medium cursor-pointer'
                                        : 'hover:bg-gray-50 text-gray-700 cursor-pointer'
                                  }`}>
                                  <span className="truncate">{ch.title}</span>
                                  {taken && <span className="text-xs whitespace-nowrap shrink-0">이미 있음</span>}
                                </button>
                              );
                            })}
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
    </>
  );
}
