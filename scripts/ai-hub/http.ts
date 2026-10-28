// pull·push 가 같이 쓰는 작은 도구: 동시 실행 제한과 429(요청 한도) 재시도.
// 서버에는 IP 당 분당 300 요청의 전역 한도가 있어 파일이 많은 이전에서는 429 가 정상적으로 나온다.
import { retryDelayMs } from '@mathchois/shared';

const sleepMs = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** 최대 `limit` 개씩 동시에 처리한다. 결과 순서는 입력 순서. `fn` 이 던지면 전체가 실패하므로 호출 쪽에서 잡을 것. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i] as T, i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export type RetryOptions = { attempts?: number; label?: string; sleep?: (ms: number) => Promise<void> };

/**
 * fetch 하다가 429 면 기다렸다 같은 요청을 다시 보낸다(`Retry-After` 초, 없으면 5초에서 두 배씩 최대 60초, 기본 6번까지).
 * 본문이 스트림일 수 있어 요청 설정은 시도마다 `init()` 으로 새로 만든다. 429 가 아니면 그 응답을 그대로 돌려준다.
 */
export async function fetchRetry(url: string, init: () => RequestInit, opts: RetryOptions = {}): Promise<Response> {
  const attempts = opts.attempts ?? 6;
  const sleep = opts.sleep ?? sleepMs;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init());
    if (res.status !== 429) return res;
    await res.arrayBuffer().catch(() => undefined); // 연결을 돌려주려면 본문을 비워야 한다
    if (attempt + 1 >= attempts) throw new Error(`${opts.label ?? url}: still 429 after ${attempts} attempts`);
    const wait = retryDelayMs(attempt, res.headers.get('retry-after'));
    console.warn(`429 ${opts.label ?? url}: retrying in ${(wait / 1000).toFixed(wait % 1000 ? 1 : 0)}s (attempt ${attempt + 2}/${attempts})`);
    await sleep(wait);
  }
}

export function baseUrl(raw: string | undefined, fallback: string): string {
  return (raw || fallback).replace(/\/+$/, '');
}

export function requireEnv(name: string, why: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (${why})`);
  return value;
}
