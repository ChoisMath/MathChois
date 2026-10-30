import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { RotateCw } from 'lucide-react';
import IconButton from '../common/IconButton';
import { VIEWPORT_SETTLE_MS, sameView, sceneToScreen, renderPlan, placeBitmap } from '../../lib/pdfLayerMath';

const ERROR_TEXT = {
  document: 'PDF를 불러오지 못했습니다',
  page: '쪽을 불러오지 못했습니다',
};

function placeBox(el, box) {
  el.style.left = `${box.left}px`;
  el.style.top = `${box.top}px`;
  el.style.width = `${box.width}px`;
  el.style.height = `${box.height}px`;
}

/**
 * Excalidraw 아래에 깔리는 PDF 벡터 레이어(입력은 받지 않음 — pointer-events: none).
 * 뷰어가 onChange 마다 `ref.setViewport(view)` 를 부르면, 마지막 비트맵을 CSS transform 으로 즉시 옮기고
 * 뷰포트가 VIEWPORT_SETTLE_MS 동안 멈추면 보이는 부분만 zoom × DPR 로 다시 렌더한다.
 *
 * 배치 방식: 캔버스의 style left/top/width/height 는 렌더 당시 clip(`rendered.css`) 그대로 두고,
 * 이후 이동·확대는 그 자리를 기준으로 한 transform 으로만 표현한다
 * (`translate(place.left - css.left, place.top - css.top) scale(s)`, transformOrigin 0 0).
 * 새 렌더는 화면 밖 캔버스(ref 하나를 재사용)에 그린 뒤 완료되면 보이는 캔버스에 복사한다(렌더 도중 흰 화면 깜박임 방지).
 * 복사가 끝나면(또는 렌더가 실패하면) 화면 밖 캔버스를 0×0 으로 줄여 다음 렌더까지 메모리를 돌려준다
 * — iOS Safari 는 캔버스 메모리가 차면 getContext('2d') 가 null 을 돌려준다.
 * 복사 직후 transform 을 지우고, 렌더 도중 뷰가 바뀌었으면 즉시 현재 뷰로 다시 배치한다.
 * 오류 안내는 z-0 레이어 밖의 형제 요소(zIndex 4, 젖은 잉크 캔버스 3 위)로 그려야 Excalidraw 위에서 누를 수 있다.
 *
 * @param {object} props
 * @param {any} props.page PDFPageProxy | null
 * @param {{ x: number, y: number, width: number, height: number } | null} props.paperRect 종이(scene 좌표, 값으로 비교)
 * @param {import('react').RefObject<HTMLElement>} props.containerRef Excalidraw 컨테이너(크기 기준)
 * @param {'document' | 'page' | null} [props.error]
 * @param {() => void} [props.onRetry]
 * @param {import('react').Ref<{ setViewport: (view: any) => void, rerender: () => void }>} [props.ref]
 */
export default function PdfPageLayer({ page, paperRect, containerRef, error, onRetry, ref }) {
  const canvasRef = useRef(null);
  const offscreenRef = useRef(null);
  const paperRef = useRef(null);
  const propsRef = useRef({ page: null, paperRect: null, pageSize: null });
  const lastViewRef = useRef(null);
  const renderedRef = useRef(null); // { css, view } — 보이는 캔버스에 담긴 비트맵의 렌더 당시 배치
  const timerRef = useRef(null);
  const taskRef = useRef(null);
  const tokenRef = useRef(0);

  const hideCanvas = useCallback(() => {
    renderedRef.current = null;
    if (canvasRef.current) canvasRef.current.style.display = 'none';
  }, []);

  const placePaper = useCallback(() => {
    const el = paperRef.current;
    if (!el) return;
    const { paperRect: rect } = propsRef.current;
    const view = lastViewRef.current;
    if (!rect || !view) {
      el.style.display = 'none';
      return;
    }
    placeBox(el, sceneToScreen(rect, view));
    el.style.display = 'block';
  }, []);

  const placeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const rendered = renderedRef.current;
    const view = lastViewRef.current;
    if (!canvas || !rendered || !view) return;
    const place = placeBitmap(rendered, view);
    canvas.style.transform =
      `translate(${place.left - rendered.css.left}px, ${place.top - rendered.css.top}px) scale(${place.scale})`;
  }, []);

  const releaseOffscreen = useCallback(() => {
    const off = offscreenRef.current;
    if (off) {
      off.width = 0;
      off.height = 0;
    }
  }, []);

  const cancelTask = useCallback(() => {
    tokenRef.current += 1;
    if (taskRef.current) {
      taskRef.current.cancel();
      taskRef.current = null;
    }
  }, []);

  const render = useCallback(async () => {
    clearTimeout(timerRef.current);
    timerRef.current = null;
    cancelTask();
    const token = tokenRef.current;
    const { page: pdfPage, paperRect: paper, pageSize } = propsRef.current;
    const view = lastViewRef.current;
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!pdfPage || !paper || !pageSize || !view || !container || !canvas) {
      hideCanvas();
      return;
    }
    const plan = renderPlan({
      paper,
      view,
      container: { width: container.clientWidth, height: container.clientHeight },
      pageSize,
      dpr: window.devicePixelRatio,
    });
    if (!plan) {
      hideCanvas();
      return;
    }

    /* 이전 작업은 위 cancelTask 에서 동기적으로 취소됐으므로(pdf.js 의 canvasInUse 해제) 같은 캔버스를 다시 써도 된다 */
    if (!offscreenRef.current) offscreenRef.current = document.createElement('canvas');
    const offscreen = offscreenRef.current;
    offscreen.width = plan.canvasWidth;
    offscreen.height = plan.canvasHeight;
    const offCtx = offscreen.getContext('2d');
    if (!offCtx) {
      console.warn('PDF 쪽 렌더 실패: 2D 컨텍스트를 만들 수 없음');
      releaseOffscreen();
      return; // 이전 비트맵 유지
    }
    let task = null;
    try {
      offCtx.fillStyle = '#ffffff';
      offCtx.fillRect(0, 0, plan.canvasWidth, plan.canvasHeight);
      task = pdfPage.render({
        canvasContext: offCtx,
        viewport: pdfPage.getViewport({ scale: plan.scale, offsetX: plan.offsetX, offsetY: plan.offsetY }),
      });
      taskRef.current = task;
      await task.promise;
    } catch (err) {
      if (err?.name !== 'RenderingCancelledException') console.warn('PDF 쪽 렌더 실패', err);
      /* 취소됐다면 새 렌더가 이미 화면 밖 캔버스를 쓰고 있을 수 있으므로 내 차례일 때만 비운다 */
      if (token === tokenRef.current) releaseOffscreen();
      return;
    } finally {
      if (task && taskRef.current === task) taskRef.current = null;
    }
    if (token !== tokenRef.current || canvasRef.current !== canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.warn('PDF 쪽 렌더 실패: 2D 컨텍스트를 만들 수 없음');
      releaseOffscreen();
      return; // 크기를 바꾸기 전이므로 이전 비트맵 유지
    }
    canvas.width = plan.canvasWidth;
    canvas.height = plan.canvasHeight;
    ctx.drawImage(offscreen, 0, 0);
    releaseOffscreen();
    placeBox(canvas, plan.css);
    canvas.style.transform = 'none';
    canvas.style.display = 'block';
    renderedRef.current = { css: plan.css, view };
    if (!sameView(view, lastViewRef.current)) placeCanvas();
  }, [cancelTask, containerRef, hideCanvas, placeCanvas, releaseOffscreen]);

  /* 뷰포트·컨테이너 크기가 VIEWPORT_SETTLE_MS 동안 멈추면 한 번만 다시 렌더한다 */
  const scheduleRender = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(render, VIEWPORT_SETTLE_MS);
  }, [render]);

  const setViewport = useCallback((view) => {
    if (sameView(lastViewRef.current, view)) return;
    lastViewRef.current = view;
    placeCanvas();
    placePaper();
    scheduleRender();
  }, [placeCanvas, placePaper, scheduleRender]);

  const rerender = useCallback(() => { render(); }, [render]);

  useImperativeHandle(ref, () => ({ setViewport, rerender }), [setViewport, rerender]);

  /* 페이지·종이가 바뀌면 이전 비트맵은 쓸 수 없다 → 숨기고 새로 렌더.
     종이는 값으로 비교한다(뷰어가 같은 값의 새 객체를 넘겨도 다시 렌더하지 않음). */
  const paperX = paperRect?.x;
  const paperY = paperRect?.y;
  const paperW = paperRect?.width;
  const paperH = paperRect?.height;
  useLayoutEffect(() => {
    let pageSize = null;
    if (page) {
      const { width, height } = page.getViewport({ scale: 1 });
      pageSize = { width, height };
    }
    const rect = paperX == null ? null : { x: paperX, y: paperY, width: paperW, height: paperH };
    propsRef.current = { page, paperRect: rect, pageSize };
    hideCanvas();
    placePaper();
    render();
  }, [page, paperX, paperY, paperW, paperH, hideCanvas, placePaper, render]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return undefined;
    /* 크기 변경(회전·창 조절)은 연속으로 오므로 즉시 렌더하지 않고 같은 정착 타이머로 모은다 */
    const observer = new ResizeObserver(() => scheduleRender());
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef, scheduleRender]);

  useEffect(() => () => {
    clearTimeout(timerRef.current);
    cancelTask();
    releaseOffscreen();
  }, [cancelTask, releaseOffscreen]);

  return (
    <>
      <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0, background: '#e5e7eb' }}>
        <div ref={paperRef} className="absolute bg-white" style={{ display: 'none' }} />
        <canvas
          ref={canvasRef}
          data-testid="pdf-layer-canvas"
          className="absolute"
          style={{ display: 'none', transformOrigin: '0 0' }}
        />
      </div>
      {error && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 4 }}>
          <div
            role="alert"
            className="flex flex-col items-center gap-2 rounded-lg bg-white/95 px-5 py-4 text-sm text-gray-700 shadow"
            style={{ pointerEvents: 'auto' }}
          >
            <p>{ERROR_TEXT[error] ?? ERROR_TEXT.document}</p>
            <IconButton icon={RotateCw} label="다시 시도" onClick={onRetry} />
          </div>
        </div>
      )}
    </>
  );
}
