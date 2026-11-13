import { useDroppable } from '@dnd-kit/core';
import { Trash2 } from 'lucide-react';

/**
 * 모둠 방(또는 미배정 트레이) — 칩을 놓을 수 있는 자리.
 *
 * props:
 *  - id: 드롭 식별자(groupKey 또는 'unassigned')
 *  - title: 이름(트레이) — name/onRename 이 있으면 이름 입력 칸이 대신 나온다
 *  - count: 학생 수
 *  - variant: 'desk' | 'tray'
 *  - fallbackName: 이름을 비웠을 때 읽기 이름·안내문에 쓰는 이름(예: '3모둠')
 *  - readOnly, onRename(name), onRemove()
 */
export default function GroupDesk({
  id, title, name, fallbackName, count, children, variant = 'desk', readOnly = false, onRename, onRemove,
}) {
  const accessibleName = (title ?? name)?.trim() || fallbackName || '모둠';
  const { setNodeRef, isOver } = useDroppable({ id, data: { title: accessibleName } });
  const empty = count === 0;
  const classes = [
    variant === 'tray' ? 'tray' : 'desk',
    empty && 'desk--empty',
    isOver && 'desk--over',
  ].filter(Boolean).join(' ');

  return (
    <section ref={setNodeRef} className={classes} aria-label={accessibleName}>
      <header className="desk-head">
        {onRename && !readOnly ? (
          <input
            value={name} maxLength={30}
            onChange={(e) => onRename(e.target.value)}
            className="desk-name"
            placeholder={fallbackName}
            aria-label="모둠 이름"
          />
        ) : (
          <span className="desk-title">{title ?? name}</span>
        )}
        <span className="desk-count num">{variant === 'tray' ? count : `${count}명`}</span>
        {onRemove && !readOnly && (
          <button type="button" onClick={onRemove} title="모둠 삭제" aria-label="모둠 삭제" className="desk-remove">
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </header>
      <div className="desk-body">
        {empty ? <span className="desk-hint">{variant === 'tray' ? '모두 배정됨' : '여기로 끌어다 놓기'}</span> : children}
      </div>
    </section>
  );
}
