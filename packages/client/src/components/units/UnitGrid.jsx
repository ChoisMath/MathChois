import { FolderPlus } from 'lucide-react';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, rectSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { UNASSIGNED } from '@mathchois/shared';
import UnitCard from './UnitCard';
import { CARD_GRID } from '../../lib/layout';

/** 교사: [+ 새 단원] 카드 — 카드라서 글자를 남긴다 */
function NewUnitCard({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col pt-2.5 rounded-xl cursor-pointer text-gray-400 hover:text-blue-500 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#2453a6] group"
    >
      <span className="flex-1 min-h-40 w-full border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center gap-2 text-sm transition-colors group-hover:border-blue-300">
        <FolderPlus className="h-8 w-8" aria-hidden="true" />
        <span>새 단원</span>
      </span>
    </button>
  );
}

/**
 * 단원 목록 화면: 단원 카드 + (미분류 항목이 있으면) 미분류 카드 + (교사) 새 단원 카드.
 * 교사는 단원 카드의 손잡이로 순서를 바꾼다(미분류·새 단원 카드는 정렬 대상이 아니다).
 *
 * @param {object} props
 * @param {object[]} props.units 화면에 보일 단원(position 순)
 * @param {'chapters'|'videos'} props.tab
 * @param {boolean} props.isTeacher
 * @param {(unit: object) => number} props.countOf
 * @param {(unit: object) => string|null} props.coverOf
 * @param {number} props.unassignedCount
 * @param {string|null} [props.unassignedCover]
 * @param {(unitIdOrNone: string) => void} props.onOpen 단원 id 또는 UNASSIGNED('none')
 * @param {() => void} [props.onCreate]
 * @param {(unit: object) => void} [props.onEdit]
 * @param {(unit: object) => void} [props.onDelete]
 * @param {(ids: string[]) => void} [props.onReorder] 바뀐 전체 순서
 */
export default function UnitGrid({
  units, tab, isTeacher, countOf, coverOf,
  unassignedCount = 0, unassignedCover = null,
  onOpen, onCreate, onEdit, onDelete, onReorder,
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const canSort = isTeacher && !!onReorder && units.length > 1;
  const ids = units.map((u) => u.id);

  const handleDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(active.id);
    const to = ids.indexOf(over.id);
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(ids, from, to));
  };

  const unassignedUnit = { id: UNASSIGNED, title: isTeacher ? '미분류' : '기타 자료', description: null, isHidden: false };

  const grid = (
    <div className={CARD_GRID}>
      {units.map((unit) => (
        <UnitCard
          key={unit.id}
          unit={unit}
          tab={tab}
          isTeacher={isTeacher}
          count={countOf(unit)}
          cover={coverOf(unit)}
          sortable={canSort}
          onOpen={() => onOpen(unit.id)}
          onEdit={isTeacher && onEdit ? () => onEdit(unit) : undefined}
          onDelete={isTeacher && onDelete ? () => onDelete(unit) : undefined}
        />
      ))}
      {unassignedCount > 0 && (
        <UnitCard
          unit={unassignedUnit}
          tab={tab}
          isTeacher={false}
          count={unassignedCount}
          cover={unassignedCover}
          onOpen={() => onOpen(UNASSIGNED)}
        />
      )}
      {isTeacher && onCreate && <NewUnitCard onClick={onCreate} />}
    </div>
  );

  if (!canSort) return grid;
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        {grid}
      </SortableContext>
    </DndContext>
  );
}
