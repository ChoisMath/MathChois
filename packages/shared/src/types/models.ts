import type { ExcalidrawData } from './excalidraw.js';

// ─── Core ───────────────────────────────────────────

export interface Classroom {
  id: string;
  name: string;
  teacherId: string;
  classCode: string;
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
}

export interface Page {
  id: string;
  chapterId: string;
  imageUrl: string | null;
  videoUrl: string | null;
  position: number;
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
