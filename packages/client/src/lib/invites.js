/** 학생 사전 등록·교사 등록 응답을 한 줄로 요약한다 */

const SKIP_LABEL = { member: '이미 참여', teacher: '교사 계정', invited: '이미 대기 중' };

/** 학급 사전 등록 결과 — "2명 바로 참여 · 3명 가입 대기 · 1명 건너뜀(이미 참여) · 1개 형식 오류" */
export function summarizeInviteResult(r) {
  const parts = [];
  if (r.joined?.length) parts.push(`${r.joined.length}명 바로 참여`);
  if (r.invited?.length) parts.push(`${r.invited.length}명 가입 대기`);
  if (r.skipped?.length) {
    const reasons = [...new Set(r.skipped.map((s) => SKIP_LABEL[s.reason] ?? s.reason))].join(', ');
    parts.push(`${r.skipped.length}명 건너뜀(${reasons})`);
  }
  if (r.invalid?.length) parts.push(`${r.invalid.length}개 형식 오류`);
  return parts.length ? parts.join(' · ') : '처리한 이메일이 없습니다.';
}

/** 관리자 교사 등록 결과 — "2명 등록 · 1명 이미 등록됨 · 1개 형식 오류" */
export function summarizeAllowedTeachersResult(r) {
  const parts = [];
  if (r.added?.length) parts.push(`${r.added.length}명 등록`);
  if (r.existing?.length) parts.push(`${r.existing.length}명 이미 등록됨`);
  if (r.invalid?.length) parts.push(`${r.invalid.length}개 형식 오류`);
  return parts.length ? parts.join(' · ') : '처리한 이메일이 없습니다.';
}
