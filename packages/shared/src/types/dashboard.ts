export interface DashboardUnit {
  id: string;
  title: string;
  position: number;
}

export interface DashboardChapter {
  id: string;
  title: string;
  totalPages: number;
  /** 소속 단원 (null = 미지정) */
  unitId: string | null;
  position: number;
}

/** 학급 영상 — id 는 classroom_videos.id (video_progress 가 가리키는 키) */
export interface DashboardVideo {
  id: string;
  title: string;
  unitId: string | null;
  durationSec: number | null;
  position: number;
}

export interface DashboardVideoCell {
  maxPositionSec: number;
  completed: boolean;
}

export interface DashboardCell {
  attempts: number;
  correct: number;
  notedPages: number;
}

export interface DashboardStudent {
  studentId: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  overall: { attempts: number; correct: number };
  /** 챕터 id → 셀 */
  cells: Record<string, DashboardCell>;
  /** 학급 영상 id → 시청 기록 (기록 없는 영상은 키 없음) */
  videoCells: Record<string, DashboardVideoCell>;
}

export interface ClassroomDashboard {
  /** 숨김 단원 포함(교사 화면) — position 순 */
  units: DashboardUnit[];
  chapters: DashboardChapter[];
  videos: DashboardVideo[];
  students: DashboardStudent[];
  summary: {
    avgAccuracy: number;
    totalAttempts: number;
    activeStudents: number;
    chapterCount: number;
  };
}
