/**
 * 분류 거르기 한 벌 — 모바일(<768)은 드롭다운, 그 이상은 칩 줄. 둘 다 그리고 CSS 로 하나만 보인다.
 * options: [{ value: string|null, label, count }]  (null = 전체)
 */
export default function FilterPicker({ label, options, value, onChange, testId }) {
  return (
    <div className="ai-filter">
      <label className="ai-filter-select-wrap">
        <span className="sr-only">{label}</span>
        <select
          data-testid={`${testId}-select`}
          className="ai-filter-select"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
        >
          {options.map((o) => (
            <option key={o.value ?? 'all'} value={o.value ?? ''}>{`${o.label} ${o.count}`}</option>
          ))}
        </select>
      </label>
      <div role="toolbar" aria-label={label} data-testid={testId} className="ai-filter-chips">
        {options.map((o) => (
          <button
            key={o.value ?? 'all'}
            type="button"
            className="ai-filter-chip"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
          >
            {o.label}
            <span className="ai-filter-count">{o.count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
