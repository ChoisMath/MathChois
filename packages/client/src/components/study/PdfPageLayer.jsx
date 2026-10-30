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
 * 새 렌더는 화면 밖 캔버스에 그린 뒤 완료되면 보이는 캔버스에 복사한다(렌더 도중 흰 화면 깜박임 방지).
 * 복사 직후 transform 을 지우고, 렌더 도중 뷰가 바뀌었으면 즉시 현재 뷰로 다시 배치한다.
 *
 * @param {object} props
 * @param {any} props.page PDFPageProxy | null
 * @param {{ x: number, y: number, width: number, height: number } | null} props.paperRect 종이(scene 좌표).
 *   바뀔 때마다 비트맵을 버리고 다시 렌더하므로 호출 쪽에서 참조를 안정적으로 유지(useMemo 등)해야 한다.
 * @param {import('react').RefObject<HTMLElement>} props.containerRef Excalidraw 컨테이너(크기 기준)
 * @param {'document' | 'page' | null} [props.error]
 * @param {() => void} [props.onRetry]
 * @param {import('react').Ref<{ setViewport: (view: any) => void, rerender: () => void }>} [props.ref]
 */
export default function PdfPageLayer({ page, paperRect, containerRef, error, onRetry, ref }) {
  const canvasRef = useRef(null);
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

    const offscreen = document.createElement('canvas');
    offscreen.width = plan.canvasWidth;
    offscreen.height = plan.canvasHeight;
    const offCtx = offscreen.getContext('2d');
    offCtx.fillStyle = '#ffffff';
    offCtx.fillRect(0, 0, plan.canvasWidth, plan.canvasHeight);
    let task = null;
    try {
      task = pdfPage.render({
        canvasContext: offCtx,
        viewport: pdfPage.getViewport({ scale: plan.scale, offsetX: plan.offsetX, offsetY: plan.offsetY }),
      });
      taskRef.current = task;
      await task.promise;
    } catch (err) {
      if (err?.name !== 'RenderingCancelledException') console.warn('PDF 쪽 렌더 실패', err);
      return;
    } finally {
      if (task && taskRef.current === task) taskRef.current = null;
    }
    if (token !== tokenRef.current || canvasRef.current !== canvas) return;

    canvas.width = plan.canvasWidth;
    canvas.height = plan.canvasHeight;
    canvas.getContext('2d').drawImage(offscreen, 0, 0);
    placeBox(canvas, plan.css);
    canvas.style.transform = 'none';
    canvas.style.display = 'block';
    renderedRef.current = { css: plan.css, view };
    if (!sameView(view, lastViewRef.current)) placeCanvas();
  }, [cancelTask, containerRef, hideCanvas, placeCanvas]);

  const setViewport = useCallback((view) => {
    if (sameView(lastViewRef.current, view)) return;
    lastViewRef.current = view;
    placeCanvas();
    placePaper();
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(render, VIEWPORT_SETTLE_MS);
  }, [placeCanvas, placePaper, render]);

  const rerender = useCallback(() => { render(); }, [render]);

  useImperativeHandle(ref, () => ({ setViewport, rerender }), [setViewport, rerender]);

  /* 페이지·종이가 바뀌면 이전 비트맵은 쓸 수 없다 → 숨기고 새로 렌더 */
  useLayoutEffect(() => {
    let pageSize = null;
    if (page) {
      const { width, height } = page.getViewport({ scale: 1 });
      pageSize = { width, height };
    }
    propsRef.current = { page, paperRect, pageSize };
    hideCanvas();
    placePaper();
    render();
  }, [page, paperRect, hideCanvas, placePaper, render]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => render());
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef, render]);

  useEffect(() => () => {
    clearTimeout(timerRef.current);
    cancelTask();
  }, [cancelTask]);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0, background: '#e5e7eb' }}>
      <div ref={paperRef} className="absolute bg-white" style={{ display: 'none' }} />
      <canvas
        ref={canvasRef}
        data-testid="pdf-layer-canvas"
        className="absolute"
        style={{ display: 'none', transformOrigin: '0 0' }}
      />
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-gray-600">
          <p>{ERROR_TEXT[error] ?? ERROR_TEXT.document}</p>
          <IconButton icon={RotateCw} label="다시 시도" onClick={onRetry} style={{ pointerEvents: 'auto' }} />
        </div>
      )}
    </div>
  );
}
