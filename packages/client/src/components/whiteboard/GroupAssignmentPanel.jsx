import { useState } from 'react';
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import { Plus, Shuffle } from 'lucide-react';
import IconButton from '../common/IconButton';
import GroupDesk from './GroupDesk';
import StudentChip, { ChipFace } from './StudentChip';
import {
  moveStudent, groupKey, unassignedStudents, resizeGroups, GROUP_COUNT_MIN, GROUP_COUNT_MAX,
} from '../../lib/groupAssign';
import { deskKeyboardCoordinates, deskCollision } from '../../lib/groupBoardKeyboard';

const TRAY_ID = 'unassigned';

const screenReaderInstructions = {
  draggable: '학생 칩입니다. Space 또는 Enter 로 들고, 화살표로 옮길 모둠을 고른 뒤, Space 또는 Enter 로 놓습니다. Esc 로 취소합니다.',
};
const nameOf = (x) => x?.data?.current?.name ?? x?.data?.current?.title ?? '';
const announcements = {
  onDragStart: ({ active }) => `${nameOf(active)} 칩을 들었습니다.`,
  onDragOver: ({ active, over }) => (over ? `${nameOf(active)} 칩이 ${nameOf(over)} 위에 있습니다.` : `${nameOf(active)} 칩이 방 밖에 있습니다.`),
  onDragEnd: ({ active, over }) => (over ? `${nameOf(active)} 칩을 ${nameOf(over)} 에 놓았습니다.` : '칩을 제자리에 두었습니다.'),
  onDragCancel: ({ active }) => `${nameOf(active)} 칩 이동을 취소했습니다.`,
};

/**
 * 모둠 배정 보드 — 학급 기본 모둠(학생 탭)과 화이트보드 페이지별 배정(교사 설정)에서 공용.
 * 위에 미배정 트레이, 아래 모둠 방. 칩을 잡아 방으로 옮긴다. 모둠 수를 바꾸면 방이 그 수만큼 된다.
 *
 * props:
 *  - members: { studentId, name, avatarUrl }[]
 *  - groups:  { id?, name, position, studentIds[] }[]   (controlled)
 *  - onChange(groups)
 *  - onAuto(count)            자동 배분 (서버 또는 로컬) — 없으면 버튼 숨김
 *  - readOnly
 *  - warnOnRemove             모둠 삭제(수 줄이기 포함) 시 경고 문구 (페이지별 배정: 보드 내용 삭제)
 */
export default function GroupAssignmentPanel({
  members, groups, onChange, onAuto, readOnly = false, warnOnRemove = null,
}) {
  const [countDraft, setCountDraft] = useState(null); // 입력 중인 글자(null = 지금 모둠 수를 그대로 보여 준다)
  const [activeId, setActiveId] = useState(null);
  const countInput = countDraft ?? String(groups.length || 4);

  const unassigned = unassignedStudents(members, groups);
  const byId = new Map(members.map((m) => [m.studentId, m]));
  const update = (next) => { if (!readOnly) onChange(next); };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: deskKeyboardCoordinates }),
  );

  /* ── 모둠 수: 유효한 수가 들어오는 즉시 방 개수를 맞춘다. 비우거나 범위 밖이면 blur 때 되돌린다 ── */
  const applyCount = (raw) => {
    const n = Number(raw);
    if (raw === '' || !Number.isInteger(n) || n < GROUP_COUNT_MIN || n > GROUP_COUNT_MAX) { setCountDraft(raw); return; }
    if (n < groups.length && warnOnRemove && groups.slice(n).some((g) => g.id) && !window.confirm(warnOnRemove)) {
      setCountDraft(null);
      return;
    }
    setCountDraft(null);
    const next = resizeGroups(groups, n);
    if (next !== groups) update(next);
  };
  const desiredCount = () => {
    const n = Number(countInput);
    return Number.isInteger(n) && n >= GROUP_COUNT_MIN && n <= GROUP_COUNT_MAX ? n : (groups.length || 4);
  };

  const handleAddGroup = () => update(resizeGroups(groups, groups.length + 1));
  const handleRemoveGroup = (g) => {
    if (warnOnRemove && g.id && !window.confirm(warnOnRemove)) return;
    update(groups.filter((x) => groupKey(x) !== groupKey(g)).map((x, i) => ({ ...x, position: i })));
  };
  const handleRename = (g, name) => update(groups.map((x) => (groupKey(x) === groupKey(g) ? { ...x, name } : x)));

  const handleDragEnd = ({ active, over }) => {
    setActiveId(null);
    if (!over) return; // 방 밖에 놓음 → 제자리
    const target = over.id === TRAY_ID ? null : over.id;
    update(moveStudent(groups, active.id, target));
  };

  const activeMember = activeId ? byId.get(activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={deskCollision}
      accessibility={{ announcements, screenReaderInstructions }}
      onDragStart={({ active }) => setActiveId(active.id)}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={handleDragEnd}
    >
      <div className="board">
        {/* 조작 줄 */}
        {!readOnly && (
          <div className="board-bar">
            <label className="board-count">
              <span>모둠 수</span>
              <input
                type="number" inputMode="numeric" min={GROUP_COUNT_MIN} max={GROUP_COUNT_MAX}
                value={countInput}
                onChange={(e) => applyCount(e.target.value)}
                onBlur={() => setCountDraft(null)}
              />
            </label>
            {onAuto && (
              <IconButton
                icon={Shuffle} label="자동 배분"
                onClick={() => {
                  if (groups.some((g) => g.studentIds.length > 0) &&
                      !window.confirm('현재 배정을 지우고 자동으로 다시 배분합니다. 계속할까요?')) return;
                  onAuto(desiredCount());
                }}
              />
            )}
            <IconButton icon={Plus} label="모둠 추가" onClick={handleAddGroup} disabled={groups.length >= GROUP_COUNT_MAX} />
          </div>
        )}

        {/* 미배정 트레이 */}
        <GroupDesk id={TRAY_ID} title="미배정" count={unassigned.length} variant="tray" readOnly={readOnly}>
          {unassigned.map((m) => (
            <StudentChip key={m.studentId} studentId={m.studentId} name={m.name} disabled={readOnly} />
          ))}
        </GroupDesk>

        {/* 모둠 방 */}
        {groups.length === 0 ? (
          <p className="desk-hint board-empty">아직 모둠이 없습니다. 모둠 수를 정하거나 모둠을 추가하세요.</p>
        ) : (
          <div className="desk-grid">
            {groups.map((g) => (
              <GroupDesk
                key={groupKey(g)} id={groupKey(g)} name={g.name} count={g.studentIds.length}
                readOnly={readOnly}
                onRename={(name) => handleRename(g, name)}
                onRemove={() => handleRemoveGroup(g)}
              >
                {g.studentIds.map((sid) => (
                  <StudentChip key={sid} studentId={sid} name={byId.get(sid)?.name ?? '알 수 없음'} disabled={readOnly} />
                ))}
              </GroupDesk>
            ))}
          </div>
        )}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeMember ? <ChipFace name={activeMember.name} lifted /> : null}
      </DragOverlay>
    </DndContext>
  );
}
