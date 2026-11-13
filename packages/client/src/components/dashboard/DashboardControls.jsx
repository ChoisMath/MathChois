const VIEWS = [
  { key: 'chapters', label: '챕터별' },
  { key: 'videos', label: '영상별' },
  { key: 'students', label: '학생별' },
];

/**
 * 보기 + 대상 드롭다운 한 줄.
 * 보기가 챕터별·영상별이면 대상은 단원(전체 · 단원들 · 단원 미지정), 학생별이면 학생 명렬.
 * onChange({ view? , unit?, student? }) — unit: null=전체, 'none'=미지정, 그 외 단원 id
 */
export default function DashboardControls({ view, unitParam, studentId, units, students, onChange }) {
  const byUnit = view !== 'students';
  return (
    <div className="dash-controls">
      <label className="dash-select">
        <span>보기</span>
        <select aria-label="보기" value={view} onChange={(e) => onChange({ view: e.target.value })}>
          {VIEWS.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
        </select>
      </label>
      {byUnit ? (
        <label className="dash-select">
          <span>단원</span>
          <select aria-label="단원" value={unitParam ?? ''} onChange={(e) => onChange({ unit: e.target.value || null })}>
            <option value="">전체</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.title}</option>)}
            <option value="none">단원 미지정</option>
          </select>
        </label>
      ) : (
        <label className="dash-select">
          <span>학생</span>
          <select aria-label="학생" value={studentId ?? ''} onChange={(e) => onChange({ student: e.target.value || null })} disabled={students.length === 0}>
            {students.length === 0 && <option value="">학생이 없습니다</option>}
            {students.map((s) => <option key={s.studentId} value={s.studentId}>{s.name || '(이름 없음)'}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}
