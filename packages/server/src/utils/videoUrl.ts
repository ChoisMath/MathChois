/**
 * 챕터/과제 페이지 videoUrl 검증.
 * 허용: YouTube 링크(watch?v= / youtu.be / embed) 또는 영상자료 라이브러리 파일 경로
 * (`/api/files/videos/library/...`). 그 외는 거부한다.
 */

export const LIBRARY_VIDEO_PREFIX = '/api/files/videos/library/';

const YOUTUBE_PATTERNS = [
  /^https?:\/\/(?:www\.|m\.)?youtube\.com\/watch\?(?:.*&)?v=[\w-]{11}(?:[&#]|$)/,
  /^https?:\/\/youtu\.be\/[\w-]{11}(?:[?#]|$)/,
  /^https?:\/\/(?:www\.|m\.)?youtube\.com\/embed\/[\w-]{11}(?:[?#]|$)/,
];

export function isYouTubeUrl(url: string): boolean {
  return YOUTUBE_PATTERNS.some((re) => re.test(url));
}

export function isLibraryVideoUrl(url: string): boolean {
  return url.startsWith(LIBRARY_VIDEO_PREFIX) && !url.includes('..');
}

export function isValidPageVideoUrl(url: unknown): url is string {
  if (typeof url !== 'string' || !url.trim()) return false;
  const u = url.trim();
  return isYouTubeUrl(u) || isLibraryVideoUrl(u);
}

export const INVALID_VIDEO_URL_MESSAGE =
  'videoUrl must be a YouTube URL or a library video path (/api/files/videos/library/...)';
