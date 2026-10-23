/**
 * 자막 파일 업로드 전 로컬 검사 (서버 규칙과 동일 — @mathchois/shared 파서 사용).
 * 결과: { ok, error?, cueCount, lastEnd, warning? } — warning 이 있어도 저장은 가능하다.
 */
import {
  parseSubtitles, isLikelyMisdecoded, MAX_SUBTITLE_BYTES, SUBTITLE_EXT_RE,
} from '@mathchois/shared';

/** 영상 길이보다 이만큼(초) 넘게 긴 자막은 다른 영상의 자막일 수 있어 경고한다 */
const LENGTH_TOLERANCE_SEC = 5;

export function inspectSubtitleText(text, durationSec) {
  if (isLikelyMisdecoded(text)) {
    return { ok: false, error: 'UTF-8로 저장된 자막 파일만 올릴 수 있습니다.', cueCount: 0, lastEnd: 0 };
  }
  const cues = parseSubtitles(text);
  if (!cues.length) {
    return { ok: false, error: '자막 문장을 찾을 수 없습니다. SRT/VTT 파일인지 확인하세요.', cueCount: 0, lastEnd: 0 };
  }
  const lastEnd = cues.reduce((m, c) => Math.max(m, c.end), 0);
  const result = { ok: true, cueCount: cues.length, lastEnd };
  if (durationSec != null && lastEnd > Number(durationSec) + LENGTH_TOLERANCE_SEC) {
    result.warning = '자막이 영상보다 깁니다. 다른 영상의 자막이 아닌지 확인하세요.';
  }
  return result;
}

/** 파일 확장자·크기 검사 후 내용을 UTF-8 로 읽어 검사한다 */
export async function readSubtitleFile(file, durationSec) {
  if (!SUBTITLE_EXT_RE.test(file.name)) {
    return { ok: false, error: 'SRT 또는 VTT 자막 파일만 올릴 수 있습니다.', cueCount: 0, lastEnd: 0 };
  }
  if (file.size > MAX_SUBTITLE_BYTES) {
    return { ok: false, error: '자막 파일이 너무 큽니다. 최대 2MB 까지 올릴 수 있습니다.', cueCount: 0, lastEnd: 0 };
  }
  return inspectSubtitleText(await file.text(), durationSec);
}
