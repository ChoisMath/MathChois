import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

/**
 * 가로선 가운데 ▼/▲ 버튼이 있는 접이식 섹션.
 * 영상 설명·시청 현황처럼 길어질 수 있는 내용을 접어 두어 댓글이 아래로 밀리지 않게 한다.
 * props: label(접힌 상태에서 버튼 옆에 보이는 짧은 안내), defaultOpen(기본 false), children
 */
export default function CollapsibleSection({ label, defaultOpen = false, className = '', children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="group w-full flex items-center gap-2 min-h-9 cursor-pointer select-none"
        title={open ? '접기' : '펼치기'}
      >
        <span className="flex-1 h-px bg-gray-200 group-hover:bg-gray-300" />
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-gray-200 bg-white text-xs text-gray-500 group-hover:text-gray-800 group-hover:border-gray-300">
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {label && <span>{label}</span>}
        </span>
        <span className="flex-1 h-px bg-gray-200 group-hover:bg-gray-300" />
      </button>
      {open && <div className="mt-1">{children}</div>}
    </div>
  );
}
