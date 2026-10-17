import { useEffect } from 'react';
import VideoPlayer from './VideoPlayer';
import CollapsibleSection from './CollapsibleSection';
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
      {/* 헤더는 고정, 본문(영상 + 설명)만 스크롤. 영상은 폭 기준 16:9 로 고정(shrink-0)되어 설명이 길어도 줄어들지 않는다. */}
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[95dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start gap-2 p-3 pb-2 shrink-0">
          <div className="min-w-0">
            <h3 className="font-bold truncate">{video.title}</h3>
            <p className="text-xs text-gray-500 truncate">
              {[meta, formatDuration(video.durationSec), formatBytes(video.fileSize)].filter(Boolean).join(' · ')}
            </p>
          </div>
          <button onClick={onClose} className="min-h-11 min-w-11 shrink-0 flex items-center justify-center" aria-label="닫기">✕</button>
        </div>
        <div className="overflow-y-auto px-3 pb-3 min-h-0">
          <div className="shrink-0">
            <VideoPlayer
              src={video.videoUrl}
              poster={video.thumbnailUrl}
              title={video.title}
              storageKey={`lib:${video.id}`}
              autoPlay
            />
          </div>
          {video.description && (
            <CollapsibleSection label="설명" className="mt-2">
              <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg px-3 py-2">{video.description}</p>
            </CollapsibleSection>
          )}
        </div>
      </div>
    </div>
  );
}
