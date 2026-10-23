import { describe, it, expect } from 'vitest';
import {
  parseSubtitles, toWebVtt, activeCues, isLikelyMisdecoded,
  SUBTITLE_LANGS, isSubtitleLang, subtitleLangLabel,
} from '@mathchois/shared';

const SRT = '﻿1\r\n00:00:01,000 --> 00:00:03,500\r\n안녕하세요\r\n<i>수학</i> 시간\r\n\r\n2\r\n00:00:04,000 --> 00:00:05,000\r\n마지막';

describe('parseSubtitles', () => {
  it('SRT: BOM·CRLF·번호·태그, 마지막 빈 줄 없음', () => {
    expect(parseSubtitles(SRT)).toEqual([
      { start: 1, end: 3.5, text: '안녕하세요\n수학 시간' },
      { start: 4, end: 5, text: '마지막' },
    ]);
  });

  it('VTT: 헤더·NOTE·STYLE·cue id·설정·시 생략·밀리초 1~3자리', () => {
    const vtt = 'WEBVTT - 제목\n\nNOTE 메모\n줄\n\nSTYLE\n::cue { color: red }\n\nintro\n01:02.5 --> 01:04.25 align:start line:0\n<v 선생님>a &amp; b&nbsp;c</v>\n';
    expect(parseSubtitles(vtt)).toEqual([{ start: 62.5, end: 64.25, text: 'a & b c' }]);
  });

  it('태그 제거: <c.x>, 인라인 타임스탬프, <font>, {\\an8}', () => {
    const t = '1\n00:00:00,000 --> 00:00:01,000\n{\\an8}<font color="#fff"><c.yellow>가</c><00:00:00.500>나</font>\n';
    expect(parseSubtitles(t)[0].text).toBe('가나');
  });

  it('&amp; 는 마지막에 풀어서 &amp;lt; 가 < 로 바뀌지 않는다', () => {
    const t = '00:00:00.000 --> 00:00:01.000\n&amp;lt;\n';
    expect(parseSubtitles(t)[0].text).toBe('&lt;');
  });

  it('잘못된 블록·end<=start·빈 본문은 버리고 시작 순으로 정렬(같으면 원래 순서)', () => {
    const t = '00:00:05.000 --> 00:00:06.000\nB\n\n쓰레기\n\n00:00:02.000 --> 00:00:02.000\n0길이\n\n00:00:03.000 --> 00:00:04.000\n\n\n00:00:01.000 --> 00:00:02.000\nA1\n\n00:00:01.000 --> 00:00:09.000\nA2\n';
    expect(parseSubtitles(t).map((c) => c.text)).toEqual(['A1', 'A2', 'B']);
  });

  it('빈 문자열·자막 아닌 텍스트 → []', () => {
    expect(parseSubtitles('')).toEqual([]);
    expect(parseSubtitles('그냥 메모입니다')).toEqual([]);
  });
});

describe('toWebVtt', () => {
  it('헤더·hh:mm:ss.mmm·이스케이프, 왕복 동일', () => {
    const cues = [{ start: 3661.5, end: 3662, text: 'a < b & c\n둘째 줄' }];
    const out = toWebVtt(cues);
    expect(out.startsWith('WEBVTT\n\n01:01:01.500 --> 01:01:02.000\na &lt; b &amp; c\n둘째 줄\n')).toBe(true);
    expect(parseSubtitles(out)).toEqual(cues);
    expect(parseSubtitles(toWebVtt(parseSubtitles(SRT)))).toEqual(parseSubtitles(SRT));
  });

  it('본문 안 빈 줄과 --> 가 문서를 깨지 않는다', () => {
    const out = toWebVtt([{ start: 0, end: 1, text: 'a\n\nb --> c' }]);
    expect(parseSubtitles(out)).toEqual([{ start: 0, end: 1, text: 'a\nb -> c' }]);
  });
});

describe('activeCues', () => {
  it('시작 포함·끝 제외, 앞서 시작한 긴 문장과 겹침', () => {
    const cues = [{ start: 0, end: 100, text: '긴' }, { start: 10, end: 12, text: '짧' }, { start: 12, end: 13, text: '다음' }];
    expect(activeCues(cues, 11).map((c) => c.text)).toEqual(['긴', '짧']);
    expect(activeCues(cues, 12).map((c) => c.text)).toEqual(['긴', '다음']);
    expect(activeCues(cues, 100)).toEqual([]);
    expect(activeCues([], 5)).toEqual([]);
  });
});

describe('isLikelyMisdecoded', () => {
  it('대체 문자(\\uFFFD)가 공백 아닌 글자의 5% 이상', () => {
    expect(isLikelyMisdecoded('정상 자막 텍스트')).toBe(false);
    expect(isLikelyMisdecoded('��� abc')).toBe(true);
    expect(isLikelyMisdecoded('a'.repeat(99) + '�')).toBe(false); // 1%
    expect(isLikelyMisdecoded('')).toBe(false);
  });
});

describe('SUBTITLE_LANGS', () => {
  it('한국어만 지원, 모르는 코드는 그대로 표시', () => {
    expect(SUBTITLE_LANGS.map((l) => l.code)).toEqual(['ko']);
    expect(isSubtitleLang('ko')).toBe(true);
    expect(isSubtitleLang('xx')).toBe(false);
    expect(subtitleLangLabel('ko')).toBe('한국어');
    expect(subtitleLangLabel('xx')).toBe('xx');
  });
});
