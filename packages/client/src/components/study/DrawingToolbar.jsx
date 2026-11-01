import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  LassoSelect, Pen, Highlighter, Type, Square, Circle, Triangle,
  Eraser, Minus, Trash2, Plus, Palette,
  SlidersHorizontal, Hand, Shapes, ChevronDown, ImagePlus, Dot,
  RefreshCw, Undo2, Redo2, Pointer, StickyNote,
} from 'lucide-react';
import './viewer.css';
import PageListIcon from './PageListIcon';
import { BG_ELEMENT_ID } from '../../lib/excalidrawUtils';
import { getInputMode, setInputMode, subscribeInputMode } from '../../lib/inputMode';
import { sceneStrokeWidth } from '../../lib/penWidth';
import {
  HL_OPACITY, PEN_COLOR_DEFAULT,
  loadColorSlots, saveColorSlots, loadToolColor, saveToolColor, loadToolWidth, saveToolWidth, widthRange,
  loadStickyLast, saveStickyLast,
} from '../../lib/toolPrefs';
import ColorSlotsModal from './ColorSlotsModal';
import StickyPicker from './StickyPicker';
import { buildStickyElement, stickyFile } from '../../lib/stickyPads';

/**
 * 필기 도구바 (5개 필기 뷰어 + AI 코칭 공용).
 * 순서·형광펜·색상 슬롯·두께 규칙: docs/superpowers/specs/2026-10-30-drawing-toolbar-reorg-highlighter-design.md
 *
 * 논리 도구(activeTool)와 Excalidraw 도구는 다르다: 형광펜(highlighter)·삼각형(triangle)은 Excalidraw 쪽이 freedraw 이고,
 * 올가미(lasso, hooks/useLasso.js)·레이저포인터·이미지이동은 selection 이다. 형광펜은 currentItemOpacity 40 + 전용 색·두께, 펜으로 돌아오면 100 + 펜 색·두께.
 * 화면 고정 버튼은 여기 없다 — components/study/ScreenLockFab.jsx (필기 영역 우측 상단 플로팅).
 * 맨 앞의 페이지 목록(썸네일) 버튼은 뷰어가 `sidebarOpen`/`onToggleSidebar` 를 넘길 때만 나온다 — 도구바가 보일 때는 여기,
 * 보기 모드·도구바 접힘처럼 도구바가 없을 때는 뷰어 상단 바에 같은 버튼이 대신 나온다.
 * 겉모양은 components/study/viewer.css (`.vw-tb*`) — 뷰어 상단 바·페이지 목록과 같은 토큰을 쓴다.
 * 메모지(포스트잇 배경 도형, lib/stickyPads.js): `sticky` 버튼 → StickyPicker 팝오버 → 잠긴 image 요소 하나를 배경 바로 뒤에 넣는다.
 *   길게 누르기(500ms)·더블탭은 마지막 메모지를 바로 붙인다. 코멘트 창은 `stickyOpacity={70}`. 설계 docs/superpowers/specs/2026-11-01-sticky-pads-design.md
 */

const SHAPE_TOOL_ICONS = {
  rectangle: Square,
  ellipse:   Circle,
  triangle:  Triangle,
};

const SHAPE_TOOLS    = ['rectangle', 'ellipse', 'triangle'];
const SAVEABLE_TOOLS = ['freedraw', 'highlighter', 'lasso', 'text', 'line', 'rectangle', 'ellipse', 'triangle'];
/** 색·두께를 공유하는 "잉크" 도구: 형광펜이면 형광펜 설정, 그 외는 펜 설정 */
const inkToolOf = (tool) => (tool === 'highlighter' ? 'highlighter' : 'freedraw');

/* 요소 순서는 lib/toolPrefs.js TOOLBAR_ORDER 가 기준 — 아래 JSX 의 data-tb 순서와 일치해야 한다(테스트가 검증) */
/** 도구 버튼 클래스 — `mod` 는 켜졌을 때의 상태 색(viewer.css `.vw-tb-btn--hl` 등), 없으면 잉크 남색 */
const btnCls = (active, mod = '') => ['vw-tb-btn', mod, active ? 'is-on' : ''].filter(Boolean).join(' ');
const Divider = () => <div className="vw-tb-sep" aria-hidden="true" />;

function DrawingToolbar({ apiRef, pageId, showPanel, onTogglePanel, onBaseWidthChange, onReloadImage, onUndo, onRedo, canUndo = true, canRedo = true, htmlMode = false, pdfMode = false, onActiveToolChange, sidebarOpen, onToggleSidebar, stickyOpacity = 100, bgPositionRef }) {
  const [activeTool, setActiveTool]       = useState('freedraw');
  const [imageMoveMode, setImageMoveMode] = useState(false);
  const [inputMode, setInputModeState] = useState(() => getInputMode());
  useEffect(() => subscribeInputMode(setInputModeState), []);
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen]     = useState(false);
  /* 메모지: 팝오버 열림, 마지막 선택(유형·친구·무늬), 길게 누르기 타이머, 직전 삽입 위치 */
  const [pickerOpen, setPickerOpen]       = useState(false);
  const [stickySpec, setStickySpec]       = useState(() => loadStickyLast());
  const stickyBtnRef    = useRef(null);
  const longPressRef    = useRef({ timer: null, fired: false });
  const lastStickyPosRef = useRef(null);
  useEffect(() => { setPickerOpen(false); }, [pageId]);
  const [slots, setSlots]                 = useState(() => loadColorSlots());

  /* 펜·형광펜 색/두께 — 콜백에서 최신값을 쓰도록 ref 와 state 를 함께 갱신 */
  const [penColor, setPenColorState] = useState(() => loadToolColor('freedraw'));
  const [hlColor,  setHlColorState]  = useState(() => loadToolColor('highlighter'));
  const [penWidth, setPenWidthState] = useState(() => loadToolWidth('freedraw'));
  const [hlWidth,  setHlWidthState]  = useState(() => loadToolWidth('highlighter'));
  const inkRef = useRef({ penColor, hlColor, penWidth, hlWidth });
  const setInk = (patch) => {
    inkRef.current = { ...inkRef.current, ...patch };
    if ('penColor' in patch) setPenColorState(patch.penColor);
    if ('hlColor'  in patch) setHlColorState(patch.hlColor);
    if ('penWidth' in patch) setPenWidthState(patch.penWidth);
    if ('hlWidth'  in patch) setHlWidthState(patch.hlWidth);
  };
  const inkTool  = inkToolOf(activeTool);
  const curColor = inkTool === 'highlighter' ? hlColor : penColor;
  const curWidth = inkTool === 'highlighter' ? hlWidth : penWidth;
  const range    = widthRange(inkTool);

  const imageInputRef  = useRef(null);
  /* 레이저 포인터·삼각형 변환은 펜 색을 쓴다 */
  const colorRef = useRef(penColor);
  useEffect(() => { colorRef.current = penColor; }, [penColor]);

  /* ── 삼각형 모드용 ref ── */
  const activeToolRef = useRef(activeTool);
  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);

  /* 논리 도구 변화 통지 (wet-ink 오버레이가 펜 자유필기만 가로채도록 — 삼각형은 내부적으로 freedraw) */
  useEffect(() => { onActiveToolChange?.(activeTool); }, [activeTool, onActiveToolChange]);

  /* ── 삼각형 모드: pointerup 후 freedraw → 삼각형 line 으로 변환 ── */
  useEffect(() => {
    const onPointerUp = () => {
      if (activeToolRef.current !== 'triangle') return;
      const api = apiRef.current;
      if (!api) return;
      setTimeout(() => {
        const els      = api.getSceneElements();
        const freedraws = els.filter((el) => el.type === 'freedraw' && !el.isDeleted);
        if (freedraws.length === 0) return;
        const newest = freedraws.reduce((a, b) => (a.updated > b.updated ? a : b));
        const { x, y, width: w, height: h } = newest;
        if (w < 5 || h < 5) return;
        /* Excalidraw LinearElement 정규화 필수 요구사항:
           1. points[0]은 반드시 [0, 0] 이어야 함 (is not normalized 에러의 원인)
           2. element의 x, y는 bounding box의 top-left가 아니라 첫 번째 점(points[0])의 절대 좌표임
           3. 나머지 point들은 첫 번째 점을 기준으로 한 상대 좌표
           4. 수동 생성 시 boundElements, startBinding, endBinding 외에 lastCommittedPoint 속성 유지
        */
        // 꼭짓점 순서: 위(시작점) -> 오른쪽 아래 -> 왼쪽 아래 -> 위(끝점)
        const points = [
          [0, 0],
          [w / 2, h],
          [-w / 2, h],
          [0, 0]
        ];

        const triangleEl = {
          type: 'line', id: 'tri_' + Math.random().toString(36).slice(2, 9),
          x: x + w / 2, // 첫 번째 점(위쪽 꼭짓점)의 x좌표
          y: y,         // 첫 번째 점(위쪽 꼭짓점)의 y좌표
          width: w, height: h, angle: 0,
          strokeColor: colorRef.current, backgroundColor: 'transparent',
          fillStyle: 'solid', strokeWidth: 2,
          strokeStyle: 'solid', roughness: 0, opacity: 100,
          points,
          startArrowhead: null, endArrowhead: null,
          groupIds: [], frameId: null, roundness: null,
          isDeleted: false, locked: false, link: null,
          version: 1, versionNonce: Math.floor(Math.random() * 2e9),
          updated: Date.now(), seed: Math.floor(Math.random() * 2e9),
          boundElements: null, startBinding: null, endBinding: null,
          lastCommittedPoint: null,
        };
        const nextEls = els.map((el) =>
          el.id === newest.id ? { ...el, isDeleted: true } : el
        );
        api.updateScene({ elements: [...nextEls, triangleEl] });
      }, 80);
    };
    document.addEventListener('pointerup', onPointerUp, { capture: true });
    return () => document.removeEventListener('pointerup', onPointerUp, { capture: true });
  }, [apiRef]);

  /* ── 레이저 포인터 모드 ── */
  const laserCanvasRef = useRef(null);
  const laserTrailRef  = useRef([]);   // { x, y, time }[]
  const laserRafRef    = useRef(null);
  const laserDrawing   = useRef(false);

  useEffect(() => {
    if (activeTool !== 'laser_pointer') {
      /* 포인터 모드 비활성 시 캔버스 정리 */
      if (laserRafRef.current) cancelAnimationFrame(laserRafRef.current);
      laserTrailRef.current = [];
      const cvs = laserCanvasRef.current;
      if (cvs) {
        const ctx = cvs.getContext('2d');
        ctx?.clearRect(0, 0, cvs.width, cvs.height);
      }
      return;
    }

    const FADE_MS  = 2000; // 궤적이 사라지는 시간

    const getPos = (e) => {
      const cvs = laserCanvasRef.current;
      if (!cvs) return null;
      const rect = cvs.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top, time: Date.now() };
    };

    const onDown = (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      laserDrawing.current = true;
      const pos = getPos(e);
      if (pos) laserTrailRef.current.push(pos);
    };
    const onMove = (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (!laserDrawing.current) return;
      const pos = getPos(e);
      if (pos) laserTrailRef.current.push(pos);
    };
    const onUp = (e) => {
      e.stopPropagation();
      e.preventDefault();
      laserDrawing.current = false;
    };

    /* 렌더 루프 */
    const render = () => {
      const cvs = laserCanvasRef.current;
      if (!cvs) { laserRafRef.current = requestAnimationFrame(render); return; }
      const ctx = cvs.getContext('2d');
      /* 캔버스 크기 동기화 */
      const parent = cvs.parentElement;
      if (parent && (cvs.width !== parent.clientWidth || cvs.height !== parent.clientHeight)) {
        cvs.width  = parent.clientWidth;
        cvs.height = parent.clientHeight;
      }
      ctx.clearRect(0, 0, cvs.width, cvs.height);

      const now   = Date.now();
      const trail = laserTrailRef.current;
      /* 오래된 점 제거 */
      while (trail.length > 0 && now - trail[0].time > FADE_MS) trail.shift();

      if (trail.length > 1) {
        const curColor = colorRef.current;
        for (let i = 1; i < trail.length; i++) {
          const prev = trail[i - 1];
          const curr = trail[i];
          /* 다른 획인지 판별 (시간 차이 > 100ms이고 이전 획 끝) */
          if (curr.time - prev.time > 150) continue;
          const age     = (now - curr.time) / FADE_MS;
          const alpha   = Math.max(1 - age, 0);

          /* 네온 글로우: 넓은 블러 + 밝은 중심선 */
          ctx.save();
          ctx.globalAlpha = alpha * 0.4;
          ctx.strokeStyle = curColor;
          ctx.lineWidth   = 14;
          ctx.lineCap     = 'round';
          ctx.lineJoin    = 'round';
          ctx.shadowColor = curColor;
          ctx.shadowBlur  = 20;
          ctx.beginPath();
          ctx.moveTo(prev.x, prev.y);
          ctx.lineTo(curr.x, curr.y);
          ctx.stroke();
          ctx.restore();

          /* 밝은 중심선 */
          ctx.save();
          ctx.globalAlpha = alpha * 0.9;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth   = 2;
          ctx.lineCap     = 'round';
          ctx.lineJoin    = 'round';
          ctx.shadowColor = curColor;
          ctx.shadowBlur  = 10;
          ctx.beginPath();
          ctx.moveTo(prev.x, prev.y);
          ctx.lineTo(curr.x, curr.y);
          ctx.stroke();
          ctx.restore();
        }
      }

      laserRafRef.current = requestAnimationFrame(render);
    };

    const cvs = laserCanvasRef.current;
    if (cvs) {
      cvs.addEventListener('pointerdown', onDown);
      cvs.addEventListener('pointermove', onMove);
      cvs.addEventListener('pointerup',   onUp);
      cvs.addEventListener('pointercancel', onUp);
      cvs.addEventListener('pointerleave', onUp);
    }
    laserRafRef.current = requestAnimationFrame(render);

    return () => {
      if (laserRafRef.current) cancelAnimationFrame(laserRafRef.current);
      if (cvs) {
        cvs.removeEventListener('pointerdown', onDown);
        cvs.removeEventListener('pointermove', onMove);
        cvs.removeEventListener('pointerup',   onUp);
        cvs.removeEventListener('pointercancel', onUp);
        cvs.removeEventListener('pointerleave', onUp);
      }
    };
  }, [activeTool]);

  const disableImageMove = useCallback((api) => {
    const els = api.getSceneElements().map((el) =>
      el.id === BG_ELEMENT_ID ? { ...el, locked: true } : el
    );
    api.updateScene({ elements: els });
    setImageMoveMode(false);
  }, []);

  const SHAPE_TYPES = ['rectangle', 'ellipse', 'triangle', 'line'];

  const applyTool = (type) => {
    const api = apiRef.current;
    if (imageMoveMode && api) disableImageMove(api);
    setActiveTool(type);
    activeToolRef.current = type;
    if (SAVEABLE_TOOLS.includes(type)) localStorage.setItem('mc_active_tool', type);
    const zoom = api?.getAppState()?.zoom?.value || 1;
    const ink = inkRef.current;

    if (type === 'highlighter') {
      /* 형광펜: Excalidraw 는 freedraw, 투명도 40 + 형광펜 색·두께(줌 보정) */
      onBaseWidthChange?.(ink.hlWidth);
      api?.updateScene({
        appState: {
          activeTool: { type: 'freedraw', locked: false },
          currentItemStrokeColor: ink.hlColor,
          currentItemOpacity: HL_OPACITY,
          currentItemStrokeWidth: sceneStrokeWidth(ink.hlWidth, zoom),
        },
        commitToHistory: false,
      });
      return;
    }
    if (type === 'freedraw') {
      /* 펜: 투명도 100 + 펜 색·두께 복구 (줌 보정) */
      onBaseWidthChange?.(ink.penWidth);
      api?.updateScene({
        appState: {
          activeTool: { type: 'freedraw', locked: false },
          currentItemStrokeColor: ink.penColor,
          currentItemOpacity: 100,
          currentItemStrokeWidth: sceneStrokeWidth(ink.penWidth, zoom),
        },
        commitToHistory: false,
      });
      return;
    }

    /* 그 외 도구: 형광펜의 반투명·색이 새 요소에 남지 않게 펜 기준으로 되돌린다 */
    api?.updateScene({
      appState: { currentItemOpacity: 100, currentItemStrokeColor: ink.penColor },
      commitToHistory: false,
    });

    /* 도형 도구 공통: roughness=0 (반듯한 선) + strokeWidth=2 (중간 두께) + 도구 잠금 유지(locked: true) */
    if (SHAPE_TYPES.includes(type)) {
      const targetType = type === 'triangle' ? 'freedraw' : type;
      api?.updateScene({
        appState: {
          activeTool: { type: targetType, locked: true },
          currentItemRoughness: 0,
          currentItemStrokeWidth: 2,
          ...(type === 'rectangle' ? { currentItemRoundness: 'sharp' } : {}),
        },
        commitToHistory: false,
      });
      return;
    }

    if (type === 'laser_pointer' || type === 'lasso') {
      api?.setActiveTool({ type: 'selection' });
    } else {
      api?.setActiveTool({ type });
    }
  };

  /** 색 적용 — 켜진 도구가 형광펜이면 형광펜 색, 아니면 펜 색. 지우개·선택·이미지이동 중이면 펜으로 돌아간다. */
  const applyColor = (hex) => {
    const tool = activeToolRef.current;
    if (tool === 'highlighter') {
      setInk({ hlColor: hex });
      saveToolColor('highlighter', hex);
      apiRef.current?.updateScene({ appState: { currentItemStrokeColor: hex } });
      return;
    }
    setInk({ penColor: hex });
    saveToolColor('freedraw', hex);
    if (['eraser', 'lasso', 'image_move'].includes(tool)) {
      applyTool('freedraw');
      return;
    }
    apiRef.current?.updateScene({ appState: { currentItemStrokeColor: hex } });
  };

  /* 페이지 진입 시 항상 펜+검정으로 초기화 (형광펜 색·두께는 저장값 유지) */
  useEffect(() => {
    applyTool('freedraw');
    applyColor(PEN_COLOR_DEFAULT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId]);

  /** 두께 적용 — 켜진 잉크 도구(펜/형광펜)의 두께를 저장하고 줌 보정해 Excalidraw 에 넣는다 */
  const applyWidth = (w) => {
    const tool = inkToolOf(activeToolRef.current);
    setInk(tool === 'highlighter' ? { hlWidth: w } : { penWidth: w });
    saveToolWidth(tool, w);
    onBaseWidthChange?.(w);
    const zoom = apiRef.current?.getAppState()?.zoom?.value || 1;
    apiRef.current?.updateScene({ appState: { currentItemStrokeWidth: sceneStrokeWidth(w, zoom) }, commitToHistory: false });
  };

  const handleSlotsChange = (next) => {
    const saved = saveColorSlots(next);
    if (saved) setSlots(saved);
  };

  const handleToggleInputMode = () => {
    setInputMode(getInputMode() === 'stylus' ? 'finger' : 'stylus');
  };

  const handleToggleImageMove = () => {
    const api = apiRef.current;
    if (!api) return;
    const next = !imageMoveMode;
    setImageMoveMode(next);
    const els = api.getSceneElements().map((el) =>
      el.id === BG_ELEMENT_ID ? { ...el, locked: !next } : el
    );
    api.updateScene({ elements: els });
    if (next) {
      setActiveTool('image_move');
      api.setActiveTool({ type: 'selection' });
    } else {
      setActiveTool('freedraw');
      api.setActiveTool({ type: 'freedraw' });
    }
  };

  /* ── 배경 이미지 가로/세로 독립 리사이즈 ── */
  const handleResizeBg = (axis, delta) => {
    const api = apiRef.current;
    if (!api) return;
    const els = api.getSceneElements();
    if (!els.find(el => el.id === BG_ELEMENT_ID)) return;
    const factor = 1 + delta;
    const updated = els.map(el => {
      if (el.id !== BG_ELEMENT_ID) return el;
      return axis === 'width'
        ? { ...el, width: Math.max(el.width * factor, 50) }
        : { ...el, height: Math.max(el.height * factor, 50) };
    });
    api.updateScene({ elements: updated, commitToHistory: false });
  };

  /* ── 이미지 삽입 ── */
  const handleImageFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // 동일 파일 재선택 허용
    const api = apiRef.current;
    if (!api) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const rawImg = new Image();
      rawImg.onload = () => {
        /* 최대 800px 로 리사이즈 후 JPEG 85% 압축 */
        const maxDim  = 800;
        const scale   = Math.min(maxDim / rawImg.naturalWidth, maxDim / rawImg.naturalHeight, 1);
        const compW   = Math.round(rawImg.naturalWidth  * scale);
        const compH   = Math.round(rawImg.naturalHeight * scale);
        const cvs     = document.createElement('canvas');
        cvs.width     = compW;
        cvs.height    = compH;
        const ctx     = cvs.getContext('2d');
        ctx.fillStyle = '#ffffff'; // 투명 배경 → 흰색 처리
        ctx.fillRect(0, 0, compW, compH);
        ctx.drawImage(rawImg, 0, 0, compW, compH);
        const dataURL  = cvs.toDataURL('image/jpeg', 0.85);
        const mimeType = 'image/jpeg';

        /* 캔버스 표시 크기: 최대 400px */
        const dispScale = Math.min(400 / compW, 400 / compH, 1);
        const imgW      = Math.round(compW * dispScale);
        const imgH      = Math.round(compH * dispScale);

        /* 뷰포트 중앙 → 씬 좌표 변환 */
        const appState  = api.getAppState();
        const zoom      = appState.zoom.value;
        const canvasEl  = document.querySelector('.excalidraw canvas');
        const vpW       = canvasEl?.clientWidth  || 800;
        const vpH       = canvasEl?.clientHeight || 600;
        const centerX   = (vpW / 2 - appState.scrollX) / zoom;
        const centerY   = (vpH / 2 - appState.scrollY) / zoom;

        const fileId = 'imgf_' + Math.random().toString(36).slice(2, 9);
        api.addFiles([{ id: fileId, dataURL, mimeType, created: Date.now() }]);

        const imgEl = {
          type: 'image', id: 'img_' + Math.random().toString(36).slice(2, 9),
          fileId, status: 'saved',
          x: centerX - imgW / 2, y: centerY - imgH / 2,
          width: imgW, height: imgH, angle: 0,
          strokeColor: 'transparent', backgroundColor: 'transparent',
          fillStyle: 'solid', strokeWidth: 0, strokeStyle: 'solid',
          roughness: 0, opacity: 100, groupIds: [], frameId: null,
          roundness: null, isDeleted: false, locked: false, link: null,
          version: 1, versionNonce: Math.floor(Math.random() * 2e9),
          updated: Date.now(), seed: Math.floor(Math.random() * 2e9),
          boundElements: null, scale: [1, 1],
        };
        api.updateScene({ elements: [...api.getSceneElements(), imgEl] });
      };
      rawImg.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  /* ── 메모지 붙이기 ── */
  const STICKY_PAPER_RATIO = 0.36;
  const STICKY_FALLBACK_WIDTH = 260;
  const STICKY_NUDGE = 24;
  const insertSticky = (spec) => {
    const api = apiRef.current;
    if (!api) return;
    const paperW = bgPositionRef?.current?.width;
    const width = paperW ? paperW * STICKY_PAPER_RATIO : STICKY_FALLBACK_WIDTH;
    const height = width; // 자리 계산용 근사 — 실제 높이는 buildStickyElement 가 유형 비율로 정한다
    const appState = api.getAppState();
    const zoom = appState.zoom?.value || 1;
    const canvasEl = document.querySelector('.excalidraw canvas');
    const vpW = canvasEl?.clientWidth || 800;
    const vpH = canvasEl?.clientHeight || 600;
    let x = (vpW / 2 - (appState.scrollX || 0)) / zoom - width / 2;
    let y = (vpH / 2 - (appState.scrollY || 0)) / zoom - height / 2;
    const last = lastStickyPosRef.current;
    if (last && last.x === x && last.y === y) { x += STICKY_NUDGE; y += STICKY_NUDGE; }
    lastStickyPosRef.current = { x, y };
    saveStickyLast(spec);
    setStickySpec(spec);
    setPickerOpen(false);
    const el = buildStickyElement(spec, { x, y, width, opacity: stickyOpacity });
    /* addFiles 의 상태 커밋 뒤 다음 프레임에 updateScene — 같은 틱이면 이미지가 안 보일 수 있다 */
    requestAnimationFrame(() => {
      const a = apiRef.current;
      if (!a) return;
      a.addFiles([stickyFile(spec)]);
      const els = a.getSceneElements();
      const i = els.findIndex((e) => e.id === BG_ELEMENT_ID) + 1; // 배경 바로 뒤(없으면 맨 앞) = 기존 필기 아래
      a.updateScene({ elements: [...els.slice(0, i), el, ...els.slice(i)] });
    });
  };
  const openSticky = () => {
    setShapeMenuOpen(false);
    setPaletteOpen(false);
    setPickerOpen((v) => !v);
  };
  const onStickyPointerDown = () => {
    clearTimeout(longPressRef.current.timer);
    longPressRef.current.fired = false;
    longPressRef.current.timer = setTimeout(() => {
      longPressRef.current.fired = true;
      insertSticky(stickySpec);
    }, 500);
  };
  const onStickyPointerUp = () => { clearTimeout(longPressRef.current.timer); };
  const onStickyClick = () => {
    if (longPressRef.current.fired) { longPressRef.current.fired = false; return; }
    openSticky();
  };
  const onStickyDoubleClick = () => { setPickerOpen(false); insertSticky(stickySpec); };

  const handleClear = () => {
    if (!window.confirm('필기 내용을 모두 지우시겠습니까?')) return;
    const api = apiRef.current;
    if (!api) return;
    const bgEl = api.getSceneElements().find((el) => el.id === BG_ELEMENT_ID);
    api.updateScene({ elements: bgEl ? [bgEl] : [] });
  };

  const isShapeActive   = SHAPE_TOOLS.includes(activeTool);
  const ShapeActiveIcon = isShapeActive ? SHAPE_TOOL_ICONS[activeTool] : Shapes;

  const toolBtn = (type, Icon, label, mod) => (
    <button key={type} data-tb={type} onClick={() => applyTool(type)} title={label}
      aria-pressed={activeTool === type}
      className={btnCls(activeTool === type, mod)}>
      <Icon />
    </button>
  );

  return (
    <div className="vw-tb" role="toolbar" aria-label="필기 도구">

      {/* ⓪ 페이지 목록(썸네일) 열기/닫기 — 뷰어가 핸들러를 줄 때만 */}
      {onToggleSidebar && (
        <>
          <button data-tb="pages" onClick={onToggleSidebar}
            aria-pressed={!!sidebarOpen}
            title={sidebarOpen ? '페이지 목록 숨기기' : '페이지 목록 펼치기'}
            aria-label={sidebarOpen ? '페이지 목록 숨기기' : '페이지 목록 펼치기'}
            className={btnCls(!!sidebarOpen)}>
            <PageListIcon />
          </button>
          <Divider />
        </>
      )}

      {/* ⓪ 실행 취소 / 다시 실행 */}
      <button data-tb="undo" onClick={onUndo} disabled={!canUndo} title="실행 취소 (Ctrl+Z)" aria-label="실행 취소"
        className="vw-tb-btn">
        <Undo2 />
      </button>
      <button data-tb="redo" onClick={onRedo} disabled={!canRedo} title="다시 실행 (Ctrl+Shift+Z)" aria-label="다시 실행"
        className="vw-tb-btn">
        <Redo2 />
      </button>
      <Divider />

      {/* ① 펜 · 형광펜 · 손가락 필기 · 레이저 포인터 */}
      {toolBtn('freedraw', Pen, '펜')}
      {toolBtn('highlighter', Highlighter, '형광펜 (반투명)', 'vw-tb-btn--hl')}
      <button data-tb="finger" onClick={handleToggleInputMode}
        aria-pressed={inputMode === 'finger'}
        title={inputMode === 'finger'
          ? '손가락 필기 끄기 (현재: 손가락 허용)'
          : '손가락 필기 켜기 (현재: 스타일러스 전용)'}
        className={btnCls(inputMode === 'finger', 'vw-tb-btn--finger')}>
        <Pointer />
      </button>
      {toolBtn('laser_pointer', Dot, '레이저 포인터', 'vw-tb-btn--laser')}
      <Divider />

      {/* ② 색상 바로가기 5칸 + 색상 설정 */}
      {slots.map((hex, i) => (
        <button key={i} data-tb={`slot-${i}`} onClick={() => applyColor(hex)} title={hex}
          aria-label={`색 ${i + 1}: ${hex}`}
          aria-pressed={curColor === hex}
          className={`vw-swatch${curColor === hex ? ' is-current' : ''}`}
          style={{ backgroundColor: hex }}
        />
      ))}
      <button data-tb="palette" onClick={() => setPaletteOpen(true)} title="색상 설정 — 바로가기 색 바꾸기 · 스포이드 · 직접 입력"
        aria-haspopup="dialog" aria-expanded={paletteOpen}
        className={btnCls(paletteOpen)}>
        <Palette style={{ color: paletteOpen ? undefined : curColor }} />
      </button>
      <Divider />

      {/* ③ 두께 슬라이더 (펜/형광펜 — 켜진 도구의 두께) */}
      <div data-tb="width" className={`vw-tb-width${inkTool === 'highlighter' ? ' is-hl' : ''}`}>
        <input
          type="range" min={range.min} max={range.max} step={range.step}
          value={curWidth}
          title={`${inkTool === 'highlighter' ? '형광펜' : '펜'} 굵기: ${curWidth}`}
          aria-label={`${inkTool === 'highlighter' ? '형광펜' : '펜'} 굵기`}
          onChange={(e) => applyWidth(parseFloat(e.target.value))}
        />
        <svg width="22" height="16" className="flex-shrink-0" style={{ overflow: 'visible' }} aria-hidden="true">
          <line x1="1" y1="8" x2="21" y2="8"
            stroke={curColor}
            strokeOpacity={inkTool === 'highlighter' ? HL_OPACITY / 100 : 1}
            strokeWidth={Math.max(Math.min(inkTool === 'highlighter' ? curWidth * 3 : curWidth, 10), 0.1)}
            strokeLinecap="round"
          />
        </svg>
      </div>
      <Divider />

      {/* ④ 지우개 · 이미지 */}
      {toolBtn('eraser', Eraser, '지우개 — 획 단위')}

      {/* 이미지 이동 (배경 이미지 페이지 전용 — PDF 종이는 Excalidraw 요소가 아니라 끌 수 없음) */}
      {!htmlMode && !pdfMode && (
      <button data-tb="image_move" onClick={handleToggleImageMove}
        aria-pressed={imageMoveMode}
        title={imageMoveMode ? '이미지 이동 완료 (잠금)' : '이미지 이동 — 배경 이미지를 드래그로 이동'}
        className={btnCls(imageMoveMode, 'vw-tb-btn--image')}>
        <Hand />
      </button>
      )}

      {/* 이미지 가로/세로 비율 조정 (이동 모드일 때만) */}
      {imageMoveMode && (
        <>
          <div className="vw-tb-mini" role="group" aria-label="배경 너비">
            <span className="vw-tb-mini-label" aria-hidden="true">W</span>
            <button onClick={() => handleResizeBg('width', -0.05)} title="너비 축소 (-5%)" aria-label="너비 축소 (-5%)">
              <Minus />
            </button>
            <button onClick={() => handleResizeBg('width', 0.05)} title="너비 확대 (+5%)" aria-label="너비 확대 (+5%)">
              <Plus />
            </button>
          </div>
          <div className="vw-tb-mini" role="group" aria-label="배경 높이">
            <span className="vw-tb-mini-label" aria-hidden="true">H</span>
            <button onClick={() => handleResizeBg('height', -0.05)} title="높이 축소 (-5%)" aria-label="높이 축소 (-5%)">
              <Minus />
            </button>
            <button onClick={() => handleResizeBg('height', 0.05)} title="높이 확대 (+5%)" aria-label="높이 확대 (+5%)">
              <Plus />
            </button>
          </div>
        </>
      )}

      {onReloadImage && (
        <button data-tb="image_reload" onClick={onReloadImage}
          title="이미지 위치 초기화 — 원본 비율로 재배치"
          className="vw-tb-btn">
          <RefreshCw />
        </button>
      )}

      <button ref={stickyBtnRef} data-tb="sticky" type="button"
        onPointerDown={onStickyPointerDown} onPointerUp={onStickyPointerUp} onPointerLeave={onStickyPointerUp}
        onClick={onStickyClick} onDoubleClick={onStickyDoubleClick}
        disabled={!apiRef.current}
        aria-haspopup="dialog" aria-expanded={pickerOpen} aria-label="메모지"
        title="메모지 — 누르면 고르기, 길게 누르면 마지막 메모지 바로 붙이기"
        className={btnCls(pickerOpen)}>
        <StickyNote />
      </button>
      {pickerOpen && (
        <StickyPicker
          current={stickySpec}
          anchorEl={stickyBtnRef.current}
          anchorRect={stickyBtnRef.current?.getBoundingClientRect() ?? { bottom: 0 }}
          onPick={insertSticky}
          onPatternChange={(pattern) => setStickySpec((sp) => ({ ...sp, pattern }))}
          onClose={() => setPickerOpen(false)}
        />
      )}

      <button data-tb="image_add" onClick={() => imageInputRef.current?.click()} title="이미지 삽입"
        className="vw-tb-btn">
        <ImagePlus />
      </button>
      <input ref={imageInputRef} type="file" accept="image/*" className="sr-only"
        onChange={handleImageFileChange} />
      <Divider />

      {/* ⑤ 직선 · 텍스트 · 도형 · 선택 */}
      {toolBtn('line', Minus, '직선')}
      {toolBtn('text', Type, '텍스트')}
      <button data-tb="shapes"
        onClick={() => setShapeMenuOpen((v) => !v)}
        title="도형 (사각형 / 원 / 삼각형)"
        aria-expanded={shapeMenuOpen}
        className={`${btnCls(isShapeActive || shapeMenuOpen)} vw-tb-btn--wide`}
      >
        <ShapeActiveIcon />
        <ChevronDown className="vw-tb-caret" />
      </button>

      {shapeMenuOpen && (
        <>
          {[
            { type: 'rectangle', Icon: Square,   label: '사각형' },
            { type: 'ellipse',   Icon: Circle,   label: '원' },
            { type: 'triangle',  Icon: Triangle, label: '삼각형 (그린 후 자동 변환)' },
          ].map(({ type, Icon: ShapeIcon, label }) => (
            <button key={type}
              onClick={() => { applyTool(type); setShapeMenuOpen(false); }}
              title={label}
              className={btnCls(activeTool === type)}>
              <ShapeIcon />
            </button>
          ))}
        </>
      )}
      {toolBtn('lasso', LassoSelect, '올가미 선택 — 둘러싼 필기·이미지 선택')}
      <Divider />

      {/* ⑥ 전체 지우기 */}
      <button data-tb="clear" onClick={handleClear} title="전체 지우기"
        className="vw-tb-btn vw-tb-btn--danger">
        <Trash2 />
      </button>
      <Divider />

      {/* ⑦ Excalidraw 세부설정 패널 토글 */}
      <button data-tb="settings" onClick={onTogglePanel}
        title={showPanel ? 'Excalidraw 세부설정 숨기기' : 'Excalidraw 세부설정 열기'}
        aria-pressed={!!showPanel}
        className={btnCls(showPanel, 'vw-tb-btn--settings')}>
        <SlidersHorizontal />
      </button>

      {paletteOpen && (
        <ColorSlotsModal
          slots={slots}
          currentColor={curColor}
          onApply={applyColor}
          onSlotsChange={handleSlotsChange}
          onClose={() => setPaletteOpen(false)}
        />
      )}

      {/* 레이저 포인터 캔버스 오버레이 (포털을 통해 전체화면 최상단 렌더링) */}
      {activeTool === 'laser_pointer' && createPortal(
        <canvas
          ref={laserCanvasRef}
          className="fixed inset-0 z-40 pointer-events-auto"
          style={{ touchAction: 'none', cursor: 'crosshair' }}
        />,
        document.body
      )}
    </div>
  );
}

export default DrawingToolbar;
