import type { ExcalidrawData } from './excalidraw.js';

// ─── Socket.IO Room 타입 ──────────────────────────

/** 클라이언트 → 서버 이벤트 */
export interface ClientToServerEvents {
  'join:chapter-monitor': (data: { chapterId: string; pageIds: string[] }) => void;
  'leave:chapter-monitor': (data: { chapterId: string }) => void;
  'join:student-work': (data: { pageId: string; studentId: string }) => void;
  'leave:student-work': (data: { pageId: string; studentId: string }) => void;
  'join:comments': (data: { pageId: string; studentId: string }) => void;
  'leave:comments': (data: { pageId: string; studentId: string }) => void;
  'join:assignment-monitor': (data: { assignmentId: string }) => void;
  'leave:assignment-monitor': (data: { assignmentId: string }) => void;
  'join:asn-comments': (data: { pageId: string; studentId: string }) => void;
  'leave:asn-comments': (data: { pageId: string; studentId: string }) => void;
}

/** 서버 → 클라이언트 이벤트 */
export interface ServerToClientEvents {
  'student-note:updated': (data: StudentNoteUpdatedPayload) => void;
  'teacher-comment:updated': (data: TeacherCommentUpdatedPayload) => void;
  'submission:updated': (data: SubmissionUpdatedPayload) => void;
  'asn-comment:updated': (data: AsnCommentUpdatedPayload) => void;
}

// ─── 이벤트 페이로드 ──────────────────────────────

export interface StudentNoteUpdatedPayload {
  studentId: string;
  pageId: string;
  updatedAt: string;
  /** work room에서만 전송 — 전체 excalidraw 데이터 */
  excalidrawData?: ExcalidrawData;
}

export interface TeacherCommentUpdatedPayload {
  teacherId: string;
  studentId: string;
  pageId: string;
  excalidrawData: ExcalidrawData;
}

export interface SubmissionUpdatedPayload {
  studentId: string;
  assignmentId: string;
  status: string;
  score: number | null;
  submittedAt: string | null;
  isLate: boolean;
}

export interface AsnCommentUpdatedPayload {
  teacherId: string;
  studentId: string;
  pageId: string;
  excalidrawData: ExcalidrawData;
}
