import { LayoutTemplate, Maximize2, Lock, Users, PenLine } from 'lucide-react';
import BackgroundColorPicker from './BackgroundColorPicker';

/**
 * 캔버스 위 자체 바 — 바탕색, 템플릿 삽입, 화면 맞춤, 잠금 배지, 접속자, (교사) 작성자.
 * 좌측 `left`, 우측 `right` 슬롯은 페이지가 채운다 (나가기, 모둠 드롭다운 등).
 */
export default function WhiteboardTopBar({
  left, right,
  backgroundColor, onBackgroundChange,
  onInsertTemplate, onFit,
  readOnly, locked, lockedAll,
  users = [], authorName = null, showAuthor = false,
}) {
  const lockText = lockedAll ? '전체 잠금' : locked ? '편집 잠금' : null;
  return (
    <div className="flex items-center gap-2 px-2 h-12 bg-white border-b shadow-sm shrink-0 overflow-x-auto hidden-scroll">
      <div className="flex items-center gap-2 shrink-0">{left}</div>
      <div className="flex items-center gap-1.5 shrink-0">
        <BackgroundColorPicker value={backgroundColor} onChange={onBackgroundChange} disabled={readOnly} />
        <button
          type="button" onClick={onInsertTemplate} disabled={readOnly} title="템플릿 삽입"
          className="inline-flex items-center gap-1 px-2 min-h-9 rounded-md border bg-white hover:bg-gray-50 disabled:opacity-40 cursor-pointer text-sm whitespace-nowrap"
        >
          <LayoutTemplate className="h-4 w-4" /> 템플릿
        </button>
        <button
          type="button" onClick={onFit} title="발표 영역에 맞추기"
          className="inline-flex items-center gap-1 px-2 min-h-9 rounded-md border bg-white hover:bg-gray-50 cursor-pointer text-sm whitespace-nowrap"
        >
          <Maximize2 className="h-4 w-4" /> 화면 맞춤
        </button>
      </div>
      {lockText && (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-medium shrink-0">
          <Lock className="h-3.5 w-3.5" /> {lockText}
        </span>
      )}
      {readOnly && !lockText && (
        <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-600 text-xs shrink-0">읽기 전용</span>
      )}
      {showAuthor && (
        <span className="inline-flex items-center gap-1 text-xs text-gray-500 shrink-0">
          <PenLine className="h-3.5 w-3.5" /> {authorName ? `작성: ${authorName}` : '요소를 선택하면 작성자 표시'}
        </span>
      )}
      <div className="flex-1" />
      {users.length > 0 && (
        <div className="flex items-center gap-1 shrink-0" title={users.map((u) => u.name).join(', ')}>
          <Users className="h-4 w-4 text-gray-500" />
          <div className="flex -space-x-1.5">
            {users.slice(0, 5).map((u) => (
              <span
                key={u.socketId}
                className={`h-6 w-6 rounded-full border-2 border-white text-[10px] flex items-center justify-center font-medium ${u.role === 'teacher' ? 'bg-indigo-500 text-white' : 'bg-emerald-500 text-white'}`}
              >
                {(u.name || '?').charAt(0)}
              </span>
            ))}
          </div>
          {users.length > 5 && <span className="text-xs text-gray-500">+{users.length - 5}</span>}
          <span className="text-xs text-gray-500 ml-1">{users.length}명</span>
        </div>
      )}
      <div className="flex items-center gap-2 shrink-0">{right}</div>
    </div>
  );
}
