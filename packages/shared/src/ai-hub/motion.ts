// 모션 스타일 갤러리 — 타입·상수·카탈로그 검증. 목록 자체는 motion.data.ts(생성 파일).
export const MOTION_GROUPS = [
  '게임·만화', '종이·공예', '손그림·노트', '그림·일러스트', '포스터·인쇄',
  '네온·레트로 컴퓨터', '입체·3D', '무대·영화', '한국',
] as const;
export type MotionGroup = (typeof MOTION_GROUPS)[number];

// chois = HyperFrames 로 직접 다시 만든 판, oppadu = 아직 변형하지 않아 원본(oppadu.com/ai/motion-styles)을 출처와 함께 싣는 편.
export const MOTION_SOURCES = ['chois', 'oppadu'] as const;
export type MotionSource = (typeof MOTION_SOURCES)[number];

export type MotionPublic = {
  id: string;
  no: number;
  group: MotionGroup;
  name: string;
  en: string;
  use: string;
  concept: string;
  featured: boolean;
  source: MotionSource;
  // v2 원본에만 있는 종류·길이(없으면 10초 인트로)
  kind?: string;
  kindLabel?: string;
  secs?: number;
};

const MOTION_ID = /^\d{2,3}-[a-z0-9-]+$/;

/** 오류 문장 배열(빈 배열 = 정상). 목록 순서는 화면의 기본 순서이므로 건드리지 않는다. */
export function validateMotionCatalog(list: unknown): string[] {
  if (!Array.isArray(list)) return ['motion catalog is not an array'];
  const errors: string[] = [];
  const ids = new Set<string>();
  const nos = new Set<number>();
  for (const [i, m] of (list as MotionPublic[]).entries()) {
    // 스크립트가 신뢰할 수 없는 JSON 을 읽으므로 null·숫자 같은 원소에서 던지지 않고 보고한다.
    if (typeof m !== 'object' || m === null || Array.isArray(m)) {
      errors.push(`bad entry at ${i}`);
      continue;
    }
    if (!MOTION_ID.test(m.id)) errors.push(`bad motion id: ${m.id}`);
    if (ids.has(m.id)) errors.push(`duplicate motion id: ${m.id}`);
    ids.add(m.id);
    if (nos.has(m.no)) errors.push(`duplicate motion no: ${m.no}`);
    nos.add(m.no);
    if (!(MOTION_SOURCES as readonly string[]).includes(m.source)) errors.push(`bad source: ${m.id}`);
    if (!(MOTION_GROUPS as readonly string[]).includes(m.group)) errors.push(`bad group: ${m.id}`);
  }
  return errors;
}
