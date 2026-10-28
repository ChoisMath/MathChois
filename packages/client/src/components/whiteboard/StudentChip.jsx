import { useDraggable } from '@dnd-kit/core';

/** 칩의 겉모습 — 보드 안의 칩과 들고 있는 복제(DragOverlay)가 같이 쓴다 */
export function ChipFace({ name, lifted = false, className = '' }) {
  return (
    <span className={`chip ${lifted ? 'chip--lift' : ''} ${className}`.trim()}>{name}</span>
  );
}

/**
 * 학생 이름 칩 — 잡아서 방으로 옮긴다. id = studentId.
 * 키보드: Tab 으로 칩에 가서 Space → 화살표로 방 이동 → Space 로 놓기(안내문은 패널의 screenReaderInstructions).
 */
export default function StudentChip({ studentId, name, disabled = false }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: studentId,
    data: { name },
    disabled,
    attributes: { roleDescription: '학생 칩' },
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`chip-btn ${isDragging ? 'chip-btn--ghost' : ''}`.trim()}
      disabled={disabled}
      {...listeners}
      {...attributes}
    >
      <ChipFace name={name} />
    </button>
  );
}
