import { describe, it, expect } from 'vitest';
import { splitLinkSegments } from './linkify.js';

describe('splitLinkSegments', () => {
  it('returns empty array for empty input', () => {
    expect(splitLinkSegments('')).toEqual([]);
  });

  it('returns single text segment when no url', () => {
    expect(splitLinkSegments('링크 없는 글')).toEqual([{ type: 'text', value: '링크 없는 글' }]);
  });

  it('splits http/https urls into link segments', () => {
    expect(splitLinkSegments('보기 https://a.com 끝')).toEqual([
      { type: 'text', value: '보기 ' },
      { type: 'link', value: 'https://a.com', href: 'https://a.com' },
      { type: 'text', value: ' 끝' },
    ]);
  });

  it('prepends https:// to www-prefixed urls', () => {
    const segs = splitLinkSegments('www.naver.com');
    expect(segs).toEqual([{ type: 'link', value: 'www.naver.com', href: 'https://www.naver.com' }]);
  });

  it('keeps trailing sentence punctuation out of the url', () => {
    expect(splitLinkSegments('자료: https://a.com/b, 참고.')).toEqual([
      { type: 'text', value: '자료: ' },
      { type: 'link', value: 'https://a.com/b', href: 'https://a.com/b' },
      { type: 'text', value: ', 참고.' },
    ]);
  });

  it('strips a wrapping close paren but keeps balanced ones in the url', () => {
    expect(splitLinkSegments('(https://a.com)')).toEqual([
      { type: 'text', value: '(' },
      { type: 'link', value: 'https://a.com', href: 'https://a.com' },
      { type: 'text', value: ')' },
    ]);
    const wiki = splitLinkSegments('https://en.wikipedia.org/wiki/Foo_(bar)');
    expect(wiki).toEqual([
      { type: 'link', value: 'https://en.wikipedia.org/wiki/Foo_(bar)', href: 'https://en.wikipedia.org/wiki/Foo_(bar)' },
    ]);
  });

  it('handles multiple urls in one text', () => {
    const segs = splitLinkSegments('http://a.com 그리고 www.b.com.');
    expect(segs).toEqual([
      { type: 'link', value: 'http://a.com', href: 'http://a.com' },
      { type: 'text', value: ' 그리고 ' },
      { type: 'link', value: 'www.b.com', href: 'https://www.b.com' },
      { type: 'text', value: '.' },
    ]);
  });
});
