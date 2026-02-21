import { useState, useRef, useCallback, useEffect } from 'react';
import {
  MousePointer, Pen, Type, Square,
  Eraser, Minus, Undo2, Redo2, Trash2, Pipette, Plus, Scissors,
  SlidersHorizontal, Hand,
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
  line:      Minus,
  rectangle: Square,
};

function DrawingToolbar({ apiRef, showPanel, onTogglePanel }) {
  const [activeTool, setActiveTool]       = useState('freedraw');
  const [color, setColor]                 = useState('#1e1e1e');
  const [strokeWidth, setStrokeWidth]     = useState(2);
  const [imageMoveMode, setImageMoveMode] = useState(false);
  const [customColors, setCustomColors]   = useState(() => {
    try { return JSON.parse(localStorage.getItem('mc_custom_colors') || '[]'); }
    catch { return []; }
  });
  const colorPickerRef = useRef(null);

  /* ── S Pen 사이드 버튼 → 지우개 모드 ── */
  const sPenPrevToolRef = useRef(null); // 버튼 누르기 전 도구 저장
  const activeToolRef   = useRef(activeTool);
  const applyToolRef    = useRef(null);
  activeToolRef.current = activeTool;   // 매 렌더마다 최신값으로 갱신
  // applyToolRef.current 는 applyTool 정의 직후에 갱신 (정의 전 참조 불가)

  useEffect(() => {
    const onSPenDown = (e) => {
      if (e.pointerType !== 'pen' || e.button !== 2) return; // 사이드(배럴) 버튼만
      if (sPenPrevToolRef.current !== null) return;          // 중복 방지

      const current = activeToolRef.current;
      if (current === 'eraser') return; // 이미 지우개 모드면 스킵

      /* 'image_move', 'eraser_area' 는 복잡한 상태이므로 freedraw로 복원 */
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

    /* capture: true → Excalidraw 내부 핸들러보다 먼저 실행되어 도구 전환이 즉시 반영됨 */
    document.addEventListener('pointerdown',  onSPenDown, { capture: true });
    document.addEventListener('pointerup',    onSPenUp);
    document.addEventListener('pointercancel', onSPenUp); // 펜 추적 취소 시에도 복원

    return () => {
      document.removeEventListener('pointerdown',  onSPenDown, { capture: true });
      document.removeEventListener('pointerup',    onSPenUp);
      document.removeEventListener('pointercancel', onSPenUp);
    };
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
    if (type === 'eraser_area') {
      api?.setActiveTool({ type: 'selection' });
    } else {
      api?.setActiveTool({ type });
    }
  };
  applyToolRef.current = applyTool; // 매 렌더마다 최신값으로 갱신 (stale closure 방지)

  const applyColor = (hex) => {
    setColor(hex);
    apiRef.current?.updateScene({ appState: { currentItemStrokeColor: hex } });
    if (['eraser', 'eraser_area', 'selection', 'image_move'].includes(activeTool)) {
      setActiveTool('freedraw');
      apiRef.current?.setActiveTool({ type: 'freedraw' });
    }
  };

  const applyWidth = (w) => {
    setStrokeWidth(w);
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

  /* Excalidraw 공개 API에 undo/redo 메서드가 없으므로
     document에 키보드 이벤트를 dispatch하여 Excalidraw 내부 핸들러를 트리거 */
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

  return (
    <div className="flex items-center gap-1 px-3 h-11 bg-white border-b shadow-sm flex-shrink-0 z-10 overflow-x-auto">

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

      {/* ② 색상 팔레트 */}
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

      {/* ③ 선 굵기 슬라이더 */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <input
          type="range"
          min="0.5"
          max="16"
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
            strokeWidth={Math.min(strokeWidth, 14)}
            strokeLinecap="round"
          />
        </svg>
      </div>

      <div className="w-px h-6 bg-gray-200 mx-1 flex-shrink-0" />

      {/* ④ 실행 취소 / 다시 실행 */}
      <button onClick={handleUndo} title="실행 취소"
        className="p-1.5 rounded-md text-gray-600 hover:bg-gray-100 cursor-pointer flex-shrink-0">
        <Undo2 className="h-4 w-4" />
      </button>
      <button onClick={handleRedo} title="다시 실행"
        className="p-1.5 rounded-md text-gray-600 hover:bg-gray-100 cursor-pointer flex-shrink-0">
        <Redo2 className="h-4 w-4" />
      </button>

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
