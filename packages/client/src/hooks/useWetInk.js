import { useEffect } from 'react';
import { viewportCoordsToSceneCoords } from '@excalidraw/excalidraw';
import { buildStrokePath, makeFreedrawElement } from '../lib/wetInkStroke';
import {
  recognizeShape, snapLineEnd, linePoints, HOLD_MS, HOLD_RADIUS_PX, CANCEL_MOVE_PX, MIN_LINE_PX,
} from '../lib/shapeRecognizer';
import { orderCoalesced, isMicroReversal, MICRO_REVERSAL_PX } from '../lib/penSamples';
import { beginPenStroke, recordPenMove, endPenStroke } from '../lib/penSampleLog';

/**
 * wet-ink 오버레이 (5개 필기 뷰어 공용, 기본 ON · ?wetink=0 비상 차단).
 *
 * Excalidraw 는 펜이 움직일 때마다 전체 씬을 재렌더해 태블릿에서 끊긴다. 펜 자유필기 입력을
 * window 캡처에서 가로채(= Excalidraw 로의 전파 차단) 진행 중인 획을 전용 오버레이 캔버스에
 * 우리가 직접 즉시 렌더하고(풀 펜 레이트), pointerup 에만 Excalidraw freedraw 요소로 commit 한다.
 * commit 은 updateScene → onChange 로 기존 저장/동기화/히스토리 파이프라인을 그대로 탄다.
 *
 * window 캡처 + stopPropagation 으로 Excalidraw(#root 위임 핸들러)에는 전달되지 않지만,
 * 같은 window 리스너인 useExcalidrawTouch 는 그대로 실행된다(penDownRef 등 유지).
 *
 * 가로채는 조건: 그리기 모드 ON + 논리 도구가 펜(자유필기) + pointerType==='pen' + 주버튼 + .excalidraw 내부.
 * (삼각형 모드도 Excalidraw activeTool 은 freedraw 이므로 penActiveRef 로 논리 도구를 구분한다.
 *  마우스/손가락/배럴버튼/지우개·도형은 가로채지 않아 기존 동작 유지.)
 *
 * 펜 멈춤 → 도형 보정(docs/superpowers/specs/2026-10-29-pen-shape-snap-design.md): 획 끝에서 HOLD_MS 동안
 * HOLD_RADIUS_PX 안에 머물면 lib/shapeRecognizer 로 선분/원·타원/삼각형/사각형을 판정해 미리보기·commit 점을
 * 바꾼다(저장은 여전히 freedraw). 선분은 이후 펜을 끌면 끝점이 따라오고, 닫힌 도형은 CANCEL_MOVE_PX 넘게
 * 움직이면 취소된다. 판정은 성공할 때까지 멈출 때마다 시도하고, 성공한 뒤에는 그 획에서 다시 하지 않는다.
 * 비상 끄기 ?shapesnap=0 (localStorage mc_shape_snap_off).
 *
 * @param {object} opts
 * @param {import('@excalidraw/excalidraw').CaptureUpdateAction[keyof import('@excalidraw/excalidraw').CaptureUpdateAction]} [opts.captureUpdate]
 *   commit 의 updateScene captureUpdate (화이트보드처럼 Excalidraw 내장 undo 를 쓰는 곳은 IMMEDIATELY; 생략 시 기본값)
 */
export function useWetInk({ excalidrawAPIRef, overlayRef, drawModeRef, penActiveRef, captureUpdate }) {
  useEffect(() => {
    // 기본 ON. 비상 차단 스위치: ?wetink=0 으로 끄고(localStorage 유지) ?wetink=1 로 되켠다.
    const params = new URLSearchParams(window.location.search);
    const wp = params.get('wetink');
    if (wp === '0') localStorage.setItem('mc_wetink_off', '1');
    else if (wp === '1') localStorage.removeItem('mc_wetink_off');
    if (localStorage.getItem('mc_wetink_off') === '1') return undefined;
    const sp = params.get('shapesnap');
    if (sp === '0') localStorage.setItem('mc_shape_snap_off', '1');
    else if (sp === '1') localStorage.removeItem('mc_shape_snap_off');
    const shapeSnapEnabled = localStorage.getItem('mc_shape_snap_off') !== '1';

    let drawing = false;
    let pointerId = null;
    let pts = [];          // [clientX, clientY]
    let pressures = [];
    let rect = null;       // 오버레이/컨테이너 bounding rect (down 시점)
    let dpr = 1;
    let rafId = 0;

    /* ── 도형 보정 상태 (획마다 초기화) ── */
    let snapped = null;    // { kind, points } — 판정 성공 시 미리보기·commit 에 쓰는 점(화면 px)
    let snapAnchor = null; // 닫힌 도형 확정 위치 (여기서 CANCEL_MOVE_PX 넘게 움직이면 취소)
    let holdAnchor = null; // 멈춤 판정 기준점
    let holdTimer = 0;
    let travel = 0;        // 획 누적 길이(화면 px)

    const clearHold = () => { if (holdTimer) { clearTimeout(holdTimer); holdTimer = 0; } };

    const onHold = () => {
      holdTimer = 0;
      if (!drawing || snapped || !shapeSnapEnabled) return;
      if (travel < MIN_LINE_PX / 2) return; // 펜을 대고 생각만 하는 동안은 판정할 것이 없다
      const result = recognizeShape(pts);
      if (!result) return;
      snapped = result;
      snapAnchor = pts[pts.length - 1];
      scheduleRender();
    };

    const armHold = (p) => {
      holdAnchor = p;
      clearHold();
      if (shapeSnapEnabled) holdTimer = setTimeout(onHold, HOLD_MS);
    };

    /** 새 점이 들어올 때의 보정 상태 갱신 */
    const trackPoint = (p, prev) => {
      travel += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
      if (snapped) {
        if (snapped.kind === 'line') {
          snapped = { kind: 'line', points: linePoints(snapped.points[0], snapLineEnd(snapped.points[0], p)) };
        } else if (Math.hypot(p[0] - snapAnchor[0], p[1] - snapAnchor[1]) > CANCEL_MOVE_PX) {
          snapped = null; // 글자를 쓰다 멈춘 경우 — 손글씨로 복귀
        }
        return;
      }
      if (!holdAnchor || Math.hypot(p[0] - holdAnchor[0], p[1] - holdAnchor[1]) > HOLD_RADIUS_PX) armHold(p);
    };

    const ctx = () => overlayRef.current?.getContext('2d');

    const sizeCanvas = () => {
      const cv = overlayRef.current;
      if (!cv) return;
      rect = cv.getBoundingClientRect();
      dpr = window.devicePixelRatio || 1;
      cv.width = Math.round(rect.width * dpr);
      cv.height = Math.round(rect.height * dpr);
    };

    const clear = () => {
      const c = ctx();
      if (!c || !overlayRef.current) return;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, overlayRef.current.width, overlayRef.current.height);
    };

    const render = () => {
      rafId = 0;
      const c = ctx();
      const api = excalidrawAPIRef.current;
      if (!c || !api || !pts.length) return;
      const app = api.getAppState();
      const zoom = app?.zoom?.value || 1;
      const size = (app?.currentItemStrokeWidth || 1) * zoom * 10; // 화면 px (vite excalidrawPenTweak 의 size 배수와 동일)
      const color = app?.currentItemStrokeColor || '#000000';
      const src = snapped ? snapped.points : pts;
      const screenPts = src.map((p) => [p[0] - rect.left, p[1] - rect.top]);
      const path = buildStrokePath(screenPts, snapped ? src.map(() => 0.5) : pressures, { size, simulatePressure: true, last: true });
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, rect.width, rect.height);
      if (path) { c.fillStyle = color; c.fill(path); }
    };
    const scheduleRender = () => { if (!rafId) rafId = requestAnimationFrame(render); };

    const shouldIntercept = (e) =>
      drawModeRef.current && penActiveRef.current &&
      e.pointerType === 'pen' && e.button === 0 &&
      !!overlayRef.current && !!e.target.closest?.('.excalidraw');

    const onDown = (e) => {
      if (!shouldIntercept(e)) return;
      e.stopPropagation();
      e.preventDefault();
      sizeCanvas();
      drawing = true;
      pointerId = e.pointerId;
      {
        const app = excalidrawAPIRef.current?.getAppState?.();
        beginPenStroke(e, { zoom: app?.zoom?.value, strokeWidth: app?.currentItemStrokeWidth });
      }
      pts = [[e.clientX, e.clientY]];
      pressures = [e.pressure || 0.5];
      snapped = null; snapAnchor = null; holdAnchor = null; travel = 0;
      armHold(pts[0]);
      scheduleRender();
    };

    const onMove = (e) => {
      if (!drawing || e.pointerId !== pointerId) return;
      e.stopPropagation();
      e.preventDefault();
      // iPad Safari 는 coalesced 샘플 순서가 뒤섞여 올 수 있다 → 시간순 정렬 + 미세 역행 점 제거 (lib/penSamples.js)
      const raw = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      const evs = orderCoalesced(raw.length ? raw : [e], pts[pts.length - 1]);
      let used = 0;
      for (const ev of evs) {
        const p = [ev.clientX, ev.clientY];
        if (isMicroReversal(pts, p, MICRO_REVERSAL_PX)) continue;
        trackPoint(p, pts[pts.length - 1]);
        pts.push(p);
        pressures.push(ev.pressure || 0.5);
        used += 1;
      }
      recordPenMove(e, raw, used);
      scheduleRender();
    };

    const commit = () => {
      clearHold();
      const api = excalidrawAPIRef.current;
      const src = snapped ? snapped.points : pts;
      endPenStroke({ committedPoints: src.length, rawPoints: pts.length, snapped: snapped?.kind || null });
      if (api && src.length >= 2) {
        const app = api.getAppState();
        const simulatePressure = true; // S-Pen 실제 필압 미사용(균일 젤펜 thinning 0 — pressures 미저장)
        const scenePoints = src.map(([cx, cy]) => viewportCoordsToSceneCoords({ clientX: cx, clientY: cy }, app));
        const el = makeFreedrawElement(scenePoints, snapped ? src.map(() => 0.5) : pressures, {
          strokeColor: app?.currentItemStrokeColor || '#000000',
          strokeWidth: app?.currentItemStrokeWidth || 1,
          simulatePressure,
        });
        api.updateScene({
          elements: [...api.getSceneElements(), el],
          ...(captureUpdate ? { captureUpdate } : { commitToHistory: false }),
        });
      }
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      drawing = false; pointerId = null; pts = []; pressures = [];
      snapped = null; snapAnchor = null; holdAnchor = null; travel = 0;
      // commit 직후 Excalidraw 가 같은 프레임에 요소를 그리므로 다음 프레임에 오버레이 클리어(겹침/깜빡임 방지)
      requestAnimationFrame(clear);
    };

    const onUp = (e) => {
      if (!drawing || e.pointerId !== pointerId) return;
      e.stopPropagation();
      commit();
    };

    window.addEventListener('pointerdown', onDown, { capture: true, passive: false });
    window.addEventListener('pointermove', onMove, { capture: true, passive: false });
    window.addEventListener('pointerup', onUp, { capture: true, passive: false });
    window.addEventListener('pointercancel', onUp, { capture: true, passive: false });
    return () => {
      clearHold();
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('pointerdown', onDown, { capture: true });
      window.removeEventListener('pointermove', onMove, { capture: true });
      window.removeEventListener('pointerup', onUp, { capture: true });
      window.removeEventListener('pointercancel', onUp, { capture: true });
    };
  }, [excalidrawAPIRef, overlayRef, drawModeRef, penActiveRef, captureUpdate]);
}
