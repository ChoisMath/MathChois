import { Clapperboard } from 'lucide-react';
import VideoPlayer from './VideoPlayer';
import { extractYouTubeId, getYouTubeEmbedUrl, getYouTubeThumbnail } from '../../lib/youtubeUtils';
import { isLibraryVideoUrl } from '../../lib/pageVideoUrl'; // 판별 유틸은 lib에 둠 (react-refresh 규칙상 여기서 재export 금지)

const YT_ALLOW = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';

/**
 * 챕터/과제 페이지의 영상 임베드.
 * - YouTube 링크 → 기존 iframe 임베드
 * - 영상자료 라이브러리(`/api/files/videos/library/...`) → 자체 VideoPlayer
 *
 * hotkeys: 라이브러리 플레이어의 window 단축키. 필기 도구가 있는 뷰어 안에서는
 * 키를 가로채지 않도록 기본 false.
 */
export function PageVideoEmbed({ videoUrl, title, className = 'w-full h-full', hotkeys = false }) {
  if (isLibraryVideoUrl(videoUrl)) {
    return (
      <div className={className}>
        <VideoPlayer src={videoUrl} title={title} storageKey={`page:${videoUrl}`} hotkeys={hotkeys} />
      </div>
    );
  }
  const videoId = extractYouTubeId(videoUrl);
  if (!videoId) {
    return (
      <div className={`${className} flex items-center justify-center text-sm text-gray-400`}>
        재생할 수 없는 영상 주소입니다.
      </div>
    );
  }
  return (
    <iframe
      src={getYouTubeEmbedUrl(videoId)}
      className={className}
      title={title}
      allow={YT_ALLOW}
      allowFullScreen
    />
  );
}

/**
 * 페이지 목록용 영상 썸네일.
 * YouTube는 기존처럼 <img>, 라이브러리 영상은 썸네일 URL이 없으므로 어두운 16:9 박스 + 아이콘.
 */
export function PageVideoThumb({
  videoUrl, alt = '', className = 'w-full h-auto object-cover bg-gray-900', loading = 'lazy', decoding, draggable, onError,
}) {
  const videoId = isLibraryVideoUrl(videoUrl) ? null : extractYouTubeId(videoUrl);
  if (!videoId) {
    return (
      <div className="w-full aspect-video flex items-center justify-center bg-gray-900" role="img" aria-label={alt}>
        <Clapperboard className="h-6 w-6 text-gray-400" />
      </div>
    );
  }
  return (
    <img
      src={getYouTubeThumbnail(videoId)}
      alt={alt}
      className={className}
      loading={loading}
      decoding={decoding}
      draggable={draggable}
      onError={onError}
    />
  );
}
