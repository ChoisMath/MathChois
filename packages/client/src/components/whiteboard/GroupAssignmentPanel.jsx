import { useState } from 'react';
import { Plus, Trash2, Shuffle, AlertTriangle } from 'lucide-react';
import IconButton from '../common/IconButton';
import { moveStudent, groupKey, unassignedStudents, findGroupKeyOf } from '../../lib/groupAssign';

/**
 * 모둠 배정 패널 — 학급 기본 모둠(학생 탭)과 화이트보드 페이지별 배정(교사 설정)에서 공용.
 *
 * props:
 *  - members: { studentId, name, avatarUrl }[]
 *  - groups:  { id?, name, position, studentIds[] }[]   (controlled)
 *  - onChange(groups)
 *  - onAuto(count)            자동 배분 (서버 또는 로컬) — 없으면 버튼 숨김
 *  - readOnly
 *  - warnOnRemove             모둠 삭제 시 경고 문구 (페이지별 배정: 보드 내용 삭제)
 */
export default function GroupAssignmentPanel({
  members, groups, onChange, onAuto, readOnly = false, warnOnRemove = null,
}) {
  const [autoCount, setAutoCount] = useState(groups.length > 0 ? groups.length : 4);
  const unassigned = unassignedStudents(members, groups);
  const byId = new Map(members.map((m) => [m.studentId, m]));

  const update = (next) => { if (!readOnly) onChange(next); };

  const handleAddGroup = () => {
    const position = groups.length > 0 ? Math.max(...groups.map((g) => g.position)) + 1 : 0;
    update([...groups, { name: `${groups.length + 1}모둠`, position, studentIds: [] }]);
  };

  const handleRemoveGroup = (g) => {
    if (warnOnRemove && g.id && !window.confirm(warnOnRemove)) return;
    update(groups.filter((x) => groupKey(x) !== groupKey(g)).map((x, i) => ({ ...x, position: i })));
  };

  const handleRename = (g, name) => {
    update(groups.map((x) => (groupKey(x) === groupKey(g) ? { ...x, name } : x)));
  };

  const handleMove = (studentId, key) => {
    update(moveStudent(groups, studentId, key === '' ? null : key));
  };

  return (
    <div className="space-y-4">
      {/* 상단 조작 */}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          {onAuto && (
            <div className="flex items-center gap-1.5">
              <label className="text-sm text-gray-600">모둠 수</label>
              <input
                type="number" min={1} max={30} value={autoCount}
                onChange={(e) => setAutoCount(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
                className="w-16 border rounded-md px-2 py-1 text-sm"
              />
              <IconButton
                icon={Shuffle} label="자동 배분"
                onClick={() => {
                  if (groups.some((g) => g.studentIds.length > 0) &&
                      !window.confirm('현재 배정을 지우고 자동으로 다시 배분합니다. 계속할까요?')) return;
                  onAuto(autoCount);
                }}
              />
            </div>
          )}
          <IconButton icon={Plus} label="모둠 추가" onClick={handleAddGroup} />
          {unassigned.length > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-yellow-100 text-yellow-800 text-xs font-medium">
              <AlertTriangle className="h-3.5 w-3.5" /> 미배정 {unassigned.length}명
            </span>
          )}
        </div>
      )}

      {/* 모둠 카드 */}
      {groups.length === 0 ? (
        <p className="text-sm text-gray-400 border-2 border-dashed rounded-lg p-4 text-center">
          아직 모둠이 없습니다. 자동 배분하거나 모둠을 추가하세요.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {groups.map((g) => (
            <div key={groupKey(g)} className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                {readOnly ? (
                  <span className="font-medium text-sm text-gray-900 flex-1">{g.name}</span>
                ) : (
                  <input
                    value={g.name} maxLength={30}
                    onChange={(e) => handleRename(g, e.target.value)}
                    className="flex-1 min-w-0 border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none text-sm font-medium px-1"
                    aria-label="모둠 이름"
                  />
                )}
                <span className="text-xs text-gray-400 shrink-0">{g.studentIds.length}명</span>
                {!readOnly && (
                  <button type="button" onClick={() => handleRemoveGroup(g)} title="모둠 삭제"
                    className="p-1 text-gray-300 hover:text-red-500 cursor-pointer">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {g.studentIds.length === 0 && <span className="text-xs text-gray-300">비어 있음</span>}
                {g.studentIds.map((sid) => (
                  <span key={sid} className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs">
                    {byId.get(sid)?.name ?? '알 수 없음'}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 학생별 드롭다운 */}
      {!readOnly && members.length > 0 && (
        <div className="border rounded-lg divide-y max-h-80 overflow-y-auto">
          {members.map((m) => {
            const current = findGroupKeyOf(groups, m.studentId) ?? '';
            return (
              <div key={m.studentId} className="flex items-center gap-3 px-3 py-2">
                {m.avatarUrl ? (
                  <img src={m.avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="h-7 w-7 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-500">
                    {m.name?.charAt(0)}
                  </div>
                )}
                <span className="flex-1 text-sm text-gray-800 truncate">{m.name}</span>
                <select
                  value={current}
                  onChange={(e) => handleMove(m.studentId, e.target.value)}
                  className={`border rounded-md px-2 py-1 text-sm ${current === '' ? 'text-yellow-700 bg-yellow-50' : ''}`}
                  aria-label={`${m.name} 모둠`}
                >
                  <option value="">미배정</option>
                  {groups.map((g) => (
                    <option key={groupKey(g)} value={groupKey(g)}>{g.name}</option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
