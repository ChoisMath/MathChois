import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/** ←/→ 로 이전·다음 항목. 입력 중이거나 영상에 포커스가 있으면 브라우저 기본 동작(커서 이동·탐색)을 지킨다. */
export default function KeyNav({ prevHref, nextHref }) {
  const navigate = useNavigate();
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      if (
        e.altKey || e.ctrlKey || e.metaKey || e.shiftKey ||
        t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement ||
        t instanceof HTMLSelectElement || t instanceof HTMLVideoElement ||
        (t instanceof HTMLElement && t.isContentEditable)
      ) return;
      if (e.key === 'ArrowLeft' && prevHref) navigate(prevHref);
      if (e.key === 'ArrowRight' && nextHref) navigate(nextHref);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prevHref, nextHref, navigate]);
  return null;
}
