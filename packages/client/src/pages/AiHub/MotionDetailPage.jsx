import { Link, useParams } from 'react-router-dom';
import { useAiHubData } from '../../hooks/useAiHubData';
import { neighbors } from '../../lib/aiHub/motionNav';
import KeyNav from '../../components/aiHub/KeyNav';
import OriginalCredit from '../../components/aiHub/OriginalCredit';
import PromptCopy from '../../components/aiHub/PromptCopy';
import '../../components/aiHub/aiHubMotion.css';

export default function MotionDetailPage() {
  const { id } = useParams();
  const { access, motion, status } = useAiHubData();
  if (status !== 'ready') return <p className="ai-empty">불러오는 중...</p>;

  const hit = neighbors(motion, id);
  if (!hit) {
    return (
      <div data-testid="motion-missing" className="ai-empty">
        <p>찾을 수 없는 예시예요</p>
        <p><Link to="/ai/motion" className="ai-pill ai-pill--ghost">모션 목록으로</Link></p>
      </div>
    );
  }
  const { item, prev, next } = hit;
  const href = (m) => (m ? `/ai/motion/${m.id}` : null);

  return (
    <article className="ai-detail">
      <video
        key={item.id}
        data-testid="motion-video"
        className="ai-detail-video"
        src={item.video}
        poster={item.poster ?? undefined}
        controls
        playsInline
        preload="metadata"
      />
      <div className="ai-detail-info">
        <header className="ai-detail-head">
          <span className="ai-detail-no">{String(item.no).padStart(2, '0')}</span>
          <h2 className="ai-detail-name" title={item.name}>{item.name}</h2>
          <span className="ai-detail-en" title={item.en}>{item.en}</span>
        </header>
        <p className="ai-detail-use">{item.use}</p>
        <p className="ai-detail-concept">{item.concept}</p>
        {item.source === 'oppadu' ? <OriginalCredit tab="motion" /> : null}
        <PromptCopy key={item.id} id={item.id} prompt={item.prompt} canEdit={access.canEdit} />
        <nav className="ai-detail-nav" aria-label="모션 이동">
          {prev ? <Link to={href(prev)} className="ai-pill ai-pill--ghost">← 이전</Link> : null}
          <Link to="/ai/motion" className="ai-pill ai-pill--ghost">목록</Link>
          {next ? <Link to={href(next)} className="ai-pill ai-pill--ghost">다음 →</Link> : null}
        </nav>
      </div>
      <KeyNav prevHref={href(prev)} nextHref={href(next)} />
    </article>
  );
}
