import { eq, count, inArray } from 'drizzle-orm';
import fs from 'node:fs/promises';
import path from 'node:path';
import { db } from '../config/database.js';
import {
  profiles, classrooms, classroomMembers, chapters, pages,
  studentNotes, teacherNotes, teacherStudentComments,
  posts, postFiles, postClassrooms,
  assignments, assignmentPages, assignmentSubmissions,
  assignmentNotes, assignmentTeacherComments,
} from '../db/schema.js';
import { urlToStoragePath, removeFile, urlToParentDir, removeDirectoryIfEmpty } from './storage.service.js';
import { env } from '../config/env.js';

const VOLUME_ROOT = path.resolve(env.VOLUME_PATH);

// ─── Users ─────────────────────────────────────────

/** 모든 사용자 목록 (클래스룸 수 포함, limit 기본 500) */
export async function getAllUsers(limit = 500) {
  const allProfiles = await db.select().from(profiles).limit(limit);

  const teacherCounts = await db
    .select({ teacherId: classrooms.teacherId, cnt: count() })
    .from(classrooms)
    .groupBy(classrooms.teacherId);

  const studentCounts = await db
    .select({ studentId: classroomMembers.studentId, cnt: count() })
    .from(classroomMembers)
    .groupBy(classroomMembers.studentId);

  const tMap = Object.fromEntries(teacherCounts.map(r => [r.teacherId, r.cnt]));
  const sMap = Object.fromEntries(studentCounts.map(r => [r.studentId, r.cnt]));

  return allProfiles.map(p => ({
    id: p.id,
    name: p.name,
    email: p.email,
    avatarUrl: p.avatarUrl,
    role: p.role,
    isAdmin: p.isAdmin,
    authMethod: p.authMethod,
    mustResetPassword: p.mustResetPassword,
    classroomCount: p.role === 'teacher'
      ? (tMap[p.id] ?? 0)
      : (sMap[p.id] ?? 0),
  }));
}

/** 교사 → 클래스룸 → 학생 계층 구조 조회 */
export async function getTeachersWithStudents() {
  // 4 queries, no N+1
  const allTeachers = await db.select().from(profiles).where(eq(profiles.role, 'teacher'));
  const allClassrooms = await db.select().from(classrooms);
  const allMembers = await db
    .select({
      classroomId: classroomMembers.classroomId,
      studentId: classroomMembers.studentId,
      joinedAt: classroomMembers.joinedAt,
      name: profiles.name,
      email: profiles.email,
      avatarUrl: profiles.avatarUrl,
      authMethod: profiles.authMethod,
      mustResetPassword: profiles.mustResetPassword,
    })
    .from(classroomMembers)
    .innerJoin(profiles, eq(classroomMembers.studentId, profiles.id));
  const allStudents = await db.select().from(profiles).where(eq(profiles.role, 'student'));

  // Build classroom map: classroomId → { ...classroom, students[] }
  const classroomMap = new Map<string, { id: string; name: string; classCode: string; teacherId: string; students: typeof allMembers }>();
  for (const c of allClassrooms) {
    classroomMap.set(c.id, { id: c.id, name: c.name, classCode: c.classCode!, teacherId: c.teacherId, students: [] });
  }
  for (const m of allMembers) {
    classroomMap.get(m.classroomId)?.students.push(m);
  }

  // Build teacher hierarchy (only teachers with classrooms)
  const assignedStudentIds = new Set(allMembers.map(m => m.studentId));
  const teachers = allTeachers
    .filter(t => allClassrooms.some(c => c.teacherId === t.id))
    .map(t => {
      const tClassrooms = allClassrooms
        .filter(c => c.teacherId === t.id)
        .map(c => {
          const entry = classroomMap.get(c.id)!;
          const students = entry.students
            .map(s => ({
              id: s.studentId,
              name: s.name,
              email: s.email,
              avatarUrl: s.avatarUrl,
              authMethod: s.authMethod,
              mustResetPassword: s.mustResetPassword,
              joinedAt: s.joinedAt,
            }))
            .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
          return { id: entry.id, name: entry.name, classCode: entry.classCode, students };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      return {
        teacher: { id: t.id, name: t.name, email: t.email, avatarUrl: t.avatarUrl },
        classrooms: tClassrooms,
      };
    })
    .sort((a, b) => (a.teacher.name ?? '').localeCompare(b.teacher.name ?? ''));

  // Unassigned students (role='student' but not in any classroom)
  const unassignedStudents = allStudents
    .filter(s => !assignedStudentIds.has(s.id))
    .map(s => ({
      id: s.id,
      name: s.name,
      email: s.email,
      avatarUrl: s.avatarUrl,
      authMethod: s.authMethod,
      mustResetPassword: s.mustResetPassword,
    }))
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));

  return { teachers, unassignedStudents };
}

/** 사용자 역할 변경 */
export async function updateUserRole(userId: string, role: 'teacher' | 'student') {
  const [updated] = await db
    .update(profiles)
    .set({ role })
    .where(eq(profiles.id, userId))
    .returning();
  return updated ?? null;
}

/** 관리자 상태 토글 */
export async function setUserAdmin(userId: string, isAdmin: boolean) {
  const [updated] = await db
    .update(profiles)
    .set({ isAdmin })
    .where(eq(profiles.id, userId))
    .returning();
  return updated ?? null;
}

/** 사용자 삭제 (CASCADE로 관련 데이터 자동 삭제) */
export async function deleteUser(userId: string) {
  // 삭제 전 Storage 파일 URL 수집
  const urls = await collectUserFileUrls(userId);

  const [deleted] = await db
    .delete(profiles)
    .where(eq(profiles.id, userId))
    .returning();

  // Storage 파일 정리
  await deleteStorageFiles(urls);

  return deleted ?? null;
}

/** 사용자의 클래스룸 목록 */
export async function getUserClassrooms(userId: string, role: string | null) {
  if (role === 'teacher') {
    return db.select().from(classrooms).where(eq(classrooms.teacherId, userId));
  }
  if (role === 'student') {
    const memberships = await db
      .select({ classroomId: classroomMembers.classroomId })
      .from(classroomMembers)
      .where(eq(classroomMembers.studentId, userId));
    if (memberships.length === 0) return [];
    return db
      .select()
      .from(classrooms)
      .where(inArray(classrooms.id, memberships.map(m => m.classroomId)));
  }
  return [];
}

/** 사용자 상세 통계 (DB row 수 + Storage) */
export async function getUserDetail(userId: string) {
  const profile = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
  if (!profile[0]) return null;

  // Teacher DB rows
  const [crCount] = await db.select({ cnt: count() }).from(classrooms).where(eq(classrooms.teacherId, userId));
  const [postCount] = await db.select({ cnt: count() }).from(posts).where(eq(posts.teacherId, userId));
  const [tnCount] = await db.select({ cnt: count() }).from(teacherNotes).where(eq(teacherNotes.teacherId, userId));
  const [tscCount] = await db.select({ cnt: count() }).from(teacherStudentComments).where(eq(teacherStudentComments.teacherId, userId));
  const [asnCount] = await db.select({ cnt: count() }).from(assignments).where(eq(assignments.teacherId, userId));
  const [atcCount] = await db.select({ cnt: count() }).from(assignmentTeacherComments).where(eq(assignmentTeacherComments.teacherId, userId));

  // Student DB rows
  const [memCount] = await db.select({ cnt: count() }).from(classroomMembers).where(eq(classroomMembers.studentId, userId));
  const [snCount] = await db.select({ cnt: count() }).from(studentNotes).where(eq(studentNotes.studentId, userId));
  const [subCount] = await db.select({ cnt: count() }).from(assignmentSubmissions).where(eq(assignmentSubmissions.studentId, userId));
  const [anCount] = await db.select({ cnt: count() }).from(assignmentNotes).where(eq(assignmentNotes.studentId, userId));

  // Storage 용량 계산
  const storageBytes = await calculateUserStorage(userId);

  // Classrooms
  const userClassrooms = await getUserClassrooms(userId, profile[0].role);

  return {
    profile: profile[0],
    classrooms: userClassrooms,
    dbRows: {
      teacher: {
        classrooms: crCount.cnt,
        posts: postCount.cnt,
        teacherNotes: tnCount.cnt,
        comments: tscCount.cnt,
        assignments: asnCount.cnt,
        assignmentComments: atcCount.cnt,
      },
      student: {
        memberships: memCount.cnt,
        notes: snCount.cnt,
        submissions: subCount.cnt,
        assignmentNotes: anCount.cnt,
      },
    },
    storageBytes,
  };
}

// ─── Classrooms ────────────────────────────────────

/** 전체 클래스룸 개요 */
export async function getClassroomOverview() {
  const allClassrooms = await db.select().from(classrooms);
  if (allClassrooms.length === 0) return [];

  const teacherIds = [...new Set(allClassrooms.map(c => c.teacherId))];
  const teachers = await db
    .select()
    .from(profiles)
    .where(inArray(profiles.id, teacherIds));
  const teacherMap = Object.fromEntries(teachers.map(t => [t.id, t]));

  const memberCounts = await db
    .select({ classroomId: classroomMembers.classroomId, cnt: count() })
    .from(classroomMembers)
    .groupBy(classroomMembers.classroomId);
  const memberMap = Object.fromEntries(memberCounts.map(r => [r.classroomId, r.cnt]));

  const chapterCounts = await db
    .select({ classroomId: chapters.classroomId, cnt: count() })
    .from(chapters)
    .groupBy(chapters.classroomId);
  const chapterMap = Object.fromEntries(chapterCounts.map(r => [r.classroomId, r.cnt]));

  return allClassrooms.map(c => ({
    id: c.id,
    name: c.name,
    classCode: c.classCode,
    createdAt: c.createdAt,
    teacher: teacherMap[c.teacherId]
      ? { id: teacherMap[c.teacherId].id, name: teacherMap[c.teacherId].name, email: teacherMap[c.teacherId].email }
      : null,
    studentCount: memberMap[c.id] ?? 0,
    chapterCount: chapterMap[c.id] ?? 0,
  }));
}

// ─── Stats ─────────────────────────────────────────

let _statsCache: { data: unknown; ts: number } | null = null;
const STATS_CACHE_TTL = 30_000; // 30초

/** 시스템 전체 통계 (TTL 30초 캐시) */
export async function getSystemStats() {
  if (_statsCache && Date.now() - _statsCache.ts < STATS_CACHE_TTL) {
    return _statsCache.data;
  }
  // DB 테이블 row 수
  const tableStats = await Promise.all([
    db.select({ cnt: count() }).from(profiles).then(r => ({ table: 'profiles', rows: r[0].cnt })),
    db.select({ cnt: count() }).from(classrooms).then(r => ({ table: 'classrooms', rows: r[0].cnt })),
    db.select({ cnt: count() }).from(classroomMembers).then(r => ({ table: 'classroom_members', rows: r[0].cnt })),
    db.select({ cnt: count() }).from(chapters).then(r => ({ table: 'chapters', rows: r[0].cnt })),
    db.select({ cnt: count() }).from(pages).then(r => ({ table: 'pages', rows: r[0].cnt })),
    db.select({ cnt: count() }).from(studentNotes).then(r => ({ table: 'student_notes', rows: r[0].cnt })),
    db.select({ cnt: count() }).from(teacherNotes).then(r => ({ table: 'teacher_notes', rows: r[0].cnt })),
    db.select({ cnt: count() }).from(teacherStudentComments).then(r => ({ table: 'teacher_student_comments', rows: r[0].cnt })),
    db.select({ cnt: count() }).from(posts).then(r => ({ table: 'posts', rows: r[0].cnt })),
    db.select({ cnt: count() }).from(postFiles).then(r => ({ table: 'post_files', rows: r[0].cnt })),
    db.select({ cnt: count() }).from(assignments).then(r => ({ table: 'assignments', rows: r[0].cnt })),
    db.select({ cnt: count() }).from(assignmentPages).then(r => ({ table: 'assignment_pages', rows: r[0].cnt })),
    db.select({ cnt: count() }).from(assignmentSubmissions).then(r => ({ table: 'assignment_submissions', rows: r[0].cnt })),
    db.select({ cnt: count() }).from(assignmentNotes).then(r => ({ table: 'assignment_notes', rows: r[0].cnt })),
    db.select({ cnt: count() }).from(assignmentTeacherComments).then(r => ({ table: 'assignment_teacher_comments', rows: r[0].cnt })),
  ]);

  // Storage 용량
  const totalStorage = await getDirectorySize(VOLUME_ROOT);
  const buckets = ['chapter-pages', 'assignments', 'posts'];
  const bucketStats = await Promise.all(
    buckets.map(async (bucket) => ({
      bucket,
      size: await getDirectorySize(path.resolve(VOLUME_ROOT, bucket)),
    })),
  );

  // 사용자 요약
  const allProfiles = await db.select().from(profiles);
  const totalUsers = allProfiles.length;
  const teachers = allProfiles.filter(p => p.role === 'teacher').length;
  const students = allProfiles.filter(p => p.role === 'student').length;
  const [classroomTotal] = await db.select({ cnt: count() }).from(classrooms);

  const result = {
    summary: { totalUsers, teachers, students, classrooms: classroomTotal.cnt },
    storage: { totalSize: totalStorage, buckets: bucketStats },
    database: tableStats,
  };
  _statsCache = { data: result, ts: Date.now() };
  return result;
}

// ─── Reset ─────────────────────────────────────────

/** 전체 데이터 초기화 (관리자 계정 제외) */
export async function resetAllData() {
  // 1. 모든 클래스룸 삭제 (CASCADE → chapters, pages, notes, members, assignments 등)
  await db.delete(classrooms);

  // 2. 모든 게시물 삭제
  await db.delete(posts);

  // 3. orphan 데이터 정리 (프로필에 직접 연결되어 CASCADE 안 된 경우)
  await db.delete(teacherNotes);
  await db.delete(studentNotes);
  await db.delete(teacherStudentComments);
  await db.delete(assignmentTeacherComments);
  await db.delete(assignmentNotes);
  await db.delete(assignmentSubmissions);
  await db.delete(assignmentPages);
  await db.delete(assignments);

  // 4. 비관리자 프로필 삭제
  await db.delete(profiles).where(eq(profiles.isAdmin, false));

  // 5. Storage 전체 삭제
  await clearAllStorage();

  return { success: true };
}

/** 특정 사용자 데이터 초기화 (프로필은 유지) */
export async function resetUserData(userId: string) {
  const profile = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
  if (!profile[0]) throw new Error('User not found');

  // Storage 파일 URL 수집 (삭제 전)
  const urls = await collectUserFileUrls(userId);

  // Teacher 데이터 삭제
  await db.delete(classrooms).where(eq(classrooms.teacherId, userId));
  await db.delete(posts).where(eq(posts.teacherId, userId));
  await db.delete(teacherNotes).where(eq(teacherNotes.teacherId, userId));
  await db.delete(teacherStudentComments).where(eq(teacherStudentComments.teacherId, userId));
  await db.delete(assignmentTeacherComments).where(eq(assignmentTeacherComments.teacherId, userId));

  // Student 데이터 삭제 (역할 전환 경우 대비)
  await db.delete(classroomMembers).where(eq(classroomMembers.studentId, userId));
  await db.delete(studentNotes).where(eq(studentNotes.studentId, userId));
  await db.delete(assignmentSubmissions).where(eq(assignmentSubmissions.studentId, userId));
  await db.delete(assignmentNotes).where(eq(assignmentNotes.studentId, userId));

  // Storage 파일 정리
  await deleteStorageFiles(urls);

  return { success: true };
}

// ─── Storage Helpers ───────────────────────────────

/** 사용자의 모든 파일 URL 수집 (teacher가 업로드한 파일) */
async function collectUserFileUrls(userId: string): Promise<string[]> {
  const urls: string[] = [];

  // Chapter 페이지 이미지
  const pageRows = await db
    .select({ imageUrl: pages.imageUrl })
    .from(pages)
    .innerJoin(chapters, eq(pages.chapterId, chapters.id))
    .innerJoin(classrooms, eq(chapters.classroomId, classrooms.id))
    .where(eq(classrooms.teacherId, userId));
  urls.push(...pageRows.map(r => r.imageUrl));

  // Assignment 페이지 이미지
  const asnPageRows = await db
    .select({ imageUrl: assignmentPages.imageUrl })
    .from(assignmentPages)
    .innerJoin(assignments, eq(assignmentPages.assignmentId, assignments.id))
    .where(eq(assignments.teacherId, userId));
  urls.push(...asnPageRows.map(r => r.imageUrl));

  // Post 파일
  const postFileRows = await db
    .select({ fileUrl: postFiles.fileUrl })
    .from(postFiles)
    .innerJoin(posts, eq(postFiles.postId, posts.id))
    .where(eq(posts.teacherId, userId));
  urls.push(...postFileRows.map(r => r.fileUrl));

  return urls;
}

/** 사용자 Storage 용량 계산 (bytes) */
async function calculateUserStorage(userId: string): Promise<number> {
  const urls = await collectUserFileUrls(userId);
  let total = 0;
  for (const url of urls) {
    const parsed = urlToStoragePath(url);
    if (parsed) {
      try {
        const absPath = path.resolve(VOLUME_ROOT, parsed.bucket, parsed.path);
        const stat = await fs.stat(absPath);
        total += stat.size;
      } catch { /* file might not exist */ }
    }
  }
  return total;
}

/** Storage 파일 목록 삭제 */
async function deleteStorageFiles(urls: string[]) {
  const dirs = new Set<string>();
  for (const url of urls) {
    const parsed = urlToStoragePath(url);
    if (parsed) {
      await removeFile(parsed.bucket, parsed.path);
    }
    const parentDir = urlToParentDir(url);
    if (parentDir) {
      dirs.add(`${parentDir.bucket}\t${parentDir.dir}`);
    }
  }
  for (const entry of dirs) {
    const [bucket, dir] = entry.split('\t');
    await removeDirectoryIfEmpty(bucket, dir);
  }
}

/** Storage 전체 삭제 */
async function clearAllStorage() {
  try {
    const entries = await fs.readdir(VOLUME_ROOT, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(VOLUME_ROOT, entry.name);
      if (entry.isDirectory()) {
        await fs.rm(fullPath, { recursive: true, force: true });
      }
    }
  } catch { /* volume might not exist */ }
}

/** 디렉토리 크기 재귀 계산 */
async function getDirectorySize(dirPath: string): Promise<number> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    let total = 0;
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        total += await getDirectorySize(fullPath);
      } else {
        const stat = await fs.stat(fullPath);
        total += stat.size;
      }
    }
    return total;
  } catch {
    return 0;
  }
}
