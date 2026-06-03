export type SolutionSource =
  | 'teacher-markscheme'
  | 'ai'
  | 'ai-regenerated'
  | 'teacher-verified';

export interface ProblemFigure {
  idx: number;       // 본문 [FIGURE:idx] 와 1:1
  alt: string;       // 그림 설명 (figureNotes)
  imageUrl: string;  // 삽입된 이미지 URL (/api/files/...)
}

export interface Problem {
  id: string;
  title: string | null;
  problemLatex: string;
  figureNotes: string[];
  originalImageUrl: string | null;
  figures: ProblemFigure[];
  subject: string | null;
  majorUnit: string | null;
  minorUnit: string | null;
  difficulty: string | null;    // 상/중/하
  problemType: string | null;
  detailType: string | null;
  keywords: string[];
  answer: string | null;
  solution: string | null;
  solutionSource: SolutionSource | null;
  markschemeImageUrl: string | null;
  coachingSvg: string | null;
  aiModel: string | null;
  status: 'draft' | 'ready';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** AI OCR 추출 결과 (저장 전 폼 상태) */
export interface OcrProblemResult {
  latex: string;
  figureNotes: string[];
  meta: {
    subject: string;
    majorUnit: string;
    minorUnit: string;
    difficulty: string;
    problemType: string;
    detailType: string;
    keywords: string[];
  };
}

export interface SolutionResult {
  answer: string;
  solution: string;
}

/** 목록 검색 응답 */
export interface ProblemListResult {
  items: Problem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ProblemFacets {
  subject: string[];
  majorUnit: string[];
  minorUnit: string[];
  difficulty: string[];
  problemType: string[];
}
