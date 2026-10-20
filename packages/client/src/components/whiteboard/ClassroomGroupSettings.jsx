import { useEffect, useState } from 'react';
import { Save, Users } from 'lucide-react';
import { api } from '../../lib/api';
import IconButton from '../common/IconButton';
import GroupAssignmentPanel from './GroupAssignmentPanel';

/**
 * 학급 상세 > 학생 탭의 "모둠 설정" 카드 (교사 전용).
 * 화이트보드 페이지를 만들면 이 기본 모둠이 복사된다 (페이지별 변경은 여기에 영향 없음).
 */
export default function ClassroomGroupSettings({ classroomId, members }) {
  const [groups, setGroups] = useState(null);   // null = 로딩
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => api.get(`/api/classrooms/${classroomId}/groups`)
    .then((data) => { setGroups(data || []); setDirty(false); })
    .catch((err) => { setError(err.message ?? '모둠 정보를 불러오지 못했습니다.'); setGroups([]); });

  useEffect(() => {
    let alive = true;
    api.get(`/api/classrooms/${classroomId}/groups`)
      .then((data) => { if (alive) { setGroups(data || []); setDirty(false); } })
      .catch((err) => { if (alive) { setError(err.message ?? '모둠 정보를 불러오지 못했습니다.'); setGroups([]); } });
    return () => { alive = false; };
  }, [classroomId]);

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      const saved = await api.put(`/api/classrooms/${classroomId}/groups`, {
        groups: groups.map((g, i) => ({ id: g.id, name: g.name.trim() || `${i + 1}모둠`, position: i, studentIds: g.studentIds })),
      });
      setGroups(saved || []);
      setDirty(false);
    } catch (err) {
      setError(err.message ?? '저장에 실패했습니다.');
    }
    setSaving(false);
  };

  const handleAuto = async (count) => {
    setSaving(true); setError('');
    try {
      const saved = await api.post(`/api/classrooms/${classroomId}/groups/auto`, { count });
      setGroups(saved || []);
      setDirty(false);
    } catch (err) {
      setError(err.message ?? '자동 배분에 실패했습니다.');
      await load();
    }
    setSaving(false);
  };

  const panelMembers = members.map((m) => ({
    studentId: m.studentId, name: m.student?.name ?? '', avatarUrl: m.student?.avatarUrl ?? null,
  }));

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <Users className="h-4 w-4 text-indigo-500" /> 모둠 설정
          <span className="text-xs font-normal text-gray-400">화이트보드 페이지의 기본 모둠</span>
        </h3>
        <IconButton icon={Save} label="저장" variant="primary" onClick={handleSave} disabled={!dirty} busy={saving} />
      </div>
      {error && <p className="text-sm text-red-500 mb-2">{error}</p>}
      {groups === null ? (
        <p className="text-sm text-gray-400">로딩 중...</p>
      ) : (
        <GroupAssignmentPanel
          members={panelMembers}
          groups={groups}
          onChange={(next) => { setGroups(next); setDirty(true); }}
          onAuto={handleAuto}
          readOnly={saving}
        />
      )}
    </div>
  );
}
