import { useRef } from 'react';
import { Link } from 'react-router-dom';
import OriginalBadge from './OriginalBadge';
import './aiHubMotion.css';

export default function MotionCard({ item }) {
  const video = useRef(null);
  // 터치 기기는 호버가 없으므로 미리보기를 받지 않고, 탭하면 바로 상세로 간다.
  const play = () => {
    const v = video.current;
    if (!v || !item.preview || !window.matchMedia('(hover: hover)').matches) return;
    if (!v.getAttribute('src')) v.src = item.preview;
    v.play().catch(() => {});
  };
  const stop = () => {
    const v = video.current;
    if (!v) return;
    v.pause();
    v.currentTime = 0;
  };
  return (
    <Link
      to={`/ai/motion/${item.id}`}
      data-testid="motion-card"
      className="ai-motion-card"
      onMouseEnter={play}
      onMouseLeave={stop}
      onFocus={play}
      onBlur={stop}
    >
      <div className="ai-motion-thumb">
        {item.poster ? <img src={item.poster} alt="" loading="lazy" /> : null}
        {item.preview ? <video ref={video} muted loop playsInline preload="none" aria-hidden="true" /> : null}
        {item.source === 'oppadu' ? <OriginalBadge /> : null}
      </div>
      <div className="ai-motion-title">
        <span className="ai-motion-no">{String(item.no).padStart(2, '0')}</span>
        <span className="ai-motion-name" title={item.name}>{item.name}</span>
      </div>
      <p className="ai-motion-use" title={item.use}>{item.use}</p>
    </Link>
  );
}
