import type { Profile } from './auth.js';
import type {
  Classroom, Chapter, Page, Post, PostFile,
  Assignment, AssignmentPage, AssignmentSubmission,
} from './models.js';

// ─── 공통 ───────────────────────────────────────────

export interface ApiError {
  error: string;
  message?: string;
}

// ─── Classrooms ─────────────────────────────────────

export interface CreateClassroomRequest {
  name: string;
}

export interface JoinClassroomRequest {
  code: string;
}

export interface ClassroomWithCount extends Classroom {
  memberCount: number;
}

export interface ClassroomMemberWithProfile {
  id: string;
  classroomId: string;
  studentId: string;
  joinedAt: string;
  student: Pick<Profile, 'id' | 'name' | 'email' | 'avatarUrl'>;
}

// ─── Chapters ───────────────────────────────────────

export interface CreateChapterRequest {
  title: string;
  description?: string;
}

export interface ChapterWithPageCount extends Chapter {
  pageCount: number;
}

export interface ReorderRequest {
  items: { id: string; position: number }[];
}

// ─── Notes ──────────────────────────────────────────

export interface StudentNoteSummary {
  studentId: string;
  pageId: string;
  updatedAt: string;
}

// ─── Posts ───────────────────────────────────────────

export interface CreatePostRequest {
  title: string;
  content: string;
  classroomIds: string[];
}

export interface PostWithFiles extends Post {
  files: PostFile[];
  classroomIds: string[];
}

// ─── Assignments ────────────────────────────────────

export interface CreateAssignmentRequest {
  title: string;
  description?: string;
  deadline?: string;
  maxScore?: number;
}

export interface UpdateSubmissionRequest {
  status?: string;
  score?: number;
  rejectionComment?: string;
  files?: { fileName: string; fileUrl: string; fileSize: number; mimeType?: string }[];
}

// ─── Files ──────────────────────────────────────────

export interface UploadResponse {
  url: string;
}
