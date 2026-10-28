import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clapperboard, Plus, GripVertical, Trash2, MessageSquare, Pencil, Check, X, Eye, CheckCircle2, BookOpen, ListPlus } from 'lucide-react';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, rectSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  listClassroomVideos, addClassroomVideo, reorderClassroomVideos, removeClassroomVideo,
  updateClassroomVideo, formatDuration, getClassroomVideoProgress, progressPercent, getClassroomVideoUnread,
} from '../../lib/videos';
import VideoPickerModal from './VideoPickerModal';
import SortOrderSelect from '../common/SortOrderSelect';
import IconButton from '../common/IconButton';
import { useAuth } from '../../contexts/AuthContext';
import { useSortOrder } from '../../hooks/useSortOrder';
import { sortItems, isManualOrder } from '../../lib/sortOrder';
import { api } from '../../lib/api';
import { CARD_GRID } from '../../lib/layout';
import { addItemsToUnit } from '../../lib/units';
import { groupByUnit } from '@mathchois/shared';
import UnitBrowser from '../units/UnitBrowser';
import UnitSelect from '../units/UnitSelect';
import UnitItemPickerModal from '../units/UnitItemPickerModal';

/** 단원 카드 그림: 영상 썸네일 */
const videoCover = (cv) => cv.video.thumbnailUrl ?? null;

/** 연결된 필기 챕터 칩 (교사·학생 공통) */
function ChapterChip({ chapter }) {
  if (!chapter) return null;
  return (
    <span className="inline-flex items-center gap-1 max-w-full text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded px-2 py-0.5"
      title={`필기 챕터: ${chapter.title}`}>
      <BookOpen className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">필기 챕터 · {chapter.title}</span>
    </span>
  );
}

/* ─── 영상 카드 (교사: 드래그 정렬·메모·필기 챕터 연결·해제) — 드래그는 교사 지정순(sortable)에서만 ─── */
function VideoCard({ cv, isTeacher, sortable = isTeacher, progress, unread = 0, chapters = [], units = [], onOpen, onRemove, onSaveNote, onSaveChapter, onUnitChange }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cv.id, disabled: !sortable });
  const [editingNote, setEditingNote] = useState(false);
  const [note, setNote] = useState(cv.note ?? '');
  const v = cv.video;
  // 학생: 본인 시청률(길이를 모르면 바 숨김). 교사: 시청/완료 학생 수.
  const myPct = !isTeacher && progress ? progressPercent(progress.maxPositionSec, v.durationSec) : null;
  const showMyBar = !isTeacher && progress && (myPct != null || progress.completed);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style}
      className="group bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col select-none">
      <button type="button" onClick={() => onOpen(cv)} className="relative aspect-video bg-gray-900 w-full text-left cursor-pointer">
        {v.thumbnailUrl
          ? <img src={v.thumbnailUrl} alt="" className="w-full h-full object-cover" />
          : <span className="w-full h-full flex items-center justify-center"><Clapperboard className="h-10 w-10 text-gray-500" /></span>}
        {v.durationSec != null && (
          <span className="absolute bottom-1.5 right-1.5 text-[11px] px-1.5 py-0.5 rounded bg-black/75 text-white tabular-nums">
            {formatDuration(v.durationSec)}
          </span>
        )}
        {showMyBar && (
          <span className="absolute inset-x-0 bottom-0 h-1 bg-white/30" aria-label="내 시청률"
            title={progress.completed ? '시청 완료' : `${myPct}% 시청`}>
            <span className={`block h-full ${progress.completed ? 'bg-green-500' : 'bg-blue-500'}`}
              style={{ width: `${progress.completed ? 100 : myPct}%` }} />
          </span>
        )}
        {sortable && (
          <span {...attributes} {...listeners}
            onClick={(e) => e.stopPropagation()}
            className="absolute top-1.5 left-1.5 p-1 rounded bg-black/50 text-white opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing touch-none"
            title="드래그하여 순서 변경">
            <GripVertical className="h-4 w-4" />
          </span>
        )}
      </button>

      <div className="p-3 flex flex-col gap-1 flex-1">
        <button type="button" onClick={() => onOpen(cv)} className="text-left font-medium text-gray-900 line-clamp-2 cursor-pointer hover:text-blue-700">
          {v.title}
        </button>
        <p className="text-xs text-gray-500 truncate">
          {[v.subject, v.majorUnit, v.minorUnit].filter(Boolean).join(' · ') || '단원 미지정'}
        </p>

        {editingNote ? (
          <div className="flex items-start gap-1 mt-1">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
              className="flex-1 border rounded px-2 py-1 text-xs" placeholder="학급용 안내 메모" />
            <button onClick={async () => { await onSaveNote(cv, note.trim() || null); setEditingNote(false); }}
              className="p-1.5 rounded text-green-600 hover:bg-green-50" title="저장"><Check className="h-4 w-4" /></button>
            <button onClick={() => { setNote(cv.note ?? ''); setEditingNote(false); }}
              className="p-1.5 rounded text-gray-400 hover:bg-gray-100" title="취소"><X className="h-4 w-4" /></button>
          </div>
        ) : (
          cv.note && <p className="text-xs text-blue-700 bg-blue-50 rounded px-2 py-1 mt-1 whitespace-pre-wrap">{cv.note}</p>
        )}

        {/* 단원 선택 (교사 전용, 단원이 있는 학급만) — 필기 챕터 줄 위 */}
        {isTeacher && units.length > 0 && onUnitChange && (
          <UnitSelect units={units} value={cv.unitId ?? null} onChange={(unitId) => onUnitChange(cv, unitId)} />
        )}

        {/* 필기 챕터: 교사는 선택, 학생은 칩만. 학생은 영상 상세의 [2분할로 필기하며 보기] 로 이 챕터를 옆에 놓고 필기한다. */}
        {isTeacher ? (
          <label className="flex items-center gap-1.5 mt-1 text-xs text-gray-600">
            <BookOpen className="h-3.5 w-3.5 shrink-0 text-amber-700" />
            <span className="shrink-0">필기 챕터</span>
            <select
              value={cv.chapterId ?? ''}
              onChange={(e) => onSaveChapter(cv, e.target.value || null)}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 min-w-0 min-h-9 border border-gray-200 rounded px-1.5 text-xs bg-white truncate"
              title="학생이 2분할 화면에서 옆에 놓고 필기할 챕터"
            >
              <option value="">연결 없음</option>
              {chapters.map((ch) => (
                <option key={ch.id} value={ch.id}>{ch.title}</option>
              ))}
              {/* 삭제되지 않았지만 목록 로드에 실패한 경우에도 현재 값이 표시되도록 */}
              {cv.chapter && !chapters.some((ch) => ch.id === cv.chapter.id) && (
                <option value={cv.chapter.id}>{cv.chapter.title}</option>
              )}
            </select>
          </label>
        ) : (
          cv.chapter && <div className="mt-1"><ChapterChip chapter={cv.chapter} /></div>
        )}

        <div className="flex items-center gap-2 mt-auto pt-2 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1">
            <MessageSquare className="h-3.5 w-3.5" />{cv.commentCount ?? 0}
            {unread > 0 && (
              <span className="ml-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full leading-none"
                title={`새 댓글 ${unread}개`}>
                {unread}
              </span>
            )}
          </span>
          {isTeacher && progress && (
            <span className="inline-flex items-center gap-1 text-gray-500" title="시청한 학생 / 학급 총원 · 완료 학생">
              <Eye className="h-3.5 w-3.5" />시청 {progress.watchedCount}/{progress.totalStudents} · 완료 {progress.completedCount}
            </span>
          )}
          {!isTeacher && progress?.completed && (
            <span className="inline-flex items-center gap-0.5 text-green-700 font-medium"><CheckCircle2 className="h-3.5 w-3.5" />완료</span>
          )}
          <div className="flex-1" />
          {isTeacher && !editingNote && (
            <>
              <button onClick={() => setEditingNote(true)} className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50" title="안내 메모">
                <Pencil className="h-4 w-4" />
              </button>
              <button onClick={() => onRemove(cv)} className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50" title="학급에서 배정 해제">
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 학급 상세의 [영상] 탭 + 단원 재생목록 화면(UnitBrowser).
 * 교사: 라이브러리에서 영상을 골라 배정, 드래그 정렬, 메모, 배정 해제, 카드별 단원 선택. 학생: 시청 화면으로 이동.
 *
 * @param {object} props
 * @param {string} props.classroomId
 * @param {boolean} props.isTeacher
 * @param {object[]|null} props.units 학급 단원 목록(null = 아직 불러오는 중)
 * @param {string|null} props.unitParam 주소의 unit 값
 * @param {(next: string|null) => void} props.onUnitParamChange
 * @param {() => void} props.onUnitsChanged 단원 목록(개수 포함)을 다시 읽게 한다
 */
export default function ClassroomVideoTab({ classroomId, isTeacher, units, unitParam, onUnitParamChange, onUnitsChanged }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  /* 정렬 순서(최신순/등록순/교사 지정순) — 사용자별 localStorage 유지. 드래그 정렬은 교사 지정순에서만 */
  const [sortOrder, setSortOrder] = useSortOrder('videos', user?.id);
  const sortedItems = useMemo(() => sortItems(items, sortOrder), [items, sortOrder]);
  const canReorder = isTeacher && isManualOrder(sortOrder);
  const [progressMap, setProgressMap] = useState({}); // cvId → 학생: 본인 기록 / 교사: 집계
  const [unreadMap, setUnreadMap] = useState({});     // cvId → 미읽음 댓글 수
  const [chapters, setChapters] = useState([]);       // 교사: 필기 챕터 선택용 학급 챕터 목록
  const [loading, setLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [addUnitId, setAddUnitId] = useState(null);     // [+ 영상 추가]로 넣을 단원(null = 미분류)
  const [pickerUnit, setPickerUnit] = useState(null);   // 기존 항목 가져오기 대상 단원
  /* 기존 항목 가져오기에 보일 미분류 영상 */
  const unassignedItems = useMemo(
    () => groupByUnit(units ?? [], sortedItems).unassigned,
    [units, sortedItems],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const fetchList = useCallback(async () => {
    try {
      const [list, progress, unread] = await Promise.all([
        listClassroomVideos(classroomId),
        getClassroomVideoProgress(classroomId).catch(() => null), // 시청 기록은 보조 정보 — 실패해도 목록은 표시
        getClassroomVideoUnread(classroomId).catch(() => null),   // 미읽음 배지도 보조 정보
      ]);
      setItems(list);
      if (progress) setProgressMap(progress);
      if (unread?.byClassroomVideo) setUnreadMap(unread.byClassroomVideo);
    } catch { /* 유지 */ }
    finally { setLoading(false); }
  }, [classroomId]);

  useEffect(() => { setLoading(true); fetchList(); }, [fetchList]);

  /* 다른 탭/앱에서 돌아왔을 때 시청 기록·미읽음을 다시 읽는다(학생 시청은 소켓 이벤트가 없음) */
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') fetchList(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [fetchList]);

  /* 교사: 학급 챕터 목록(필기 챕터 선택지). 실패해도 영상 목록은 표시 — 보조 정보 */
  useEffect(() => {
    if (!isTeacher) return undefined;
    let alive = true;
    api.get(`/api/classrooms/${classroomId}/chapters`)
      .then((list) => { if (alive) setChapters([...(list || [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))); })
      .catch(() => { /* 유지 */ });
    return () => { alive = false; };
  }, [classroomId, isTeacher]);

  const openWatch = (cv) => {
    navigate(`/${isTeacher ? 'teacher' : 'student'}/classrooms/${classroomId}/videos/${cv.id}`);
  };

  /* 창은 닫지 않는다 — 여러 영상을 이어서 추가하고 교사가 X 로 닫는다. 목록을 다시 읽어 '배정됨' 표시 */
  const handleSelect = async (video) => {
    try {
      await addClassroomVideo(classroomId, video.id, undefined, addUnitId);
      await fetchList();
      if (addUnitId) onUnitsChanged();
    } catch (err) {
      alert(err.message ?? '배정에 실패했습니다.');
    }
  };

  const handleRemove = async (cv) => {
    if (!confirm(`"${cv.video.title}" 배정을 해제할까요? 이 학급의 댓글도 함께 삭제됩니다. (라이브러리 원본은 유지)`)) return;
    try {
      await removeClassroomVideo(cv.id);
      fetchList();
    } catch (err) {
      alert(err.message ?? '해제에 실패했습니다.');
    }
  };

  const handleSaveNote = async (cv, note) => {
    try {
      const updated = await updateClassroomVideo(cv.id, { note });
      setItems((prev) => prev.map((x) => (x.id === cv.id ? { ...x, note: updated?.note ?? note } : x)));
    } catch (err) {
      alert(err.message ?? '메모 저장에 실패했습니다.');
    }
  };

  const handleSaveChapter = async (cv, chapterId) => {
    try {
      const updated = await updateClassroomVideo(cv.id, { chapterId });
      setItems((prev) => prev.map((x) => (
        x.id === cv.id ? { ...x, chapterId: updated?.chapterId ?? chapterId, chapter: updated?.chapter ?? null } : x
      )));
    } catch (err) {
      alert(err.message ?? '필기 챕터 연결에 실패했습니다.');
    }
  };

  /* 교사: 카드의 단원 선택 — 먼저 옮겨 보이고, 실패하면 되돌린다 */
  const handleUnitChange = async (cv, unitId) => {
    const prevUnitId = cv.unitId ?? null;
    if (prevUnitId === unitId) return;
    const setUnitOf = (value) => setItems((prev) => prev.map((x) => (x.id === cv.id ? { ...x, unitId: value } : x)));
    setUnitOf(unitId);
    try {
      await updateClassroomVideo(cv.id, { unitId });
      onUnitsChanged();
    } catch (err) {
      setUnitOf(prevUnitId);
      alert(err?.message || '단원을 바꾸지 못했습니다.');
    }
  };

  /* 교사: 기존 항목 가져오기(미분류 영상 → 이 단원) */
  const handlePickVideos = async (ids) => {
    await addItemsToUnit(pickerUnit.id, { classroomVideoIds: ids }); // 실패하면 창에 오류 문구
    setPickerUnit(null);
    await fetchList();
    onUnitsChanged();
  };

  const openAddPicker = (unitId) => {
    setAddUnitId(unitId ?? null);
    setShowPicker(true);
  };

  /* 정렬: 보이는 목록(단원 안이면 그 단원 영상) 안에서만, 그 영상 id 만 보낸다 */
  const handleDragEnd = async ({ active, over }, list) => {
    if (!canReorder || !over || active.id === over.id) return;
    const oldIdx = list.findIndex((x) => x.id === active.id);
    const newIdx = list.findIndex((x) => x.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const ids = arrayMove(list, oldIdx, newIdx).map((x) => x.id);
    const posById = new Map(ids.map((xid, i) => [xid, i]));
    setItems((prev) => prev.map((x) => (posById.has(x.id) ? { ...x, position: posById.get(x.id) } : x)));
    try {
      await reorderClassroomVideos(classroomId, ids);
    } catch {
      fetchList();
    }
  };

  /* 툴바: 단원 없음 → 목록 위 줄, 단원 안 → 단원 머리 오른쪽. 보일 것이 없으면 null */
  const renderToolbar = (ctx) => {
    const hasItems = items.length > 0;
    if (!isTeacher && !hasItems) return null;
    return (
      <>
        {isTeacher && hasItems && !canReorder && (
          <span className="text-xs text-gray-400">드래그 정렬은 ‘교사 지정순’에서 가능합니다</span>
        )}
        {hasItems && <SortOrderSelect value={sortOrder} onChange={setSortOrder} />}
        {isTeacher && ctx.unitId && (
          <IconButton icon={ListPlus} label="기존 항목 가져오기" onClick={() => setPickerUnit(ctx.unit)} />
        )}
        {isTeacher && (
          <IconButton icon={Plus} label="영상 추가" variant="primary" onClick={() => openAddPicker(ctx.unitId)} />
        )}
      </>
    );
  };

  /* 영상 격자 — list 는 보이는 영상(단원 안이면 그 단원 것만), 정렬 순서 유지 */
  const renderVideos = (list) => (
    list.length === 0 ? (
      <div
        onClick={isTeacher ? () => openAddPicker(null) : undefined}
        className={`border-2 border-dashed border-gray-300 rounded-xl h-40 flex flex-col items-center justify-center text-gray-400 text-sm gap-2 ${
          isTeacher ? 'cursor-pointer hover:border-blue-300 hover:text-blue-400 transition-colors' : ''}`}>
        <Clapperboard className="h-8 w-8" />
        <span>{isTeacher ? '영상자료에서 이 학급에 보여줄 영상을 추가하세요.' : '아직 등록된 영상이 없습니다.'}</span>
      </div>
    ) : (
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(e, list)}>
        <SortableContext items={list.map((x) => x.id)} strategy={rectSortingStrategy}>
          <div className={CARD_GRID}>
            {list.map((cv) => (
              <VideoCard key={cv.id} cv={cv} isTeacher={isTeacher} sortable={canReorder} progress={progressMap[cv.id]} unread={unreadMap[cv.id] ?? 0}
                chapters={chapters} units={units ?? []}
                onOpen={openWatch} onRemove={handleRemove} onSaveNote={handleSaveNote} onSaveChapter={handleSaveChapter}
                onUnitChange={handleUnitChange} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    )
  );

  return (
    <div>
      {/* 단원 목록도 읽은 뒤에 그린다 — 그 전에 그리면 평면 격자·단원 목록이 잠깐 번갈아 보인다 */}
      {loading || units == null ? (
        <p className="text-gray-400 text-sm">로딩 중...</p>
      ) : (
        <UnitBrowser
          classroomId={classroomId}
          tab="videos"
          units={units}
          items={sortedItems}
          isTeacher={isTeacher}
          unitParam={unitParam}
          onUnitParamChange={onUnitParamChange}
          coverOfItem={videoCover}
          onUnitsChanged={onUnitsChanged}
          renderItems={renderVideos}
          toolbar={renderToolbar}
        />
      )}

      {showPicker && (
        <VideoPickerModal
          multiple
          excludeIds={items.map((x) => x.videoId)}
          onSelect={handleSelect}
          onClose={() => setShowPicker(false)}
        />
      )}

      {pickerUnit && (
        <UnitItemPickerModal
          title={`${pickerUnit.title}에 영상 가져오기`}
          items={unassignedItems}
          renderLabel={(cv) => cv.video.title}
          onSubmit={handlePickVideos}
          onClose={() => setPickerUnit(null)}
        />
      )}
    </div>
  );
}
