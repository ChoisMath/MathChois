/**
 * 영상 플레이어 설정/유틸 (순수 함수 — VideoPlayer.jsx 가 사용, Vitest 로 검증)
 *
 * - 설정은 기기별 localStorage(`mc_video_player`)에 저장: 방향키 이동 시간·배속·볼륨·음소거
 * - 마지막 재생 위치는 `mc_video_pos:<key>` 에 저장(설계 결정 Q4: v1 은 로컬 이어보기만)
 */

export const SEEK_STEPS = [10, 20, 30, 60];
export const PLAYBACK_RATES = [0.7, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5];
export const VOLUME_STEP = 0.05;

export const DEFAULT_SETTINGS = Object.freeze({
  seekStep: 10,
  playbackRate: 1.0,
  volume: 1,
  muted: false,
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
  };
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

/** 키보드 단축키를 무시해야 하는 타깃(입력 중)인지 */
export function isTypingTarget(target) {
  if (!target || typeof target !== 'object') return false;
  const tag = (target.tagName || '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return !!target.isContentEditable;
}
