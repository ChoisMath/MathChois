const TOOLS_ORIGIN = import.meta.env.VITE_TOOLS_ORIGIN || '';

/**
 * HTML 도구는 앱과 "다른 origin"에서 서빙해야 iframe 안에서 postMessage/blob worker 가 동작한다.
 * (sandbox 에 allow-same-origin 을 주되 src 가 앱과 같은 origin 이면 opaque origin 'null' 이 되어
 *  수식 입력 등 postMessage 기반 위젯이 깨진다.)
 * VITE_TOOLS_ORIGIN 이 설정되면 절대 URL 로 변환, 없으면 same-origin(상대경로) 유지(로컬 dev).
 */
export function toolUrl(htmlUrl) {
  if (!htmlUrl) return htmlUrl;
  if (/^https?:\/\//i.test(htmlUrl)) return htmlUrl;
  return TOOLS_ORIGIN ? `${TOOLS_ORIGIN}${htmlUrl}` : htmlUrl;
}
