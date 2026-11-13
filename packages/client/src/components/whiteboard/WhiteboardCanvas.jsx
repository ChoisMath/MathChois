import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Excalidraw, reconcileElements, restoreElements, CaptureUpdateAction } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import ExcalidrawErrorBoundary from '../ExcalidrawErrorBoundary';
import { api } from '../../lib/api';
import { useWhiteboardCollab } from '../../hooks/useWhiteboardCollab';
import { useExcalidrawTouch } from '../../hooks/useExcalidrawTouch';
import { useWetInk } from '../../hooks/useWetInk';
import { useScribbleErase } from '../../hooks/useScribbleErase';
import { TOUCH_CSS } from '../../lib/excalidrawUtils';
import {
  createGuideElement, isGuideElement, withoutGuide, viewportCenterScene, GUIDE_ELEMENT_ID,
} from '../../lib/whiteboardExport';
import { buildTemplateElements } from '../../lib/whiteboardTemplateBuild';
import { pickNewFiles, fileRefsToExcalidrawFiles, downscaleImage, cursorColorFor } from '../../lib/whiteboardImage';
import { PRESENT_W, PRESENT_H } from '../../lib/whiteboardExport';
import WhiteboardTopBar from './WhiteboardTopBar';
import TemplatePickerDialog from './TemplatePickerDialog';

const WB_UI_OPTIONS = {
  canvasActions: {
    loadScene: false,
    saveToActiveFile: false,
    toggleTheme: false,
    clearCanvas: false,
    changeViewBackgroundColor: false, // 자체 피커 (서버 동기화)
    export: false,
    saveAsImage: true,
  },
  tools: { image: true },
};

const NEVER = { captureUpdate: CaptureUpdateAction.NEVER };

/**
 * 공유 보드 캔버스 — Excalidraw 기본 UI + 요소 단위 실시간 병합.
 *
 * props:
 *  - boardId, pageId, isTeacher
 *  - readOnly: 외부 강제(다른 모둠 열람 등)
 *  - templateKey: 교사 기본 템플릿 (빈 보드면 자동 적용)
 *  - showStartTemplatePicker: 기본 템플릿 없고 빈 보드일 때 선택 오버레이
 *  - topLeft / topRight: 상단 바 슬롯
 *  - onUsers(users), onAuthorChange(name), onRemoved()
 *  - penTouchHandling: 기존 S펜 훅 장착 (기본 true)
 */
export default function WhiteboardCanvas(props) {
  // 보드가 바뀌면 통째로 리마운트 — 파일/협업자/버전 기록 등 내부 상태가 섞이지 않도록
  return <WhiteboardCanvasInner key={props.boardId ?? 'none'} {...props} />;
}

function WhiteboardCanvasInner({
  boardId, pageId, isTeacher = false, readOnly: forcedReadOnly = false,
  templateKey = null, showStartTemplatePicker = false,
  topLeft = null, topRight = null, onUsers, onAuthorChange, onRemoved,
  penTouchHandling = true,
}) {
  const apiRef = useRef(null);
  const containerRef = useRef(null);
  const [excApi, setExcApi] = useState(null);
  const [serverReadOnly, setServerReadOnly] = useState(false);
  const [locked, setLocked] = useState(false);
  const [lockedAll, setLockedAll] = useState(false);
  const [backgroundColor, setBackgroundColor] = useState('#ffffff');
  const [users, setUsers] = useState([]);
  const [authorName, setAuthorName] = useState(null);
  const [initialized, setInitialized] = useState(false);
  const [startPicker, setStartPicker] = useState(false);
  const [insertPicker, setInsertPicker] = useState(false);
  const [toast, setToast] = useState(null);

  const fileRefsRef = useRef({});          // fileId → {id,url,mimeType}
  const loadedFilesRef = useRef(new Set()); // Excalidraw 에 addFiles 된 id
  const knownFilesRef = useRef(new Set());  // 업로드 완료/진행 중 id
  const collaboratorsRef = useRef(new Map());
  const collabRafRef = useRef(0);
  const lastAuthorRef = useRef(null);
  const templateAppliedRef = useRef(false);

  const effectiveReadOnly = forcedReadOnly || serverReadOnly || (!isTeacher && (locked || lockedAll));
  const readOnlyRef = useRef(effectiveReadOnly);
  useEffect(() => { readOnlyRef.current = effectiveReadOnly; }, [effectiveReadOnly]);

  /* S펜·손바닥 거부 (옵션) */
  const noopRef = useRef(false);
  const widthRef = useRef(2);
  useExcalidrawTouch({
    excalidrawAPIRef: penTouchHandling ? apiRef : { current: null },
    containerRef, screenLockedRef: noopRef, baseStrokeWidthRef: widthRef,
  });
  useScribbleErase({ excalidrawAPIRef: penTouchHandling ? apiRef : { current: null }, excludePrefixes: [GUIDE_ELEMENT_ID] });
  /* 웻잉크 펜 렌더 + 멈춤 도형 보정 (필기 뷰어와 같은 훅). 읽기 전용이면 끔, Excalidraw 내장 펜 도구일 때만 가로챔.
     commit 은 IMMEDIATELY 로 내장 undo 에 바로 잡히고, onChange → collab.sendElements 로 요소 단위 동기화를 탄다. */
  const wetInkOverlayRef = useRef(null);
  const drawModeRef = useRef(!effectiveReadOnly);
  useEffect(() => { drawModeRef.current = !effectiveReadOnly; }, [effectiveReadOnly]);
  const penActiveRef = useRef(false);
  useWetInk({
    excalidrawAPIRef: penTouchHandling ? apiRef : { current: null },
    overlayRef: wetInkOverlayRef, drawModeRef, penActiveRef,
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  /* ── 파일 로드 (URL → dataURL → addFiles) ── */
  const loadFilesFor = useCallback(async (ids) => {
    const excalidraw = apiRef.current;
    if (!excalidraw) return;
    const need = {};
    for (const id of ids) {
      if (loadedFilesRef.current.has(id)) continue;
      const ref = fileRefsRef.current[id];
      if (ref) need[id] = ref;
    }
    if (Object.keys(need).length === 0) return;
    for (const id of Object.keys(need)) loadedFilesRef.current.add(id);
    const files = await fileRefsToExcalidrawFiles(need);
    const list = Object.values(files);
    if (list.length > 0 && apiRef.current) {
      apiRef.current.addFiles(list);
      // 이미지 요소가 이미 장면에 있으면 다시 그리도록 동일 요소로 updateScene
      apiRef.current.updateScene({ elements: apiRef.current.getSceneElementsIncludingDeleted(), ...NEVER });
    }
  }, []);

  const fileIdsIn = (elements) => elements.filter((el) => el.type === 'image' && el.fileId).map((el) => el.fileId);

  /* ── 장면 적용 공통 ── */
  const applyScene = useCallback((elements, { files, bg, fit = false } = {}) => {
    const excalidraw = apiRef.current;
    if (!excalidraw) return;
    if (files) {
      fileRefsRef.current = { ...files };
      for (const id of Object.keys(files)) knownFilesRef.current.add(id);
    }
    const restored = restoreElements(withoutGuide(elements), null);
    const next = [createGuideElement(), ...restored];
    excalidraw.updateScene({
      elements: next,
      ...(bg ? { appState: { viewBackgroundColor: bg } } : {}),
      ...NEVER,
    });
    void loadFilesFor(fileIdsIn(restored));
    if (fit) {
      requestAnimationFrame(() => {
        const guide = apiRef.current?.getSceneElements().find(isGuideElement);
        if (guide) apiRef.current.scrollToContent(guide, { fitToViewport: true, viewportZoomFactor: 0.95 });
      });
    }
  }, [loadFilesFor]);

  /* ── 빈 보드 템플릿: 기본 템플릿 자동 적용 / 선택 오버레이 (init 시점에 결정) ── */
  const propsRef = useRef({ templateKey, showStartTemplatePicker, forcedReadOnly, isTeacher });
  useEffect(() => { propsRef.current = { templateKey, showStartTemplatePicker, forcedReadOnly, isTeacher }; });

  const applyTemplateToServer = useCallback(async (key) => {
    if (!boardId || !key) return false;
    const elements = buildTemplateElements(key, 0, 0);
    if (elements.length === 0) return false;
    try {
      const res = await api.post(`/api/whiteboards/groups/${boardId}/apply-template`, { elements });
      return !!res?.applied;
    } catch (err) {
      console.warn('[whiteboard] apply-template failed', err?.message);
      return false;
    }
  }, [boardId]);

  const decideStartTemplate = useCallback((init) => {
    if (templateAppliedRef.current) return;
    const { templateKey: key, showStartTemplatePicker: pick, forcedReadOnly: forced, isTeacher: teacher } = propsRef.current;
    const ro = forced || init.readOnly || (!teacher && (init.locked || init.lockedAll));
    if (ro) return;
    const live = (init.elements || []).filter((el) => !el.isDeleted && !isGuideElement(el));
    if (live.length > 0) { templateAppliedRef.current = true; return; }
    if (key) {
      templateAppliedRef.current = true;
      void applyTemplateToServer(key);
    } else if (pick) {
      setStartPicker(true);
    }
  }, [applyTemplateToServer]);

  /* ── 소켓 ── */
  const collab = useWhiteboardCollab({
    boardId,
    enabled: !!boardId && !!excApi,
    onInit: (d) => {
      collab.resetKnown();
      collab.markKnown(d.elements);
      applyScene(d.elements, { files: d.files, bg: d.backgroundColor, fit: true });
      setBackgroundColor(d.backgroundColor);
      setLocked(d.locked); setLockedAll(d.lockedAll); setServerReadOnly(d.readOnly);
      setUsers(d.users); onUsers?.(d.users);
      setInitialized(true);
      decideStartTemplate(d);
      // 재연결: 로컬에서 앞선 변경이 있으면 재전송 (version 이 다른 것만 나간다)
      const local = apiRef.current?.getSceneElementsIncludingDeleted() ?? [];
      if (!d.readOnly) collab.sendElements(withoutGuide(local));
    },
    onElements: (remote) => {
      const excalidraw = apiRef.current;
      if (!excalidraw) return;
      const local = excalidraw.getSceneElementsIncludingDeleted();
      const merged = reconcileElements(local, remote, excalidraw.getAppState());
      excalidraw.updateScene({ elements: merged, ...NEVER });
      collab.markKnown(remote);
      void loadFilesFor(fileIdsIn(remote));
    },
    onScene: (d) => {
      collab.resetKnown();
      collab.markKnown(d.elements);
      applyScene(d.elements, { files: d.files, bg: d.backgroundColor, fit: d.reason === 'template' });
      setBackgroundColor(d.backgroundColor);
      if (d.reason === 'template') { templateAppliedRef.current = true; setStartPicker(false); }
      if (d.reason === 'reset') showToast('보드가 초기화되었습니다.');
      if (d.reason === 'restore') showToast('직전 상태로 되돌렸습니다.');
    },
    onLock: (d) => { setLocked(d.locked); setLockedAll(d.lockedAll); },
    onBackground: (color) => {
      setBackgroundColor(color);
      apiRef.current?.updateScene({ appState: { viewBackgroundColor: color }, ...NEVER });
    },
    onFiles: (files) => {
      fileRefsRef.current = { ...fileRefsRef.current, ...files };
      for (const id of Object.keys(files)) knownFilesRef.current.add(id);
      void loadFilesFor(Object.keys(files));
    },
    onPresence: (list) => {
      setUsers(list); onUsers?.(list);
      const alive = new Set(list.map((u) => u.socketId));
      for (const key of Array.from(collaboratorsRef.current.keys())) {
        if (!alive.has(key)) collaboratorsRef.current.delete(key);
      }
      apiRef.current?.updateScene({ collaborators: new Map(collaboratorsRef.current) });
    },
    onPointer: (p) => {
      collaboratorsRef.current.set(p.socketId, {
        id: p.userId, socketId: p.socketId, username: p.name,
        pointer: { x: p.x, y: p.y, tool: p.tool || 'pointer' }, button: p.button || 'up',
        color: cursorColorFor(p.userId),
      });
      if (!collabRafRef.current) {
        collabRafRef.current = requestAnimationFrame(() => {
          collabRafRef.current = 0;
          apiRef.current?.updateScene({ collaborators: new Map(collaboratorsRef.current) });
        });
      }
    },
    onRejected: (reason) => {
      if (reason === 'locked') showToast('선생님이 편집을 잠갔습니다.');
      else if (reason === 'forbidden') showToast('이 보드는 읽기 전용입니다.');
    },
    onRemoved: () => { showToast('이 모둠이 삭제되었습니다.'); onRemoved?.(); },
  });

  const handleStartPick = async (key) => {
    setStartPicker(false);
    templateAppliedRef.current = true;
    if (key) await applyTemplateToServer(key);
  };

  /* ── 이미지 업로드 ── */
  const uploadNewFiles = useCallback(async (files) => {
    const fresh = pickNewFiles(files, knownFilesRef.current);
    if (fresh.length === 0 || !boardId) return;
    for (const f of fresh) knownFilesRef.current.add(f.id);
    const refs = {};
    for (const f of fresh) {
      try {
        const small = await downscaleImage(f.dataURL);
        if (!small) { showToast('이미지가 너무 큽니다.'); continue; }
        const fd = new FormData();
        const ext = small.mimeType === 'image/png' ? 'png' : 'jpg';
        fd.append('file', small.blob, `${f.id.slice(0, 16)}.${ext}`);
        const res = await api.upload(`/api/files/upload?bucket=whiteboard-files&directory=${pageId}/${boardId}`, fd);
        if (res?.url) refs[f.id] = { id: f.id, url: res.url, mimeType: small.mimeType };
        loadedFilesRef.current.add(f.id);
      } catch (err) {
        console.warn('[whiteboard] image upload failed', err?.message);
        showToast('이미지 업로드에 실패했습니다.');
        knownFilesRef.current.delete(f.id);
      }
    }
    if (Object.keys(refs).length > 0) {
      fileRefsRef.current = { ...fileRefsRef.current, ...refs };
      collab.sendFiles(refs);
    }
  }, [boardId, pageId, collab, showToast]);

  /* ── Excalidraw onChange ── */
  const handleChange = useCallback((elements, appState, files) => {
    penActiveRef.current = appState?.activeTool?.type === 'freedraw';
    if (isTeacher && onAuthorChange) {
      const sel = Object.keys(appState.selectedElementIds || {});
      let name = null;
      if (sel.length === 1) {
        const el = elements.find((e) => e.id === sel[0]);
        name = el?.customData?.authorName ?? null;
      }
      if (name !== lastAuthorRef.current) { lastAuthorRef.current = name; setAuthorName(name); onAuthorChange(name); }
    }
    if (readOnlyRef.current || !initialized) return;
    collab.sendElements(withoutGuide(elements));
    if (files && Object.keys(files).length > 0) void uploadNewFiles(files);
  }, [collab, initialized, isTeacher, onAuthorChange, uploadNewFiles]);

  const handlePointerUpdate = useCallback(({ pointer, button }) => {
    if (!pointer) return;
    collab.sendPointer(pointer.x, pointer.y, pointer.tool === 'laser' ? 'laser' : 'pointer', button === 'down' ? 'down' : 'up');
  }, [collab]);

  /* ── 상단 바 동작 ── */
  const handleBackground = (color) => {
    setBackgroundColor(color);
    apiRef.current?.updateScene({ appState: { viewBackgroundColor: color }, ...NEVER });
    collab.sendBackground(color);
  };
  const handleFit = useCallback(() => {
    const excalidraw = apiRef.current;
    if (!excalidraw) return;
    const guide = excalidraw.getSceneElements().find(isGuideElement);
    if (guide) excalidraw.scrollToContent(guide, { fitToViewport: true, viewportZoomFactor: 0.95, animate: true });
  }, []);
  const handleInsertTemplate = (key) => {
    setInsertPicker(false);
    const excalidraw = apiRef.current;
    if (!key || !excalidraw) return;
    const c = viewportCenterScene(excalidraw.getAppState());
    const tpl = buildTemplateElements(key, Math.round(c.x - PRESENT_W / 2), Math.round(c.y - PRESENT_H / 2));
    excalidraw.updateScene({
      elements: [...excalidraw.getSceneElementsIncludingDeleted(), ...tpl],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  };

  const handleMount = useCallback((excalidrawApi) => {
    apiRef.current = excalidrawApi;
    setExcApi(excalidrawApi);
    if (import.meta.env.DEV) window.__wbApi = excalidrawApi; // 개발/E2E 디버그용
    // 첫 장면에 안내선을 넣고 발표 영역에 맞춘다
    excalidrawApi.updateScene({ elements: [createGuideElement()], ...NEVER });
    requestAnimationFrame(() => {
      const guide = excalidrawApi.getSceneElements().find(isGuideElement);
      if (guide) excalidrawApi.scrollToContent(guide, { fitToViewport: true, viewportZoomFactor: 0.95 });
    });
  }, []);

  const initialData = useMemo(() => ({
    elements: [],
    appState: { viewBackgroundColor: '#ffffff', currentItemStrokeColor: '#1e1e1e', currentItemRoughness: 0 },
  }), []);

  return (
    <div className="flex flex-col h-full w-full">
      <WhiteboardTopBar
        left={topLeft} right={topRight}
        backgroundColor={backgroundColor} onBackgroundChange={handleBackground}
        onInsertTemplate={() => setInsertPicker(true)} onFit={handleFit}
        readOnly={effectiveReadOnly} locked={locked} lockedAll={lockedAll}
        users={users} authorName={authorName} showAuthor={isTeacher}
      />
      <div ref={containerRef} className="relative flex-1 min-h-0 wb-canvas" style={{ touchAction: 'none' }}>
        <style>{TOUCH_CSS}</style>
        <ExcalidrawErrorBoundary key={boardId}>
          <Excalidraw
            excalidrawAPI={handleMount}
            initialData={initialData}
            langCode="ko-KR"
            viewModeEnabled={effectiveReadOnly}
            isCollaborating
            UIOptions={WB_UI_OPTIONS}
            onChange={handleChange}
            onPointerUpdate={handlePointerUpdate}
            name={`whiteboard-${boardId}`}
          />
        </ExcalidrawErrorBoundary>
        <canvas
          ref={wetInkOverlayRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ zIndex: 3 }}
        />
        {startPicker && (
          <TemplatePickerDialog variant="overlay" onSelect={handleStartPick} onClose={() => handleStartPick(null)} />
        )}
        {!initialized && boardId && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60 z-30 pointer-events-none">
            <p className="text-gray-500 text-sm">보드 연결 중...</p>
          </div>
        )}
        {toast && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 bg-gray-900 text-white text-sm px-3 py-1.5 rounded-full shadow">
            {toast}
          </div>
        )}
      </div>
      {insertPicker && (
        <TemplatePickerDialog title="템플릿 삽입" onSelect={handleInsertTemplate} onClose={() => setInsertPicker(false)} />
      )}
    </div>
  );
}
