import { useState, useRef, useCallback, useEffect } from 'react';
import {
  MousePointer, Pen, Type, Square, Circle, Triangle,
  Eraser, Minus, Trash2, Pipette, Plus, Scissors,
  SlidersHorizontal, Hand, Shapes, ChevronDown, ImagePlus,
} from 'lucide-react';
import {
  BG_ELEMENT_ID,
  DEFAULT_COLORS,
  MAX_CUSTOM_COLORS,
  TOOLS,
} from '../../lib/excalidrawUtils';

const TOOL_ICONS = {
  selection: MousePointer,
  freedraw:  Pen,
  text:      Type,
};

const SHAPE_TOOL_ICONS = {
  rectangle: Square,
  ellipse:   Circle,
  triangle:  Triangle,
  line:      Minus,
};

const SHAPE_TOOLS    = ['rectangle', 'ellipse', 'triangle', 'line'];
const SAVEABLE_TOOLS = ['freedraw', 'selection', 'text', 'line', 'rectangle', 'ellipse', 'triangle'];

function DrawingToolbar({ apiRef, showPanel, onTogglePanel }) {
  const [activeTool, setActiveTool]       = useState(() => {
    const saved = localStorage.getItem('mc_active_tool') || 'freedraw';
    return SAVEABLE_TOOLS.includes(saved) ? saved : 'freedraw';
  });
  const [color, setColor]                 = useState(() =>
    localStorage.getItem('mc_tool_color') || '#000000'
  );
  const [strokeWidth, setStrokeWidth]     = useState(() =>
    parseFloat(localStorage.getItem('mc_stroke_width') || '0.2')
  );
  const [imageMoveMode, setImageMoveMode] = useState(false);
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false);
  const [customColors, setCustomColors]   = useState(() => {
    try { return JSON.parse(localStorage.getItem('mc_custom_colors') || '[]'); }
    catch { return []; }
  });

  const colorPickerRef = useRef(null);
  const imageInputRef  = useRef(null);
  const colorRef       = useRef(color);
  const strokeWidthRef = useRef(strokeWidth);
  useEffect(() => { colorRef.current = color; },             [color]);
  useEffect(() => { strokeWidthRef.current = strokeWidth; }, [strokeWidth]);

  /* ── S Pen refs ── */
  const sPenPrevToolRef = useRef(null);
  const activeToolRef   = useRef(activeTool);
  const applyToolRef    = useRef(null);
  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);

  /* ── S Pen 사이드 버튼 → 지우개 모드 (개선) ── */
  const sPenBtnActiveRef = useRef(false);   // 버튼이 눌린 상태 추적

  useEffect(() => {
    /* 헬퍼: 지우개 모드 진입 */
    const enterEraser = () => {
      if (sPenPrevToolRef.current !== null) return; // 이미 진입됨
      const current = activeToolRef.current;
      if (current === 'eraser') return;
      sPenPrevToolRef.current = ['image_move', 'eraser_area'].includes(current)
        ? 'freedraw'
        : current;
      sPenBtnActiveRef.current = true;
      applyToolRef.current?.('eraser');
    };

    /* 헬퍼: 이전 도구 복원 */
    const restoreTool = () => {
      if (sPenPrevToolRef.current === null) return;
      applyToolRef.current?.(sPenPrevToolRef.current);
      sPenPrevToolRef.current = null;
      sPenBtnActiveRef.current = false;
    };

    /* ① pointerdown: button===2 (기존 방식) 또는 button===5 (eraser tip) */
    const onSPenDown = (e) => {
      if (e.pointerType !== 'pen') return;
      if (e.button === 2 || e.button === 5) {
        e.preventDefault();
        enterEraser();
      }
      /* ② 호버 감지: 공중에서 버튼 누른 채 터치 (button===1, pressure===0 상태에서 진입) */
      if (sPenBtnActiveRef.current && sPenPrevToolRef.current !== null) {
        e.preventDefault();
      }
    };

    /* ③ pointermove: buttons 비트마스크 모니터링 */
    const onSPenMove = (e) => {
      if (e.pointerType !== 'pen') return;
      const hasBtn = (e.buttons & 2) !== 0 || (e.buttons & 32) !== 0;

      if (hasBtn && !sPenBtnActiveRef.current) {
        /* 버튼이 방금 눌림 → 지우개 전환 */
        enterEraser();
      } else if (!hasBtn && sPenBtnActiveRef.current && e.pressure > 0) {
        /* 화면에 터치 중인데 버튼이 풀림 → 도구 복원 */
        restoreTool();
      }

      /* 호버 상태에서 버튼 감지 (공중에서 버튼 누르기) */
      if (e.pressure === 0 && (e.buttons & 2) !== 0) {
        enterEraser();
      }
    };

    /* ④ pointerup / pointercancel: 펜을 들었을 때 도구 복원 */
    const onSPenUp = (e) => {
      if (e.pointerType !== 'pen') return;
      restoreTool();
    };

    /* ⑤ contextmenu: S Pen 버튼 + 터치 후 릴리스 시 발생 → 지우개 전환 트리거 */
    const onContextMenu = (e) => {
      if (sPenBtnActiveRef.current || sPenPrevToolRef.current !== null) {
        e.preventDefault();
        return;
      }
      /* S Pen 컨텍스트 메뉴를 지우개 토글로 활용 */
      const lastPointerType = e.pointerType || '';
      if (lastPointerType === 'pen' || (e.sourceCapabilities && !e.sourceCapabilities.firesTouchEvents)) {
        e.preventDefault();
        enterEraser();
        /* 짧은 시간 후 자동 복원 (컨텍스트메뉴는 일회성 이벤트이므로) */
        setTimeout(restoreTool, 100);
      }
    };

    document.addEventListener('pointerdown',   onSPenDown, { capture: true });
    document.addEventListener('pointermove',   onSPenMove, { capture: true });
    document.addEventListener('pointerup',     onSPenUp,   { capture: true });
    document.addEventListener('pointercancel', onSPenUp,   { capture: true });
    document.addEventListener('contextmenu',   onContextMenu, { capture: true });
    return () => {
      document.removeEventListener('pointerdown',   onSPenDown, { capture: true });
      document.removeEventListener('pointermove',   onSPenMove, { capture: true });
      document.removeEventListener('pointerup',     onSPenUp,   { capture: true });
      document.removeEventListener('pointercancel', onSPenUp,   { capture: true });
      document.removeEventListener('contextmenu',   onContextMenu, { capture: true });
    };
  }, []);

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
        const triangleEl = {
          type: 'line', id: 'tri_' + Math.random().toString(36).slice(2, 9),
          x, y, width: w, height: h, angle: 0,
          strokeColor: colorRef.current, backgroundColor: 'transparent',
          fillStyle: 'solid', strokeWidth: Math.max(strokeWidthRef.current, 0.5),
          strokeStyle: 'solid', roughness: 0, opacity: 100,
          points: [[w / 2, 0], [w, h], [0, h], [w / 2, 0]],
          startArrowhead: null, endArrowhead: null,
          groupIds: [], frameId: null, roundness: null,
          isDeleted: false, locked: false, link: null,
          version: 1, versionNonce: Math.floor(Math.random() * 2e9),
          updated: Date.now(), seed: Math.floor(Math.random() * 2e9), boundElements: null,
        };
        const nextEls = els.map((el) =>
          el.id === newest.id ? { ...el, isDeleted: true } : el
        );
        api.updateScene({ elements: [...nextEls, triangleEl] });
      }, 80);
    };
    document.addEventListener('pointerup', onPointerUp, { capture: true });
    return () => document.removeEventListener('pointerup', onPointerUp, { capture: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const allColors = [...DEFAULT_COLORS, ...customColors];

  const disableImageMove = useCallback((api) => {
    const els = api.getSceneElements().map((el) =>
      el.id === BG_ELEMENT_ID ? { ...el, locked: true } : el
    );
    api.updateScene({ elements: els });
    setImageMoveMode(false);
  }, []);

  const applyTool = (type) => {
    const api = apiRef.current;
    if (imageMoveMode && api) disableImageMove(api);
    setActiveTool(type);
    if (SAVEABLE_TOOLS.includes(type)) localStorage.setItem('mc_active_tool', type);
    if (type === 'eraser_area') {
      api?.setActiveTool({ type: 'selection' });
    } else if (type === 'triangle') {
      api?.setActiveTool({ type: 'freedraw' });
    } else if (type === 'rectangle') {
      api?.updateScene({ appState: { currentItemRoundness: 'sharp' }, commitToHistory: false });
      api?.setActiveTool({ type: 'rectangle' });
    } else {
      api?.setActiveTool({ type });
    }
  };
  useEffect(() => { applyToolRef.current = applyTool; });

  const applyColor = (hex) => {
    setColor(hex);
    localStorage.setItem('mc_tool_color', hex);
    apiRef.current?.updateScene({ appState: { currentItemStrokeColor: hex } });
    if (['eraser', 'eraser_area', 'selection', 'image_move'].includes(activeTool)) {
      setActiveTool('freedraw');
      localStorage.setItem('mc_active_tool', 'freedraw');
      apiRef.current?.setActiveTool({ type: 'freedraw' });
    }
  };

  const applyWidth = (w) => {
    setStrokeWidth(w);
    localStorage.setItem('mc_stroke_width', String(w));
    apiRef.current?.updateScene({ appState: { currentItemStrokeWidth: w } });
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

  const handleClear = () => {
    if (!window.confirm('필기 내용을 모두 지우시겠습니까?')) return;
    const api = apiRef.current;
    if (!api) return;
    const bgEl = api.getSceneElements().find((el) => el.id === BG_ELEMENT_ID);
    api.updateScene({ elements: bgEl ? [bgEl] : [] });
  };

  const handleDeleteSelected = () => {
    const api = apiRef.current;
    if (!api) return;
    const selectedIds = api.getAppState()?.selectedElementIds ?? {};
    if (Object.keys(selectedIds).length === 0) return;
    const next = api.getSceneElements().map((el) =>
      selectedIds[el.id] && el.id !== BG_ELEMENT_ID
        ? { ...el, isDeleted: true }
        : el
    );
    api.updateScene({ elements: next });
  };

  const handleEyeDropper = async () => {
    if (!window.EyeDropper) {
      alert('스포이드 기능은 Chrome 95 이상에서만 지원됩니다.');
      return;
    }
    try {
      const result = await new window.EyeDropper().open();
      applyColor(result.sRGBHex);
    } catch { /* 취소 */ }
  };

  const handleAddColor = () => colorPickerRef.current?.click();

  const handleColorPickerChange = (e) => {
    const hex  = e.target.value;
    const next = customColors.filter((c) => c !== hex);
    if (next.length >= MAX_CUSTOM_COLORS) next.shift();
    next.push(hex);
    setCustomColors(next);
    localStorage.setItem('mc_custom_colors', JSON.stringify(next));
    applyColor(hex);
  };

  const isShapeActive   = SHAPE_TOOLS.includes(activeTool);
  const ShapeActiveIcon = isShapeActive ? SHAPE_TOOL_ICONS[activeTool] : Shapes;

  return (
    <div className="flex items-center gap-1 px-3 h-11 bg-white border-b shadow-sm flex-shrink-0 overflow-x-auto sticky top-14 z-10">

      {/* ① 기본 도구 */}
      {TOOLS.map(({ type, label }) => {
        const Icon = TOOL_ICONS[type];
        return (
          <button key={type} onClick={() => applyTool(type)} title={label}
            className={`p-1.5 rounded-md transition-colors cursor-pointer ${
              activeTool === type ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:bg-gray-100'
            }`}>
            <Icon className="h-4 w-4" />
          </button>
        );
      })}

      {/* ② 도형 버튼 + 인라인 서브메뉴 */}
      <button
        onClick={() => setShapeMenuOpen((v) => !v)}
        title="도형 (사각형 / 원 / 삼각형 / 직선)"
        className={`p-1.5 rounded-md transition-colors cursor-pointer flex-shrink-0 flex items-center gap-0.5 ${
          isShapeActive || shapeMenuOpen ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:bg-gray-100'
        }`}
      >
        <ShapeActiveIcon className="h-4 w-4" />
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>

      {shapeMenuOpen && (
        <>
          {[
            { type: 'rectangle', Icon: Square,   label: '사각형' },
            { type: 'ellipse',   Icon: Circle,   label: '원' },
            { type: 'triangle',  Icon: Triangle, label: '삼각형 (그린 후 자동 변환)' },
            { type: 'line',      Icon: Minus,    label: '직선' },
          // eslint-disable-next-line no-unused-vars
          ].map(({ type, Icon: ShapeIcon, label }) => (
            <button key={type}
              onClick={() => { applyTool(type); setShapeMenuOpen(false); }}
              title={label}
              className={`p-1.5 rounded-md transition-colors cursor-pointer flex-shrink-0 ${
                activeTool === type ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:bg-gray-100'
              }`}>
              <ShapeIcon className="h-4 w-4" />
            </button>
          ))}
          <div className="w-px h-6 bg-gray-200 mx-0.5 flex-shrink-0" />
        </>
      )}

      {/* 지우개 (획 단위) */}
      <button onClick={() => applyTool('eraser')} title="지우개 — 획 단위"
        className={`p-1.5 rounded-md transition-colors cursor-pointer ${
          activeTool === 'eraser' ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:bg-gray-100'
        }`}>
        <Eraser className="h-4 w-4" />
      </button>

      {/* 영역 삭제 */}
      <button onClick={() => applyTool('eraser_area')} title="영역 삭제 — 드래그 선택 후 삭제"
        className={`p-1.5 rounded-md transition-colors cursor-pointer ${
          activeTool === 'eraser_area' ? 'bg-orange-100 text-orange-600' : 'text-gray-600 hover:bg-gray-100'
        }`}>
        <Scissors className="h-4 w-4" />
      </button>

      {activeTool === 'eraser_area' && (
        <button onClick={handleDeleteSelected}
          className="px-2 h-7 rounded text-xs font-medium bg-orange-500 text-white hover:bg-orange-600 cursor-pointer flex-shrink-0">
          선택 삭제
        </button>
      )}

      {/* 이미지 이동 */}
      <button onClick={handleToggleImageMove}
        title={imageMoveMode ? '이미지 이동 완료 (잠금)' : '이미지 이동 — 배경 이미지를 드래그로 이동'}
        className={`p-1.5 rounded-md transition-colors cursor-pointer ${
          imageMoveMode ? 'bg-green-100 text-green-600' : 'text-gray-600 hover:bg-gray-100'
        }`}>
        <Hand className="h-4 w-4" />
      </button>

      {/* 이미지 삽입 */}
      <button onClick={() => imageInputRef.current?.click()} title="이미지 삽입"
        className="p-1.5 rounded-md transition-colors cursor-pointer text-gray-600 hover:bg-gray-100 flex-shrink-0">
        <ImagePlus className="h-4 w-4" />
      </button>
      <input ref={imageInputRef} type="file" accept="image/*" className="sr-only"
        onChange={handleImageFileChange} />

      <div className="w-px h-6 bg-gray-200 mx-1 flex-shrink-0" />

      {/* ③ 색상 팔레트 */}
      {allColors.map((hex) => (
        <button key={hex} onClick={() => applyColor(hex)} title={hex}
          className={`w-5 h-5 rounded-full cursor-pointer flex-shrink-0 transition-transform border border-white ${
            color === hex ? 'ring-2 ring-offset-1 ring-gray-500 scale-110' : 'hover:scale-110'
          }`}
          style={{ backgroundColor: hex }}
        />
      ))}

      <button onClick={handleAddColor} title="커스텀 색상 추가"
        className="w-5 h-5 rounded-full flex items-center justify-center bg-gray-100 hover:bg-gray-200 cursor-pointer flex-shrink-0 border border-dashed border-gray-400">
        <Plus className="h-3 w-3 text-gray-600" />
      </button>
      <input ref={colorPickerRef} type="color" className="sr-only"
        value={color} onChange={handleColorPickerChange} />

      <button onClick={handleEyeDropper} title="스포이드 — 화면에서 색상 추출 (Chrome 95+)"
        className="p-1.5 rounded-md text-gray-600 hover:bg-gray-100 cursor-pointer flex-shrink-0">
        <Pipette className="h-4 w-4" />
      </button>

      <div className="w-px h-6 bg-gray-200 mx-1 flex-shrink-0" />

      {/* ④ 선 굵기 슬라이더 */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <input
          type="range" min="0.1" max="2" step="0.1"
          value={strokeWidth}
          title={`굵기: ${strokeWidth}`}
          onChange={(e) => applyWidth(parseFloat(e.target.value))}
          className="w-32 accent-blue-500 cursor-pointer"
        />
        <svg width="22" height="16" className="flex-shrink-0" style={{ overflow: 'visible' }}>
          <line x1="1" y1="8" x2="21" y2="8"
            stroke={color}
            strokeWidth={Math.max(Math.min(strokeWidth, 2), 0.1)}
            strokeLinecap="round"
          />
        </svg>
      </div>

      <div className="w-px h-6 bg-gray-200 mx-1 flex-shrink-0" />

      {/* ⑤ 전체 지우기 */}
      <button onClick={handleClear} title="전체 지우기"
        className="p-1.5 rounded-md text-red-500 hover:bg-red-50 cursor-pointer flex-shrink-0">
        <Trash2 className="h-4 w-4" />
      </button>

      <div className="w-px h-6 bg-gray-200 mx-1 flex-shrink-0" />

      {/* ⑥ Excalidraw 세부설정 패널 토글 */}
      <button onClick={onTogglePanel}
        title={showPanel ? 'Excalidraw 세부설정 숨기기' : 'Excalidraw 세부설정 열기'}
        className={`p-1.5 rounded-md transition-colors cursor-pointer flex-shrink-0 ${
          showPanel ? 'bg-violet-100 text-violet-600' : 'text-gray-400 hover:bg-gray-100'
        }`}>
        <SlidersHorizontal className="h-4 w-4" />
      </button>
    </div>
  );
}

export default DrawingToolbar;
