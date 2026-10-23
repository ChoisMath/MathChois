import { useEffect, useState } from 'react';
import { isLibraryVideoUrl } from '../lib/pageVideoUrl';
import { getVideoSubtitlesCached, getSubtitleCuesCached } from '../lib/videos';
import { pickSubtitleTrack } from '../lib/videoPlayer';

const EMPTY = [];

/**
 * 재생 화면용 자막 로딩.
 * - 영상자료 라이브러리 URL 일 때만 자막 목록을 조회한다(로컬 Blob 미리보기·YouTube 는 없음).
 * - enabled 가 false 면 문장(VTT)은 받지 않는다 — 트랙 목록은 CC 버튼 표시용으로 받는다.
 * - 실패하면 자막 없이 재생한다.
 *
 * @returns {{ tracks: import('@mathchois/shared').VideoSubtitle[], track: object|null, cues: import('@mathchois/shared').SubtitleCue[]|null }}
 */
export default function useVideoSubtitles(src, { enabled, lang }) {
  const library = isLibraryVideoUrl(src);
  // 늦게 온 응답이 다른 영상에 섞이지 않도록 결과에 요청 키를 함께 둔다
  const [list, setList] = useState({ src: null, tracks: EMPTY });
  const [loaded, setLoaded] = useState({ url: null, cues: null });

  useEffect(() => {
    if (!library) return undefined;
    let alive = true;
    getVideoSubtitlesCached(src).then((tracks) => { if (alive) setList({ src, tracks }); });
    return () => { alive = false; };
  }, [library, src]);

  const tracks = library && list.src === src ? list.tracks : EMPTY;
  const track = pickSubtitleTrack(tracks, lang);
  const trackUrl = enabled ? track?.url ?? null : null;

  useEffect(() => {
    if (!trackUrl) return undefined;
    let alive = true;
    getSubtitleCuesCached(trackUrl).then((cues) => { if (alive) setLoaded({ url: trackUrl, cues }); });
    return () => { alive = false; };
  }, [trackUrl]);

  return { tracks, track, cues: trackUrl && loaded.url === trackUrl ? loaded.cues : null };
}
