import { useEffect, useState } from 'react';

const QUERY = '(orientation: portrait)';

function read() {
  if (typeof window === 'undefined' || !window.matchMedia) return 'horizontal';
  return window.matchMedia(QUERY).matches ? 'vertical' : 'horizontal';
}

/**
 * 화면 방향에 따른 분할 방향.
 * 세로(포트레이트) → 'vertical'(위/아래 분할), 그 외 → 'horizontal'(좌/우 분할).
 * 기기 회전/창 크기 변경에 반응한다.
 */
export function useOrientation() {
  const [orientation, setOrientation] = useState(read);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia(QUERY);
    const onChange = () => setOrientation(mq.matches ? 'vertical' : 'horizontal');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return orientation;
}
