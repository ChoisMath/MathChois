/**
 * 페이지 목록(썸네일) 버튼 아이콘 — 왼쪽 칸에 줄이 있는 두 칸 공책(사용자가 고른 모양, lucide 에 같은 글리프가 없어 직접 그림).
 * lucide 아이콘과 같은 규격(24 뷰박스, 선 2px, currentColor)이라 `.vw-tb-btn svg` / `.vw-ibtn svg` 크기 규칙을 그대로 따른다.
 */
export default function PageListIcon({ size, className = '', ...rest }) {
  const dim = size ? { width: size, height: size } : {};
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false" className={className} {...dim} {...rest}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M12 4v16" />
      <path d="M6.5 9h3M6.5 12h3M6.5 15h3" />
    </svg>
  );
}
