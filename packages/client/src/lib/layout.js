/**
 * 레이아웃 공용 상수.
 *
 * CARD_GRID — 카드 목록(챕터·영상·과제·진도 모니터·클래스룸)의 반응형 열 규칙.
 *   모바일 1열 → 640px 2열 → 1024px(태블릿 가로) 3열 → 1280px(데스크톱) 4열 → 1536px(와이드) 5열.
 *   본문이 유동 폭이므로 화면이 넓어질수록 열이 늘어난다.
 */
export const CARD_GRID = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4';

/** 데스크톱(고정 사이드바) 기준 — Tailwind `lg` 와 동일 */
export const DESKTOP_MEDIA_QUERY = '(min-width: 1024px)';

/** 데스크톱 사이드바 접힘 상태 저장 키 */
export const SIDEBAR_COLLAPSED_KEY = 'mc_sidebar_collapsed';
