// 페이지 생성 body 의 PDF 필드 쌍(pdfUrl·pdfPage) 검증. null/undefined 는 "없음"으로 본다.

const PDF_URL_PREFIX = '/api/files/chapter-pdfs/';

/** 통과하면 null, 아니면 400 응답용 메시지 */
export function pdfFieldsError(body: { pdfUrl?: unknown; pdfPage?: unknown }): string | null {
  const hasUrl = body.pdfUrl != null;
  const hasPage = body.pdfPage != null;
  if (!hasUrl && !hasPage) return null;
  if (!hasUrl || !hasPage) return 'pdfUrl과 pdfPage는 함께 보내야 합니다.';
  if (typeof body.pdfUrl !== 'string' || !body.pdfUrl.startsWith(PDF_URL_PREFIX)) {
    return `pdfUrl은 ${PDF_URL_PREFIX} 로 시작해야 합니다.`;
  }
  if (typeof body.pdfPage !== 'number' || !Number.isInteger(body.pdfPage) || body.pdfPage < 1) {
    return 'pdfPage는 1 이상의 정수여야 합니다.';
  }
  return null;
}
