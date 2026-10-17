// ─── 영상자료 라이브러리 (교사 간 공유) ───────────────

export interface Video {
  id: string;
  createdBy: string;
  title: string;
  subject: string | null;
  majorUnit: string | null;
  minorUnit: string | null;
  description: string | null;
  videoUrl: string;
  thumbnailUrl: string | null;
  mimeType: string | null;
  fileSize: number | null;
  durationSec: number | null;
  createdAt: string;
  updatedAt: string;
  /** 목록 조회 시 조인되는 등록 교사 이름 */
  createdByName?: string | null;
}

export interface VideoListResult {
  items: Video[];
  total: number;
  page: number;
  pageSize: number;
}

export interface VideoFacets {
  subject: string[];
  majorUnit: string[];
  minorUnit: string[];
}

export interface VideoFilters {
  q?: string;
  subject?: string;
  majorUnit?: string;
  minorUnit?: string;
  mine?: boolean;
  page?: number;
  pageSize?: number;
}

/** 라이브러리 영상의 학급 배정 현황 (삭제 차단 안내용) */
export interface VideoUsage {
  classrooms: { classroomVideoId: string; classroomId: string; classroomName: string }[];
}

/** 업로드 응답 (`POST /api/videos/upload`) */
export interface VideoUploadResult {
  url: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

// ─── 학급 배정 영상 ───────────────────────────────────

export interface ClassroomVideo {
  id: string;
  classroomId: string;
  videoId: string;
  addedBy: string | null;
  note: string | null;
  position: number;
  createdAt: string;
  video: Video;
  commentCount: number;
}

export interface ClassroomVideoDetail extends ClassroomVideo {
  classroom: { id: string; name: string; teacherId: string };
  /** 같은 학급의 다른 영상(재생목록 패널용) */
  siblings: ClassroomVideo[];
}

// ─── 댓글 ────────────────────────────────────────────

export interface VideoComment {
  id: string;
  classroomVideoId: string;
  authorId: string;
  parentId: string | null;
  content: string;
  isPrivate: boolean;
  timestampSec: number | null;
  createdAt: string;
  updatedAt: string;
  author: { id: string; name: string | null; avatarUrl: string | null; role: 'teacher' | 'student' | null };
}

/** 루트 댓글 + 대댓글(깊이 1) */
export interface VideoCommentThread extends VideoComment {
  replies: VideoComment[];
}

// ─── 플레이어 설정 (클라이언트 localStorage) ─────────

export type SeekStep = 10 | 20 | 30 | 60;

export interface VideoPlayerSettings {
  seekStep: SeekStep;
  playbackRate: number;
  volume: number;   // 0~1
  muted: boolean;
}
