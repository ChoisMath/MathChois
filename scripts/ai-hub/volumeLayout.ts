// 이전 스크립트들이 공유하는 경로 규칙: .media-out/ 의 배치와 me.chois.pro Volume ↔ MathChois 경로 변환.
// 변환 자체(순수 로직)는 shared 에 있어 클라이언트 Vitest 로 검증한다. 여기서는 로컬 폴더 이름만 정한다.
import path from 'node:path';

export { toAiHubRel, meUrlPath } from '@mathchois/shared';

export type AiSet = 'motion' | 'slide' | 'brand';
export const SETS: readonly AiSet[] = ['motion', 'slide', 'brand'];

/** 스크립트 실행 위치(저장소 루트) 기준 `.media-out/`. 지우지 말고 Mac 에 남겨 원천 백업으로 쓴다. */
export const OUT_DIR = path.resolve('.media-out');
/** 서버 `<VOLUME_PATH>/ai-hub/` 와 같은 구조 — `motion/<id>/…`, `slide/<id>/…`, `brand/…`, `manifest/<set>.json`. */
export const AI_DIR = path.join(OUT_DIR, 'ai-hub');

export const manifestFile = (set: AiSet) => path.join(AI_DIR, 'manifest', `${set}.json`);
/** 프롬프트 JSON(PUT /api/ai/prompts/:set 본문). 서버 파일이 아니라 DB 로 가므로 ai-hub/ 밖에 둔다. */
export const promptsFile = (set: 'motion' | 'slide') => path.join(OUT_DIR, 'prompts', `${set}.json`);

export function parseSetArg(argv: readonly string[], required: boolean): AiSet | null {
  const at = argv.indexOf('--set');
  if (at < 0) {
    if (required) throw new Error('--set motion|slide|brand is required');
    return null;
  }
  const value = argv[at + 1];
  if (value !== 'motion' && value !== 'slide' && value !== 'brand') throw new Error(`--set must be motion, slide or brand, got ${value}`);
  return value;
}

export const hasFlag = (argv: readonly string[], flag: string) => argv.includes(flag);
