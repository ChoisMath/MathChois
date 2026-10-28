/**
 * 접속 규칙 — 누가 교사이고 누가 학생인지, 이메일 명단을 어떻게 읽는지. 서버·클라이언트가 같은 규칙을 쓴다.
 *
 * - 교사는 관리자가 등록한 이메일(allowed_teachers)만. 그 외 모든 계정은 학생.
 * - 관리자(isAdmin)는 자동으로 역할을 바꾸지 않는다(관리자 패널에서 스스로 정한다).
 * - 이메일은 소문자·trim 으로 저장·비교한다.
 */

export type AccessRole = 'teacher' | 'student';

/** 한 요청에서 받는 이메일 최대 개수(관리자 교사 등록·학급 학생 사전 등록 공통) */
export const EMAIL_LIST_MAX = 200;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 소문자·trim. 비어 있거나 이메일 형식이 아니면 null. */
export function normalizeEmail(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase();
  if (!s || !EMAIL_RE.test(s)) return null;
  return s;
}

export interface ParsedEmailList {
  /** 정규화된 유효 이메일(중복 제거, 입력 순서) */
  valid: string[];
  /** 형식이 아닌 항목(입력 그대로, trim) */
  invalid: string[];
  /** 유효 이메일이 max 를 넘어 앞 max 개만 남겼으면 true */
  tooMany?: boolean;
}

/**
 * 붙여넣은 명단(쉼표·세미콜론·공백·줄바꿈 구분) 또는 문자열 배열을 유효/무효 이메일로 가른다.
 * 대소문자만 다른 중복은 하나로 본다.
 */
export function parseEmailList(
  input: string | readonly string[] | null | undefined,
  max: number = EMAIL_LIST_MAX,
): ParsedEmailList {
  if (input == null) return { valid: [], invalid: [] };
  const tokens = Array.isArray(input)
    ? (input as readonly string[]).flatMap((s) => String(s ?? '').split(/[\s,;]+/))
    : String(input).split(/[\s,;]+/);

  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const token of tokens) {
    const t = token.trim();
    if (!t) continue;
    const email = normalizeEmail(t);
    if (!email) { invalid.push(t); continue; }
    if (seen.has(email)) continue;
    seen.add(email);
    valid.push(email);
  }

  if (valid.length > max) {
    return { valid: valid.slice(0, max), invalid, tooMany: true };
  }
  return { valid, invalid };
}

/**
 * 역할 규칙.
 * - 관리자: 현재 역할 유지(아직 없으면 teacher).
 * - 허용 목록에 있으면 teacher.
 * - 그 외 student (예전에 teacher 였어도 내려간다).
 */
export function resolveRole(input: {
  isAdmin: boolean;
  currentRole: AccessRole | null | undefined;
  isAllowedTeacher: boolean;
}): AccessRole {
  if (input.isAdmin) return input.currentRole ?? 'teacher';
  return input.isAllowedTeacher ? 'teacher' : 'student';
}
