/**
 * 첫 화면(로그인) 필기 장면 모션 — 이 브라우저에서 처음 방문할 때 한 번만 재생한다.
 *
 * 재생을 결정하는 순간 기록을 남겨, 재생 도중 새로고침해도 다시 재생하지 않는다.
 * 저장소를 쓸 수 없으면(사생활 보호 모드 등) 방문할 때마다 재생되는 것을 막기 위해 재생하지 않는다.
 * 동작 줄이기(prefers-reduced-motion) 사용자는 완성된 그림만 본다.
 */

export const HOME_INTRO_KEY = 'mc_home_intro_played';

/** 재생해야 하면 true 를 돌려주고 재생 기록을 남긴다. */
export function claimHomeIntro(storage, { reducedMotion = false } = {}) {
  if (reducedMotion || !storage) return false;
  try {
    if (storage.getItem(HOME_INTRO_KEY)) return false;
    storage.setItem(HOME_INTRO_KEY, new Date().toISOString());
    return true;
  } catch {
    return false;
  }
}
