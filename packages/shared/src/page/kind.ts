/** PDF 교재 페이지 여부: pdfUrl 이 비어 있지 않고 pdfPage 가 1 이상의 정수일 때만 true. */
export function isPdfPage(
  page: { pdfUrl?: string | null; pdfPage?: number | null } | null | undefined,
): boolean {
  if (!page) return false;
  const { pdfUrl, pdfPage } = page;
  return typeof pdfUrl === 'string' && pdfUrl !== '' && Number.isInteger(pdfPage) && (pdfPage as number) >= 1;
}
