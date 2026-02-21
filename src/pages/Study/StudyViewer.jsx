import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, ArrowLeft, ArrowRight, Menu,
  Pencil, Eye, MousePointer, Pen, Type, Square,
  Eraser, Minus, Undo2, Redo2, Trash2, Pipette, Plus, Scissors,
  SlidersHorizontal, Hand,
} from 'lucide-react';
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

/* ─────────── 상수 ─────────── */
const DEFAULT_COLORS  = ['#1e1e1e', '#e03131', '#2f9e44', '#1971c2', '#f08c00', '#9c36b5'];
const MAX_CUSTOM_COLORS = 6;
/** 배경 이미지 Excalidraw element 전용 ID */
const BG_ELEMENT_ID   = '__bg_image__';
const BG_FILE_ID      = '__bg_file__';

const STROKE_WIDTHS = [
  { value: 1, label: 'S' },
  { value: 2, label: 'M' },
  { value: 4, label: 'L' },
  { value: 8, label: 'XL' },
];

const TOOLS = [
  { type: 'selection', Icon: MousePointer, label: '선택' },
  { type: 'freedraw',  Icon: Pen,          label: '자유 필기' },
  { type: 'text',      Icon: Type,         label: '텍스트' },
  { type: 'line',      Icon: Minus,        label: '직선' },
  { type: 'rectangle', Icon: Square,       label: '사각형' },
];

/* ─────────── Excalidraw CSS ─────────── */
const ALWAYS_HIDE_CSS = `
  .excalidraw .App-toolbar,
  .excalidraw .App-toolbar-container,
  .excalidraw .layer-ui__wrapper__top-left,
  .excalidraw .layer-ui__wrapper__top-right,
  .excalidraw .App-bottom-bar,
  .excalidraw .UserList,
  .excalidraw .HintViewer,
  .excalidraw .scroll-back-to-content,
  .excalidraw [data-testid="toolbar"],
  .excalidraw [data-testid="toolbar-container"],
  .excalidraw .ToolIcon__keybinding { display: none !important; }
`;
const PANEL_HIDE_CSS = `
  .excalidraw .island,
  .excalidraw .App-menu,
  .excalidraw .popover,
  .excalidraw .context-menu,
  .excalidraw .Stats,
  .excalidraw .layer-ui__wrapper__footer,
  .excalidraw [data-testid="footer"] { display: none !important; }
`;

/* ─────────── 모눈종이 배경 ─────────── */
const GRID_STYLE = {
  backgroundColor: '#ffffff',
  backgroundImage: `
    linear-gradient(rgba(180,190,210,0.35) 1px, transparent 1px),
    linear-gradient(90deg, rgba(180,190,210,0.35) 1px, transparent 1px)
  `,
  backgroundSize: '20px 20px',
};

/* ─────────── 유틸: 이미지 URL → DataURL ─────────── */
async function fetchAsDataUrl(url) {
  const res  = await fetch(url, { mode: 'cors' });
  const blob = await res.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () =>
      resolve({ dataUrl: reader.result, mimeType: blob.type || 'image/jpeg' });
    reader.readAsDataURL(blob);
  });
}

/* ─────────── 유틸: DataURL → 이미지 자연 크기 ─────────── */
function getImageNaturalSize(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = dataUrl;
  });
}

/* ─────────── Excalidraw image element 생성 ─────────── */
function createBgElement(x, y, w, h) {
  return {
    type:            'image',
    id:              BG_ELEMENT_ID,
    fileId:          BG_FILE_ID,
    status:          'saved',
    x, y,
    width:           w,
    height:          h,
    angle:           0,
    strokeColor:     'transparent',
    backgroundColor: 'transparent',
    fillStyle:       'solid',
    strokeWidth:     0,
    strokeStyle:     'solid',
    roughness:       0,
    opacity:         100,
    groupIds:        [],
    frameId:         null,
    roundness:       null,
    isDeleted:       false,
    locked:          true,
    link:            null,
    version:         1,
    versionNonce:    1,
    updated:         Date.now(),
    seed:            1,
    boundElements:   null,
    scale:           [1, 1],
  };
}

/* ─────────── 필기 툴바 ─────────── */
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

  const allColors = [...DEFAULT_COLORS, ...customColors];

  /* 이미지 이동 모드 해제 헬퍼 */
  const disableImageMove = useCallback((api) => {
    const els = api.getSceneElements().map((el) =>
      el.id === BG_ELEMENT_ID ? { ...el, locked: true } : el
    );
    api.updateScene({ elements: els });
    setImageMoveMode(false);
  }, []);

  const applyTool = (type) => {
    const api = apiRef.current;
    // 이미지 이동 모드 중 다른 도구를 선택하면 이동 모드 해제
    if (imageMoveMode && api) disableImageMove(api);

    setActiveTool(type);
    if (type === 'eraser_area') {
      api?.setActiveTool({ type: 'selection' });
    } else {
      api?.setActiveTool({ type });
    }
  };

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

  /* 이미지 이동 모드 토글 */
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

  const handleUndo = () => apiRef.current?.history?.undo();
  const handleRedo = () => apiRef.current?.history?.redo();

  /* 전체 지우기: BG element는 유지 */
  const handleClear = () => {
    if (!window.confirm('필기 내용을 모두 지우시겠습니까?')) return;
    const api = apiRef.current;
    if (!api) return;
    const bgEl = api.getSceneElements().find((el) => el.id === BG_ELEMENT_ID);
    api.updateScene({ elements: bgEl ? [bgEl] : [] });
  };

  /* 영역 삭제: BG element는 보호 */
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
      {TOOLS.map(({ type, Icon, label }) => (
        <button key={type} onClick={() => applyTool(type)} title={label}
          className={`p-1.5 rounded-md transition-colors cursor-pointer ${
            activeTool === type ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:bg-gray-100'
          }`}>
          <Icon className="h-4 w-4" />
        </button>
      ))}

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

      {/* ③ 선 굵기 */}
      {STROKE_WIDTHS.map(({ value, label }) => (
        <button key={value} onClick={() => applyWidth(value)} title={`굵기 ${label}`}
          className={`w-7 h-7 rounded flex items-center justify-center cursor-pointer text-xs font-bold transition-colors ${
            strokeWidth === value ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:bg-gray-100'
          }`}>
          {label}
        </button>
      ))}

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

/* ─────────── 메인 컴포넌트 ─────────── */
const StudyViewer = () => {
  const { chapterId, pageId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [chapter, setChapter]         = useState(null);
  const [pages, setPages]             = useState([]);
  const [currentPage, setCurrentPage] = useState(null);
  const [loading, setLoading]         = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [drawMode, setDrawMode]       = useState(false);
  const [noteElements, setNoteElements] = useState([]);
  const [saveStatus, setSaveStatus]   = useState('saved');
  const [showExcalidrawPanel, setShowExcalidrawPanel] = useState(false);

  const containerRef     = useRef(null);
  const saveTimerRef     = useRef(null);
  const excalidrawAPIRef = useRef(null);
  const currentPageRef   = useRef(null);
  const noteElementsRef  = useRef([]);
  /** 이미지 위치/크기 — 페이지마다 저장되어 복원됨 */
  const bgPositionRef    = useRef(null); // { x, y, width, height } | null

  useEffect(() => { currentPageRef.current  = currentPage;  }, [currentPage]);
  useEffect(() => { noteElementsRef.current = noteElements; }, [noteElements]);

  /* ── 데이터 로드 ── */
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      bgPositionRef.current = null;

      const { data: chap } = await supabase
        .from('chapters').select('id, title').eq('id', chapterId).single();
      setChapter(chap);

      const { data: pgs } = await supabase
        .from('pages').select('id, image_url, position')
        .eq('chapter_id', chapterId).order('position');
      setPages(pgs || []);

      if (pgs && pgs.length > 0) {
        const found = pgs.find((p) => p.id === pageId);
        if (found) {
          setCurrentPage(found);
          if (user) {
            const { data: note } = await supabase
              .from('student_notes').select('excalidraw_data')
              .eq('student_id', user.id).eq('page_id', pageId).maybeSingle();
            setNoteElements(note?.excalidraw_data?.elements || []);
            bgPositionRef.current = note?.excalidraw_data?.bgPosition ?? null;
          }
        } else {
          navigate(`/student/study/${chapterId}/page/${pgs[0].id}`, { replace: true });
          return;
        }
      }
      setLoading(false);
    };
    fetchData();
  }, [chapterId, pageId, navigate, user]);

  /* ── Excalidraw onChange ──
   * setState 호출 없이 ref + 저장만 처리 → 무한루프 없음
   */
  const handleExcalidrawChange = useCallback((elements) => {
    /* 이미지 위치 변화 추적 */
    const bgEl = elements.find((el) => el.id === BG_ELEMENT_ID);
    if (bgEl) {
      bgPositionRef.current = { x: bgEl.x, y: bgEl.y, width: bgEl.width, height: bgEl.height };
    }

    const page = currentPageRef.current;
    if (!user || !page) return;

    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus('saving');
      const userEls = elements.filter((el) => el.id !== BG_ELEMENT_ID && !el.isDeleted);
      await supabase.from('student_notes').upsert(
        {
          student_id:      user.id,
          page_id:         page.id,
          excalidraw_data: {
            elements:   userEls,
            bgPosition: bgPositionRef.current,
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'student_id,page_id' }
      );
      setSaveStatus('saved');
    }, 1500);
  }, [user]);

  /* ── Excalidraw 마운트: 배경 이미지를 scene element로 추가 ──
   *
   * CSS overlay 대신 Excalidraw 내부 image element를 사용하므로
   * 확대/축소·패닝 시 이미지와 필기가 완벽히 동기화됨.
   */
  const handleExcalidrawMount = useCallback(async (api) => {
    excalidrawAPIRef.current = api;
    api.setActiveTool({ type: 'freedraw' });

    const page = currentPageRef.current;
    if (!page?.image_url || !containerRef.current) return;

    try {
      /* 1. 이미지를 DataURL로 변환 */
      const { dataUrl, mimeType } = await fetchAsDataUrl(page.image_url);
      /* 2. 자연 크기 계산 */
      const { w: iW, h: iH } = await getImageNaturalSize(dataUrl);

      /* 3. 초기 위치/크기: 저장된 값 우선, 없으면 object-contain 방식으로 계산 */
      let bgX, bgY, bgW, bgH;
      const saved = bgPositionRef.current;
      if (saved) {
        ({ x: bgX, y: bgY, width: bgW, height: bgH } = saved);
      } else {
        const W     = containerRef.current.clientWidth  || 800;
        const H     = containerRef.current.clientHeight || 1000;
        const scale = Math.min(W / iW, H / iH);
        bgW = iW * scale;
        bgH = iH * scale;
        bgX = (W - bgW) / 2;
        bgY = (H - bgH) / 2;
        bgPositionRef.current = { x: bgX, y: bgY, width: bgW, height: bgH };
      }

      /* 4. Excalidraw에 파일 등록 */
      api.addFiles([{ id: BG_FILE_ID, dataURL: dataUrl, mimeType, created: Date.now() }]);

      /* 5. BG element를 맨 앞(z-order 최하단)에 배치 */
      const bgEl = createBgElement(bgX, bgY, bgW, bgH);
      api.updateScene({ elements: [bgEl, ...noteElementsRef.current] });

    } catch (err) {
      console.error('배경 이미지 로드 실패:', err);
      /* fallback: 이미지 없이 필기만 */
      api.updateScene({ elements: noteElementsRef.current });
    }
  }, []);

  /* ── 파생 값 ── */
  const currentIndex = pages.findIndex((p) => p.id === currentPage?.id);
  const prevPage = currentIndex > 0                ? pages[currentIndex - 1] : null;
  const nextPage = currentIndex < pages.length - 1 ? pages[currentIndex + 1] : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <p className="text-gray-500">로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-100">

      {/* ── 내비게이션 바 ── */}
      <div className="h-14 bg-white shadow-sm flex items-center justify-between px-4 border-b z-10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)}
            className="p-1.5 text-gray-500 hover:text-gray-700 cursor-pointer">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="font-semibold text-gray-900">{chapter?.title}</span>
          {pages.length > 0 && (
            <span className="text-sm text-gray-400">{currentIndex + 1} / {pages.length}</span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {drawMode && (
            <span className={`text-xs ${saveStatus === 'saved' ? 'text-green-600' : 'text-gray-400'}`}>
              {saveStatus === 'saved'  && '저장됨'}
              {saveStatus === 'saving' && '저장 중...'}
            </span>
          )}

          <button onClick={() => setDrawMode((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${
              drawMode
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}>
            {drawMode
              ? <><Pencil className="h-3.5 w-3.5" /> 필기 모드</>
              : <><Eye    className="h-3.5 w-3.5" /> 뷰 모드</>}
          </button>

          <button onClick={() => setSidebarOpen((v) => !v)}
            title={sidebarOpen ? '페이지 목록 숨기기' : '페이지 목록 펼치기'}
            className="p-1.5 text-gray-500 hover:text-gray-700 cursor-pointer">
            {sidebarOpen ? <ChevronRight className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* ── 필기 툴바 ── */}
      {drawMode && (
        <DrawingToolbar
          apiRef={excalidrawAPIRef}
          showPanel={showExcalidrawPanel}
          onTogglePanel={() => setShowExcalidrawPanel((v) => !v)}
        />
      )}

      {/* ── 본문 ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* 페이지 목록 사이드바 */}
        {sidebarOpen && (
          <div className="w-44 bg-white border-r overflow-y-auto flex-shrink-0">
            <div className="px-3 py-2 border-b flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">페이지</span>
              <button onClick={() => setSidebarOpen(false)} title="목록 숨기기"
                className="text-gray-400 hover:text-gray-600 cursor-pointer">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2 p-2">
              {pages.map((pg, idx) => (
                <Link key={pg.id} to={`/student/study/${chapterId}/page/${pg.id}`}
                  className={`block rounded-md overflow-hidden border-2 transition-colors ${
                    pg.id === currentPage?.id ? 'border-blue-500' : 'border-transparent hover:border-gray-300'
                  }`}>
                  <img src={pg.image_url} alt={`페이지 ${idx + 1}`} className="w-full aspect-[3/4] object-cover" />
                  <div className="bg-gray-50 text-center text-xs py-1 text-gray-600">{idx + 1}</div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ── 콘텐츠 ── */}
        {drawMode ? (

          /* 필기 모드: 모눈종이 배경 + Excalidraw (투명) */
          <div
            ref={containerRef}
            style={GRID_STYLE}
            className="flex-1 relative overflow-hidden"
          >
            <style>{ALWAYS_HIDE_CSS}{showExcalidrawPanel ? '' : PANEL_HIDE_CSS}</style>

            {currentPage ? (
              <Excalidraw
                key={currentPage.id}
                excalidrawAPI={handleExcalidrawMount}
                initialData={{
                  elements: noteElements,
                  appState: {
                    viewBackgroundColor:    'transparent',
                    currentItemStrokeColor: '#1e1e1e',
                    currentItemStrokeWidth: 2,
                    scrollX:                0,
                    scrollY:                0,
                  },
                }}
                onChange={handleExcalidrawChange}
                UIOptions={{
                  canvasActions: {
                    changeViewBackgroundColor: false,
                    clearCanvas:               false,
                    export:                    false,
                    loadScene:                 false,
                    saveToActiveFile:          false,
                    toggleTheme:               false,
                    saveAsImage:               false,
                  },
                  tools: { image: false },
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">
                페이지가 없습니다.
              </div>
            )}
          </div>

        ) : (

          /* 뷰 모드 */
          <div className="flex-1 overflow-auto flex flex-col items-center py-8 px-4">
            {currentPage ? (
              <img src={currentPage.image_url} alt={`페이지 ${currentIndex + 1}`}
                className="max-w-full object-contain shadow-lg bg-white"
                style={{ maxHeight: 'calc(100vh - 12rem)' }} />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">
                페이지가 없습니다.
              </div>
            )}

            <div className="flex items-center gap-6 mt-6">
              <button
                onClick={() => prevPage && navigate(`/student/study/${chapterId}/page/${prevPage.id}`)}
                disabled={!prevPage}
                className="flex items-center gap-2 px-4 py-2 rounded-md bg-white shadow-sm text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 cursor-pointer">
                <ArrowLeft className="h-4 w-4" /> 이전
              </button>
              <button
                onClick={() => nextPage && navigate(`/student/study/${chapterId}/page/${nextPage.id}`)}
                disabled={!nextPage}
                className="flex items-center gap-2 px-4 py-2 rounded-md bg-blue-600 text-white shadow-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-700 cursor-pointer">
                다음 <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StudyViewer;
