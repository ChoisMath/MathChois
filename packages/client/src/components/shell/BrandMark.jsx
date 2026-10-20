// 체크 노트 아이콘 — 첫 화면(Home)과 상단 바 로고가 같이 쓴다. 체크 표시는 항상 빨간색.
const BrandMark = ({ className = 'h-7 w-7', onDark = false }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke={onDark ? '#fff' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <path d="M8 8h8M8 12h5" />
    <path d="m14 16 2 2 4-5" stroke="#d9372b" />
  </svg>
);

export default BrandMark;
