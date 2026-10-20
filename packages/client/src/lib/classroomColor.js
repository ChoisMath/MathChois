/**
 * 학급 색 — 목록 공책 표지·사이드바 탭·상단 바가 함께 쓰는 색.
 *
 * 색 목록과 배정 규칙(고유 색, 자동 배정, 가장 적게 쓴 색)은 서버와 같은 코드를 쓰도록
 * @mathchois/shared 에 있고, 여기서는 그것을 다시 내보내며 화면용 색 값만 더한다.
 */
import { CLASSROOM_COLORS, classroomColor, isClassroomColor } from '@mathchois/shared';

export {
  CLASSROOM_COLORS, classroomColor, assignClassroomColors, pickLeastUsedColor, isClassroomColor,
} from '@mathchois/shared';

/** cover=표지·탭 색, tint=옅은 배경, deep=그 위 글씨(4.5:1 이상), label=이름 */
export const COLOR_STYLES = {
  coral:    { cover: '#f2836b', tint: '#fde3dc', deep: '#a63b24', label: '코랄' },
  mustard:  { cover: '#f2b544', tint: '#fcefc7', deep: '#7d5200', label: '머스터드' },
  sage:     { cover: '#8fc28a', tint: '#dff0dc', deep: '#2c6537', label: '세이지' },
  sky:      { cover: '#6fa8dc', tint: '#dcebfa', deep: '#1d5893', label: '하늘' },
  lavender: { cover: '#a78bda', tint: '#ece4fa', deep: '#563a99', label: '라벤더' },
  rose:     { cover: '#ee8ab1', tint: '#fbe1ec', deep: '#932a56', label: '로즈' },
};

/**
 * 학급의 색을 정한다: 저장된 유효한 색 → 자동 배정 Map → 고유 색.
 * 색이 없거나(구 서버 응답) 알 수 없는 값("red")이어도 화면이 깨지지 않게 한다.
 */
export function resolveClassroomColor(classroom, autoMap) {
  if (isClassroomColor(classroom?.color)) return classroom.color;
  return autoMap?.get(classroom?.id) ?? classroomColor(classroom?.id);
}

/** 인라인 style 용 CSS 변수 */
export function colorVars(color) {
  const s = isClassroomColor(color) ? COLOR_STYLES[color] : COLOR_STYLES[CLASSROOM_COLORS[0]];
  return { '--nb-cover': s.cover, '--nb-tint': s.tint, '--nb-deep': s.deep };
}
