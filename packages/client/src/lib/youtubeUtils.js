/**
 * YouTube URL에서 video ID를 추출합니다.
 * 지원 형식:
 *   https://www.youtube.com/watch?v=VIDEO_ID
 *   https://youtu.be/VIDEO_ID
 *   https://www.youtube.com/embed/VIDEO_ID
 *   + 추가 쿼리 파라미터 포함 URL
 *
 * @param {string} url
 * @returns {string|null} videoId (11자 영숫자+하이픈+밑줄) 또는 null
 */
export function extractYouTubeId(url) {
  if (!url || typeof url !== 'string') return null;

  const patterns = [
    /(?:youtube\.com\/watch\?.*v=)([\w-]{11})/,
    /(?:youtu\.be\/)([\w-]{11})/,
    /(?:youtube\.com\/embed\/)([\w-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  return null;
}

/**
 * YouTube video ID로 썸네일 URL을 반환합니다.
 * @param {string} videoId
 * @returns {string}
 */
export function getYouTubeThumbnail(videoId) {
  return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
}

/**
 * YouTube embed URL을 생성합니다.
 * @param {string} videoId
 * @returns {string}
 */
export function getYouTubeEmbedUrl(videoId) {
  return `https://www.youtube.com/embed/${videoId}?rel=0`;
}
