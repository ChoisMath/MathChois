import { ORIGINAL_BADGE } from '@mathchois/shared';

/** 카드 모서리의 「원본」 배지 — 오빠두엑셀 원본 예시임을 알린다(source === 'oppadu'). */
export default function OriginalBadge() {
  return (
    <span data-testid="original-badge" title="오빠두엑셀 원본 예시" className="ai-original-badge">
      {ORIGINAL_BADGE}
    </span>
  );
}
