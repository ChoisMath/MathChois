import { accuracy } from '../../lib/dashboardViews';

/** 정답률 칩 — ≥70 초록, ≥40 호박, <40 장미, 시도 없음 회색 '–' */
export default function AccuracyChip({ correct, attempts, prefix = '' }) {
  const pct = accuracy(correct, attempts);
  const tone = pct == null ? 'none' : pct >= 70 ? 'good' : pct >= 40 ? 'mid' : 'low';
  const label = pct == null ? '시도 없음' : `정답률 ${pct}% (${attempts}회 중 ${correct}회)`;
  return (
    <span className={`acc acc--${tone}`} title={label} aria-label={label}>
      {prefix}{pct == null ? '–' : `${pct}%`}
    </span>
  );
}
