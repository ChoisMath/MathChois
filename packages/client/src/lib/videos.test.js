import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildVideoQuery, formatBytes, formatDuration, progressPercent, subtitleQueryUrl, getVideoSubtitlesCached,
  deleteVideoSubtitle,
} from './videos.js';

describe('videos lib', () => {
  it('builds query strings skipping empty values', () => {
    expect(buildVideoQuery({ q: '원', subject: '', mine: 1, page: 2, minorUnit: undefined, x: false }))
      .toBe('q=%EC%9B%90&mine=1&page=2');
    expect(buildVideoQuery()).toBe('');
  });

  it('formats bytes', () => {
    expect(formatBytes(512)).toBe('512B');
    expect(formatBytes(2048)).toBe('2KB');
    expect(formatBytes(3.5 * 1024 * 1024)).toBe('3.5MB');
    expect(formatBytes(1.5 * 1024 ** 3)).toBe('1.50GB');
  });

  it('formats durations', () => {
    expect(formatDuration(null)).toBe('');
    expect(formatDuration(59)).toBe('0:59');
    expect(formatDuration(600)).toBe('10:00');
    expect(formatDuration(3661)).toBe('1:01:01');
  });

  it('computes progress percent', () => {
    expect(progressPercent(30, 100)).toBe(30);
    expect(progressPercent(33, 100)).toBe(33);
    expect(progressPercent(150, 100)).toBe(100);
    expect(progressPercent(-5, 100)).toBe(0);
    expect(progressPercent(10, 0)).toBeNull();
    expect(progressPercent(10, null)).toBeNull();
    expect(progressPercent(undefined, 60)).toBe(0);
  });
});

describe('subtitleQueryUrl', () => {
  it('한글·공백 URL 을 인코딩', () => {
    expect(subtitleQueryUrl('/api/files/videos/library/1_이차 함수.mp4'))
      .toBe('/api/video-subtitles?videoUrl=%2Fapi%2Ffiles%2Fvideos%2Flibrary%2F1_%EC%9D%B4%EC%B0%A8%20%ED%95%A8%EC%88%98.mp4');
  });
});

describe('getVideoSubtitlesCached', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('빈 목록은 캐시하지 않는다 — 교사가 나중에 올린 자막이 다시 열 때 보인다', async () => {
    const track = { id: 't1', lang: 'ko', label: '한국어', url: '/api/files/videos/subtitles/1_v_ko.vtt', cueCount: 1, updatedAt: '' };
    const responses = [[], [track]];
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(responses.shift()), { status: 200 })));
    expect(await getVideoSubtitlesCached('/api/files/videos/library/1_a.mp4')).toEqual([]);
    expect(await getVideoSubtitlesCached('/api/files/videos/library/1_a.mp4')).toEqual([track]);
  });
});

describe('deleteVideoSubtitle', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('이미 지워진 자막(404)은 성공으로 본다 — 다른 탭에서 먼저 지운 경우', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"자막을 찾을 수 없습니다"}', { status: 404 })));
    await expect(deleteVideoSubtitle('v1', 'ko')).resolves.toBeUndefined();
  });

  it('그 밖의 오류는 그대로 던진다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"수정 권한이 없습니다"}', { status: 403 })));
    await expect(deleteVideoSubtitle('v1', 'ko')).rejects.toMatchObject({ status: 403 });
  });
});
