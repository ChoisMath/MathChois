/**
 * 영상 플레이어 설정/유틸 (순수 함수 — VideoPlayer.jsx 가 사용, Vitest 로 검증)
 *
 * - 설정은 기기별 localStorage(`mc_video_player`)에 저장: 방향키 이동 시간·배속·볼륨·음소거·자막(켜짐·언어·글자 크기)
 * - 마지막 재생 위치는 `mc_video_pos:<key>` 에 저장(설계 결정 Q4: v1 은 로컬 이어보기만)
 */

export const SEEK_STEPS = [10, 20, 30, 60];
export const PLAYBACK_RATES = [0.7, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5];
export const VOLUME_STEP = 0.05;

/** 세로 드래그 밝기 조절 범위(CSS filter: brightness) — 1 이 원본 */
export const BRIGHTNESS_MIN = 0.2;
export const BRIGHTNESS_MAX = 1.5;
export const BRIGHTNESS_DEFAULT = 1;

/** 자막 글자 크기 단계 */
export const SUBTITLE_SIZES = ['sm', 'md', 'lg'];

export const DEFAULT_SETTINGS = Object.freeze({
  seekStep: 10,
  playbackRate: 1.0,
  volume: 1,
  muted: false,
  // 교사가 일부러 올린 자막이므로 기본으로 켠다. 사용자가 끄면 그 선택이 기기에 저장된다.
  subtitlesOn: true,
  subtitleLang: 'ko',
  subtitleSize: 'md',
});

const SETTINGS_KEY = 'mc_video_player';
const POS_PREFIX = 'mc_video_pos:';

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/** 허용 목록에 없는 값은 가장 가까운 값으로 보정 */
export function normalizeSeekStep(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.seekStep;
  return SEEK_STEPS.reduce((best, s) => (Math.abs(s - n) < Math.abs(best - n) ? s : best), SEEK_STEPS[0]);
}

export function normalizeRate(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.playbackRate;
  return PLAYBACK_RATES.reduce((best, r) => (Math.abs(r - n) < Math.abs(best - n) ? r : best), PLAYBACK_RATES[0]);
}

export function normalizeSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const vol = Number(src.volume);
  return {
    seekStep: normalizeSeekStep(src.seekStep),
    playbackRate: normalizeRate(src.playbackRate),
    volume: Number.isFinite(vol) ? clamp(vol, 0, 1) : DEFAULT_SETTINGS.volume,
    muted: !!src.muted,
    subtitlesOn: typeof src.subtitlesOn === 'boolean' ? src.subtitlesOn : DEFAULT_SETTINGS.subtitlesOn,
    // 나중 번역 자막을 위해 SUBTITLE_LANGS 로 제한하지 않는다(없는 언어면 pickSubtitleTrack 이 첫 트랙을 고른다)
    subtitleLang: typeof src.subtitleLang === 'string' && src.subtitleLang ? src.subtitleLang : DEFAULT_SETTINGS.subtitleLang,
    subtitleSize: SUBTITLE_SIZES.includes(src.subtitleSize) ? src.subtitleSize : DEFAULT_SETTINGS.subtitleSize,
  };
}

/** 표시할 자막 트랙: 같은 언어 → 없으면 첫 트랙 → 트랙이 없으면 null */
export function pickSubtitleTrack(tracks, lang) {
  if (!Array.isArray(tracks) || !tracks.length) return null;
  return tracks.find((t) => t.lang === lang) ?? tracks[0];
}

function storage() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

export function loadSettings() {
  const ls = storage();
  if (!ls) return { ...DEFAULT_SETTINGS };
  try {
    const raw = ls.getItem(SETTINGS_KEY);
    return normalizeSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  const normalized = normalizeSettings(settings);
  const ls = storage();
  if (ls) {
    try { ls.setItem(SETTINGS_KEY, JSON.stringify(normalized)); } catch { /* quota 등 무시 */ }
  }
  return normalized;
}

/** 배속 한 단계 올림/내림 (목록 양 끝에서는 고정) */
export function stepRate(current, dir) {
  const idx = PLAYBACK_RATES.indexOf(normalizeRate(current));
  const next = clamp(idx + (dir > 0 ? 1 : -1), 0, PLAYBACK_RATES.length - 1);
  return PLAYBACK_RATES[next];
}

export function formatRate(rate) {
  // 1 → "1×", 1.25 → "1.25×", 0.7 → "0.7×"
  return `${Number(rate).toString()}×`;
}

/** 초 → "m:ss" 또는 "h:mm:ss" */
export function formatTime(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(r).padStart(2, '0')}`;
}

// ─── 이어보기 위치 (기기 로컬) ──────────────────────

export function loadResumePosition(key) {
  const ls = storage();
  if (!ls || !key) return 0;
  const n = Number(ls.getItem(POS_PREFIX + key));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * 재생 위치 저장. 거의 끝까지 본 영상(마지막 5초 이내)은 처음부터 다시 보도록 지운다.
 */
export function saveResumePosition(key, currentTime, duration) {
  const ls = storage();
  if (!ls || !key) return;
  try {
    const t = Number(currentTime) || 0;
    const d = Number(duration) || 0;
    if (t < 3 || (d > 0 && d - t < 5)) ls.removeItem(POS_PREFIX + key);
    else ls.setItem(POS_PREFIX + key, String(Math.floor(t)));
  } catch { /* 무시 */ }
}

// ─── 길게 누른 뒤 드래그 제스처 ──────────────────────

/** 드래그 방향이 확정되기 전까지 무시할 이동 거리(px) */
export const GESTURE_AXIS_THRESHOLD = 8;

/**
 * 길게 누른 뒤의 첫 이동으로 제스처 축을 정한다.
 * 임계값 미만이면 null(아직 미정), 가로가 세로 이상이면 'x'(시간 이동), 아니면 'y'(볼륨/밝기).
 */
export function decideGestureAxis(dx, dy, threshold = GESTURE_AXIS_THRESHOLD) {
  const ax = Math.abs(Number(dx) || 0);
  const ay = Math.abs(Number(dy) || 0);
  if (Math.hypot(ax, ay) < threshold) return null;
  return ax >= ay ? 'x' : 'y';
}

/**
 * 세로 드래그가 시작된 위치가 화면의 어느 절반인지로 조절 대상을 정한다.
 * 왼쪽 절반 → 'brightness', 오른쪽 절반(정중앙 포함) → 'volume'.
 */
export function verticalGestureKind(x, left, width) {
  const w = Number(width) || 0;
  if (w <= 0) return 'volume';
  return (Number(x) || 0) - (Number(left) || 0) < w / 2 ? 'brightness' : 'volume';
}

/**
 * 세로 드래그 거리 → 조절값. 위로 끌면(dy < 0) 커지고, 화면 높이만큼 끌면 (max - min) 전체가 바뀐다.
 * 결과는 1% 단위로 반올림해 [min, max] 로 묶는다.
 */
export function dragToLevel(start, dy, height, min, max) {
  const h = Number(height) || 0;
  const span = max - min;
  const base = clamp(Number(start) || 0, min, max);
  if (h <= 0 || span <= 0) return base;
  const next = base + (-(Number(dy) || 0) / h) * span;
  return clamp(Math.round(next * 100) / 100, min, max);
}

// ─── 스크럽 중 탐색 스케줄러 ──────────────────────

/** 같은 목표로 다시 탐색하지 않을 최소 간격(초) */
export const SCRUB_MIN_STEP_SEC = 0.25;
/** seeked 가 이 시간(ms) 안에 오지 않으면 막혔다고 보고 다음 탐색을 그냥 보낸다 */
export const SCRUB_STALL_MS = 1200;

/**
 * 스크럽(좌우 드래그) 중 프레임이 실제로 갱신되도록 탐색을 한 번에 하나만 보낸다.
 *
 * HTML 표준의 seeking 알고리즘은 이전 탐색이 끝나기(seeked) 전에 currentTime 을 다시 쓰면 진행 중인 탐색을
 * 취소한다. 드래그마다 currentTime 을 대입하면 네트워크(Range 요청)·디코딩 지연이 그 간격보다 길 때 어떤
 * 프레임도 완료되지 못해 화면이 멈춘 채 숫자만 바뀐다. → 탐색 중이면 최신 목표만 기억해 두고, seeked 가 오면
 * 그 목표로 다시 보낸다. 스크럽 중에는 가능한 브라우저(Safari/Firefox)에서 키프레임 단위 `fastSeek` 로 빠르게
 * 근처 프레임을 보여 주고, `finish()` 에서 정확한 위치로 마무리한다(Chrome 은 fastSeek 미지원 → currentTime).
 *
 * @param video HTMLVideoElement (seeking, currentTime, fastSeek?, add/removeEventListener)
 * @returns { request(target) → boolean(실제로 보냈는지), finish(target), dispose() }
 */
export function createScrubSeeker(video, { minStep = SCRUB_MIN_STEP_SEC, stallMs = SCRUB_STALL_MS, now = Date.now } = {}) {
  let inFlight = false;
  let sentAt = 0;
  let lastSent = null;   // 마지막으로 보낸 목표
  let pending = null;    // 탐색 중에 들어온 최신 목표
  let attached = true;

  const send = (t) => {
    inFlight = true;
    sentAt = now();
    lastSent = t;
    if (typeof video.fastSeek === 'function') {
      try { video.fastSeek(t); return; } catch { /* 폴백 */ }
    }
    video.currentTime = t;
  };
  const tooClose = (t) => lastSent != null && Math.abs(t - lastSent) < minStep;
  const onSeeked = () => {
    inFlight = false;
    if (pending == null) return;
    const t = pending;
    pending = null;
    if (!tooClose(t)) send(t);
  };
  video.addEventListener('seeked', onSeeked);

  const dispose = () => {
    if (!attached) return;
    attached = false;
    pending = null;
    video.removeEventListener('seeked', onSeeked);
  };

  return {
    request(target) {
      const t = Number(target);
      if (!Number.isFinite(t)) return false;
      const busy = inFlight && now() - sentAt < stallMs;
      if (busy) { pending = t; return false; }
      if (tooClose(t)) return false;
      send(t);
      return true;
    },
    /** 드래그 종료: 대기열을 버리고 정확한 위치로 한 번만 탐색한다 */
    finish(target) {
      dispose();
      const t = Number(target);
      if (Number.isFinite(t)) video.currentTime = t;
    },
    dispose,
  };
}

/** 키보드 단축키를 무시해야 하는 타깃(입력 중)인지 */
export function isTypingTarget(target) {
  if (!target || typeof target !== 'object') return false;
  const tag = (target.tagName || '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return !!target.isContentEditable;
}
