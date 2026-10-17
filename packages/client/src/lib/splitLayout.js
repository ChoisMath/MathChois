/**
 * 영상 2분할 필기 화면의 레이아웃 설정 (기기 로컬 localStorage).
 *
 * - `mc_video_split`           : { ratio, videoSide } — 영상 패널 비율(0.2~0.8), 영상 위치('start' = 좌측/위, 'end' = 우측/아래)
 * - `mc_video_split_page:<cv>` : 학급 영상별 마지막으로 본 챕터 페이지 id
 *
 * 비율은 항상 **영상 패널 기준**으로 저장한다. 좌우를 바꿔도 영상 크기는 유지된다.
 * 플레이어 설정(lib/videoPlayer.js)과 같은 방식으로 저장 실패/손상 데이터를 무시한다.
 */

export const SPLIT_KEY = 'mc_video_split';
export const SPLIT_PAGE_PREFIX = 'mc_video_split_page:';
export const RATIO_MIN = 0.2;
export const RATIO_MAX = 0.8;
export const RATIO_STEP = 0.02;

export const DEFAULT_SPLIT_SETTINGS = Object.freeze({ ratio: 0.5, videoSide: 'start' });

function storage() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

/** 비율을 [min,max] 로 클램프. 숫자가 아니면 기본값(0.5). */
export function clampRatio(r, min = RATIO_MIN, max = RATIO_MAX) {
  const n = Number(r);
  if (!Number.isFinite(n)) return DEFAULT_SPLIT_SETTINGS.ratio;
  return Math.min(max, Math.max(min, n));
}

export function normalizeSplitSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    ratio: clampRatio(src.ratio),
    videoSide: src.videoSide === 'end' ? 'end' : 'start',
  };
}

export function loadSplitSettings() {
  const ls = storage();
  if (!ls) return { ...DEFAULT_SPLIT_SETTINGS };
  try {
    const raw = ls.getItem(SPLIT_KEY);
    return normalizeSplitSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_SPLIT_SETTINGS };
  }
}

/** 일부 키만 넘겨도 기존 값과 머지해 저장. 정규화된 전체 설정을 돌려준다. */
export function saveSplitSettings(patch) {
  const next = normalizeSplitSettings({ ...loadSplitSettings(), ...(patch || {}) });
  const ls = storage();
  if (ls) {
    try { ls.setItem(SPLIT_KEY, JSON.stringify(next)); } catch { /* quota 등 무시 */ }
  }
  return next;
}

export function loadSplitPage(classroomVideoId) {
  const ls = storage();
  if (!ls || !classroomVideoId) return null;
  try { return ls.getItem(SPLIT_PAGE_PREFIX + classroomVideoId) || null; } catch { return null; }
}

export function saveSplitPage(classroomVideoId, pageId) {
  const ls = storage();
  if (!ls || !classroomVideoId) return;
  try {
    if (pageId) ls.setItem(SPLIT_PAGE_PREFIX + classroomVideoId, String(pageId));
    else ls.removeItem(SPLIT_PAGE_PREFIX + classroomVideoId);
  } catch { /* 무시 */ }
}

/**
 * 손잡이 드래그: 포인터 좌표 → 첫 패널 비율.
 * horizontal(좌/우 분할)은 x, vertical(위/아래 분할)은 y 를 쓴다.
 */
export function ratioFromPointer(rect, clientX, clientY, orientation, min = RATIO_MIN, max = RATIO_MAX) {
  const size = orientation === 'vertical' ? rect.height : rect.width;
  if (!size || !Number.isFinite(size)) return DEFAULT_SPLIT_SETTINGS.ratio;
  const offset = orientation === 'vertical' ? clientY - rect.top : clientX - rect.left;
  return clampRatio(offset / size, min, max);
}

/** 키보드 조작: 한 단계(2%) 이동 후 클램프. 부동소수 오차는 소수 4자리로 정리. */
export function stepRatio(ratio, dir, min = RATIO_MIN, max = RATIO_MAX) {
  const next = Number(ratio) + (dir > 0 ? RATIO_STEP : -RATIO_STEP);
  return clampRatio(Math.round(next * 10000) / 10000, min, max);
}
