/**
 * 올가미 선택 (Excalidraw 0.18.1 에는 올가미 도구가 없어 직접 구현).
 *
 * 논리 도구가 lasso(Excalidraw 는 selection)일 때 window-capture 로 포인터를 가로채 오버레이 캔버스에 점선 경로를 그리고,
 * 떼면 lib/lasso.js 로 안에 든 요소를 골라 Excalidraw 선택 상태(selectedElementIds/selectedGroupIds)로 넘긴다.
 * 이후 이동·크기 조절·회전·삭제는 Excalidraw 가 처리한다: 선택 묶음의 화면 bbox(+핸들 여백, lib/lasso.js selectionPad) 안을 누르면 가로채지 않고,
 * 밖을 누르면 새 올가미를 시작한다. 탭(이동 거리 < TAP_MAX_PX)은 선택 해제.
 *
 * 가로채는 입력: 펜·마우스 주버튼, 손가락은 입력 모드 finger 일 때만(스타일러스 모드의 손가락은 팬/줌). 두 번째 손가락이 닿으면 취소.
 * 오버레이 캔버스는 웻잉크와 공유한다(두 도구는 동시에 켜지지 않는다).
 * 스펙: docs/superpowers/specs/2026-10-30-lasso-and-bg-fit-design.md
 */
import { useEffect } from 'react';
import { viewportCoordsToSceneCoords } from '@excalidraw/excalidraw';
import { lassoSelection, selectionScreenBounds, selectionPad, isTapPath } from '../lib/lasso';
import { getInputMode } from '../lib/inputMode';

export const LASSO_STROKE = '#4b5563';
export const LASSO_DASH = [6, 4];

export function useLasso({ excalidrawAPIRef, overlayRef, drawModeRef, lassoActiveRef, excludeIds = [], excludePrefixes = [] }) {
  const excludeIdsKey = excludeIds.join('\u0000');
  const excludePrefixesKey = excludePrefixes.join('\u0000');

  useEffect(() => {
    const exIds = excludeIdsKey ? excludeIdsKey.split('\u0000') : [];
    const exPrefixes = excludePrefixesKey ? excludePrefixesKey.split('\u0000') : [];
    let drawing = false;
    let pointerId = null;
    let pts = [];
    let rafId = 0;
    let rect = null;
    let dpr = 1;

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
      if (!c || !rect || pts.length < 2) return;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, rect.width, rect.height);
      c.lineWidth = 1.5;
      c.lineJoin = 'round';
      c.strokeStyle = LASSO_STROKE;
      c.setLineDash(LASSO_DASH);
      c.beginPath();
      pts.forEach(([x, y], i) => (i ? c.lineTo(x - rect.left, y - rect.top) : c.moveTo(x - rect.left, y - rect.top)));
      c.stroke();
      // 닫는 선(끝 → 시작)은 옅게
      c.globalAlpha = 0.4;
      c.beginPath();
      c.moveTo(pts[pts.length - 1][0] - rect.left, pts[pts.length - 1][1] - rect.top);
      c.lineTo(pts[0][0] - rect.left, pts[0][1] - rect.top);
      c.stroke();
      c.globalAlpha = 1;
      c.setLineDash([]);
    };
    const scheduleRender = () => { if (!rafId) rafId = requestAnimationFrame(render); };

    const pointerAllowed = (e) => {
      if (e.pointerType === 'touch') return getInputMode() === 'finger';
      return e.button === 0;
    };

    /** 현재 선택 묶음의 화면 bbox 안을 눌렀는지 (→ Excalidraw 에 이동/크기 조절을 맡긴다) */
    const insideSelection = (e) => {
      const api = excalidrawAPIRef.current;
      if (!api) return false;
      const app = api.getAppState();
      const ids = app?.selectedElementIds || {};
      if (!Object.keys(ids).length) return false;
      // 핸들은 상자 밖에 있으므로 포인터 종류별 핸들 크기만큼 여백을 둔다 (펜 16·손가락 28px, 위쪽은 회전 핸들까지)
      const b = selectionScreenBounds(api.getSceneElements(), ids, app, selectionPad(e.pointerType));
      if (!b) return false;
      const r = overlayRef.current?.getBoundingClientRect() || { left: 0, top: 0 };
      const x = e.clientX - r.left, y = e.clientY - r.top;
      return x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;
    };

    const shouldIntercept = (e) =>
      drawModeRef.current && lassoActiveRef.current &&
      pointerAllowed(e) && !!overlayRef.current && !!e.target.closest?.('.excalidraw') &&
      !insideSelection(e);

    const cancel = () => {
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      drawing = false; pointerId = null; pts = [];
      clear();
    };

    const onDown = (e) => {
      if (drawing) {
        // 두 번째 손가락(핀치) → 진행 중 올가미 취소
        if (e.pointerType === 'touch' && e.pointerId !== pointerId) cancel();
        return;
      }
      if (!shouldIntercept(e)) return;
      e.stopPropagation();
      e.preventDefault();
      sizeCanvas();
      drawing = true;
      pointerId = e.pointerId;
      pts = [[e.clientX, e.clientY]];
    };

    const onMove = (e) => {
      if (!drawing || e.pointerId !== pointerId) return;
      e.stopPropagation();
      e.preventDefault();
      pts.push([e.clientX, e.clientY]);
      scheduleRender();
    };

    const finish = () => {
      const api = excalidrawAPIRef.current;
      const path = pts;
      cancel();
      if (!api) return;
      if (isTapPath(path)) {
        api.updateScene({ appState: { selectedElementIds: {}, selectedGroupIds: {} } });
        return;
      }
      const app = api.getAppState();
      const polygon = path.map(([cx, cy]) => {
        const s = viewportCoordsToSceneCoords({ clientX: cx, clientY: cy }, app);
        return [s.x, s.y];
      });
      const sel = lassoSelection(api.getSceneElements(), polygon, { excludeIds: exIds, excludePrefixes: exPrefixes });
      api.updateScene({ appState: { selectedElementIds: sel.selectedElementIds, selectedGroupIds: sel.selectedGroupIds } });
    };

    const onUp = (e) => {
      if (!drawing || e.pointerId !== pointerId) return;
      e.stopPropagation();
      e.preventDefault();
      finish();
    };
    const onCancel = (e) => {
      if (!drawing || e.pointerId !== pointerId) return;
      cancel();
    };

    window.addEventListener('pointerdown', onDown, { capture: true, passive: false });
    window.addEventListener('pointermove', onMove, { capture: true, passive: false });
    window.addEventListener('pointerup', onUp, { capture: true, passive: false });
    window.addEventListener('pointercancel', onCancel, { capture: true, passive: false });
    return () => {
      cancel();
      window.removeEventListener('pointerdown', onDown, { capture: true });
      window.removeEventListener('pointermove', onMove, { capture: true });
      window.removeEventListener('pointerup', onUp, { capture: true });
      window.removeEventListener('pointercancel', onCancel, { capture: true });
    };
  }, [excalidrawAPIRef, overlayRef, drawModeRef, lassoActiveRef, excludeIdsKey, excludePrefixesKey]);
}
