/*
 * 페이지 삭제 시 함께 지울 저장소 파일 판정.
 * PDF 한 파일은 여러 페이지(쪽)가 공유하므로, 같은 pdfUrl 을 쓰는 페이지가 남아 있으면 지우지 않는다.
 */

const FILES_MARKER = '/api/files/'

/** 저장 URL 에서 `/api/files/…` 경로만 남긴다(origin 제거). 저장소 파일이 아니면 null. */
export function storagePathOf(url) {
  if (typeof url !== 'string') return null
  const idx = url.indexOf(FILES_MARKER)
  return idx === -1 ? null : url.slice(idx)
}

/**
 * page 를 지울 때 함께 지울 파일 URL 목록.
 * @param {object} page 삭제할 페이지
 * @param {object[]} remainingPages 삭제 후 같은 챕터(과제)에 남는 페이지들
 * @returns {string[]}
 */
export function fileUrlsToDeleteFor(page, remainingPages) {
  if (page.imageUrl) return [page.imageUrl]
  if (page.pdfUrl) {
    const stillUsed = remainingPages.some((p) => p.id !== page.id && p.pdfUrl === page.pdfUrl)
    return stillUsed ? [] : [page.pdfUrl]
  }
  return []
}
