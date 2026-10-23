import { describe, it, expect } from 'vitest';
import { inspectSubtitleText, readSubtitleFile } from './subtitleFile.js';

const ok = '1\n00:00:01,000 --> 00:01:05,000\n가\n';

describe('inspectSubtitleText', () => {
  it('정상: 문장 수와 마지막 끝', () => {
    expect(inspectSubtitleText(ok, 120)).toEqual({ ok: true, cueCount: 1, lastEnd: 65 });
  });

  it('영상보다 5초 넘게 길면 경고(저장 가능)', () => {
    expect(inspectSubtitleText(ok, 59)).toMatchObject({
      ok: true, warning: '자막이 영상보다 깁니다. 다른 영상의 자막이 아닌지 확인하세요.',
    });
    expect(inspectSubtitleText(ok, 60).warning).toBeUndefined(); // 정확히 5초는 허용
    expect(inspectSubtitleText(ok, null).warning).toBeUndefined();
  });

  it('문장 없음 / 깨진 인코딩', () => {
    expect(inspectSubtitleText('메모', 10))
      .toMatchObject({ ok: false, error: '자막 문장을 찾을 수 없습니다. SRT/VTT 파일인지 확인하세요.' });
    expect(inspectSubtitleText('��\n00:00:01,000 --> 00:00:02,000\n��', 10))
      .toMatchObject({ ok: false, error: 'UTF-8로 저장된 자막 파일만 올릴 수 있습니다.' });
  });
});

describe('readSubtitleFile', () => {
  it('확장자·크기 검사 후 내용 검사', async () => {
    expect(await readSubtitleFile(new File([ok], 'a.txt'), 120))
      .toMatchObject({ ok: false, error: 'SRT 또는 VTT 자막 파일만 올릴 수 있습니다.' });
    expect(await readSubtitleFile(new File(['a'.repeat(2 * 1024 * 1024 + 1)], 'a.srt'), 120))
      .toMatchObject({ ok: false, error: '자막 파일이 너무 큽니다. 최대 2MB 까지 올릴 수 있습니다.' });
    expect(await readSubtitleFile(new File([ok], 'a.SRT'), 120)).toEqual({ ok: true, cueCount: 1, lastEnd: 65 });
  });
});
