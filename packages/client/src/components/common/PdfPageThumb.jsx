import { useEffect, useRef, useState } from 'react';
import { rasterizePdfPage } from '../../lib/pdfRaster';
import { pdfThumbCache, thumbKey } from '../../lib/pdfThumbCache';

const PAPER_RATIO = '1 / 1.414';
const FAILED_STYLE = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  backgroundColor: '#e5e7eb', color: '#6b7280', fontSize: '0.75rem',
};

/*
 * 썸네일 래스터는 한 번에 하나씩 — 목록이 한꺼번에 보여도 메인 스레드를 막지 않고,
 * 여러 PDF 가 섞인 목록에서 문서 LRU(2개)가 그리는 도중의 문서를 닫아 버리는 일을 막는다.
 */
let queue = Promise.resolve();
function enqueue(task) {
  const run = queue.then(task);
  queue = run.catch(() => {});
  return run;
}

/**
 * PDF 한 쪽의 썸네일. 캐시에 있으면 바로 `<img>`, 없으면 자리 상자를 두고 화면에 들어올 때(200px 앞) 래스터한다.
 * 폭만 바뀐 경우(편집기 미리보기 크기 변경)에는 새 크기를 그리는 동안 이전 그림을 그대로 보인다.
 *
 * @param {{ pdfUrl: string, pageNumber: number, width?: number, alt?: string, className?: string, style?: object }} props
 *   width: 표시 폭(px). 래스터 긴 변 = width × 1.6
 */
export default function PdfPageThumb({ pdfUrl, pageNumber, width = 240, alt, className, style }) {
  const key = thumbKey(pdfUrl, pageNumber, width);
  const [result, setResult] = useState({ key: null, pdfUrl: null, pageNumber: null, dataUrl: null, failed: false });
  const ref = useRef(null);

  const cached = pdfThumbCache.get(key);
  const current = result.key === key ? result : null;
  const samePage = result.pdfUrl === pdfUrl && result.pageNumber === pageNumber;
  const src = cached ?? current?.dataUrl ?? (samePage ? result.dataUrl : null);
  const failed = !cached && !!current?.failed;

  useEffect(() => {
    if (pdfThumbCache.get(key)) return undefined;
    let active = true;
    const load = () => {
      enqueue(() => (active ? rasterizePdfPage(pdfUrl, pageNumber, { longSide: Math.round(width * 1.6) }) : null)).then(
        (out) => {
          if (!out) return;
          pdfThumbCache.set(key, out.dataUrl);
          if (active) setResult({ key, pdfUrl, pageNumber, dataUrl: out.dataUrl, failed: false });
        },
        (err) => {
          console.warn('PDF 썸네일 실패', err);
          if (active) setResult({ key, pdfUrl, pageNumber, dataUrl: null, failed: true });
        },
      );
    };

    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      load();
      return () => { active = false; };
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      observer.disconnect();
      load();
    }, { rootMargin: '200px' });
    observer.observe(el);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [key, pdfUrl, pageNumber, width]);

  if (src) {
    return (
      <img ref={ref} src={src} alt={alt} className={className} style={style} loading="lazy" decoding="async" draggable={false} />
    );
  }
  if (failed) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={className}
        style={{ aspectRatio: PAPER_RATIO, ...style, ...FAILED_STYLE }}
      >
        미리보기 없음
      </div>
    );
  }
  return (
    <div
      ref={ref}
      role="img"
      aria-label={alt}
      aria-busy="true"
      className={className}
      style={{ aspectRatio: PAPER_RATIO, ...style, backgroundColor: '#f3f4f6' }}
    />
  );
}
