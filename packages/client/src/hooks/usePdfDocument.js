import { useCallback, useEffect, useState } from 'react';
import { isPdfPage } from '@mathchois/shared';
import { pdfDocCache } from '../lib/pdfDocCache';

/** 이웃 쪽 미리 받기 — `pdfDocCache.prefetch` 그대로. */
export const prefetchPdfPages = (pdfUrl, numbers) => pdfDocCache.prefetch(pdfUrl, numbers);

/**
 * 뷰어의 이웃 페이지 중 현재 페이지와 같은 PDF 문서의 쪽만 미리 받는다
 * — 문서 LRU(2개)에서 화면의 문서가 밀려나지 않도록 다른 문서는 받지 않는다.
 * 현재 페이지가 PDF 가 아니면 아무것도 하지 않는다.
 * @param {any} currentPage
 * @param {any[]} neighbours 이전·다음 페이지(null 허용)
 */
export function prefetchPdfNeighbors(currentPage, neighbours) {
  if (!isPdfPage(currentPage)) return;
  const numbers = neighbours
    .filter((n) => isPdfPage(n) && n.pdfUrl === currentPage.pdfUrl)
    .map((n) => n.pdfPage);
  if (numbers.length > 0) prefetchPdfPages(currentPage.pdfUrl, numbers);
}

const EMPTY = { page: null, pageSize: null, error: null };

/**
 * PDF 한 쪽을 연다(문서는 pdfDocCache 가 공유).
 * 결과는 요청 키(url·쪽·재시도 횟수)와 함께 저장하고, 현재 키와 다르면 버린다 —
 * url/쪽이 바뀐 뒤 늦게 끝난 이전 요청이 화면을 덮지 않는다.
 *
 * @param {string | null | undefined} pdfUrl
 * @param {number | null | undefined} pageNumber 1부터
 * @returns {{ page: any, pageSize: { width: number, height: number } | null, error: 'document' | 'page' | null, retry: () => void }}
 */
export function usePdfPage(pdfUrl, pageNumber) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState({ key: null, ...EMPTY });
  const key = pdfUrl && pageNumber ? `${attempt}|${pageNumber}|${pdfUrl}` : null;

  /* 화면에 그리는 문서는 썸네일·이웃 문서가 문서 LRU 를 채워도 닫히지 않게 고정한다 */
  useEffect(() => {
    if (!pdfUrl) return undefined;
    return pdfDocCache.pin(pdfUrl);
  }, [pdfUrl]);

  useEffect(() => {
    if (!key) return undefined;
    let active = true;
    const settle = (value) => { if (active) setResult({ key, ...EMPTY, ...value }); };
    pdfDocCache.get(pdfUrl).then(
      () => pdfDocCache.getPage(pdfUrl, pageNumber).then(
        (page) => {
          const { width, height } = page.getViewport({ scale: 1 });
          settle({ page, pageSize: { width, height } });
        },
        () => settle({ error: 'page' }),
      ),
      () => settle({ error: 'document' }),
    );
    return () => { active = false; };
  }, [key, pdfUrl, pageNumber]);

  const retry = useCallback(() => {
    if (pdfUrl) pdfDocCache.evict(pdfUrl);
    setAttempt((n) => n + 1);
  }, [pdfUrl]);

  const current = result.key === key ? result : EMPTY;
  return { page: current.page, pageSize: current.pageSize, error: current.error, retry };
}
