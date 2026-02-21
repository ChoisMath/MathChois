/* ─────────── 상수 ─────────── */
export const DEFAULT_COLORS  = ['#1e1e1e', '#e03131', '#2f9e44', '#1971c2', '#f08c00', '#9c36b5'];
export const MAX_CUSTOM_COLORS = 6;
/** 배경 이미지 Excalidraw element 전용 ID */
export const BG_ELEMENT_ID   = '__bg_image__';
export const BG_FILE_ID      = '__bg_file__';

export const TOOLS = [
  { type: 'selection', label: '선택' },
  { type: 'freedraw',  label: '자유 필기' },
  { type: 'text',      label: '텍스트' },
];

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

/* ─────────── 모눈종이 배경 ─────────── */
export const GRID_STYLE = {
  backgroundColor: '#ffffff',
  backgroundImage: `
    linear-gradient(rgba(180,190,210,0.35) 1px, transparent 1px),
    linear-gradient(90deg, rgba(180,190,210,0.35) 1px, transparent 1px)
  `,
  backgroundSize: '20px 20px',
};

/* ─────────── 유틸: 이미지 URL → DataURL ─────────── */
export async function fetchAsDataUrl(url) {
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
export function getImageNaturalSize(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = dataUrl;
  });
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
