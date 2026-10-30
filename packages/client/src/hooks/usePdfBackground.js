import { useCallback, useEffect, useRef, useState } from 'react';
import { isPdfPage } from '@mathchois/shared';
import { usePdfPage } from './usePdfDocument';
import { paperRectForPage, viewFromAppState } from '../lib/pdfLayerMath';
import { waitForLayout } from '../lib/excalidrawUtils';

const NO_PAPER = { pageId: null, rect: null };

function sameRect(a, b) {
  return !!a && !!b && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/**
 * 뷰어용 PDF 배경 — PDF 쪽을 열고 종이 위치(scene 좌표)를 정해 `PdfPageLayer` 에 넘긴다.
 * 이미지 페이지의 bg element 대신 쓰며, 종이 위치는 이미지와 같은 `bgPosition` 으로 저장된다
 * (`bgPositionRef.current` 를 종이 rect 로 갱신하므로 뷰어의 기존 저장 경로가 그대로 쓴다).
 *
 * 종이 위치 결정: 저장된 위치(`savedBgPosition` 을 넘겼으면 그것, 아니면 계산 시점의 `bgPositionRef.current`)가
 * 유효하면 그대로, 아니면 컨테이너에 맞춰 배치. 뷰어는 저장된 위치를 ref 에 채우고 컨테이너를 마운트한 뒤에
 * `page` 를 넘겨야 한다(로딩 중에는 null).
 *
 * @param {object} args
 * @param {any} args.page 현재 페이지(pdfUrl·pdfPage) | null
 * @param {import('react').RefObject<HTMLElement>} args.containerRef Excalidraw 컨테이너
 * @param {import('react').MutableRefObject<any>} args.bgPositionRef 뷰어의 bgPosition ref(읽고 씀)
 * @param {{ x: number, y: number, width: number, height: number } | null} [args.savedBgPosition]
 *   저장된 위치를 state 로 가진 뷰어용. 넘기면(null 포함) ref 대신 이것만 본다.
 */
export function usePdfBackground({ page, containerRef, bgPositionRef, savedBgPosition }) {
  const active = isPdfPage(page);
  const pageId = active ? page.id : null;
  const { page: pdfPage, pageSize, error, retry } = usePdfPage(
    active ? page.pdfUrl : null,
    active ? page.pdfPage : null,
  );
  const layerRef = useRef(null);
  const [paper, setPaper] = useState(NO_PAPER);
  const paperStateRef = useRef(NO_PAPER);
  const pageIdRef = useRef(pageId);

  const commitPaper = useCallback((next) => {
    paperStateRef.current = next;
    setPaper(next);
  }, []);

  useEffect(() => {
    pageIdRef.current = pageId;
  }, [pageId]);

  /* 쪽 크기가 오면(페이지가 바뀌면) 종이 위치를 정한다 */
  useEffect(() => {
    const container = containerRef.current;
    if (!pageId || !pageSize || !container) return undefined;
    let cancelled = false;
    waitForLayout(container).then((size) => {
      if (cancelled) return;
      const saved = savedBgPosition !== undefined ? savedBgPosition : bgPositionRef.current;
      const rect = paperRectForPage(pageSize, size, saved);
      bgPositionRef.current = rect;
      commitPaper({ pageId, rect });
    });
    return () => { cancelled = true; };
  }, [pageId, pageSize, savedBgPosition, containerRef, bgPositionRef, commitPaper]);

  /* "이미지 위치 초기화" — 저장 위치를 버리고 컨테이너에 다시 맞춘 뒤 레이어를 다시 그린다 */
  const rerender = useCallback(async () => {
    const container = containerRef.current;
    if (!pageId || !pageSize || !container) return;
    bgPositionRef.current = null;
    const size = await waitForLayout(container);
    if (pageIdRef.current !== pageId) return;
    const rect = paperRectForPage(pageSize, size, null);
    bgPositionRef.current = rect;
    const current = paperStateRef.current;
    if (current.pageId === pageId && sameRect(current.rect, rect)) layerRef.current?.rerender();
    else commitPaper({ pageId, rect }); // 종이가 바뀌면 레이어가 스스로 다시 렌더
  }, [pageId, pageSize, containerRef, bgPositionRef, commitPaper]);

  /* Excalidraw onChange 마다 호출(제스처 중 포함). 레이어가 없으면(비활성) layerRef 가 비어 no-op.
     의존성이 없어 항상 같은 함수 — 뷰어의 useCallback 의존성에 넣어도 재생성되지 않는다. */
  const onViewport = useCallback((appState) => {
    if (!appState?.zoom) return;
    layerRef.current?.setViewport(viewFromAppState(appState));
  }, []);

  const paperRect = active && paper.pageId === pageId ? paper.rect : null;
  return {
    active,
    layerRef,
    layerProps: { page: pdfPage, paperRect, error, onRetry: retry }, // 비활성이면 usePdfPage 가 빈 값
    onViewport,
    rerender,
    paperRect,
  };
}
