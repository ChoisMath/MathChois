import { useCallback, useEffect, useRef } from 'react';
import { getInputMode, shouldBlockTouchDraw } from '../lib/inputMode';
import { BG_ELEMENT_ID } from '../lib/excalidrawUtils';

/**
 * Excalidraw 터치/제스처 제어 훅
 *
 * 입력 모드(스타일러스/손가락)로 그리기 입력을 결정적으로 게이트한다.
 * - 스타일러스 모드: 단일 손가락 + 그리기 도구 → 그리기는 차단(손바닥 연결선 원천 차단)하되
 *   잠금이 아니면 그 손가락으로 화면을 좌우/상하 팬한다.
 * - 두 손가락: 커스텀 핀치줌 + 팬 (freedraw)
 * - screenLocked=true: 2손가락 이상 줌/팬 차단, 1손가락 팬도 비활성(HTML 오버레이는 뷰포트 고정)
 * - S Pen 배럴버튼: 그리기 전달 차단
 * - baseStrokeWidthRef: 줌-독립 펜 두께 (핀치줌 시 자동 보정)
 *
 * 핀치줌/팬의 updateScene 은 requestAnimationFrame 으로 코얼레싱한다. 태블릿 touchmove 는
 * 60~120Hz 로 들어오는데, 매 이벤트마다 updateScene → 전체 리렌더 + onChange 를 돌리면
 * 메인 스레드가 포화되어 줌이 "로딩처럼" 끊기고 Socket.IO 하트비트가 굶어 접속이 끊긴다.
 * 제스처 누적 뷰포트는 viewportRef 가 단일 출처로 들고, 프레임당 한 번만 반영한다.
 * 줌 반영 시에는 shouldCacheIgnoreZoom=true 를 함께 넣는다 — Excalidraw 는 줌이 바뀌면
 * 모든 element 의 캔버스 캐시를 재생성하므로(이미지+필기 페이지에서 프레임당 수십 MB 할당
 * → OOM 튕김), 내장 핀치줌처럼 제스처 동안 캐시를 스케일만 하고 종료 시 1회 재렌더한다.
 * 제스처 동안 isGesturingRef=true 를 노출해 호출 뷰어의 onChange 가 무거운 저장/지우개/히스토리
 * 파이프라인을 건너뛰게 한다(뷰포트만 바뀌고 element 는 그대로이므로).
 *
 * 차단 리스너는 window 캡처에 부착한다. React 19 는 이벤트를 앱 루트(#root)에 위임하는데
 * #root 가 container 의 상위라, container 캡처는 React 가 Excalidraw 핸들러를 디스패치한 뒤에야
 * 실행되어 stopPropagation 이 늦는다. window 캡처는 #root 보다 먼저 실행되어 실제로 차단된다.
 * 또한 window 리스너는 container 마운트 여부와 무관하게 즉시 부착해야 한다 — 뷰어가 로딩 중
 * 스피너만 렌더하는 동안 마운트되면 containerRef.current 가 null 이라, 과거처럼 container 기준으로
 * 부착하면 영영 등록되지 않는다. container 의존 설정만 rAF 로 container 마운트까지 기다린다.
 *
 * @param {{ excalidrawAPIRef: React.RefObject, containerRef: React.RefObject, screenLockedRef: React.RefObject, baseStrokeWidthRef?: React.RefObject, onUserDrawStart?: () => void }} opts
 *   onUserDrawStart: 실제 그리기 입력(차단되지 않은 펜/마우스/1손가락 + 그리기 도구)의 첫 다운에 호출.
 *   프로그램적 씬 로드(updateScene/initialData)와 무관해 필기모드 자동 ON 트리거에 안전하다.
 */
export function useExcalidrawTouch({ excalidrawAPIRef, containerRef, screenLockedRef, baseStrokeWidthRef, onUserDrawStart }) {
  const onUserDrawStartRef = useRef(onUserDrawStart);
  useEffect(() => { onUserDrawStartRef.current = onUserDrawStart; }, [onUserDrawStart]);
  const isTouchingRef        = useRef(false);
  const pinchStateRef        = useRef(null); // { startDist, startZoom, lastCenterX, lastCenterY }
  const panStateRef          = useRef(null); // { lastX, lastY } — 1손가락 팬
  const viewportRef          = useRef({ zoom: 1, scrollX: 0, scrollY: 0 }); // 제스처 누적 뷰포트(단일 출처)
  const isGesturingRef       = useRef(false); // 1손가락 팬 또는 2손가락 핀치 진행 중
  const rafIdRef             = useRef(0);
  const pendingViewportRef   = useRef(null);  // { zoom?, scrollX, scrollY, strokeWidth? } — 다음 프레임에 반영할 값
  const touchPointerIdsRef   = useRef(new Set());
  const isSyntheticUpRef     = useRef(false);
  const barrelEraserRef      = useRef(false);  // S Pen 배럴버튼 지우개 활성 중
  const prevToolRef          = useRef('freedraw');
  const discardTouchIdRef    = useRef(null);   // 백스톱: 차단했으나 샐 수 있는 터치 pointerId
  const discardArmTimeRef    = useRef(0);      // 백스톱 무장 시각
  const penDownRef           = useRef(false);  // 스타일러스 펜 접촉 중 — 펜이 만드는 touch 를 손가락 팬/줌으로 오인하지 않도록

  useEffect(() => {
    const getActiveTool = () =>
      excalidrawAPIRef.current?.getAppState()?.activeTool?.type;

    // selection/hand/laser/frame 이 아닌 도구 = 캔버스에 무언가 그리는 도구
    const isDrawingTool = (t) => !!t && t !== 'selection' && t !== 'hand' && t !== 'laser' && t !== 'frame';
    const notifyDrawStart = () => { if (isDrawingTool(getActiveTool())) onUserDrawStartRef.current?.(); };

    const preventGesture = (e) => { e.preventDefault(); };

    const handleContextMenu = (e) => {
      if (e.target.closest?.('.excalidraw')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    /* ── 뷰포트 rAF 코얼레싱 ── */
    const flushViewport = () => {
      rafIdRef.current = 0;
      const pend = pendingViewportRef.current;
      pendingViewportRef.current = null;
      const excApi = excalidrawAPIRef.current;
      if (!pend || !excApi) return;
      const next = { scrollX: pend.scrollX, scrollY: pend.scrollY };
      if (pend.zoom != null) {
        next.zoom = { value: pend.zoom };
        // Excalidraw 는 줌 값이 바뀌면 모든 element 의 오프스크린 캔버스 캐시를 재생성한다
        // (이미지 배경은 프레임당 수십 MB 할당 → 태블릿에서 OOM 튕김/ErrorBoundary).
        // 내장 핀치줌과 동일하게 제스처 동안 캐시 재생성을 끄고 기존 캐시를 스케일만 한다.
        next.shouldCacheIgnoreZoom = true;
      }
      if (pend.strokeWidth != null) next.currentItemStrokeWidth = pend.strokeWidth;
      excApi.updateScene({ appState: next, commitToHistory: false });
    };
    const scheduleViewport = (vp) => {
      pendingViewportRef.current = vp;
      if (!rafIdRef.current) rafIdRef.current = requestAnimationFrame(flushViewport);
    };
    const endGesture = () => {
      isGesturingRef.current = false;
      panStateRef.current = null;
      pinchStateRef.current = null;
      if (rafIdRef.current) { cancelAnimationFrame(rafIdRef.current); rafIdRef.current = 0; }
      flushViewport(); // 마지막 위치 즉시 반영(isGesturing=false 상태로 onChange 한 번 정상 통과 → settle)
      // 제스처 종료 후 캐시 재생성 허용 → 최종 줌에서 한 번만 선명하게 재렌더
      const excApi = excalidrawAPIRef.current;
      if (excApi?.getAppState()?.shouldCacheIgnoreZoom) {
        excApi.updateScene({ appState: { shouldCacheIgnoreZoom: false }, commitToHistory: false });
      }
    };

    // 백스톱: 차단한 터치가 그래도 freedraw 를 시작했다면 그 획을 히스토리 오염 없이 제거.
    // Excalidraw 의 stroke 커밋은 React 배치 렌더 이후에 settle 되므로(삼각형 변환 코드와 동일),
    // pointerup 시점에 동기 삭제하면 커밋에 덮인다 → 호출부에서 setTimeout 으로 지연 실행한다.
    const discardLeakedStroke = (armTime) => {
      const api = excalidrawAPIRef.current;
      if (!api) return;
      const els = api.getSceneElements();
      let newest = null;
      for (const el of els) {
        if (el.type !== 'freedraw' || el.isDeleted || el.id === BG_ELEMENT_ID) continue;
        if ((el.updated || 0) < armTime) continue;
        if (!newest || (el.updated || 0) >= (newest.updated || 0)) newest = el;
      }
      if (newest) {
        api.updateScene({
          elements: els.map((el) => (el.id === newest.id ? { ...el, isDeleted: true } : el)),
          commitToHistory: false,
        });
      }
    };

    const handlePointerDown = (e) => {
      // 펜 접촉을 즉시 기록(closest 체크보다 먼저) — 펜이 동반 발생시키는 touch 가
      // 1손가락 팬으로 새지 않게 하는 게이트. 펜이 내려가 있으면 손가락 제스처를 전부 무시한다.
      if (e.pointerType === 'pen') penDownRef.current = true;
      if (!e.target.closest?.('.excalidraw')) return;

      // S Pen 배럴버튼 등 비주버튼 → 그리기 전달 차단(스크롤 방지)
      if (e.pointerType === 'pen' && e.button !== 0) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (e.pointerType === 'touch') {
        touchPointerIdsRef.current.add(e.pointerId);
        const count = touchPointerIdsRef.current.size;

        // 결정적 모드 규칙: 스타일러스 모드에서 1손가락 그리기 차단
        // (잠금이 아니면 touch 핸들러가 같은 손가락으로 팬한다 — 여기선 그리기 전달만 막는다)
        if (shouldBlockTouchDraw(getInputMode(), getActiveTool(), count)) {
          e.preventDefault();
          e.stopPropagation();
          discardTouchIdRef.current = e.pointerId;
          discardArmTimeRef.current = Date.now();
          return;
        }

        // 화면 고정: 2손가락 이상 Excalidraw 전달 차단
        if (screenLockedRef.current && count >= 2) {
          e.stopPropagation();
          return;
        }

        // freedraw + 2번째 손가락: 진행 중 획 종료(커스텀 핀치 진입)
        if (!screenLockedRef.current && count >= 2 && getActiveTool() === 'freedraw') {
          e.stopPropagation();
          e.preventDefault();
          const firstPointerId = [...touchPointerIdsRef.current].find((id) => id !== e.pointerId);
          if (firstPointerId !== undefined) {
            const canvas = containerRef.current?.querySelector('.excalidraw canvas');
            if (canvas) {
              isSyntheticUpRef.current = true;
              canvas.dispatchEvent(new PointerEvent('pointerup', {
                pointerId: firstPointerId, pointerType: 'touch', bubbles: true, cancelable: true,
              }));
              isSyntheticUpRef.current = false;
            }
          }
          return;
        }

        // 차단되지 않은 1손가락 그리기 → 필기모드 자동 ON 후보
        if (count === 1) notifyDrawStart();
        return;
      }

      // 펜(주버튼)·마우스(주버튼) 그리기 → 필기모드 자동 ON 후보
      if (e.button === 0) notifyDrawStart();
    };

    const handlePointerMove = (e) => {
      if (!e.target.closest?.('.excalidraw')) return;
      if (e.pointerType !== 'touch') return;
      const count = touchPointerIdsRef.current.size;

      if (shouldBlockTouchDraw(getInputMode(), getActiveTool(), count)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (screenLockedRef.current && count >= 2) {
        e.stopPropagation();
        return;
      }
      // 핀치 진행 중 freedraw 로 새지 않도록 pointermove 전파 차단 (커스텀 핀치는 touchmove 가 처리)
      if (!screenLockedRef.current && count >= 2 && getActiveTool() === 'freedraw') {
        e.stopPropagation();
        e.preventDefault();
      }
    };

    const handlePointerUp = (e) => {
      if (e.pointerType === 'pen') penDownRef.current = false;
      if (isSyntheticUpRef.current) return;
      if (e.pointerType === 'pen' && barrelEraserRef.current) {
        barrelEraserRef.current = false;
        excalidrawAPIRef.current?.setActiveTool({ type: prevToolRef.current });
      }
      if (e.pointerType === 'touch') {
        if (discardTouchIdRef.current === e.pointerId) {
          discardTouchIdRef.current = null;
          const armTime = discardArmTimeRef.current;
          setTimeout(() => discardLeakedStroke(armTime), 80);
        }
        touchPointerIdsRef.current.delete(e.pointerId);
      }
    };

    const handleTouchStart = (e) => {
      isTouchingRef.current = true;
      if (!e.target.closest?.('.excalidraw')) return;

      const tool = getActiveTool();
      const mode = getInputMode();
      const locked = screenLockedRef.current;
      const count = e.touches.length;

      // 스타일러스 모드 1손가락(그리기 도구) → 그리기 대신 팬 (잠금 아니고, 펜이 안 닿았을 때만)
      if (count === 1 && !locked && !penDownRef.current && shouldBlockTouchDraw(mode, tool, 1)) {
        const t = e.touches[0];
        const appState = excalidrawAPIRef.current?.getAppState();
        viewportRef.current = {
          zoom: appState?.zoom?.value || 1,
          scrollX: appState?.scrollX || 0,
          scrollY: appState?.scrollY || 0,
        };
        panStateRef.current = { lastX: t.clientX, lastY: t.clientY };
        isGesturingRef.current = true;
        e.stopPropagation();
        if (e.cancelable) e.preventDefault();
        return;
      }

      // 그 외 차단 케이스(잠금 상태 1손가락 등) → 그리기만 차단, 팬 없음
      if (shouldBlockTouchDraw(mode, tool, count)) {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (locked && count >= 2) {
        e.stopPropagation();
        if (e.cancelable) e.preventDefault();
        return;
      }
      // 2손가락 핀치 진입 (펜이 안 닿았을 때만 — 펜 드로잉 중 손가락 줌 방지)
      if (!locked && count >= 2 && !penDownRef.current && tool === 'freedraw') {
        const t0 = e.touches[0], t1 = e.touches[1];
        const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
        const cx = (t0.clientX + t1.clientX) / 2;
        const cy = (t0.clientY + t1.clientY) / 2;
        const appState = excalidrawAPIRef.current?.getAppState();
        const z = appState?.zoom?.value || 1;
        pinchStateRef.current = { startDist: dist, startZoom: z, lastCenterX: cx, lastCenterY: cy };
        viewportRef.current = { zoom: z, scrollX: appState?.scrollX || 0, scrollY: appState?.scrollY || 0 };
        panStateRef.current = null;
        isGesturingRef.current = true;
        e.stopPropagation();
        if (e.cancelable) e.preventDefault();
      }
    };

    const handleTouchMove = (e) => {
      if (!e.target.closest?.('.excalidraw')) return;
      const tool = getActiveTool();
      const mode = getInputMode();
      const locked = screenLockedRef.current;
      const count = e.touches.length;

      // 1손가락 팬 진행 (펜이 닿으면 즉시 중단 → 펜 드로잉이 우선)
      if (count === 1 && panStateRef.current && !locked && !penDownRef.current) {
        e.stopPropagation();
        if (e.cancelable) e.preventDefault();
        const t = e.touches[0];
        const vp = viewportRef.current;
        vp.scrollX += (t.clientX - panStateRef.current.lastX) / vp.zoom;
        vp.scrollY += (t.clientY - panStateRef.current.lastY) / vp.zoom;
        panStateRef.current.lastX = t.clientX;
        panStateRef.current.lastY = t.clientY;
        scheduleViewport({ scrollX: vp.scrollX, scrollY: vp.scrollY });
        return;
      }

      if (shouldBlockTouchDraw(mode, tool, count)) {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (locked && count >= 2) {
        e.stopPropagation();
        if (e.cancelable) e.preventDefault();
        return;
      }
      // 2손가락 핀치줌 + 팬 (펜이 안 닿았을 때만)
      if (!locked && count >= 2 && pinchStateRef.current && !penDownRef.current && tool === 'freedraw') {
        e.stopPropagation();
        if (e.cancelable) e.preventDefault();
        const t0 = e.touches[0], t1 = e.touches[1];
        const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
        const cx = (t0.clientX + t1.clientX) / 2;
        const cy = (t0.clientY + t1.clientY) / 2;
        const ps = pinchStateRef.current;
        const newZoom = Math.min(Math.max(ps.startZoom * (dist / ps.startDist), 0.1), 10);
        const vp = viewportRef.current;
        vp.scrollX += (cx - ps.lastCenterX) / newZoom;
        vp.scrollY += (cy - ps.lastCenterY) / newZoom;
        vp.zoom = newZoom;
        ps.lastCenterX = cx;
        ps.lastCenterY = cy;
        const strokeWidth = baseStrokeWidthRef?.current
          ? Math.max(baseStrokeWidthRef.current / newZoom, 0.05)
          : null;
        scheduleViewport({ zoom: newZoom, scrollX: vp.scrollX, scrollY: vp.scrollY, strokeWidth });
      }
    };

    const handleTouchEnd = (e) => {
      if (e.touches.length === 0) {
        isTouchingRef.current = false;
        endGesture();
        return;
      }
      // 핀치에서 손가락 하나 뗌 — 남은 손가락은 새 제스처로 다시 시작해야 함(점프 방지)
      if (e.touches.length < 2) {
        pinchStateRef.current = null;
        panStateRef.current = null;
      }
    };

    // window 캡처 리스너 — container 마운트 여부와 무관하게 즉시 부착
    window.addEventListener('pointerdown',   handlePointerDown,  { capture: true, passive: false });
    window.addEventListener('pointermove',   handlePointerMove,  { capture: true, passive: false });
    window.addEventListener('pointerup',     handlePointerUp,    { capture: true, passive: true });
    window.addEventListener('pointercancel', handlePointerUp,    { capture: true, passive: true });
    window.addEventListener('touchstart',    handleTouchStart,   { capture: true, passive: false });
    window.addEventListener('touchmove',     handleTouchMove,    { capture: true, passive: false });
    window.addEventListener('touchend',      handleTouchEnd,     { capture: true, passive: true });
    window.addEventListener('touchcancel',   handleTouchEnd,     { capture: true, passive: true });

    // container 의존 설정 — 뷰어가 로딩 스피너를 먼저 렌더하므로 container 가 마운트될 때까지 rAF 로 대기
    let rafId = 0;
    let boundContainer = null;
    const setupContainer = () => {
      const container = containerRef.current;
      if (!container) { rafId = requestAnimationFrame(setupContainer); return; }
      boundContainer = container;
      container.style.touchAction = 'none';
      container.addEventListener('gesturestart',  preventGesture, { passive: false });
      container.addEventListener('gesturechange', preventGesture, { passive: false });
      container.addEventListener('gestureend',    preventGesture, { passive: false });
      container.addEventListener('contextmenu',   handleContextMenu, { capture: true });
    };
    setupContainer();

    return () => {
      cancelAnimationFrame(rafId);
      if (rafIdRef.current) { cancelAnimationFrame(rafIdRef.current); rafIdRef.current = 0; }
      window.removeEventListener('pointerdown',   handlePointerDown, { capture: true });
      window.removeEventListener('pointermove',   handlePointerMove, { capture: true });
      window.removeEventListener('pointerup',     handlePointerUp,   { capture: true });
      window.removeEventListener('pointercancel', handlePointerUp,   { capture: true });
      window.removeEventListener('touchstart',    handleTouchStart,  { capture: true });
      window.removeEventListener('touchmove',     handleTouchMove,   { capture: true });
      window.removeEventListener('touchend',      handleTouchEnd,    { capture: true });
      window.removeEventListener('touchcancel',   handleTouchEnd,    { capture: true });
      if (boundContainer) {
        boundContainer.style.touchAction = '';
        boundContainer.removeEventListener('contextmenu',   handleContextMenu, { capture: true });
        boundContainer.removeEventListener('gesturestart',  preventGesture);
        boundContainer.removeEventListener('gesturechange', preventGesture);
        boundContainer.removeEventListener('gestureend',    preventGesture);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const triggerPalmRejectionWarmup = useCallback(() => {}, []);

  return { isTouchingRef, triggerPalmRejectionWarmup, barrelEraserRef, isGesturingRef };
}
