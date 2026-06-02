export interface DashboardChapter {
  id: string;
  title: string;
  totalPages: number;
}

export interface DashboardCell {
  attempts: number;
  correct: number;
  notedPages: number;
}

export interface DashboardStudent {
  studentId: string;
  name: string | null;
  overall: { attempts: number; correct: number };
  cells: Record<string, DashboardCell>;
}

export interface ClassroomDashboard {
  chapters: DashboardChapter[];
  students: DashboardStudent[];
  summary: {
    avgAccuracy: number;
    totalAttempts: number;
    activeStudents: number;
    chapterCount: number;
  };
}
