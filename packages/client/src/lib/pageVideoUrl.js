/**
 * 챕터/과제 페이지의 videoUrl 판별 유틸.
 * 페이지 영상은 YouTube 링크(youtubeUtils) 또는 영상자료 라이브러리 파일
 * (`/api/files/videos/library/...`, Range 스트리밍) 둘 중 하나다.
 */

export const LIBRARY_VIDEO_PREFIX = '/api/files/videos/library/';

/**
 * 영상자료 라이브러리 파일 URL인지 판별합니다.
 * 상대 경로(`/api/files/videos/library/x.mp4`)와 그 경로를 포함한 절대 URL 모두 허용.
 * @param {unknown} url
 * @returns {boolean}
 */
export function isLibraryVideoUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (url.startsWith(LIBRARY_VIDEO_PREFIX)) return true;
  if (/^https?:\/\//i.test(url)) {
    try {
      return new URL(url).pathname.startsWith(LIBRARY_VIDEO_PREFIX);
    } catch {
      return false;
    }
  }
  return false;
}
