import { creditText } from '@mathchois/shared';

/**
 * 상세의 출처 줄 — "출처 오빠두엑셀 「…」 원본 예시·프롬프트".
 * 조각마다 nowrap 이고(CSS) 공백은 nowrap 밖에 둬서 조각 사이에서만 줄바꿈한다.
 */
export default function OriginalCredit({ tab = 'motion' }) {
  const { lead, gallery, tail, href } = creditText(tab);
  return (
    <p data-testid="original-credit" className="ai-credit">
      <strong>{lead}</strong>{' '}
      <a href={href} target="_blank" rel="noreferrer">{gallery}</a>{' '}
      <span>{tail}</span>
    </p>
  );
}
