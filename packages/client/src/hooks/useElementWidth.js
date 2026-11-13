import { useEffect, useState } from 'react';

/**
 * 요소의 clientWidth(px)를 ResizeObserver 로 따라간다.
 * 콜백 ref 를 돌려준다 — 로딩 화면 뒤에 늦게 붙는 요소도 붙는 순간부터 잰다. 붙기 전에는 0.
 * @returns {[(el: Element | null) => void, number]}
 */
export function useElementWidth() {
  const [el, setEl] = useState(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    /* observe 직후 첫 콜백이 현재 크기를 알려 준다 */
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  return [setEl, width];
}
