// 요청 수 제한(@fastify/rate-limit, 분당 300)에서 뺄 요청.
// - 빌드된 정적 자산·Socket.IO·파비콘·헬스 체크
// - AI활용 허브 미디어 읽기(GET/HEAD /api/files/ai-hub/…): 공개·`?v=<sha8>` 로 버전이 붙은 immutable 파일이다.
//   슬라이드 목록 하나가 카드마다 썸네일 두 장(앞·뒤)을 불러 1천 장이 넘으므로, 한도에 걸리면 429 를 받은 카드가 빈 채로 남는다.
//   `..` 이 든 주소는 다른 버킷으로 빠질 수 있어 빼지 않는다(그런 요청은 평소처럼 세고, 라우트가 거절한다).
const STATIC = ['/assets/', '/socket.io/'];
const EXACT = new Set(['/favicon.svg', '/favicon.ico', '/api/health']);
const AI_HUB_MEDIA = '/api/files/ai-hub/';

export function isRateLimitExempt(method: string, url: string): boolean {
  if (STATIC.some((p) => url.startsWith(p)) || EXACT.has(url)) return true;
  if (method !== 'GET' && method !== 'HEAD') return false;
  if (!url.startsWith(AI_HUB_MEDIA)) return false;
  const pathPart = url.split('?')[0]!;
  return !/(^|\/)\.\.(\/|$)|%2e|%2f|%5c|\\/i.test(pathPart);
}
