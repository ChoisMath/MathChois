// 출처 표시 문구·링크 — 화면의 출처 줄과 푸터가 함께 쓴다.
export type AiHubTab = 'motion' | 'slide' | 'brand';

export const OPPADU: Record<AiHubTab, string> = {
  motion: 'https://www.oppadu.com/ai/motion-styles/',
  slide: 'https://www.oppadu.com/ai/slide-styles/',
  brand: 'https://www.oppadu.com/ai/design-systems-site/',
};

export const ORIGINAL_BADGE = '원본';

const GALLERY: Record<AiHubTab, string> = {
  motion: '오빠두엑셀 「모션 스타일 갤러리」',
  slide: '오빠두엑셀 「슬라이드 스타일 갤러리」',
  brand: '오빠두엑셀 「브랜드 룩북」',
};

/** "출처 오빠두엑셀 「…」 원본 예시·프롬프트" 를 조각으로 — 조각마다 nowrap 으로 그려 조각 사이에서만 줄바꿈한다. */
export function creditText(tab: AiHubTab): { lead: string; gallery: string; tail: string; href: string } {
  return { lead: '출처', gallery: GALLERY[tab], tail: '원본 예시·프롬프트', href: OPPADU[tab] };
}

/** 허브 푸터 한 줄. */
export function creditLine(tab: AiHubTab): string {
  return tab === 'brand'
    ? '© oppadu.com/ai 에서 옮겨온 자료입니다.'
    : '© oppadu.com/ai 의 자료를 가공하거나 출처를 밝혀 옮긴 것입니다.';
}
