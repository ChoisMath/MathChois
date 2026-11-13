import { pdfDocCache } from './pdfDocCache';

/** 진행 중인 래스터 작업 — 같은 쪽·크기를 동시에 요청하면 한 번만 그린다. 끝나면(성공·실패) 빠진다. */
const pending = new Map();

async function render(pdfUrl, pageNumber, longSide) {
  const page = await pdfDocCache.getPage(pdfUrl, pageNumber);
  const vp1 = page.getViewport({ scale: 1 });
  const scale = longSide / Math.max(vp1.width, vp1.height);
  const viewport = page.getViewport({ scale });
  const width = Math.round(viewport.width);
  const height = Math.round(viewport.height);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  try {
    const ctx = canvas.getContext('2d');
    /* JPEG 는 투명을 검게 만든다 — 흰 종이를 먼저 깐다 */
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    return { dataUrl: canvas.toDataURL('image/jpeg', 0.85), mimeType: 'image/jpeg', width, height };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/**
 * PDF 한 쪽을 긴 변 `longSide` px 의 JPEG dataURL 로 래스터한다(썸네일·내보내기 공용).
 * @param {string} pdfUrl
 * @param {number} pageNumber 1부터
 * @param {{ longSide: number }} options
 * @returns {Promise<{ dataUrl: string, mimeType: 'image/jpeg', width: number, height: number }>}
 */
export function rasterizePdfPage(pdfUrl, pageNumber, { longSide }) {
  const key = `${pdfUrl}#${pageNumber}@${longSide}`;
  let job = pending.get(key);
  if (!job) {
    job = render(pdfUrl, pageNumber, longSide).finally(() => pending.delete(key));
    pending.set(key, job);
  }
  return job;
}
