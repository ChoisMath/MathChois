import { openPdf } from './pdfjs';

/**
 * PDF 문서 LRU 캐시. 문서(PDFDocumentProxy)를 url 별로 한 번만 열고, 페이지 프록시도 문서별로 재사용한다.
 * `max` 개를 넘으면 가장 오래 쓰지 않은 문서를 destroy() 해 워커 쪽 메모리를 돌려준다.
 * 실패한 promise 는 캐시에서 빼서 다음 호출이 다시 시도하게 한다.
 * `pin(url)` 된 문서(화면에 그려진 배경 등)는 밀어내지 않는다 — 모두 고정이면 잠시 `max` 를 넘는다.
 * 이 모듈을 import 해도 pdf.js 는 로드되지 않는다(openPdf 가 처음 호출될 때 동적 import).
 *
 * @param {{ open: (url: string) => Promise<any>, max?: number }} options
 */
export function createDocCache({ open, max = 2 }) {
  /** @type {Map<string, { doc: Promise<any>, resolved: any, pages: Map<number, Promise<any>> }>} 삽입 순서 = 사용 순서 */
  const entries = new Map();
  /** @type {Map<string, number>} url → 고정 횟수 */
  const pins = new Map();

  function destroyEntry(entry) {
    if (entry.resolved) entry.resolved.destroy();
    else entry.doc.then((d) => d.destroy(), () => {});
  }

  /** url 의 항목을 가장 최근으로 옮기거나 새로 연다. */
  function touch(url) {
    let entry = entries.get(url);
    if (entry) {
      entries.delete(url);
      entries.set(url, entry);
      return entry;
    }
    const doc = Promise.resolve().then(() => open(url));
    entry = { doc, resolved: null, pages: new Map() };
    const created = entry;
    doc.then(
      (d) => { created.resolved = d; },
      () => { if (entries.get(url) === created) entries.delete(url); },
    );
    entries.set(url, entry);
    trim(url);
    return entry;
  }

  /** max 를 넘는 동안 가장 오래 안 쓴, 고정되지 않은 문서부터 닫는다(`keep` 은 방금 연 문서). */
  function trim(keep) {
    for (const [url, entry] of entries) {
      if (entries.size <= max) break;
      if (url === keep || pins.has(url)) continue;
      entries.delete(url);
      destroyEntry(entry);
    }
  }

  /** url 문서를 밀어내지 않게 고정한다. 돌려준 함수로 해제(여러 번 불러도 한 번만 센다). */
  function pin(url) {
    pins.set(url, (pins.get(url) ?? 0) + 1);
    let released = false;
    return function unpin() {
      if (released) return;
      released = true;
      const left = (pins.get(url) ?? 1) - 1;
      if (left > 0) { pins.set(url, left); return; }
      pins.delete(url);
      trim(null);
    };
  }

  function get(url) {
    return touch(url).doc;
  }

  function getPage(url, n) {
    const entry = touch(url);
    let page = entry.pages.get(n);
    if (!page) {
      page = entry.doc.then((d) => d.getPage(n));
      const created = page;
      page.catch(() => { if (entry.pages.get(n) === created) entry.pages.delete(n); });
      entry.pages.set(n, page);
    }
    return page;
  }

  /** 이웃 쪽을 미리 받아 둔다(실패는 무시 — 실제로 열 때 다시 시도). */
  function prefetch(url, ns) {
    for (const n of ns) getPage(url, n).catch(() => {});
  }

  function evict(url) {
    const entry = entries.get(url);
    if (!entry) return;
    entries.delete(url);
    destroyEntry(entry);
  }

  return { get, getPage, prefetch, evict, pin };
}

export const pdfDocCache = createDocCache({ open: openPdf });
