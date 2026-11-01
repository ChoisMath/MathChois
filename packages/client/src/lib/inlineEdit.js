/**
 * 인라인 편집(클릭 → 입력 → 저장) 저장 규칙 — 순수 함수. hooks/useInlineEdit.js 가 쓴다.
 *
 * @param {string|null|undefined} current 저장돼 있는 값
 * @param {string} draft 입력 상자의 값
 * @param {{ allowEmpty?: boolean }} [opts] allowEmpty: 비워서 저장할 수 있는 값(설명). 기본 false(제목처럼 필수).
 * @returns {{ changed: boolean, value: string|null }} changed 가 false 면 저장 요청을 보내지 않는다.
 */
export function resolveInlineEdit(current, draft, { allowEmpty = false } = {}) {
  const before = (current ?? '').trim() || null;
  const trimmed = String(draft ?? '').trim();
  if (!trimmed) {
    if (!allowEmpty) return { changed: false, value: before };
    return { changed: before !== null, value: null };
  }
  return { changed: trimmed !== before, value: trimmed };
}
