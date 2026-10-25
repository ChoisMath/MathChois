import { Library } from 'lucide-react';

/**
 * 교사용 카드의 `단원: [ ▾ ]` 선택 칸("미분류" + 단원들, position 순). 영상 카드의 "필기 챕터" 칸과 같은 모양.
 * 카드 전체가 눌리는 카드 안에 들어가므로 클릭이 카드로 번지지 않게 막는다.
 * 목록에 없는 단원 id(지워진 단원 등)는 화면 묶기 규칙(groupByUnit)과 같게 "미분류"로 보인다.
 *
 * @param {object} props
 * @param {{ id: string, title: string, position: number, isHidden?: boolean }[]} props.units
 * @param {string|null} props.value
 * @param {(unitIdOrNull: string|null) => void} props.onChange
 */
export default function UnitSelect({ units, value, onChange }) {
  const sorted = [...units].sort((a, b) => a.position - b.position);
  const current = value && units.some((u) => u.id === value) ? value : '';
  const stop = (e) => e.stopPropagation();

  return (
    <label className="flex items-center gap-1.5 mt-1 text-xs text-gray-600" onClick={stop}>
      <Library className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden="true" />
      <span className="shrink-0">단원</span>
      <select
        value={current}
        onChange={(e) => onChange(e.target.value || null)}
        onClick={stop}
        className="flex-1 min-w-0 min-h-9 border border-gray-200 rounded px-1.5 text-xs bg-white truncate"
        title="이 항목이 들어갈 단원"
      >
        <option value="">미분류</option>
        {sorted.map((u) => (
          <option key={u.id} value={u.id}>{u.isHidden ? `${u.title} (숨김)` : u.title}</option>
        ))}
      </select>
    </label>
  );
}
