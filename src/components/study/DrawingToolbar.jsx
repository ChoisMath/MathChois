import { useState, useRef, useCallback, useEffect } from 'react';
import {
  MousePointer, Pen, Type, Square, Circle, Triangle,
  Eraser, Minus, Undo2, Redo2, Trash2, Pipette, Plus, Scissors,
  SlidersHorizontal, Hand, Shapes, ChevronDown,
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

const SHAPE_TOOLS   = ['rectangle', 'ellipse', 'triangle', 'line'];
const SAVEABLE_TOOLS = ['freedraw', 'selection', 'text', 'line', 'rectangle', 'ellipse', 'triangle'];

function DrawingToolbar({ apiRef, showPanel, onTogglePanel }) {
  const [activeTool, setActiveTool]       = useState(() => {
    const saved = localStorage.getItem('mc_active_tool') || 'freedraw';
    return SAVEABLE_TOOLS.includes(saved) ? saved : 'freedraw';
  });
  const [color, setColor]                 = useState(() =>
    localStorage.getItem('mc_tool_color') || '#1e1e1e'
  );
  const [strokeWidth, setStrokeWidth]     = useState(() =>
    parseFloat(localStorage.getItem('mc_stroke_width') || '0.5')
  );
  const [imageMoveMode, setImageMoveMode] = useState(false);
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false);
  const [customColors, setCustomColors]   = useState(() => {
    try { return JSON.parse(localStorage.getItem('mc_custom_colors') || '[]'); }
    catch { return []; }
  });

  const colorPickerRef = useRef(null);
  const colorRef       = useRef(color);
  const strokeWidthRef = useRef(strokeWidth);
  useEffect(() => { colorRef.current = color; },       [color]);
  useEffect(() => { strokeWidthRef.current = strokeWidth; }, [strokeWidth]);

  /* ── S Pen refs ── */
  const sPenPrevToolRef = useRef(null);
  const activeToolRef   = useRef(activeTool);
  const applyToolRef    = useRef(null);
  activeToolRef.current = activeTool;   // 매 렌더마다 최신값 반영

  /* ── S Pen 사이드 버튼 → 지우개 모드 ── */
  useEffect(() => {
    const onSPenDown = (e) => {
      if (e.pointerType !== 'pen' || e.button !== 2) return;
      if (sPenPrevToolRef.current !== null) return;

      const current = activeToolRef.current;
      if (current === 'eraser') return;

      sPenPrevToolRef.current = ['image_move', 'eraser_area'].includes(current)
        ? 'freedraw'
        : current;
      applyToolRef.current('eraser');
    };

    const onSPenUp = (e) => {
      if (e.pointerType !== 'pen' || sPenPrevToolRef.current === null) return;
      applyToolRef.current(sPenPrevToolRef.current);
      sPenPrevToolRef.current = null;
    };

    /* S펜 배럴 버튼으로 발생하는 컨텍스트 메뉴 방지 */
    const onContextMenu = (e) => {
      if (sPenPrevToolRef.current !== null) e.preventDefault();
    };

    /* capture:true → Excalidraw 핸들러보다 먼저 실행
       pointerup/pointercancel도 capture:true 로 등록해야
       Excalidraw가 stopPropagation 해도 복원 이벤트를 받을 수 있음 */
    document.addEventListener('pointerdown',   onSPenDown,    { capture: true });
    document.addEventListener('pointerup',     onSPenUp,      { capture: true });
    document.addEventListener('pointercancel', onSPenUp,      { capture: true });
    document.addEventListener('contextmenu',   onContextMenu, { capture: true });

    return () => {
      document.removeEventListener('pointerdown',   onSPenDown,    { capture: true });
      document.removeEventListener('pointerup',     onSPenUp,      { capture: true });
      document.removeEventListener('pointercancel', onSPenUp,      { capture: true });
      document.removeEventListener('contextmenu',   onContextMenu, { capture: true });
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── 삼각형 모드: pointerup 후 freedraw 요소 → 삼각형 line 으로 변환 ── */
  useEffect(() => {
    const onPointerUp = () => {
      if (activeToolRef.current !== 'triangle') return;
      const api = apiRef.current;
      if (!api) return;

      /* Excalidraw 가 freedraw 요소를 확정(finalize)할 때까지 잠시 대기 */
      setTimeout(() => {
        const els = api.getSceneElements();
        const freedraws = els.filter((el) => el.type === 'freedraw' && !el.isDeleted);
        if (freedraws.length === 0) return;

        /* 가장 최근에 추가/수정된 freedraw 선택 */
        const newest = freedraws.reduce((a, b) => (a.updated > b.updated ? a : b));
        const { x, y, width: w, height: h } = newest;
        if (w < 5 || h < 5) return; // 너무 작으면 변환 생략

        /* 이등변 삼각형 (위쪽 꼭짓점, 오른쪽 아래, 왼쪽 아래, 닫힘) */
        const triangleEl = {
          type:            'line',
          id:              'tri_' + Math.random().toString(36).slice(2, 9),
          x, y,
          width:           w,
          height:          h,
          angle:           0,
          strokeColor:     colorRef.current,
          backgroundColor: 'transparent',
          fillStyle:       'solid',
          strokeWidth:     Math.max(strokeWidthRef.current, 0.5),
          strokeStyle:     'solid',
          roughness:       0,
          opacity:         100,
          points:          [[w / 2, 0], [w, h], [0, h], [w / 2, 0]],
          startArrowhead:  null,
          endArrowhead:    null,
          groupIds:        [],
          frameId:         null,
          roundness:       null,
          isDeleted:       false,
          locked:          false,
          link:            null,
          version:         1,
          versionNonce:    Math.floor(Math.random() * 2e9),
          updated:         Date.now(),
          seed:            Math.floor(Math.random() * 2e9),
          boundElements:   null,
        };

        /* 기존 freedraw 를 isDeleted 처리하고 삼각형 추가 */
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
      /* 삼각형은 freedraw 로 그린 후 pointerup 에서 변환 */
      api?.setActiveTool({ type: 'freedraw' });
    } else if (type === 'rectangle') {
      /* 사각형 모서리를 항상 각지게 */
      api?.updateScene({ appState: { currentItemRoundness: 'sharp' }, commitToHistory: false });
      api?.setActiveTool({ type: 'rectangle' });
    } else {
      api?.setActiveTool({ type });
    }
  };
  applyToolRef.current = applyTool; // 매 렌더마다 최신값으로 갱신

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

  const handleUndo = () =>
    document.dispatchEvent(new KeyboardEvent('keydown', {
      code: 'KeyZ', key: 'z', ctrlKey: true, bubbles: true, cancelable: true,
    }));
  const handleRedo = () =>
    document.dispatchEvent(new KeyboardEvent('keydown', {
      code: 'KeyY', key: 'y', ctrlKey: true, bubbles: true, cancelable: true,
    }));

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

  const isShapeActive    = SHAPE_TOOLS.includes(activeTool);
  const ShapeActiveIcon  = isShapeActive ? SHAPE_TOOL_ICONS[activeTool] : Shapes;

  return (
    <div className="flex items-center gap-1 px-3 h-11 bg-white border-b shadow-sm flex-shrink-0 overflow-x-auto sticky top-14 z-10">

      {/* ① 기본 도구 (선택, 자유 필기, 텍스트) */}
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
          ].map(({ type, Icon, label }) => (
            <button
              key={type}
              onClick={() => { applyTool(type); setShapeMenuOpen(false); }}
              title={label}
              className={`p-1.5 rounded-md transition-colors cursor-pointer flex-shrink-0 ${
                activeTool === type ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Icon className="h-4 w-4" />
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
          type="range"
          min="0"
          max="8"
          step="0.5"
          value={strokeWidth}
          title={`굵기: ${strokeWidth}`}
          onChange={(e) => applyWidth(parseFloat(e.target.value))}
          className="w-20 accent-blue-500 cursor-pointer"
        />
        <svg width="22" height="16" className="flex-shrink-0" style={{ overflow: 'visible' }}>
          <line
            x1="1" y1="8" x2="21" y2="8"
            stroke={color}
            strokeWidth={Math.max(Math.min(strokeWidth, 8), 0.5)}
            strokeLinecap="round"
          />
        </svg>
      </div>

      <div className="w-px h-6 bg-gray-200 mx-1 flex-shrink-0" />

      {/* ⑤ 실행 취소 / 다시 실행 */}
      <button onClick={handleUndo} title="실행 취소"
        className="p-1.5 rounded-md text-gray-600 hover:bg-gray-100 cursor-pointer flex-shrink-0">
        <Undo2 className="h-4 w-4" />
      </button>
      <button onClick={handleRedo} title="다시 실행"
        className="p-1.5 rounded-md text-gray-600 hover:bg-gray-100 cursor-pointer flex-shrink-0">
        <Redo2 className="h-4 w-4" />
      </button>

      <div className="w-px h-6 bg-gray-200 mx-1 flex-shrink-0" />

      {/* ⑥ 전체 지우기 */}
      <button onClick={handleClear} title="전체 지우기"
        className="p-1.5 rounded-md text-red-500 hover:bg-red-50 cursor-pointer flex-shrink-0">
        <Trash2 className="h-4 w-4" />
      </button>

      <div className="w-px h-6 bg-gray-200 mx-1 flex-shrink-0" />

      {/* ⑦ Excalidraw 세부설정 패널 토글 */}
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
