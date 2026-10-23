/**
 * 영상자료 자막 — SRT/WebVTT 파싱과 WebVTT 직렬화(순수 함수).
 * 서버(업로드 검증·VTT 정규화)와 클라이언트(업로드 전 확인·플레이어 오버레이)가 같은 규칙을 쓴다.
 * 설계: docs/superpowers/specs/2026-10-22-video-subtitles-design.md
 */

/** 자막 한 문장. 시각은 초 단위, text 는 줄바꿈(\n)을 포함한 평문(태그 없음). */
export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

/** 지원 언어. 번역 자막을 열 때는 이 목록만 늘린다. */
export const SUBTITLE_LANGS: ReadonlyArray<{ code: string; label: string }> = [
  { code: 'ko', label: '한국어' },
];

export function isSubtitleLang(code: string): boolean {
  return SUBTITLE_LANGS.some((l) => l.code === code);
}

/** 언어 표시 이름(모르는 코드는 코드 그대로) */
export function subtitleLangLabel(code: string): string {
  return SUBTITLE_LANGS.find((l) => l.code === code)?.label ?? code;
}

export const MAX_SUBTITLE_BYTES = 2 * 1024 * 1024;
export const SUBTITLE_EXT_RE = /\.(srt|vtt)$/i;

const TIME_RE = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})$/;
const SKIP_BLOCK_RE = /^(WEBVTT|NOTE|STYLE|REGION)(\s|$)/;
// 알려진 서식 태그만 지운다. SRT 는 < > 를 이스케이프하지 않으므로 `x < 3`, `<a, b>` 같은 수식은 남겨야 한다.
const MARKUP_TAG_RE = /<\/?(?:b|i|u|c|v|lang|ruby|rt|font)(?=[\s.>])[^>]*>/gi;
const INLINE_TIMESTAMP_RE = /<(?:\d+:)?\d{1,2}:\d{2}\.\d{3}>/g;

/** "hh:mm:ss,mmm" / "mm:ss.m" → 초. 형식이 아니면 null */
function parseTime(raw: string): number | null {
  const m = TIME_RE.exec(raw.trim());
  if (!m) return null;
  const [, h, mm, ss, ms] = m;
  const millis = Number(ms!.padEnd(3, '0'));
  return Number(h ?? 0) * 3600 + Number(mm) * 60 + Number(ss) + millis / 1000;
}

/** 서식 태그·엔티티 제거. `&amp;` 는 마지막에 풀어 `&amp;lt;` 가 `<` 로 두 번 풀리지 않게 한다. */
function cleanLine(line: string): string {
  return line
    .replace(MARKUP_TAG_RE, '')
    .replace(INLINE_TIMESTAMP_RE, '')
    .replace(/\{\\[^}]*\}/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lrm;|&rlm;/g, '')
    .replace(/&amp;/g, '&')
    .trim();
}

/** SRT/VTT 텍스트 → 시작 시각 순 cue 배열. 읽을 수 없는 블록은 건너뛴다. */
export function parseSubtitles(text: string): SubtitleCue[] {
  const normalized = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const cues: SubtitleCue[] = [];
  for (const block of normalized.split(/\n[ \t]*\n/)) {
    const lines = block.split('\n');
    if (SKIP_BLOCK_RE.test(lines[0]?.trim() ?? '')) continue;
    // 문장 사이 빈 줄이 빠진 잘못된 SRT 는 한 블록에 타임코드 줄이 여러 개 — 줄마다 문장으로 나눈다
    const timeIdxs = lines.flatMap((l, i) => (l.includes('-->') ? [i] : []));
    for (let k = 0; k < timeIdxs.length; k += 1) {
      const timeIdx = timeIdxs[k]!;
      const [left, right = ''] = lines[timeIdx]!.split('-->');
      const start = parseTime(left!);
      // 오른쪽은 "00:00:03.500 align:start" 처럼 VTT 설정이 붙을 수 있다
      const end = parseTime(right.trim().split(/\s+/)[0] ?? '');
      if (start == null || end == null || end <= start) continue;
      let bodyEnd = timeIdxs[k + 1] ?? lines.length;
      // 다음 타임코드 바로 앞의 번호 줄(SRT 순번·VTT cue id)은 본문이 아니다
      if (bodyEnd < lines.length && bodyEnd - 1 > timeIdx && /^\s*\d+\s*$/.test(lines[bodyEnd - 1]!)) bodyEnd -= 1;
      const body = lines.slice(timeIdx + 1, bodyEnd).map(cleanLine).filter(Boolean).join('\n');
      if (!body) continue;
      cues.push({ start, end, text: body });
    }
  }
  // Array.prototype.sort 는 안정 정렬 — 같은 시작이면 원래 순서 유지
  return cues.sort((a, b) => a.start - b.start);
}

function formatVttTime(sec: number): string {
  const total = Math.max(0, Math.round(sec * 1000));
  const ms = total % 1000;
  const s = Math.floor(total / 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}.${pad(ms, 3)}`;
}

function escapeVttLine(line: string): string {
  return line
    .replace(/-->/g, '->')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** cue 배열 → WebVTT 문서. 본문의 빈 줄(VTT 에서 cue 종료)은 없앤다. */
export function toWebVtt(cues: SubtitleCue[]): string {
  const blocks = cues.map((c) => {
    const body = c.text.split('\n').map((l) => l.trim()).filter(Boolean).map(escapeVttLine).join('\n');
    return `${formatVttTime(c.start)} --> ${formatVttTime(c.end)}\n${body}`;
  });
  return `WEBVTT\n\n${blocks.join('\n\n')}\n`;
}

/**
 * time 에 보여야 할 cue 들(시작 포함·끝 제외, 겹치면 여러 개).
 * 앞서 시작한 긴 cue 도 잡도록 전체를 선형으로 거른다(수천 개 × 초당 4회로 충분).
 */
export function activeCues(cues: SubtitleCue[], time: number): SubtitleCue[] {
  return cues.filter((c) => c.start <= time && time < c.end);
}

/**
 * UTF-8 이 아닌 파일(CP949 등)을 UTF-8 로 읽었는지: 대체 문자(U+FFFD)가 하나라도 있으면 그렇다고 본다.
 * 비율로 재면 번호·타임코드(ASCII)가 희석해 한국어가 적은 수식 위주 자막이 통과하고 깨진 채 저장된다.
 * 정상 UTF-8 자막에 U+FFFD 가 들어 있는 경우는 사실상 없다.
 */
export function isLikelyMisdecoded(text: string): boolean {
  return text.includes('\uFFFD');
}
