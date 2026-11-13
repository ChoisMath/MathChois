import { isPdfPage } from '@mathchois/shared';
import PdfPageThumb from './PdfPageThumb';

/**
 * 페이지 썸네일 — PDF 쪽이면 pdf.js 래스터(`PdfPageThumb`), 아니면 `page.imageUrl` 이미지.
 * @param {{ page: any, alt?: string, className?: string, width?: number, style?: object }} props
 *   width: PDF 쪽의 표시 폭(px, 기본 240) — 이미지 페이지에는 쓰지 않는다. 나머지 props 는 `<img>` 로 전달.
 */
export default function PageThumb({ page, alt, className, width, style, ...imgProps }) {
  if (isPdfPage(page)) {
    return <PdfPageThumb pdfUrl={page.pdfUrl} pageNumber={page.pdfPage} width={width} alt={alt} className={className} style={style} />;
  }
  return (
    <img src={page.imageUrl} alt={alt} className={className} style={style} loading="lazy" decoding="async" draggable={false} {...imgProps} />
  );
}
