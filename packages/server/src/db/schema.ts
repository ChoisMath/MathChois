import {
  pgTable, uuid, text, timestamp, integer, jsonb, unique, boolean, index, primaryKey,
} from 'drizzle-orm/pg-core';
import type { ExcalidrawData, ProblemFigure } from '@mathchois/shared';

// ─── profiles ───────────────────────────────────────

export const profiles = pgTable('profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  googleId: text('google_id').unique(),
  name: text('name'),
  email: text('email').unique(),
  avatarUrl: text('avatar_url'),
  role: text('role'),  // 'teacher' | 'student' | null
  isAdmin: boolean('is_admin').default(false).notNull(),
  authMethod: text('auth_method').default('google').notNull(),  // 'google' | 'email'
  passwordHash: text('password_hash'),
  mustResetPassword: boolean('must_reset_password').default(false).notNull(),
});

// ─── classrooms ─────────────────────────────────────

export const classrooms = pgTable('classrooms', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  teacherId: uuid('teacher_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  classCode: text('class_code').unique().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ─── classroom_members ──────────────────────────────

export const classroomMembers = pgTable('classroom_members', {
  id: uuid('id').defaultRandom().primaryKey(),
  classroomId: uuid('classroom_id').notNull().references(() => classrooms.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  unique().on(t.classroomId, t.studentId),
  index('idx_classroom_members_classroom').on(t.classroomId),
  index('idx_classroom_members_student').on(t.studentId),
]);

// ─── chapters ───────────────────────────────────────

export const chapters = pgTable('chapters', {
  id: uuid('id').defaultRandom().primaryKey(),
  classroomId: uuid('classroom_id').notNull().references(() => classrooms.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  position: integer('position').notNull().default(0),
  sourceChapterId: uuid('source_chapter_id').references((): any => chapters.id, { onDelete: 'set null' }),
}, (t) => [
  index('idx_chapters_classroom').on(t.classroomId),
  index('idx_chapters_source').on(t.sourceChapterId),
]);

// ─── pages ──────────────────────────────────────────

export const pages = pgTable('pages', {
  id: uuid('id').defaultRandom().primaryKey(),
  chapterId: uuid('chapter_id').notNull().references(() => chapters.id, { onDelete: 'cascade' }),
  imageUrl: text('image_url'),
  videoUrl: text('video_url'),
  htmlUrl: text('html_url'),
  position: integer('position').notNull().default(0),
  aiProblemId: uuid('ai_problem_id').references(() => problems.id, { onDelete: 'set null' }),
}, (t) => [
  index('idx_pages_chapter').on(t.chapterId),
]);

// ─── student_notes ──────────────────────────────────

export const studentNotes = pgTable('student_notes', {
  id: uuid('id').defaultRandom().primaryKey(),
  studentId: uuid('student_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  pageId: uuid('page_id').notNull().references(() => pages.id, { onDelete: 'cascade' }),
  excalidrawData: jsonb('excalidraw_data').$type<ExcalidrawData>(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  unique().on(t.studentId, t.pageId),
  index('idx_student_notes_page').on(t.pageId),
  index('idx_student_notes_student_page').on(t.studentId, t.pageId),
]);

// ─── teacher_notes ──────────────────────────────────

export const teacherNotes = pgTable('teacher_notes', {
  id: uuid('id').defaultRandom().primaryKey(),
  teacherId: uuid('teacher_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  pageId: uuid('page_id').notNull().references(() => pages.id, { onDelete: 'cascade' }),
  excalidrawData: jsonb('excalidraw_data').$type<ExcalidrawData>(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  unique().on(t.teacherId, t.pageId),
  index('idx_teacher_notes_page').on(t.pageId),
]);

// ─── teacher_student_comments ───────────────────────

export const teacherStudentComments = pgTable('teacher_student_comments', {
  id: uuid('id').defaultRandom().primaryKey(),
  teacherId: uuid('teacher_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  pageId: uuid('page_id').notNull().references(() => pages.id, { onDelete: 'cascade' }),
  excalidrawData: jsonb('excalidraw_data').$type<ExcalidrawData>(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  unique().on(t.teacherId, t.studentId, t.pageId),
  index('idx_tsc_page_student').on(t.pageId, t.studentId),
]);

// ─── posts ──────────────────────────────────────────

export const posts = pgTable('posts', {
  id: uuid('id').defaultRandom().primaryKey(),
  teacherId: uuid('teacher_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  content: text('content').default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  index('idx_posts_teacher').on(t.teacherId),
]);

// ─── post_files ─────────────────────────────────────

export const postFiles = pgTable('post_files', {
  id: uuid('id').defaultRandom().primaryKey(),
  postId: uuid('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  fileName: text('file_name').notNull(),
  fileUrl: text('file_url').notNull(),
  fileSize: integer('file_size').notNull(),
  mimeType: text('mime_type'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ─── post_classrooms ────────────────────────────────

export const postClassrooms = pgTable('post_classrooms', {
  postId: uuid('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  classroomId: uuid('classroom_id').notNull().references(() => classrooms.id, { onDelete: 'cascade' }),
}, (t) => [
  primaryKey({ columns: [t.postId, t.classroomId] }),
]);

// ─── assignments ────────────────────────────────────

export const assignments = pgTable('assignments', {
  id: uuid('id').defaultRandom().primaryKey(),
  classroomId: uuid('classroom_id').notNull().references(() => classrooms.id, { onDelete: 'cascade' }),
  teacherId: uuid('teacher_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').default(''),
  deadline: timestamp('deadline', { withTimezone: true }),
  maxScore: integer('max_score').default(100),
  position: integer('position').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ─── assignment_pages ───────────────────────────────

export const assignmentPages = pgTable('assignment_pages', {
  id: uuid('id').defaultRandom().primaryKey(),
  assignmentId: uuid('assignment_id').notNull().references(() => assignments.id, { onDelete: 'cascade' }),
  imageUrl: text('image_url'),
  videoUrl: text('video_url'),
  position: integer('position').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ─── assignment_submissions ─────────────────────────

export const assignmentSubmissions = pgTable('assignment_submissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  assignmentId: uuid('assignment_id').notNull().references(() => assignments.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  status: text('status').default('draft'),  // 'draft'|'submitted'|'late_submitted'|'rejected'|'graded'
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  isLate: boolean('is_late').default(false),
  score: integer('score'),
  maxScore: integer('max_score'),
  rejectionComment: text('rejection_comment'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  unique().on(t.assignmentId, t.studentId),
  index('idx_assignment_submissions_assignment').on(t.assignmentId),
]);

// ─── assignment_submission_files ────────────────────

export const assignmentSubmissionFiles = pgTable('assignment_submission_files', {
  id: uuid('id').defaultRandom().primaryKey(),
  submissionId: uuid('submission_id').notNull()
    .references(() => assignmentSubmissions.id, { onDelete: 'cascade' }),
  fileName: text('file_name').notNull(),
  fileUrl: text('file_url').notNull(),
  fileSize: integer('file_size').notNull(),
  mimeType: text('mime_type'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ─── assignment_notes ───────────────────────────────

export const assignmentNotes = pgTable('assignment_notes', {
  id: uuid('id').defaultRandom().primaryKey(),
  assignmentId: uuid('assignment_id').notNull().references(() => assignments.id, { onDelete: 'cascade' }),
  pageId: uuid('page_id').notNull().references(() => assignmentPages.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  excalidrawData: jsonb('excalidraw_data').$type<ExcalidrawData>().default({ elements: [] }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  unique().on(t.assignmentId, t.pageId, t.studentId),
  index('idx_assignment_notes_page_student').on(t.pageId, t.studentId),
]);

// ─── assignment_teacher_comments ────────────────────

export const assignmentTeacherComments = pgTable('assignment_teacher_comments', {
  id: uuid('id').defaultRandom().primaryKey(),
  teacherId: uuid('teacher_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  pageId: uuid('page_id').notNull().references(() => assignmentPages.id, { onDelete: 'cascade' }),
  excalidrawData: jsonb('excalidraw_data').$type<ExcalidrawData>().default({ elements: [] }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  unique().on(t.teacherId, t.studentId, t.pageId),
  index('idx_atc_page_student').on(t.pageId, t.studentId),
]);

// ─── problems (문제은행) ─────────────────────────────

export const problems = pgTable('problems', {
  id: uuid('id').defaultRandom().primaryKey(),

  title: text('title'),
  problemLatex: text('problem_latex').notNull(),
  figureNotes: jsonb('figure_notes').$type<string[]>().default([]).notNull(),
  originalImageUrl: text('original_image_url'),
  figures: jsonb('figures').$type<ProblemFigure[]>().default([]).notNull(),

  subject: text('subject'),
  majorUnit: text('major_unit'),
  minorUnit: text('minor_unit'),
  difficulty: text('difficulty'),
  problemType: text('problem_type'),
  detailType: text('detail_type'),
  keywords: jsonb('keywords').$type<string[]>().default([]).notNull(),

  answer: text('answer'),
  solution: text('solution'),
  solutionSource: text('solution_source'),
  markschemeImageUrl: text('markscheme_image_url'),

  aiModel: text('ai_model'),
  status: text('status').default('ready').notNull(),
  createdBy: uuid('created_by').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('idx_problems_created_at').on(t.createdAt),
  index('idx_problems_subject').on(t.subject),
  index('idx_problems_major_unit').on(t.majorUnit),
  index('idx_problems_difficulty').on(t.difficulty),
  index('idx_problems_created_by').on(t.createdBy),
]);

// ─── coaching_attempts (AI 코칭 기록) ────────────────

export const coachingAttempts = pgTable('coaching_attempts', {
  id: uuid('id').defaultRandom().primaryKey(),
  pageId: uuid('page_id').notNull().references(() => pages.id, { onDelete: 'cascade' }),
  problemId: uuid('problem_id').references(() => problems.id, { onDelete: 'set null' }),
  studentId: uuid('student_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),

  workImageUrl: text('work_image_url'),
  solutionLatex: text('solution_latex'),
  isCorrect: boolean('is_correct'),
  errorTags: jsonb('error_tags').$type<string[]>().default([]).notNull(),
  conceptTags: jsonb('concept_tags').$type<string[]>().default([]).notNull(),
  strengthNotes: text('strength_notes'),
  weaknessNotes: text('weakness_notes'),
  commentMarkdown: text('comment_markdown'),
  coachingSvg: text('coaching_svg'),
  aiModel: text('ai_model'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('idx_coaching_attempts_student').on(t.studentId, t.createdAt),
  index('idx_coaching_attempts_page_student').on(t.pageId, t.studentId),
  index('idx_coaching_attempts_problem').on(t.problemId),
]);
