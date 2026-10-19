import { useSyncExternalStore } from 'react';

/**
 * CSS 미디어 쿼리 일치 여부를 React 상태로 구독한다.
 * 첫 렌더부터 matchMedia 값을 쓰므로(SSR 없음) 레이아웃이 깜빡이지 않는다.
 */
export function useMediaQuery(query) {
  const subscribe = (onChange) => {
    if (typeof window === 'undefined' || !window.matchMedia) return () => {};
    const mql = window.matchMedia(query);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  };
  const getSnapshot = () =>
    typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false;
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
