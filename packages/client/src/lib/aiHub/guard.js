/**
 * AI활용 허브 접근 판정 — 순수 함수. 통과하면 null, 아니면 보낼 주소.
 * `allowed` 는 GET /api/ai/access 의 결과(아직 모르면 null; 이때는 로그인·역할만 본다).
 */
export function resolveAiHubRedirect({ isAuthenticated, role, allowed }) {
  if (!isAuthenticated) return '/';
  if (!role) return '/choose-role';
  if (allowed === false) return `/${role}/classrooms`;
  return null;
}
