import { useEffect } from 'react';
import { viewportCoordsToSceneCoords } from '@excalidraw/excalidraw';
import { buildStrokePath, makeFreedrawElement } from '../lib/wetInkStroke';

/**
 * wet-ink 오버레이 (PoC, StudyViewer 이미지 페이지 전용).
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
 */
export function useWetInk({ excalidrawAPIRef, overlayRef, drawModeRef, penActiveRef, enabledRef }) {
  useEffect(() => {
    let drawing = false;
    let pointerId = null;
    let pts = [];          // [clientX, clientY]
    let pressures = [];
    let hasRealPressure = false;
    let rect = null;       // 오버레이/컨테이너 bounding rect (down 시점)
    let dpr = 1;
    let rafId = 0;

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
      const size = (app?.currentItemStrokeWidth || 1) * zoom * 4.25; // 화면 px (Excalidraw 렌더와 동일)
      const color = app?.currentItemStrokeColor || '#000000';
      const screenPts = pts.map((p) => [p[0] - rect.left, p[1] - rect.top]);
      const path = buildStrokePath(screenPts, pressures, { size, simulatePressure: !hasRealPressure });
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, rect.width, rect.height);
      if (path) { c.fillStyle = color; c.fill(path); }
    };
    const scheduleRender = () => { if (!rafId) rafId = requestAnimationFrame(render); };

    const shouldIntercept = (e) =>
      enabledRef.current && drawModeRef.current && penActiveRef.current &&
      e.pointerType === 'pen' && e.button === 0 &&
      !!overlayRef.current && !!e.target.closest?.('.excalidraw');

    const onDown = (e) => {
      if (!shouldIntercept(e)) return;
      e.stopPropagation();
      e.preventDefault();
      sizeCanvas();
      drawing = true;
      pointerId = e.pointerId;
      pts = [[e.clientX, e.clientY]];
      pressures = [e.pressure || 0.5];
      hasRealPressure = e.pressure > 0 && e.pressure !== 0.5;
      scheduleRender();
    };

    const onMove = (e) => {
      if (!drawing || e.pointerId !== pointerId) return;
      e.stopPropagation();
      e.preventDefault();
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of evs.length ? evs : [e]) {
        pts.push([ev.clientX, ev.clientY]);
        pressures.push(ev.pressure || 0.5);
        if (ev.pressure > 0 && ev.pressure !== 0.5) hasRealPressure = true;
      }
      scheduleRender();
    };

    const commit = () => {
      const api = excalidrawAPIRef.current;
      if (api && pts.length >= 2) {
        const app = api.getAppState();
        const simulatePressure = !hasRealPressure;
        const scenePoints = pts.map(([cx, cy]) => viewportCoordsToSceneCoords({ clientX: cx, clientY: cy }, app));
        const el = makeFreedrawElement(scenePoints, pressures, {
          strokeColor: app?.currentItemStrokeColor || '#000000',
          strokeWidth: app?.currentItemStrokeWidth || 1,
          simulatePressure,
        });
        api.updateScene({ elements: [...api.getSceneElements(), el], commitToHistory: false });
      }
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      drawing = false; pointerId = null; pts = []; pressures = []; hasRealPressure = false;
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
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('pointerdown', onDown, { capture: true });
      window.removeEventListener('pointermove', onMove, { capture: true });
      window.removeEventListener('pointerup', onUp, { capture: true });
      window.removeEventListener('pointercancel', onUp, { capture: true });
    };
  }, [excalidrawAPIRef, overlayRef, drawModeRef, penActiveRef, enabledRef]);
}
