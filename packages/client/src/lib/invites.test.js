import { describe, it, expect } from 'vitest';
import { summarizeInviteResult, summarizeAllowedTeachersResult } from './invites';

describe('summarizeInviteResult', () => {
  it('참여·대기·건너뜀(이유 묶음)·형식 오류를 한 줄로', () => {
    expect(summarizeInviteResult({
      joined: ['a@x.com', 'b@x.com'],
      invited: ['c@x.com'],
      skipped: [{ email: 'd@x.com', reason: 'member' }, { email: 'e@x.com', reason: 'member' }, { email: 'f@x.com', reason: 'teacher' }],
      invalid: ['bad'],
    })).toBe('2명 바로 참여 · 1명 가입 대기 · 3명 건너뜀(이미 참여, 교사 계정) · 1개 형식 오류');
  });
  it('비어 있으면 안내 문구', () => {
    expect(summarizeInviteResult({})).toBe('처리한 이메일이 없습니다.');
    expect(summarizeInviteResult({ joined: [], invited: [], skipped: [] })).toBe('처리한 이메일이 없습니다.');
  });
  it('모르는 이유는 그대로 보여 준다', () => {
    expect(summarizeInviteResult({ skipped: [{ email: 'a@x.com', reason: 'odd' }] })).toBe('1명 건너뜀(odd)');
  });
});

describe('summarizeAllowedTeachersResult', () => {
  it('등록·이미 등록·형식 오류', () => {
    expect(summarizeAllowedTeachersResult({ added: ['a@x.com'], existing: ['b@x.com', 'c@x.com'], invalid: ['x'] }))
      .toBe('1명 등록 · 2명 이미 등록됨 · 1개 형식 오류');
    expect(summarizeAllowedTeachersResult({ added: [] })).toBe('처리한 이메일이 없습니다.');
  });
});
