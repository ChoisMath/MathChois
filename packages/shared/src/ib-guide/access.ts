// IB교육과정 안내 접근 규칙. 서버 가드·/api/ib-guide/access 와 클라이언트 가드가 같은 함수를 쓴다.
export type IbGuideAccessInput = {
  role: 'teacher' | 'student' | null;
  isAdmin: boolean;
  allowedClassroomCount: number; // 학생이 속한 학급 중 IB 안내가 열린 학급 수
};

export function canUseIbGuide(a: IbGuideAccessInput): boolean {
  if (a.isAdmin || a.role === 'teacher') return true;
  return a.role === 'student' && a.allowedClassroomCount > 0;
}
