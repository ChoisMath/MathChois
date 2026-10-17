import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clapperboard, Plus, GripVertical, Trash2, MessageSquare, Pencil, Check, X, Eye, CheckCircle2 } from 'lucide-react';
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
import { useAuth } from '../../contexts/AuthContext';
import { useSortOrder } from '../../hooks/useSortOrder';
import { sortItems, isManualOrder } from '../../lib/sortOrder';

/* ─── 영상 카드 (교사: 드래그 정렬·메모·해제) ─── */
function VideoCard({ cv, isTeacher, sortable = isTeacher, progress, unread = 0, onOpen, onRemove, onSaveNote }) {
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
 * 학급 상세의 [영상] 탭.
 * 교사: 라이브러리에서 영상을 골라 배정, 드래그 정렬, 메모, 배정 해제. 학생: 시청 화면으로 이동.
 */
export default function ClassroomVideoTab({ classroomId, isTeacher }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  /* 정렬 순서(최신순/등록순/교사 지정순) — 사용자별 localStorage 유지. 드래그 정렬은 교사 지정순에서만 */
  const [sortOrder, setSortOrder] = useSortOrder('videos', user?.id);
  const sortedItems = useMemo(() => sortItems(items, sortOrder), [items, sortOrder]);
  const canReorder = isTeacher && isManualOrder(sortOrder);
  const [progressMap, setProgressMap] = useState({}); // cvId → 학생: 본인 기록 / 교사: 집계
  const [unreadMap, setUnreadMap] = useState({});     // cvId → 미읽음 댓글 수
  const [loading, setLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(false);

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

  const openWatch = (cv) => {
    navigate(`/${isTeacher ? 'teacher' : 'student'}/classrooms/${classroomId}/videos/${cv.id}`);
  };

  const handleSelect = async (video) => {
    try {
      await addClassroomVideo(classroomId, video.id);
      setShowPicker(false);
      fetchList();
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

  const handleDragEnd = async ({ active, over }) => {
    if (!canReorder || !over || active.id === over.id) return;
    const oldIdx = sortedItems.findIndex((x) => x.id === active.id);
    const newIdx = sortedItems.findIndex((x) => x.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const next = arrayMove(sortedItems, oldIdx, newIdx).map((x, i) => ({ ...x, position: i }));
    setItems(next);
    try {
      await reorderClassroomVideos(classroomId, next.map((x) => x.id));
    } catch {
      fetchList();
    }
  };

  return (
    <div>
      {(isTeacher || items.length > 0) && (
        <div className="flex items-center justify-end gap-3 mb-3 flex-wrap">
          {isTeacher && items.length > 0 && !canReorder && (
            <span className="text-xs text-gray-400">드래그 정렬은 ‘교사 지정순’에서 가능합니다</span>
          )}
          {items.length > 0 && <SortOrderSelect value={sortOrder} onChange={setSortOrder} />}
          {isTeacher && (
            <button onClick={() => setShowPicker(true)}
              className="inline-flex items-center gap-1.5 px-3 min-h-11 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 cursor-pointer">
              <Plus className="h-4 w-4" /> 영상 추가
            </button>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-gray-400 text-sm">로딩 중...</p>
      ) : items.length === 0 ? (
        <div
          onClick={isTeacher ? () => setShowPicker(true) : undefined}
          className={`border-2 border-dashed border-gray-300 rounded-xl h-40 flex flex-col items-center justify-center text-gray-400 text-sm gap-2 ${
            isTeacher ? 'cursor-pointer hover:border-blue-300 hover:text-blue-400 transition-colors' : ''}`}>
          <Clapperboard className="h-8 w-8" />
          <span>{isTeacher ? '영상자료에서 이 학급에 보여줄 영상을 추가하세요.' : '아직 등록된 영상이 없습니다.'}</span>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sortedItems.map((x) => x.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {sortedItems.map((cv) => (
                <VideoCard key={cv.id} cv={cv} isTeacher={isTeacher} sortable={canReorder} progress={progressMap[cv.id]} unread={unreadMap[cv.id] ?? 0}
                  onOpen={openWatch} onRemove={handleRemove} onSaveNote={handleSaveNote} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {showPicker && (
        <VideoPickerModal
          excludeIds={items.map((x) => x.videoId)}
          onSelect={handleSelect}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
