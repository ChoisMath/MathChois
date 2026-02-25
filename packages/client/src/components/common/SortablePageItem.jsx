import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Trash2, GripVertical } from 'lucide-react';

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
        className="absolute top-1 left-1 p-1 bg-black/40 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing z-10"
      >
        <GripVertical className="h-3 w-3" />
      </div>

      <img
        src={page.image_url}
        alt={`페이지 ${index + 1}`}
        className="w-full h-auto object-contain bg-white"
        draggable={false}
      />
      <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-xs text-center py-0.5">
        {index + 1}
      </div>
      <button
        type="button"
        className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer disabled:opacity-50 z-10"
        onClick={(e) => {
          e.stopPropagation();
          onDeletePage(page);
        }}
        disabled={isDeleting}
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
};

export default SortablePageItem;
