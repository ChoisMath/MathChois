// 오빠두 동기화(`PUT /api/ai/prompts/:set?mode=sync`)가 쓰는 순수 판정.
// 서버 DB 코드와 분리해 두어 packages/client/src/lib/aiHubPromptSync.test.js 에서 검증한다.

/** insert = 새 id, skipEdited = 웹에서 고친 원본이라 건드리지 않음, unchanged = 같은 값, update = 오빠두 쪽이 바뀌어 반영. */
export type SyncDecision = 'insert' | 'skipEdited' | 'unchanged' | 'update';

/**
 * 한 id 의 들어온 값을 어떻게 처리할지 정한다. 웹 편집 표시(`editedAt`)가 있으면 값이 같든 다르든 건드리지 않는다.
 * `same` 은 값 비교 함수(모션: en·ko·shots·cues, 슬라이드: 문자열 비교).
 */
export function decidePromptSync<T>(
  existing: { value: T; editedAt: Date | string | null } | null,
  incoming: T,
  same: (a: T, b: T) => boolean,
): SyncDecision {
  if (!existing) return 'insert';
  if (existing.editedAt) return 'skipEdited';
  return same(existing.value, incoming) ? 'unchanged' : 'update';
}

/** 요청 id 중 변형본(`chois`·`school`)인 것 — 동기화는 변형본 프롬프트를 절대 바꾸지 않으므로 하나라도 있으면 요청 전체를 거절한다. */
export function remakeIdsIn(
  catalog: readonly { id: string; source: string }[],
  ids: readonly string[],
): string[] {
  const remake = new Set(catalog.filter((c) => c.source === 'chois' || c.source === 'school').map((c) => c.id));
  return ids.filter((id) => remake.has(id));
}

/** 동기화 결과 — `replaced` 는 update 한 행의 이전 값(`before`), 되돌릴 근거로 보고한다. */
export type PromptSyncResult<B> = {
  inserted: number;
  updated: number;
  unchanged: number;
  skippedEdited: string[];
  replaced: { id: string; before: B }[];
};
