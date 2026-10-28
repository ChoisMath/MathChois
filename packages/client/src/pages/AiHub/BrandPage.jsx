import './BrandPage.css';

/**
 * 브랜드 룩북 — 서버가 공개로 서빙하는 사본(/api/ai/brand/site/)을 iframe 하나로 보여 준다.
 * 제목·소개는 허브 머리글이, 출처는 푸터가 맡는다. 외부 링크를 새 창으로 여는 일은 사본에 심어 둔 스크립트가 한다.
 * 높이는 AiHubLayout 이 재서 내려 주는 --ai-head-h(Navbar+머리글)·--ai-foot-h(푸터) 로 계산해 페이지 스크롤이 생기지 않게 한다.
 */
export default function BrandPage() {
  return (
    <iframe
      data-testid="brand-frame"
      src="/api/ai/brand/site/"
      title="브랜드 룩북"
      allow="clipboard-write"
      className="ai-brand-frame"
    />
  );
}
