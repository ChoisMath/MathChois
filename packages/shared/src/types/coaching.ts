export type ErrorTag =
  | 'conceptual' | 'computational' | 'logical'
  | 'notational' | 'strategic' | 'condition';

export interface ConvertResult {
  latex: string;
}

export interface CoachingResult {
  commentMarkdown: string;
  isCorrect: boolean;
  errorTags: ErrorTag[];
  conceptTags: string[];
  strengthNotes: string;
  weaknessNotes: string;
}

export interface CoachingAttempt {
  id: string;
  pageId: string;
  problemId: string | null;
  studentId: string;
  workImageUrl: string | null;
  solutionLatex: string | null;
  isCorrect: boolean | null;
  errorTags: string[];
  conceptTags: string[];
  strengthNotes: string | null;
  weaknessNotes: string | null;
  commentMarkdown: string | null;
  aiModel: string | null;
  createdAt: string;
}

export interface CoachingProblemView {
  id: string;
  title: string | null;
  problemLatex: string;
  figureNotes: string[];
  figures: { idx: number; alt: string; imageUrl: string }[];
  originalImageUrl: string | null;
  subject: string | null;
  majorUnit: string | null;
  minorUnit: string | null;
  difficulty: string | null;
  problemType: string | null;
  detailType: string | null;
  keywords: string[];
}
