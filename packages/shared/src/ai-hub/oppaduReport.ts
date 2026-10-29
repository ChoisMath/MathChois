// `npm run ai:oppadu` 보고서(`.oppadu/<날짜>/report.md`와 화면 요약)와 `ai:push --sync-prompts` 결과 줄.
// 순수 문자열 만들기라 shared 에 두고 packages/client/src/lib/aiHubOppaduReport.test.js 에서 문구를 고정한다.
import type { SetReport } from './oppaduSync.js';
import type { PromptSyncResult } from './promptSync.js';

export type RunReport = {
  date: string;
  /** `media` = 새로 받았거나 내용이 바뀐 미디어 파일 수(.media-out 과 바이트 비교). */
  motion?: SetReport & { media: number };
  slide?: SetReport & { media: number };
  brand?: { added: string[]; removed: string[]; total: number; generatedAt: string };
  engineChanged: boolean;
  /** 수집본이 없어 건너뛴 set(`motion`·`slide`). */
  skipped: string[];
};

const LABEL: Record<string, string> = { motion: '모션', slide: '슬라이드', brand: '브랜드' };
const SCREEN_IDS = 10;
const NEXT_STEP = '다음 할 일: npm run ai:push -- --set motion --sync-prompts → --set slide --sync-prompts → --set brand';
const ENGINE_WARNING = '⚠ 오빠두 프롬프트 엔진이 바뀌었습니다 — promptEngine.ts 확인 필요';

/** `개수 (목록)` — 목록이 비면 괄호를 뺀다. `max` 가 있으면 화면용으로 앞 `max` 개만 보이고 나머지는 개수로 줄인다. */
function counted(items: readonly string[], max?: number): string {
  if (!items.length) return '0';
  const shown = max !== undefined && items.length > max ? [...items.slice(0, max), `…외 ${items.length - max}`] : items;
  return `${items.length} (${shown.join(', ')})`;
}

function setLine(set: 'motion' | 'slide', r: SetReport & { media: number }, max?: number): string {
  const updated = Object.entries(r.updated).map(([id, fields]) => `${id}: ${fields.join('·')}`);
  return [
    `${LABEL[set]}: 추가 ${counted(r.added, max)}`,
    `갱신 ${counted(updated, max)}`,
    `변형본이라 건너뜀 ${r.keptRemake}`,
    `오빠두에서 사라진 ${counted(r.gone, max)}`,
    `${set === 'motion' ? '미디어' : '그림'} 새로/바뀜 ${r.media}`,
  ].join(' · ');
}

function brandLine(b: NonNullable<RunReport['brand']>, max?: number): string {
  const day = b.generatedAt.slice(0, 10);
  return `브랜드: ${b.total}개${day ? ` (오빠두 생성 ${day})` : ''} · 추가 ${counted(b.added, max)} · 사라진 ${counted(b.removed, max)}`;
}

/** 카탈로그·미디어·브랜드 목록 중 하나라도 바뀌었는지. 사라진 id 는 카탈로그에 그대로 남으므로 변경이 아니다. */
function hasChanges(r: RunReport): boolean {
  const set = (s: RunReport['motion']) => !!s && (s.added.length > 0 || Object.keys(s.updated).length > 0 || s.media > 0);
  return set(r.motion) || set(r.slide) || (!!r.brand && (r.brand.added.length > 0 || r.brand.removed.length > 0));
}

function lines(r: RunReport, max?: number): string[] {
  const out: string[] = [];
  if (!hasChanges(r)) out.push('변경 없음');
  for (const set of ['motion', 'slide'] as const) {
    const s = r[set];
    if (s) out.push(setLine(set, s, max));
    else if (r.skipped.includes(set)) out.push(`${LABEL[set]}: 수집본이 없어 건너뜀`);
  }
  if (r.brand) out.push(brandLine(r.brand, max));
  if (r.engineChanged) out.push(ENGINE_WARNING);
  out.push(NEXT_STEP);
  return out;
}

/**
 * 한 번 실행한 결과를 사람이 읽는 글로 만든다. `summary` 는 화면에 찍는 줄(긴 id 목록은 앞 10개만),
 * `markdown` 은 `.oppadu/<날짜>/report.md` 에 남기는 전문(id 를 모두 적음).
 */
export function formatReport(r: RunReport): { markdown: string; summary: string[] } {
  const markdown = [`# 오빠두 동기화 ${r.date}`, '', ...lines(r).map((l) => `- ${l}`), ''].join('\n');
  return { markdown, summary: lines(r, SCREEN_IDS) };
}

/** `ai:push --sync-prompts` 의 서버 응답을 보고서에 덧붙일 한 줄로. 웹에서 고쳐 건너뛴 id 는 괄호 안에 모두 적는다. */
export function formatPushResult(set: 'motion' | 'slide', r: PromptSyncResult<unknown>, backup: string): string {
  return `${set}: 넣음 ${r.inserted} · 바뀜 ${r.updated} · 같음 ${r.unchanged} · 웹에서 고쳐 건너뜀 ${counted(r.skippedEdited)} · 백업 ${backup}`;
}
