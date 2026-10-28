import OriginalBadge from './OriginalBadge';
import './aiHubSlide.css';

/** 슬라이드 스타일 카드 — 표지/본문 중 고른 쪽을 앞에 두고, 호버·포커스하면 다른 쪽으로 교차한다. 누르면 상세 창(#id)이 열린다. */
export default function SlideCard({ item, view, familyLabel, onOpen }) {
  const [front, back] = view === 'cover' ? [item.coverCard, item.bodyCard] : [item.bodyCard, item.coverCard];
  return (
    <button type="button" onClick={onOpen} data-testid={`slide-card-${item.id}`} className="ai-slide-card">
      <span className="ai-slide-thumb">
        <img data-testid="slide-card-front" src={front} alt={`${item.name} ${view === 'cover' ? '표지' : '본문'}`} width={760} height={424} loading="lazy" />
        <img className="ai-slide-back" src={back} alt="" aria-hidden="true" width={760} height={424} loading="lazy" />
        {item.source === 'oppadu' ? <OriginalBadge /> : null}
      </span>
      <span className="ai-slide-meta">
        <span className="ai-slide-no">{item.no}</span>
        <span className="ai-slide-name" title={item.name}>{item.name}</span>
        <span className="ai-slide-family">{familyLabel}</span>
      </span>
    </button>
  );
}
