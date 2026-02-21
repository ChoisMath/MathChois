/**
 * 챕터·페이지 목록 공유 인메모리 캐시
 * 모든 뷰어(StudyViewer, TeacherStudyViewer, StudentWorkViewer, ChapterMonitor)가 공유합니다.
 * 브라우저 세션 동안 유지되며 새로고침 시 자동 초기화됩니다.
 */

const _chapterCache = new Map(); // chapterId → chapter
const _pagesCache   = new Map(); // chapterId → pages[]

/**
 * chapterId에 해당하는 챕터와 페이지 목록을 반환합니다.
 * 캐시 히트 시 Supabase 요청을 건너뜁니다.
 * 항상 image_url, id, position을 포함한 전체 페이지 데이터를 반환합니다.
 */
export async function getCachedChapterAndPages(chapterId, supabase) {
  if (_chapterCache.has(chapterId) && _pagesCache.has(chapterId)) {
    return {
      chapter: _chapterCache.get(chapterId),
      pages:   _pagesCache.get(chapterId),
    };
  }

  const [chapRes, pgsRes] = await Promise.all([
    supabase.from('chapters').select('id, title').eq('id', chapterId).single(),
    supabase.from('pages').select('id, image_url, position')
      .eq('chapter_id', chapterId).order('position'),
  ]);

  const chapter = chapRes.data;
  const pages   = pgsRes.data || [];

  if (chapter) _chapterCache.set(chapterId, chapter);
  _pagesCache.set(chapterId, pages);

  return { chapter, pages };
}

/**
 * 챕터 편집(페이지 추가/삭제/수정) 후 캐시를 무효화합니다.
 * ChapterEditor에서 호출하세요.
 */
export function invalidatePagesCache(chapterId) {
  _chapterCache.delete(chapterId);
  _pagesCache.delete(chapterId);
}
