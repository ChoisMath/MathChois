/* ─────────── 상수 ─────────── */
export const DEFAULT_COLORS  = ['#1e1e1e', '#e03131', '#2f9e44', '#1971c2', '#f08c00', '#9c36b5'];
export const MAX_CUSTOM_COLORS = 6;
/** 배경 이미지 Excalidraw element 전용 ID */
export const BG_ELEMENT_ID   = '__bg_image__';
export const BG_FILE_ID      = '__bg_file__';

export const TOOLS = [
  { type: 'selection', label: '선택' },
  { type: 'freedraw',  label: '자유 필기' },
  { type: 'line',      label: '직선' },
  { type: 'text',      label: '텍스트' },
];

export const EXCALIDRAW_UI_OPTIONS = {
  canvasActions: {
    changeViewBackgroundColor: false,
    clearCanvas: false,
    export: false,
    loadScene: false,
    saveToActiveFile: false,
    toggleTheme: false,
    saveAsImage: false,
  },
  tools: { image: false },
};

/* ─────────── Excalidraw CSS ─────────── */
export const ALWAYS_HIDE_CSS = `
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
export const PANEL_HIDE_CSS = `
  .excalidraw .island,
  .excalidraw .App-menu,
  .excalidraw .popover,
  .excalidraw .context-menu,
  .excalidraw .Stats,
  .excalidraw .layer-ui__wrapper__footer,
  .excalidraw [data-testid="footer"] { display: none !important; }
`;
export const TOUCH_CSS = `
  .excalidraw {
    touch-action: none !important;
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
  }
`;

/* ─────────── 모눈종이 배경 ─────────── */
export const GRID_STYLE = {
  backgroundColor: '#ffffff',
  backgroundImage: `
    linear-gradient(rgba(180,190,210,0.35) 1px, transparent 1px),
    linear-gradient(90deg, rgba(180,190,210,0.35) 1px, transparent 1px)
  `,
  backgroundSize: '20px 20px',
};

/* ─────────── 이미지 캐시 (LRU, 세션 내 유지, 새로고침 시 초기화) ─────────── */
const MAX_IMG_CACHE = 50;
const MAX_SIZE_CACHE = 100;
const _imgCache  = new Map(); // url → Promise<{ dataUrl, mimeType }>
const _sizeCache = new Map(); // dataUrl → Promise<{ w, h }>

function lruSet(map, key, value, maxSize) {
  if (map.has(key)) map.delete(key);
  if (map.size >= maxSize) {
    const oldest = map.keys().next().value;
    map.delete(oldest);
  }
  map.set(key, value);
}

/* ─────────── 유틸: 이미지 URL → DataURL (LRU 캐시) ─────────── */
export async function fetchAsDataUrl(url) {
  if (_imgCache.has(url)) {
    const cached = _imgCache.get(url);
    _imgCache.delete(url);  // LRU: 끝으로 이동
    _imgCache.set(url, cached);
    return cached;
  }
  const promise = _doFetch(url);
  lruSet(_imgCache, url, promise, MAX_IMG_CACHE);
  promise.catch(() => _imgCache.delete(url));
  return promise;
}

async function _doFetch(url) {
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(`Image fetch failed: ${res.status} ${url}`);
  const blob = await res.blob();
  if (!blob.type.startsWith('image/') && blob.size < 100) {
    throw new Error(`Invalid image response for ${url}`);
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve({ dataUrl: reader.result, mimeType: blob.type || 'image/jpeg' });
    };
    reader.onerror = () => reject(new Error(`FileReader failed for ${url}`));
    reader.readAsDataURL(blob);
  });
}

/* ─────────── 유틸: DataURL → 이미지 자연 크기 (LRU 캐시) ─────────── */
export function getImageNaturalSize(dataUrl) {
  if (_sizeCache.has(dataUrl)) {
    const cached = _sizeCache.get(dataUrl);
    _sizeCache.delete(dataUrl);  // LRU: 끝으로 이동
    _sizeCache.set(dataUrl, cached);
    return cached;
  }
  const promise = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error('Image decode failed'));
    img.src = dataUrl;
  });
  lruSet(_sizeCache, dataUrl, promise, MAX_SIZE_CACHE);
  promise.catch(() => _sizeCache.delete(dataUrl));
  return promise;
}

/* ─────────── 인접 페이지 이미지 백그라운드 프리패치 ─────────── */
export function prefetchImages(urls) {
  urls.forEach((url) => {
    if (url && !_imgCache.has(url)) {
      fetchAsDataUrl(url).catch((err) => {
        console.warn('[prefetch]', url, err.message);
      });
    }
  });
}

/* ─────────── 배경 이미지 위치/크기 계산 ─────────── */
const BG_MARGIN = 20; // px

export function calculateBgPosition(containerWidth, containerHeight, imageWidth, imageHeight) {
  const availW = containerWidth  - BG_MARGIN * 2;
  const availH = containerHeight - BG_MARGIN;
  const scale  = Math.min(availW / imageWidth, availH / imageHeight);
  return {
    x:      BG_MARGIN,
    y:      BG_MARGIN,
    width:  imageWidth  * scale,
    height: imageHeight * scale,
  };
}

/* ─────────── Excalidraw image element 생성 ─────────── */
export function createBgElement(x, y, w, h) {
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
