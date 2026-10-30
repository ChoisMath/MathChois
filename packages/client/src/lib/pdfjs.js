/*
 * pdf.js 로더 — 앱은 pdfjs-dist 를 직접 import 하지 않고 이 모듈만 쓴다.
 * pdfjs-dist 는 크므로(vendor-pdfjs 청크) PDF 페이지를 처음 열 때 동적 import 한다.
 * cmaps / standard_fonts 는 vite-plugin-pdfjs-assets.js 가 /pdfjs/ 아래로 제공한다(끝 슬래시 필수).
 */

export const PDFJS_DOC_OPTIONS = {
  cMapUrl: '/pdfjs/cmaps/',
  cMapPacked: true,
  standardFontDataUrl: '/pdfjs/standard_fonts/',
}

let pdfjsPromise = null

/** pdfjs-dist 를 1회 로드하고 워커 경로를 설정한다(이후 같은 Promise 재사용). */
export function loadPdfjs() {
  if (!pdfjsPromise) {
    /* legacy 빌드 = core-js 폴리필 포함. 모던 빌드는 2025 Map.prototype.getOrInsertComputed 를 요구해 Chromium 141·태블릿 브라우저에서 렌더가 실패한다 */
    pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs')
      .then((pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString()
        return pdfjs
      })
      .catch((err) => {
        /* 청크 로드 실패(네트워크 등)는 다음 호출에서 재시도할 수 있게 캐시를 비운다 */
        pdfjsPromise = null
        throw err
      })
  }
  return pdfjsPromise
}

/**
 * PDF 문서를 연다.
 * @param {string | Uint8Array} source URL 문자열 또는 PDF 바이트
 * @returns {Promise<import('pdfjs-dist').PDFDocumentProxy>}
 */
export async function openPdf(source) {
  const pdfjs = await loadPdfjs()
  const params = typeof source === 'string'
    ? { url: source, ...PDFJS_DOC_OPTIONS }
    : { data: source, ...PDFJS_DOC_OPTIONS }
  return pdfjs.getDocument(params).promise
}
