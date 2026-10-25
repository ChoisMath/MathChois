import { Users, BookOpen, Newspaper, ClipboardList, Clapperboard, BarChart3 } from 'lucide-react';

/** 학급 상세의 탭 — 활성 탭은 주소 쿼리 `?tab=` 에 둔다. */
export const CLASSROOM_TABS = [
  { key: 'chapters',    label: '챕터',   Icon: BookOpen },
  { key: 'board',       label: '게시판', Icon: Newspaper },
  { key: 'assignments', label: '과제',   Icon: ClipboardList },
  { key: 'videos',      label: '영상',   Icon: Clapperboard },
  { key: 'students',    label: '학생',   Icon: Users },
  { key: 'dashboard',   label: '대시보드', Icon: BarChart3, teacherOnly: true },
];

/** `?tab=` 값 → 탭 키. 알 수 없는 값, 학생의 dashboard 는 챕터로 돌린다. */
export function resolveTab(param, isTeacher) {
  const tab = CLASSROOM_TABS.find((t) => t.key === param);
  return tab && (isTeacher || !tab.teacherOnly) ? tab.key : 'chapters';
}
