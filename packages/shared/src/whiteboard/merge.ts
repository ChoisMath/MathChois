/**
 * 화이트보드 요소 단위 병합 — 서버(권위 장면)와 클라이언트가 같은 규칙을 공유한다.
 *
 * 규칙은 Excalidraw `reconcileElements` 와 동일:
 *   - 같은 id 면 `version` 이 큰 쪽이 이긴다.
 *   - `version` 이 같으면 `versionNonce` 가 작은 쪽이 이긴다 (결정적 타이브레이크).
 * 순수 함수만 두어 Vitest 로 한 벌만 테스트한다.
 */

export type WbElement = {
  id: string;
  version: number;
  versionNonce: number;
  isDeleted?: boolean;
  updated?: number;
  customData?: Record<string, unknown> | null;
} & Record<string, unknown>;

export interface MergeAuthorOpts {
  /** 보내는 사람 */
  authorId: string;
  authorName: string;
  /** 학생이면 작성자 정보를 위조할 수 없다 */
  isStudent: boolean;
}

/** 원격 요소를 받아들여야 하는가 (로컬이 없으면 항상 true) */
export function shouldAcceptRemote(local: WbElement | undefined, remote: WbElement): boolean {
  if (!local) return true;
  if (remote.version > local.version) return true;
  if (remote.version < local.version) return false;
  return remote.versionNonce < local.versionNonce;
}

function withAuthor(el: WbElement, authorId: string, authorName: string): WbElement {
  return { ...el, customData: { ...(el.customData ?? {}), authorId, authorName } };
}

/**
 * 권위 장면(Map)에 들어온 요소를 병합한다. 반환값은 실제로 반영된 요소(브로드캐스트 대상).
 * - 학생이 보낸 **신규** 요소: 작성자를 강제로 본인으로.
 * - 학생이 보낸 **기존** 요소: 기존 작성자 보존(없으면 본인).
 * - 교사: 보낸 값 유지, 없으면 본인.
 */
export function mergeElements(
  scene: Map<string, WbElement>,
  incoming: readonly WbElement[],
  opts: MergeAuthorOpts,
): WbElement[] {
  const accepted: WbElement[] = [];
  for (const raw of incoming) {
    if (!raw || typeof raw.id !== 'string') continue;
    if (typeof raw.version !== 'number' || typeof raw.versionNonce !== 'number') continue;
    const local = scene.get(raw.id);
    if (!shouldAcceptRemote(local, raw)) continue;

    let el: WbElement = raw;
    const existingAuthorId = local?.customData?.authorId;
    const existingAuthorName = local?.customData?.authorName;
    if (opts.isStudent) {
      if (local && typeof existingAuthorId === 'string') {
        el = withAuthor(raw, existingAuthorId, typeof existingAuthorName === 'string' ? existingAuthorName : '');
      } else {
        el = withAuthor(raw, opts.authorId, opts.authorName);
      }
    } else if (typeof raw.customData?.authorId !== 'string') {
      el = withAuthor(raw, opts.authorId, opts.authorName);
    }

    scene.set(el.id, el);
    accepted.push(el);
  }
  return accepted;
}

/**
 * 마지막 전송 이후 `version` 이 바뀐 요소만 골라내고 기록을 갱신한다.
 * (클라이언트 onChange → 서버 전송용)
 */
export function diffChangedElements(
  elements: readonly WbElement[],
  lastVersions: Map<string, number>,
): WbElement[] {
  const changed: WbElement[] = [];
  for (const el of elements) {
    if (!el || typeof el.id !== 'string') continue;
    if (lastVersions.get(el.id) === el.version) continue;
    lastVersions.set(el.id, el.version);
    changed.push(el);
  }
  return changed;
}

/** 전송/수신 요소의 version 을 기록만 한다 (init·scene 수신 시) */
export function markVersions(elements: readonly WbElement[], lastVersions: Map<string, number>): void {
  for (const el of elements) {
    if (el && typeof el.id === 'string') lastVersions.set(el.id, el.version);
  }
}

/** 오래된 soft-delete 요소 제거 (저장 시) */
export function pruneDeleted(
  elements: readonly WbElement[],
  olderThanMs: number,
  now: number = Date.now(),
): WbElement[] {
  return elements.filter((el) => {
    if (!el.isDeleted) return true;
    const updated = typeof el.updated === 'number' ? el.updated : 0;
    return updated >= now - olderThanMs;
  });
}

/** 살아있는(삭제되지 않은) 요소 수 */
export function countLiveElements(elements: readonly WbElement[] | undefined | null): number {
  if (!elements) return 0;
  let n = 0;
  for (const el of elements) if (el && !el.isDeleted) n++;
  return n;
}
