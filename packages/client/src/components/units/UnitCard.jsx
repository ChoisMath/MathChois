import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { BookOpen, Clapperboard, EyeOff, GripVertical, Library, Pencil, Trash2 } from 'lucide-react';
import IconButton from '../common/IconButton';

/** 이 탭의 개수 문구: `챕터 3개` / `영상 3개` */
function countLabel(tab, n) {
  return `${tab === 'chapters' ? '챕터' : '영상'} ${n}개`;
}

/** 카드 본문. 정렬 여부와 상관없이 같은 모양 — 정렬 카드는 SortableUnitCard 가 ref·style·손잡이를 넘긴다. */
function UnitCardView({
  unit, tab, isTeacher, count, cover, onOpen, onEdit, onDelete,
  rootRef, style, handle,
}) {
  // 그림을 못 불러오면 빈 그림 아이콘으로 — 주소가 바뀌면 다시 시도한다
  const [failedSrc, setFailedSrc] = useState(null);
  const showCover = cover && failedSrc !== cover;
  const CountIcon = tab === 'chapters' ? BookOpen : Clapperboard;
  const label = countLabel(tab, count);
  const showActions = isTeacher && (handle || onEdit || onDelete);

  return (
    <div ref={rootRef} style={style} className={`relative flex flex-col pt-2.5 ${unit.isHidden ? 'opacity-60' : ''}`}>
      {/* 겹친 카드 — 재생목록처럼 뒤에 두 장이 위로 살짝 보인다(가로로 넘치지 않게 좁혀서) */}
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-12 rounded-xl border border-gray-300 bg-gray-200 scale-x-[0.9]" />
      <span aria-hidden="true" className="absolute inset-x-0 top-[5px] h-12 rounded-xl border border-gray-300 bg-gray-100 scale-x-[0.95]" />

      <div className="relative flex-1 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col transition-shadow hover:shadow-md">
        <button
          type="button"
          onClick={onOpen}
          aria-label={`${unit.title} · ${label}${unit.isHidden ? ' · 숨김' : ''}`}
          className="group/open flex flex-col flex-1 w-full text-left cursor-pointer rounded-t-xl focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-[#2453a6]"
        >
          <span className="relative block shrink-0 aspect-video w-full overflow-hidden bg-gray-100">
            {showCover ? (
              <img
                src={cover}
                alt=""
                loading="lazy"
                onError={() => setFailedSrc(cover)}
                className={`w-full h-full object-cover ${tab === 'chapters' ? 'object-top' : ''}`}
              />
            ) : (
              <span className="w-full h-full flex items-center justify-center">
                <Library className="h-10 w-10 text-gray-400" aria-hidden="true" />
              </span>
            )}
            {unit.isHidden && (
              <span className="absolute top-1.5 right-1.5 inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-black/75 text-white">
                <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />숨김
              </span>
            )}
          </span>
          <span className="p-3 flex flex-col gap-1 flex-1">
            <span className="font-medium text-gray-900 line-clamp-2 break-keep [overflow-wrap:anywhere] group-hover/open:text-blue-700">
              {unit.title}
            </span>
            {unit.description && (
              <span className="text-xs text-gray-500 line-clamp-2 break-keep [overflow-wrap:anywhere]">{unit.description}</span>
            )}
            <span className="mt-auto pt-1 inline-flex items-center gap-1 text-xs text-gray-500">
              <CountIcon className="h-3.5 w-3.5" aria-hidden="true" />{label}
            </span>
          </span>
        </button>

        {/* 교사 버튼: 터치 기기에서도 늘 보이도록 마우스 올림에 기대지 않는다 */}
        {showActions && (
          <div className="flex items-center gap-0.5 px-1 pb-1 -mt-1">
            {handle}
            <span className="flex-1" />
            {onEdit && <IconButton icon={Pencil} label="단원 수정" size="sm" onClick={onEdit} />}
            {onDelete && <IconButton icon={Trash2} label="단원 삭제" variant="danger" size="sm" onClick={onDelete} />}
          </div>
        )}
      </div>
    </div>
  );
}

function SortableUnitCard(props) {
  const {
    attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging,
  } = useSortable({ id: props.unit.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
    zIndex: isDragging ? 10 : undefined,
  };
  const handle = (
    <IconButton
      ref={setActivatorNodeRef}
      icon={GripVertical}
      label="드래그하여 순서 변경"
      size="sm"
      className="touch-none cursor-grab active:cursor-grabbing"
      {...attributes}
      {...listeners}
    />
  );
  return <UnitCardView {...props} rootRef={setNodeRef} style={style} handle={handle} />;
}

/**
 * 단원 카드(재생목록 모양). 그림·이름·설명 두 줄·이 탭의 개수. 교사: 숨김 배지(흐리게), 수정·삭제, (sortable) 손잡이.
 *
 * @param {object} props
 * @param {{ id: string, title: string, description?: string|null, isHidden?: boolean }} props.unit
 * @param {'chapters'|'videos'} props.tab
 * @param {boolean} props.isTeacher
 * @param {number} props.count 이 탭의 항목 수
 * @param {string|null} props.cover 그림 주소 — 없으면 `Library` 아이콘
 * @param {boolean} [props.sortable] dnd-kit SortableContext 안에서 손잡이로 순서를 바꾼다
 * @param {() => void} props.onOpen
 * @param {() => void} [props.onEdit]
 * @param {() => void} [props.onDelete]
 */
export default function UnitCard({ sortable = false, ...props }) {
  return sortable ? <SortableUnitCard {...props} /> : <UnitCardView {...props} />;
}
