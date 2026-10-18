import type { ExcalidrawData } from './excalidraw.js';
import type { WhiteboardFileRef } from './models.js';

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
  'join:teacher-notes': (data: { pageId: string }) => void;
  'leave:teacher-notes': (data: { pageId: string }) => void;
  'presence:enter': (data: { chapterId: string; pageId: string; studentName: string }) => void;
  'presence:leave': (data: { chapterId: string }) => void;
  'presence:get': (data: { chapterId: string }, callback: (list: PresenceEntry[]) => void) => void;
}

/** 서버 → 클라이언트 이벤트 */
export interface ServerToClientEvents {
  'student-note:updated': (data: StudentNoteUpdatedPayload) => void;
  'teacher-comment:updated': (data: TeacherCommentUpdatedPayload) => void;
  'submission:updated': (data: SubmissionUpdatedPayload) => void;
  'asn-comment:updated': (data: AsnCommentUpdatedPayload) => void;
  'teacher-note:updated': (data: TeacherNoteUpdatedPayload) => void;
  'presence:updated': (data: PresenceEntry) => void;
  'presence:left': (data: { studentId: string }) => void;
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

export interface TeacherNoteUpdatedPayload {
  pageId: string;
  updatedAt: string;
}

// ─── Presence (학생 접속 상태) ─────────────────

export interface PresenceEntry {
  studentId: string;
  studentName: string;
  pageId: string;
  joinedAt: string; // ISO string
}

// ─── Whiteboard (room `wb:{boardId}`) ───────────────

export interface WbUser {
  socketId: string;
  userId: string;
  name: string;
  role: 'teacher' | 'student';
}

export interface WbJoinPayload { boardId: string }

/** 서버 → 발신자: 입장 직후 전체 장면 */
export interface WbInitPayload {
  boardId: string;
  elements: Record<string, unknown>[];
  files: Record<string, WhiteboardFileRef>;
  backgroundColor: string;
  locked: boolean;
  lockedAll: boolean;
  /** 이 소켓이 편집할 수 없는지 (권한 또는 잠금) */
  readOnly: boolean;
  allowCrossGroupView: boolean;
  users: WbUser[];
}

export interface WbElementsPayload { boardId: string; elements: Record<string, unknown>[] }

export interface WbPointerPayload {
  boardId: string;
  x: number;
  y: number;
  tool: 'pointer' | 'laser';
  button: 'up' | 'down';
}

export interface WbPointerBroadcast extends WbPointerPayload, WbUser {}

export interface WbFilesPayload { boardId: string; files: Record<string, WhiteboardFileRef> }

export interface WbBackgroundPayload { boardId: string; color: string }

/** 서버 → room: 전체 장면 교체 (초기화 / 복원 / 템플릿 적용) */
export interface WbScenePayload {
  boardId: string;
  elements: Record<string, unknown>[];
  files: Record<string, WhiteboardFileRef>;
  backgroundColor: string;
  reason: 'reset' | 'restore' | 'template';
}

export interface WbLockPayload { boardId: string; locked: boolean; lockedAll: boolean }

export interface WbSettingsPayload { pageId: string; classroomId: string; allowCrossGroupView: boolean; lockedAll: boolean }

export interface WbPresencePayload { boardId: string; users: WbUser[] }

export interface WbRejectedPayload { boardId: string; reason: 'locked' | 'forbidden' | 'invalid' }

export interface WbRemovedPayload { boardId: string }
