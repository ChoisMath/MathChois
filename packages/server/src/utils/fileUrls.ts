// 페이지 행들의 파일 URL(imageUrl·pdfUrl)을 저장소 정리용 목록으로 모은다.

/** 행들의 imageUrl·pdfUrl 값을 합쳐 null 제거·중복 제거 */
export function collectFileUrls(rows: { imageUrl: string | null; pdfUrl: string | null }[]): string[] {
  const urls = new Set<string>();
  for (const r of rows) {
    if (r.imageUrl) urls.add(r.imageUrl);
    if (r.pdfUrl) urls.add(r.pdfUrl);
  }
  return [...urls];
}
