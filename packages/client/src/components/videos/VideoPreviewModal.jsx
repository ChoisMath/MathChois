import { useEffect } from 'react';
import VideoPlayer from './VideoPlayer';
import { formatDuration, formatBytes } from '../../lib/videos';

/** 라이브러리 [미리보기] 모달 — 학급 시청 화면과 같은 VideoPlayer 를 쓴다. */
export default function VideoPreviewModal({ video, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!video) return null;
  const meta = [video.subject, video.majorUnit, video.minorUnit].filter(Boolean).join(' · ');

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-2" onClick={onClose}>
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[95dvh] flex flex-col p-3 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start gap-2 mb-2">
          <div className="min-w-0">
            <h3 className="font-bold truncate">{video.title}</h3>
            <p className="text-xs text-gray-500 truncate">
              {[meta, formatDuration(video.durationSec), formatBytes(video.fileSize)].filter(Boolean).join(' · ')}
            </p>
          </div>
          <button onClick={onClose} className="min-h-11 min-w-11 shrink-0 flex items-center justify-center" aria-label="닫기">✕</button>
        </div>
        <VideoPlayer
          src={video.videoUrl}
          poster={video.thumbnailUrl}
          title={video.title}
          storageKey={`lib:${video.id}`}
          autoPlay
        />
        {video.description && (
          <p className="text-sm text-gray-700 mt-3 whitespace-pre-wrap">{video.description}</p>
        )}
      </div>
    </div>
  );
}
