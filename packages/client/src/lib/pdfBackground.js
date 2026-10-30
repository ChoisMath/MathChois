import { isPdfPage } from '@mathchois/shared';
import { fetchAsDataUrl, getImageNaturalSize } from './excalidrawUtils';
import { rasterizePdfPage } from './pdfRaster';
import { pdfDocCache } from './pdfDocCache';

/**
 * 내보내기 배경 서술자로 바꾼다.
 * - 문자열(기존 호출 방식) → 이미지 URL
 * - 페이지 객체 → PDF 쪽이 우선, 아니면 imageUrl
 * - 그 밖(영상·HTML 페이지, null) → null
 * @param {string | { imageUrl?: string | null, pdfUrl?: string | null, pdfPage?: number | null } | null | undefined} input
 * @returns {null | { kind: 'image', imageUrl: string } | { kind: 'pdf', pdfUrl: string, pdfPage: number }}
 */
export function resolveBackground(input) {
  if (typeof input === 'string') return input ? { kind: 'image', imageUrl: input } : null;
  if (!input || typeof input !== 'object') return null;
  if (isPdfPage(input)) return { kind: 'pdf', pdfUrl: input.pdfUrl, pdfPage: input.pdfPage };
  if (input.imageUrl) return { kind: 'image', imageUrl: input.imageUrl };
  return null;
}

/**
 * 서술자의 배경 비트맵을 dataURL 로 읽는다. PDF 쪽은 pdf.js 로 긴 변 `longSide` px 래스터.
 * @param {{ kind: 'image', imageUrl: string } | { kind: 'pdf', pdfUrl: string, pdfPage: number }} bg
 * @param {{ longSide?: number }} [options]
 * @returns {Promise<{ dataUrl: string, mimeType: string, w: number, h: number }>}
 */
export async function loadBackgroundBitmap(bg, { longSide = 1754 } = {}) {
  if (bg.kind === 'pdf') {
    const { dataUrl, mimeType, width, height } = await rasterizePdfPage(bg.pdfUrl, bg.pdfPage, { longSide });
    return { dataUrl, mimeType, w: width, h: height };
  }
  const { dataUrl, mimeType } = await fetchAsDataUrl(bg.imageUrl);
  const { w, h } = await getImageNaturalSize(dataUrl);
  return { dataUrl, mimeType, w, h };
}

/**
 * 내보내기 동안 쓸 PDF 문서를 문서 LRU 에서 고정한다(여러 PDF 를 섞은 챕터를 돌다가
 * 화면의 썸네일·뷰어가 쓰는 문서를 닫지 않게). 돌려준 함수로 모두 해제한다.
 * @param {Array<Parameters<typeof resolveBackground>[0]>} inputs 배경 입력(문자열·페이지 객체·서술자 무엇이든)
 * @param {{ pin: (url: string) => () => void }} [cache]
 * @returns {() => void}
 */
export function pinBackgrounds(inputs, cache = pdfDocCache) {
  const urls = new Set();
  for (const input of inputs) {
    const bg = resolveBackground(input); // 서술자를 다시 넣어도 같은 서술자가 나온다
    if (bg?.kind === 'pdf') urls.add(bg.pdfUrl);
  }
  const unpins = [...urls].map((url) => cache.pin(url));
  return () => { for (const unpin of unpins) unpin(); };
}
