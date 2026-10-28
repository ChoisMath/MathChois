import { describe, it, expect } from 'vitest';
import { canUseAiHub, aiHubAbilities, creditText, creditLine, ORIGINAL_BADGE, OPPADU } from '@mathchois/shared';

describe('ai-hub access', () => {
  it.each([
    [{ role: null, isAdmin: false, allowedClassroomCount: 0 }, false],
    [{ role: 'student', isAdmin: false, allowedClassroomCount: 0 }, false],
    [{ role: 'student', isAdmin: false, allowedClassroomCount: 1 }, true],
    [{ role: 'teacher', isAdmin: false, allowedClassroomCount: 0 }, true],
    [{ role: 'student', isAdmin: true, allowedClassroomCount: 0 }, true],
  ])('canUseAiHub(%o) = %s', (a, ok) => expect(canUseAiHub(a)).toBe(ok));
  it('abilities', () => {
    expect(aiHubAbilities({ role: null, isAdmin: false, allowedClassroomCount: 0 })).toEqual({ allowed: false, canEdit: false, canEditOriginal: false });
    expect(aiHubAbilities({ role: 'student', isAdmin: false, allowedClassroomCount: 1 })).toEqual({ allowed: true, canEdit: false, canEditOriginal: false });
    expect(aiHubAbilities({ role: 'teacher', isAdmin: false, allowedClassroomCount: 0 })).toEqual({ allowed: true, canEdit: true, canEditOriginal: false });
    expect(aiHubAbilities({ role: 'teacher', isAdmin: true, allowedClassroomCount: 0 })).toEqual({ allowed: true, canEdit: true, canEditOriginal: true });
  });
});

describe('ai-hub source credit', () => {
  it('creditText pieces per tab', () => {
    expect(creditText('motion')).toEqual({ lead: '출처', gallery: '오빠두엑셀 「모션 스타일 갤러리」', tail: '원본 예시·프롬프트', href: OPPADU.motion });
    expect(creditText('slide').gallery).toBe('오빠두엑셀 「슬라이드 스타일 갤러리」');
    expect(creditText('brand')).toEqual({ lead: '출처', gallery: '오빠두엑셀 「브랜드 룩북」', tail: '원본 예시·프롬프트', href: 'https://www.oppadu.com/ai/design-systems-site/' });
  });
  it('creditLine and badge', () => {
    expect(creditLine('motion')).toBe('© oppadu.com/ai 의 자료를 가공하거나 출처를 밝혀 옮긴 것입니다.');
    expect(creditLine('slide')).toBe('© oppadu.com/ai 의 자료를 가공하거나 출처를 밝혀 옮긴 것입니다.');
    expect(creditLine('brand')).toBe('© oppadu.com/ai 에서 옮겨온 자료입니다.');
    expect(ORIGINAL_BADGE).toBe('원본');
  });
});
