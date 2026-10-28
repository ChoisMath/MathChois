// 슬라이드 스타일 갤러리 — 타입·상수·카탈로그 검증. 목록 자체는 slide.data.ts(생성 파일).
export const SLIDE_FAMILIES = [
  { key: 'work', label: '업무·보고' },
  { key: 'hand', label: '손그림·종이' },
  { key: 'toon', label: '일러스트·만화' },
  { key: 'solid', label: '입체·3D' },
  { key: 'poster', label: '포스터·타이포' },
  { key: 'dark', label: '어두운 테크' },
  { key: 'photo', label: '사진·잡지' },
] as const;
export type SlideFamily = (typeof SLIDE_FAMILIES)[number]['key'];

// school = 학교 상황으로 새로 만든 덱, oppadu = 아직 변형하지 않아 원본(oppadu.com/ai/slide-styles) 예시를 출처와 함께 싣는 스타일.
export const SLIDE_SOURCES = ['school', 'oppadu'] as const;
export type SlideSource = (typeof SLIDE_SOURCES)[number];

export type SlidePublic = {
  id: string;
  no: number;
  family: SlideFamily;
  name: string;
  look: string;
  use: string;
  topic?: string; // 학교 덱에만 있다
  slides: number;
  cover: number;
  body: number;
  added: string;
  source: SlideSource;
};

const SLIDE_ID = /^\d{2,3}$/;
const MAX_SLIDES = 12;

/** 오류 문장 배열(빈 배열 = 정상). 목록 순서는 화면의 기본 순서(인기순)이므로 건드리지 않는다. */
export function validateSlideCatalog(list: unknown): string[] {
  if (!Array.isArray(list)) return ['slide catalog is not an array'];
  const errors: string[] = [];
  const ids = new Set<string>();
  const nos = new Set<number>();
  for (const s of list as SlidePublic[]) {
    if (!SLIDE_ID.test(s.id)) errors.push(`bad slide id: ${s.id}`);
    if (ids.has(s.id)) errors.push(`duplicate slide id: ${s.id}`);
    ids.add(s.id);
    if (nos.has(s.no)) errors.push(`duplicate slide no: ${s.no}`);
    nos.add(s.no);
    if (!(SLIDE_SOURCES as readonly string[]).includes(s.source)) errors.push(`bad source: ${s.id}`);
    if (!SLIDE_FAMILIES.some((f) => f.key === s.family)) errors.push(`bad family: ${s.id}`);
    if (s.slides < 1 || s.slides > MAX_SLIDES) errors.push(`slides out of range: ${s.id}`);
    if (s.cover > s.slides || s.body > s.slides) errors.push(`cover/body out of range: ${s.id}`);
  }
  return errors;
}
