/*
 * PDF 등록 전 검사와 페이지 위치 계획 — 챕터·과제 편집기가 함께 쓴다.
 * inspectPdf 만 pdf.js 를 쓴다(openPdf 가 pdf.js 를 동적 import 하므로 편집기 초기 번들에 들어가지 않는다).
 */
import { openPdf } from './pdfjs'

export const PDF_MAX_PAGES = 500
export const PDF_MAX_BYTES = 100 * 1024 * 1024

export const PDF_IMPORT_MESSAGES = {
  tooLarge: 'PDF는 100MB 이하만 등록할 수 있습니다.',
  tooManyPages: 'PDF는 500쪽 이하만 등록할 수 있습니다.',
  encrypted: '암호가 걸린 PDF는 등록할 수 없습니다.',
  unreadable: 'PDF를 읽을 수 없습니다.',
}

/** MIME 이 비어 있는 환경도 있으므로 확장자(.pdf, 대소문자 무시)로도 판정한다. */
export function isPdfFile(file) {
  return file?.type === 'application/pdf' || /\.pdf$/i.test(file?.name ?? '')
}

/**
 * 검사 결과를 등록 가능 여부로 바꾼다. 판정 순서: 크기 → 열기 오류 → 쪽수.
 * @returns {{ ok: true, numPages: number } | { ok: false, message: string }}
 */
export function classifyPdfInspection({ size, numPages, errorName }) {
  if (size > PDF_MAX_BYTES) return { ok: false, message: PDF_IMPORT_MESSAGES.tooLarge }
  if (errorName === 'PasswordException') return { ok: false, message: PDF_IMPORT_MESSAGES.encrypted }
  if (errorName !== undefined || !(numPages >= 1)) return { ok: false, message: PDF_IMPORT_MESSAGES.unreadable }
  if (numPages > PDF_MAX_PAGES) return { ok: false, message: PDF_IMPORT_MESSAGES.tooManyPages }
  return { ok: true, numPages }
}

/**
 * 브라우저에서 PDF 를 열어 쪽수를 읽는다. 100MB 초과면 읽지도 열지도 않는다.
 * pdf.js 는 넘긴 바이트를 워커로 transfer 하므로(원본 버퍼가 비워짐) 업로드에는 원래 File 을 쓴다.
 */
export async function inspectPdf(file, { open = openPdf } = {}) {
  const { size } = file
  if (size > PDF_MAX_BYTES) return classifyPdfInspection({ size })
  let doc = null
  try {
    doc = await open(new Uint8Array(await file.arrayBuffer()))
    return classifyPdfInspection({ size, numPages: doc.numPages })
  } catch (err) {
    return classifyPdfInspection({ size, errorName: err?.name ?? 'Error' })
  } finally {
    try { await doc?.destroy() } catch { /* 검사 결과에는 영향 없음 */ }
  }
}

/**
 * 파일 순서대로 연속 position 블록을 배정한다. 이미지는 1칸, PDF 는 쪽수만큼.
 * @param {({ kind: 'image' } | { kind: 'pdf', numPages: number })[]} entries
 * @returns {{ start: number, count: number }[]}
 */
export function planPagePositions(entries, basePosition) {
  let next = basePosition
  return entries.map((entry) => {
    const count = entry.kind === 'pdf' ? entry.numPages : 1
    const block = { start: next, count }
    next += count
    return block
  })
}
