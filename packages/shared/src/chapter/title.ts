/**
 * 챕터 이름 비교 — 한 학급 안에 같은 이름의 챕터를 다시 복사해 넣지 않기 위한 규칙.
 * 서버(가져오기 거절)·클라이언트(목록 표시)가 같은 규칙을 쓴다.
 */

/** 비교용 키: 유니코드 NFC, 앞뒤 공백 제거, 안쪽 연속 공백은 하나로. 대소문자는 구분한다. */
export function chapterTitleKey(title: string | null | undefined): string {
  return (title ?? '').normalize('NFC').trim().replace(/\s+/g, ' ');
}

/** chapters 중에 title 과 같은 이름(chapterTitleKey 기준)이 있는가 */
export function hasSameChapterTitle(
  chapters: readonly { title: string | null }[],
  title: string | null | undefined,
): boolean {
  const key = chapterTitleKey(title);
  return chapters.some((ch) => chapterTitleKey(ch.title) === key);
}
