/**
 * 영상 카드의 필기 챕터 선택지.
 * 단원이 없는 학급, 미분류 영상, 목록에 없는(지워진) 단원의 영상 → 학급 챕터 전부.
 * 단원 영상 → 그 단원 챕터만. 현재 연결된 챕터가 빠지면 끝에 붙여 현재 값이 사라지지 않게 한다.
 *
 * @param {{ id: string, title: string, unitId?: string|null }[]} chapters 학급 챕터(화면 순서)
 * @param {{ unitId?: string|null, chapterId?: string|null }} cv
 * @param {{ id: string }[]} units 학급 단원
 */
export function chapterOptionsForVideo(chapters, cv, units) {
  const unitId = cv.unitId ?? null;
  if (!unitId || !units.some((u) => u.id === unitId)) return chapters;
  const inUnit = chapters.filter((ch) => ch.unitId === unitId);
  const current = cv.chapterId && !inUnit.some((ch) => ch.id === cv.chapterId)
    ? chapters.find((ch) => ch.id === cv.chapterId)
    : null;
  return current ? [...inUnit, current] : inUnit;
}
