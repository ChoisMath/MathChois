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
  /** 등록된 자막 언어 코드(목록 CC 배지용) */
  subtitleLangs?: string[];
}

/** 영상자료 자막(언어별 1개) — `video_subtitles` */
export interface VideoSubtitle {
  id: string;
  lang: string;
  label: string;
  /** WebVTT 파일 URL (`/api/files/videos/subtitles/...vtt`) */
  url: string;
  cueCount: number;
  /** 마지막 문장이 끝나는 시각(초, 올림). 길이 경고용 — 이 컬럼이 생기기 전 행은 null */
  lastEnd: number | null;
  updatedAt: string;
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
  /** 연결된 필기 챕터 id (교사가 설정). 챕터 삭제 시 FK SET NULL */
  chapterId: string | null;
  /** 연결된 필기 챕터 (left join) — 없거나 삭제되면 null */
  chapter: { id: string; title: string } | null;
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

// ─── 시청 기록 (v2) ───────────────────────────────────

export interface VideoProgress {
  classroomVideoId: string;
  studentId: string;
  positionSec: number;
  maxPositionSec: number;
  completed: boolean;
  updatedAt: string;
}

/** 교사용: 학급 영상별 학생 시청 현황 */
export interface VideoProgressSummary {
  classroomVideoId: string;
  durationSec: number | null;
  students: {
    studentId: string;
    name: string | null;
    avatarUrl: string | null;
    positionSec: number;
    maxPositionSec: number;
    /** 0~100, durationSec 없으면 null */
    progressPct: number | null;
    completed: boolean;
    updatedAt: string | null;   // null = 시청 기록 없음
  }[];
  watchedCount: number;
  completedCount: number;
  totalStudents: number;
}

// ─── 댓글 미읽음 (v2) ─────────────────────────────────

/** 학급 영상별 미읽음 댓글 수 (본인이 쓰지 않은, 열람 가능한, lastSeenAt 이후 댓글) */
export interface VideoUnreadCounts {
  /** classroomVideoId → count */
  byClassroomVideo: Record<string, number>;
  total: number;
}

/** 사용자가 속한 모든 학급의 미읽음 댓글 수 (`GET /api/videos/unread`) */
export interface VideoUnreadByClassroom {
  /** classroomId → count */
  byClassroom: Record<string, number>;
  total: number;
}
