/**
 * 화이트보드 이미지 — 보드 JSON 에는 dataURL 대신 업로드 URL 만 둔다.
 */
import { fetchAsDataUrl } from './excalidrawUtils';

export const IMAGE_MAX_EDGE = 1600;
export const IMAGE_MAX_BYTES = 1_000_000;

/** Excalidraw files 중 아직 모르는(업로드 안 된) 파일 */
export function pickNewFiles(files, knownIds) {
  const out = [];
  for (const [id, f] of Object.entries(files || {})) {
    if (knownIds.has(id)) continue;
    if (!f?.dataURL || typeof f.dataURL !== 'string') continue;
    out.push({ id, dataURL: f.dataURL, mimeType: f.mimeType || 'image/png' });
  }
  return out;
}

/** 파일 참조({url,mimeType}) → Excalidraw files(dataURL) — loader 는 테스트에서 주입 */
export async function fileRefsToExcalidrawFiles(refs, loader = fetchAsDataUrl) {
  const out = {};
  await Promise.all(Object.entries(refs || {}).map(async ([id, ref]) => {
    if (!ref?.url) return;
    try {
      const { dataUrl, mimeType } = await loader(ref.url);
      out[id] = { id, dataURL: dataUrl, mimeType: mimeType || ref.mimeType || 'image/png', created: Date.now() };
    } catch (err) {
      console.warn('[whiteboard] image load failed', ref.url, err?.message);
    }
  }));
  return out;
}

export function dataUrlToBlob(dataUrl) {
  const [head, body] = dataUrl.split(',');
  const mime = /data:([^;]+)/.exec(head)?.[1] || 'application/octet-stream';
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image decode failed'));
    img.src = dataUrl;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * 긴 변 maxEdge, maxBytes 이하로 축소 (브라우저 전용).
 * PNG/GIF/WebP 는 먼저 PNG 로 시도하고 크면 JPEG 품질을 0.85 → 0.45 까지 낮춘다.
 * 반환 { blob, mimeType } — 실패하면 null.
 */
export async function downscaleImage(dataUrl, { maxEdge = IMAGE_MAX_EDGE, maxBytes = IMAGE_MAX_BYTES } = {}) {
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);

  const srcMime = /data:([^;]+)/.exec(dataUrl)?.[1] || 'image/png';
  if (srcMime !== 'image/jpeg') {
    const png = await canvasToBlob(canvas, 'image/png');
    if (png && png.size <= maxBytes) return { blob: png, mimeType: 'image/png' };
  }
  for (let q = 0.85; q >= 0.45; q -= 0.1) {
    const jpg = await canvasToBlob(canvas, 'image/jpeg', q);
    if (jpg && jpg.size <= maxBytes) return { blob: jpg, mimeType: 'image/jpeg' };
  }
  // 여전히 크면 한 단계 더 축소해서 재시도
  if (maxEdge > 800) return downscaleImage(dataUrl, { maxEdge: Math.round(maxEdge / 2), maxBytes });
  return null;
}

/** 사용자 id → 커서 색 (협업자 표시) */
const CURSOR_COLORS = ['#e03131', '#2f9e44', '#1971c2', '#f08c00', '#9c36b5', '#0c8599', '#c2255c', '#5c7cfa'];
export function cursorColorFor(userId) {
  let h = 0;
  for (let i = 0; i < (userId || '').length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  const stroke = CURSOR_COLORS[h % CURSOR_COLORS.length];
  return { background: stroke, stroke };
}
