import { describe, it, expect } from 'vitest';
import { chapterTitleKey, hasSameChapterTitle } from '@mathchois/shared';

describe('chapterTitleKey', () => {
  it('앞뒤 공백을 빼고 안쪽 연속 공백은 하나로', () => {
    expect(chapterTitleKey('  1단원   함수의 극한 ')).toBe('1단원 함수의 극한');
  });
  it('조합형(NFD) 한글도 완성형과 같게 본다', () => {
    expect(chapterTitleKey('함수'.normalize('NFD'))).toBe(chapterTitleKey('함수'));
  });
  it('대소문자는 구분한다', () => {
    expect(chapterTitleKey('Ch1')).not.toBe(chapterTitleKey('ch1'));
  });
  it('null/undefined 는 빈 문자열', () => {
    expect(chapterTitleKey(null)).toBe('');
    expect(chapterTitleKey(undefined)).toBe('');
  });
});

describe('hasSameChapterTitle', () => {
  const chapters = [{ title: '수열' }, { title: '함수의 극한' }];
  it('공백만 다른 같은 이름이 있으면 true', () => {
    expect(hasSameChapterTitle(chapters, ' 함수의  극한')).toBe(true);
  });
  it('없으면 false', () => {
    expect(hasSameChapterTitle(chapters, '미분')).toBe(false);
    expect(hasSameChapterTitle([], '수열')).toBe(false);
  });
});
