// 버킷별 업로드 MIME/용량 정책. 누가 업로드할 수 있는지(학생 버킷·학생 MIME)는 다루지 않는다.

// 화이트보드 이미지 버킷: 인라인 안전 래스터 이미지만, 2MB 이하 (교사 포함)
export const WHITEBOARD_BUCKET = 'whiteboard-files';
export const WHITEBOARD_MAX_BYTES = 2 * 1024 * 1024;

// HTML 전용 버킷 (text/html 만 허용)
export const HTML_ONLY_BUCKETS = new Set(['chapter-tools', 'visualizations']);

// PDF 전용 버킷 (application/pdf 만 허용, 100MB 이하). 교사 전용 여부는 storage.ts 의 학생 버킷 목록에 없는 것으로 보장.
export const PDF_ONLY_BUCKETS = new Set(['chapter-pdfs']);
export const PDF_MAX_BYTES = 100 * 1024 * 1024;

// 앱 origin 에서 인라인 렌더해도 스크립트 실행 위험이 없는 래스터 이미지 형식.
export const INLINE_SAFE_IMAGE_RE = /^image\/(png|jpe?g|gif|webp)$/;

export type UploadPolicyResult =
  | { ok: true }
  | { ok: false; status: 400 | 413; error: string };

export function checkUploadPolicy(bucket: string, mimetype: string, size: number): UploadPolicyResult {
  if (HTML_ONLY_BUCKETS.has(bucket) && mimetype !== 'text/html') {
    return { ok: false, status: 400, error: 'HTML 도구 버킷에는 .html 파일만 업로드할 수 있습니다.' };
  }

  if (PDF_ONLY_BUCKETS.has(bucket)) {
    if (mimetype !== 'application/pdf') {
      return { ok: false, status: 400, error: 'PDF 버킷에는 .pdf 파일만 업로드할 수 있습니다.' };
    }
    if (size > PDF_MAX_BYTES) {
      return { ok: false, status: 413, error: 'PDF는 100MB 이하여야 합니다.' };
    }
  }

  // 화이트보드 이미지: 래스터 이미지만, 2MB 이하 (보드 JSON 에는 URL 만 저장)
  if (bucket === WHITEBOARD_BUCKET) {
    if (!INLINE_SAFE_IMAGE_RE.test(mimetype)) {
      return { ok: false, status: 400, error: '화이트보드에는 PNG/JPEG/GIF/WebP 이미지만 넣을 수 있습니다.' };
    }
    if (size > WHITEBOARD_MAX_BYTES) {
      return { ok: false, status: 413, error: '이미지는 2MB 이하여야 합니다.' };
    }
  }

  return { ok: true };
}
