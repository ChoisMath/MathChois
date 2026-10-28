// AI활용 허브 접근 규칙(결정표). 서버 requireAiHub·/api/ai/access 와 클라이언트 가드가 같은 함수를 쓴다.
export type AiHubAccessInput = {
  role: 'teacher' | 'student' | null;
  isAdmin: boolean;
  allowedClassroomCount: number; // 학생이 속한 학급 중 ai_hub_enabled 인 학급 수
};

export type AiHubAbilities = { allowed: boolean; canEdit: boolean; canEditOriginal: boolean };

export function canUseAiHub(a: AiHubAccessInput): boolean {
  if (a.isAdmin || a.role === 'teacher') return true;
  return a.role === 'student' && a.allowedClassroomCount > 0;
}

export function aiHubAbilities(a: AiHubAccessInput): AiHubAbilities {
  const allowed = canUseAiHub(a);
  return {
    allowed,
    canEdit: allowed && (a.isAdmin || a.role === 'teacher'), // 빈칸·옵션·복사
    canEditOriginal: allowed && a.isAdmin,                  // 원본 프롬프트 저장
  };
}
