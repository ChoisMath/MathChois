import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Trash2, GripVertical, Play, FileCode2, Sparkles, Presentation } from 'lucide-react';
import { PageVideoThumb } from '../videos/PageVideo';
import PageThumb from './PageThumb';

const SortablePageItem = ({ page, index, isSelected, onSelectPage, onDeletePage, isDeleting }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: page.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => onSelectPage(page)}
      className={`relative group rounded-md overflow-hidden cursor-pointer transition-colors ${
        isSelected ? 'border-4 border-blue-500' : 'border-4 border-transparent hover:border-gray-300'
      }`}
    >
      <div
        {...attributes}
        {...listeners}
        aria-label="순서 바꾸기 (끌어서 이동)"
        title="순서 바꾸기 (끌어서 이동)"
        className="absolute top-1 left-1 p-1 bg-black/40 text-white rounded opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity cursor-grab active:cursor-grabbing z-10"
      >
        <GripVertical className="h-3 w-3" />
      </div>

      {page.pageType === 'whiteboard' ? (
        <div className="relative flex items-center justify-center bg-indigo-50 aspect-video">
          <Presentation className="h-8 w-8 text-indigo-600" />
          <span className="absolute bottom-1 inset-x-0 text-center text-[10px] text-indigo-700 font-medium">화이트보드</span>
        </div>
      ) : page.htmlUrl ? (
        <div className="relative flex items-center justify-center bg-emerald-50 aspect-video">
          <FileCode2 className="h-8 w-8 text-emerald-600" />
          <span className="absolute bottom-1 inset-x-0 text-center text-[10px] text-emerald-700 font-medium">HTML 도구</span>
        </div>
      ) : page.videoUrl ? (
        <div className="relative">
          <PageVideoThumb
            videoUrl={page.videoUrl}
            alt={`영상 ${index + 1}`}
            className="w-full h-auto object-cover bg-gray-900"
            loading="lazy"
            draggable={false}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-red-600 rounded-full p-1.5">
              <Play className="h-4 w-4 text-white fill-white" />
            </div>
          </div>
        </div>
      ) : page.aiProblemId ? (
        <div className="relative flex items-center justify-center bg-emerald-50 aspect-video">
          <Sparkles className="h-8 w-8 text-emerald-600" />
          <span className="absolute bottom-1 inset-x-0 text-center text-[10px] text-emerald-700 font-medium">AI 코칭</span>
        </div>
      ) : (
        <PageThumb page={page} alt={`페이지 ${index + 1}`} className="w-full h-auto object-contain bg-white" />
      )}
      <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-xs text-center py-0.5">
        {index + 1}
      </div>
      <button
        type="button"
        aria-label="페이지 삭제"
        title="페이지 삭제"
        className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity cursor-pointer disabled:opacity-50 z-10"
        onClick={(e) => {
          e.stopPropagation();
          onDeletePage?.(page);
        }}
        disabled={isDeleting}
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
};

export default SortablePageItem;
