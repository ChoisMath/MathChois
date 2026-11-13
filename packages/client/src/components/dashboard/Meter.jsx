/**
 * 가는 진도 막대 — value 0~100, null 이면 '–'.
 * text 는 막대 옆 글자(예: '3/8', '82%'), label 은 읽기 이름.
 */
export default function Meter({ value, text, label, done = false }) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <span className={`meter ${done ? 'meter--done' : ''}`.trim()} role="img" aria-label={label ?? (value == null ? '기록 없음' : `${pct}%`)}>
      <span className="meter-bar" aria-hidden="true"><span className="meter-fill" style={{ width: `${pct}%` }} /></span>
      <span className="meter-text num" aria-hidden="true">{value == null ? '–' : text ?? `${pct}%`}</span>
    </span>
  );
}
