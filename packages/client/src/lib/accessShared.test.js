import { describe, it, expect } from 'vitest';
import { normalizeEmail, parseEmailList, resolveRole, EMAIL_LIST_MAX } from '@mathchois/shared';

describe('normalizeEmail', () => {
  it('소문자·trim', () => {
    expect(normalizeEmail('  Kim.Student@Gmail.com ')).toBe('kim.student@gmail.com');
  });
  it('형식이 아니면 null', () => {
    expect(normalizeEmail('')).toBeNull();
    expect(normalizeEmail('   ')).toBeNull();
    expect(normalizeEmail('no-at-sign')).toBeNull();
    expect(normalizeEmail('a@b')).toBeNull();
    expect(normalizeEmail('a b@c.com')).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
  });
});

describe('parseEmailList', () => {
  it('쉼표·공백·줄바꿈·세미콜론으로 나누고 유효/무효를 가른다', () => {
    const { valid, invalid } = parseEmailList('A@x.com, b@y.org\nc@z.net;  bad-one\n\n d@w.io ');
    expect(valid).toEqual(['a@x.com', 'b@y.org', 'c@z.net', 'd@w.io']);
    expect(invalid).toEqual(['bad-one']);
  });
  it('중복은 하나로(대소문자 무시)', () => {
    const { valid } = parseEmailList('a@x.com A@X.COM a@x.com');
    expect(valid).toEqual(['a@x.com']);
  });
  it('배열 입력도 받는다', () => {
    expect(parseEmailList(['a@x.com', ' B@y.com ', 'nope']).valid).toEqual(['a@x.com', 'b@y.com']);
    expect(parseEmailList(['a@x.com', 'nope']).invalid).toEqual(['nope']);
  });
  it('빈 입력', () => {
    expect(parseEmailList('')).toEqual({ valid: [], invalid: [] });
    expect(parseEmailList(undefined)).toEqual({ valid: [], invalid: [] });
  });
  it('최대 개수를 넘으면 tooMany 와 함께 앞 N개만', () => {
    const many = Array.from({ length: EMAIL_LIST_MAX + 5 }, (_, i) => `u${i}@x.com`).join('\n');
    const r = parseEmailList(many);
    expect(r.valid).toHaveLength(EMAIL_LIST_MAX);
    expect(r.tooMany).toBe(true);
    expect(parseEmailList('a@x.com').tooMany).toBeFalsy();
  });
});

describe('resolveRole', () => {
  it('관리자는 현재 역할을 유지한다(없으면 teacher)', () => {
    expect(resolveRole({ isAdmin: true, currentRole: 'student', isAllowedTeacher: false })).toBe('student');
    expect(resolveRole({ isAdmin: true, currentRole: 'teacher', isAllowedTeacher: false })).toBe('teacher');
    expect(resolveRole({ isAdmin: true, currentRole: null, isAllowedTeacher: false })).toBe('teacher');
  });
  it('허용 목록에 있으면 teacher', () => {
    expect(resolveRole({ isAdmin: false, currentRole: null, isAllowedTeacher: true })).toBe('teacher');
    expect(resolveRole({ isAdmin: false, currentRole: 'student', isAllowedTeacher: true })).toBe('teacher');
  });
  it('그 외는 student — 기존 teacher 도 내려간다', () => {
    expect(resolveRole({ isAdmin: false, currentRole: null, isAllowedTeacher: false })).toBe('student');
    expect(resolveRole({ isAdmin: false, currentRole: 'teacher', isAllowedTeacher: false })).toBe('student');
    expect(resolveRole({ isAdmin: false, currentRole: 'student', isAllowedTeacher: false })).toBe('student');
  });
});
