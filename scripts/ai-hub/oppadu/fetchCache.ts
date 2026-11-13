// `ai:oppadu` 의 내려받기 캐시: 오빠두 공개 자료를 `.oppadu/cache/<호스트><경로>[@<버전>]` 에 받아 둔다.
// 버전 쿼리(?v=·?ver=)가 붙은 주소는 내용이 바뀌면 버전이 바뀌므로, 같은 버전 파일이 있으면 다시 받지 않는다.
// 슬라이드 그림처럼 버전이 없는 큰 묶음은 기본으로 재사용하고 `--refresh-media` 일 때만 다시 받는다. 그 밖의 버전 없는 주소
// (목록 페이지·ms-prompt.js·브랜드 data JSON 등)는 매번 받는다. 받기는 동시 4개, 3번까지 시도, `.part` 로 받은 뒤 이름을 바꾼다.
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { retryDelayMs } from '@mathchois/shared';
import { fetchRetry, mapLimit } from '../http.js';

export const CACHE_DIR = path.resolve('.oppadu', 'cache');

const CONCURRENCY = 4; // 오빠두 요청은 동시 4개까지
const TRIES = 3;
const VERSION_KEYS = ['v', 'ver'] as const;
const SAFE_VERSION = /^[\w.-]{1,64}$/;
const SLIDE_IMAGES = '/_slide-styles-assets/img/';

const sha8 = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 8);
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * 주소 → 캐시 파일 경로. `<호스트><경로>` 뒤에 버전 쿼리 값을 `@<값>` 으로 붙인다(파일 이름에 못 쓰는 값이면 해시).
 * 경로가 `/` 로 끝나면 `index.html` 을 붙이고, 버전 말고 다른 쿼리가 있으면 서로 다른 주소가 한 파일로 겹치지 않게 그 해시를 더 붙인다.
 */
export function cachePath(url: string): string {
  const u = new URL(url);
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error(`not an http(s) address: ${url}`);
  const pathname = u.pathname.endsWith('/') ? `${u.pathname}index.html` : u.pathname;
  const key = VERSION_KEYS.find((k) => u.searchParams.has(k));
  const version = key ? u.searchParams.get(key) ?? '' : null;
  const others = [...u.searchParams.keys()].filter((k) => !(VERSION_KEYS as readonly string[]).includes(k));
  let name = path.join(CACHE_DIR, u.host, ...pathname.split('/').filter(Boolean));
  if (version !== null) name += `@${SAFE_VERSION.test(version) ? version : sha8(version)}`;
  if (others.length) name += `@q${sha8(u.search)}`;
  if (!name.startsWith(CACHE_DIR + path.sep)) throw new Error(`cache path escapes ${CACHE_DIR}: ${url}`);
  return name;
}

/** 캐시에 파일이 있으면 다시 받지 않아도 되는 주소인가 — 버전 쿼리가 있거나 슬라이드 그림(`--refresh-media` 면 그림만 다시 받음). */
export function reusable(url: string, refreshMedia: boolean): boolean {
  const u = new URL(url);
  if (u.pathname.includes(SLIDE_IMAGES)) return !refreshMedia;
  return VERSION_KEYS.some((k) => u.searchParams.has(k));
}

/** 한 주소를 캐시로 받는다. 429 는 fetchRetry 가 기다려 다시 보내고, 그 밖의 4xx 는 바로 실패, 5xx·연결 오류는 3번까지 시도한다. */
async function download(url: string, dest: string): Promise<void> {
  const tmp = `${dest}.part`;
  let lastError = 'unknown';
  for (let attempt = 0; attempt < TRIES; attempt++) {
    if (attempt) await sleep(retryDelayMs(attempt - 1));
    try {
      const res = await fetchRetry(url, () => ({}), { label: url });
      if (!res.ok || !res.body) {
        await res.arrayBuffer().catch(() => undefined);
        lastError = `HTTP ${res.status}`;
        if (res.status >= 400 && res.status < 500) break; // 주소가 틀렸거나 막힘 — 다시 보내도 같다
        continue;
      }
      await mkdir(path.dirname(dest), { recursive: true });
      await pipeline(Readable.fromWeb(res.body as never), createWriteStream(tmp));
      await rename(tmp, dest);
      return;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      await rm(tmp, { force: true });
    }
  }
  throw new Error(lastError);
}

/**
 * 주소들을 캐시로 받는다(같은 주소는 한 번). 재사용할 수 있고 이미 있는 것은 건너뛴다.
 * 던지지 않고 실패한 주소를 돌려준다 — 호출 쪽이 목록을 보이고 아무것도 쓰지 않고 멈춘다(받은 것은 캐시에 남아 다음 실행이 빠르다).
 */
export async function fetchToCache(
  urls: readonly string[],
  opts: { refreshMedia: boolean },
): Promise<{ failed: string[]; fetched: number }> {
  const todo = [...new Set(urls)].filter((url) => !(reusable(url, opts.refreshMedia) && existsSync(cachePath(url))));
  const failed: string[] = [];
  let fetched = 0;
  const loud = todo.length >= 50;
  if (loud) console.info(`받기 ${todo.length}개 → ${path.relative(process.cwd(), CACHE_DIR)}`);
  await mapLimit(todo, CONCURRENCY, async (url) => {
    try {
      await download(url, cachePath(url));
      fetched++;
      if (loud && fetched % 200 === 0) console.info(`  … ${fetched}/${todo.length}`);
    } catch (err) {
      failed.push(url);
      console.error(`받지 못함 ${url}: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
  return { failed, fetched };
}
