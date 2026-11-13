/** 날짜 표기 — 표의 날짜 열은 자릿수가 같아야 줄이 맞는다(tabular-nums 와 함께 쓴다). */

function parts(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return { y: d.getFullYear(), m: pad(d.getMonth() + 1), d: pad(d.getDate()) };
}

/** '2026.10.21' — 빈 값·잘못된 값은 '' */
export function formatYmd(iso) {
  const p = parts(iso);
  return p ? `${p.y}.${p.m}.${p.d}` : '';
}

/** '10.21' — 좁은 화면용 */
export function formatMd(iso) {
  const p = parts(iso);
  return p ? `${p.m}.${p.d}` : '';
}
