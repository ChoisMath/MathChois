/**
 * AI활용 허브 접근 판정 — 순수 함수. 통과하면 null, 아니면 보낼 주소.
 * `allowed` 는 GET /api/ai/access 의 결과(아직 모르면 null; 이때는 로그인·역할만 본다).
 */
export function resolveAiHubRedirect({ isAuthenticated, role, allowed }) {
  if (!isAuthenticated) return '/';
  // 역할은 서버가 로그인·갱신 때 정한다(교사 허용 목록). ProtectedRoute 처럼 비어 있으면 학생으로 본다.
  const effectiveRole = role ?? 'student';
  if (allowed === false) return `/${effectiveRole}/classrooms`;
  return null;
}
