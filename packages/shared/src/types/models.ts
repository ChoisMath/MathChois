import type { ExcalidrawData } from './excalidraw.js';
import type { ClassroomColor } from '../classroom/color.js';

// ─── Core ───────────────────────────────────────────

export interface Classroom {
  id: string;
  name: string;
  teacherId: string;
  classCode: string;
  /** 공책 표지 색. 구 데이터·구 서버 응답이면 null → 자동 배정 */
  color: ClassroomColor | null;
  createdAt: string;
}

export interface ClassroomMember {
  id: string;
  classroomId: string;
  studentId: string;
  joinedAt: string;
}

export interface Chapter {
  id: string;
  classroomId: string;
  title: string;
  description: string | null;
  position: number;
  sourceChapterId?: string | null;
  /** 소속 단원. 단원 삭제 시 FK SET NULL */
  unitId?: string | null;
  createdAt?: string | null;
}

/** 학급의 단원 — 챕터·영상을 묶는 재생목록 단위 */
export interface Unit {
  id: string;
  classroomId: string;
  title: string;
  description: string | null;
  position: number;
  /** 숨김: 학생의 목록에서만 뺀다 (주소로 여는 것은 막지 않음) */
  isHidden: boolean;
  createdAt: string;
}

export interface UnitWithCounts extends Unit {
  chapterCount: number;
  videoCount: number;
}

/** 페이지 종류. null = 기존 이미지/영상/HTML/AI 문항 페이지(URL 필드로 판별) */
export type PageType = 'whiteboard';

export interface Page {
  id: string;
  chapterId: string;
  imageUrl: string | null;
  videoUrl: string | null;
  htmlUrl: string | null;
  position: number;
  aiProblemId: string | null;
  pageType: PageType | null;
  /** 화이트보드 기본 템플릿 key (null = 학생이 선택) */
  whiteboardTemplate: string | null;
}

// ─── Whiteboard (모둠 공유 보드) ─────────────────────

/** 학급 기본 모둠 */
export interface ClassroomGroup {
  id: string;
  classroomId: string;
  name: string;
  position: number;
  studentIds: string[];
}

/** 보드에 삽입된 이미지 파일 참조 (dataURL 은 저장하지 않고 URL 만) */
export interface WhiteboardFileRef {
  id: string;
  url: string;
  mimeType: string;
}

/** whiteboard_groups.excalidraw_data JSONB */
export interface WhiteboardSceneData {
  elements: Record<string, unknown>[];
  files: Record<string, WhiteboardFileRef>;
}

export interface WhiteboardMember {
  studentId: string;
  name: string;
  avatarUrl: string | null;
}

/** 페이지 × 학급 × 모둠 = 보드 1개 (장면 데이터는 포함하지 않음) */
export interface WhiteboardGroup {
  id: string;
  pageId: string;
  classroomId: string;
  name: string;
  position: number;
  locked: boolean;
  backgroundColor: string;
  sceneVersion: number;
  elementCount: number;
  hasPrevious: boolean;
  updatedAt: string | null;
  members: WhiteboardMember[];
}

export interface WhiteboardPageSettings {
  allowCrossGroupView: boolean;
  lockedAll: boolean;
}

/** GET /api/whiteboards/page/:pageId 응답 */
export interface WhiteboardPageView {
  pageId: string;
  classroomId: string;
  templateKey: string | null;
  /** 원본 챕터의 페이지를 소유한 교사인지 (기본 템플릿 변경 권한) */
  isSourceChapter: boolean;
  settings: WhiteboardPageSettings;
  groups: WhiteboardGroup[];
  /** 학생: 자신이 속한 모둠(보드) id */
  myGroupId: string | null;
  /** 교사: 어느 모둠에도 없는 학급 구성원 */
  unassigned: WhiteboardMember[];
}

// ─── Notes & Comments ───────────────────────────────

export interface StudentNote {
  id: string;
  studentId: string;
  pageId: string;
  excalidrawData: ExcalidrawData;
  updatedAt: string;
}

export interface TeacherNote {
  id: string;
  teacherId: string;
  pageId: string;
  excalidrawData: ExcalidrawData;
  updatedAt: string;
}

export interface TeacherStudentComment {
  id: string;
  teacherId: string;
  studentId: string;
  pageId: string;
  excalidrawData: ExcalidrawData;
  updatedAt: string;
}

// ─── Board / Posts ───────────────────────────────────

export interface Post {
  id: string;
  teacherId: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface PostFile {
  id: string;
  postId: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string | null;
  createdAt: string;
}

export interface PostClassroom {
  postId: string;
  classroomId: string;
}

// ─── Assignments ────────────────────────────────────

export interface Assignment {
  id: string;
  classroomId: string;
  teacherId: string;
  title: string;
  description: string;
  deadline: string | null;
  maxScore: number;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface AssignmentPage {
  id: string;
  assignmentId: string;
  imageUrl: string | null;
  videoUrl: string | null;
  position: number;
  createdAt: string;
}

export type SubmissionStatus = 'draft' | 'submitted' | 'late_submitted' | 'rejected' | 'graded';

export interface AssignmentSubmission {
  id: string;
  assignmentId: string;
  studentId: string;
  status: SubmissionStatus;
  submittedAt: string | null;
  isLate: boolean;
  score: number | null;
  maxScore: number | null;
  rejectionComment: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssignmentNote {
  id: string;
  assignmentId: string;
  pageId: string;
  studentId: string;
  excalidrawData: ExcalidrawData;
  createdAt: string;
  updatedAt: string;
}

export interface AssignmentTeacherComment {
  id: string;
  teacherId: string;
  studentId: string;
  pageId: string;
  excalidrawData: ExcalidrawData;
  updatedAt: string;
}

export interface AssignmentSubmissionFile {
  id: string;
  submissionId: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string | null;
  createdAt: string;
}
