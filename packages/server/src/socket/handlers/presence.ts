import type { Server, Socket } from 'socket.io';
import type { TokenPayload } from '@mathchois/shared';
import { eq, and } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { chapters, classroomMembers } from '../../db/schema.js';

// ─── 인메모리 데이터 구조 ───────────────────────

/** chapterId → Map<studentId, { pageId, socketId, studentName, joinedAt }> */
const chapterPresence = new Map<string, Map<string, {
  pageId: string;
  socketId: string;
  studentName: string;
  joinedAt: Date;
}>>();

/** socketId → { chapterId, studentId } (disconnect 시 O(1) 정리용 역인덱스) */
const socketToPresence = new Map<string, { chapterId: string; studentId: string }>();

// ─── 권한 검증 ──────────────────────────────────

async function validateStudentChapterAccess(studentId: string, chapterId: string): Promise<boolean> {
  const ch = await db.select({ classroomId: chapters.classroomId })
    .from(chapters).where(eq(chapters.id, chapterId)).limit(1);
  if (!ch[0]) return false;

  const member = await db.select({ id: classroomMembers.id })
    .from(classroomMembers)
    .where(and(
      eq(classroomMembers.classroomId, ch[0].classroomId),
      eq(classroomMembers.studentId, studentId),
    ))
    .limit(1);

  return member.length > 0;
}

// ─── 내부 함수 ──────────────────────────────────

function removePresence(io: Server, socketId: string): void {
  const prev = socketToPresence.get(socketId);
  if (!prev) return;

  const { chapterId, studentId } = prev;
  const chMap = chapterPresence.get(chapterId);
  if (chMap) {
    const current = chMap.get(studentId);
    // 멀티탭 보호: 마지막 탭의 socketId만 유효
    if (current && current.socketId === socketId) {
      chMap.delete(studentId);
      io.to(`chapter:${chapterId}`).emit('presence:left', { studentId });
    }
    // 빈 Map 정리 (메모리 누수 방지)
    if (chMap.size === 0) {
      chapterPresence.delete(chapterId);
    }
  }

  socketToPresence.delete(socketId);
}

export function getChapterPresence(chapterId: string) {
  const chMap = chapterPresence.get(chapterId);
  if (!chMap) return [];
  return Array.from(chMap.entries()).map(([studentId, entry]) => ({
    studentId,
    studentName: entry.studentName,
    pageId: entry.pageId,
    joinedAt: entry.joinedAt.toISOString(),
  }));
}

// ─── 핸들러 등록 ─────────────────────────────────

export function registerPresenceHandlers(io: Server, socket: Socket, user: TokenPayload) {
  // 학생 이벤트
  if (user.role === 'student') {
    socket.on('presence:enter', async (data) => {
      const { chapterId, pageId, studentName } = data || {};
      if (!chapterId || !pageId) return;

      const allowed = await validateStudentChapterAccess(user.sub, chapterId);
      if (!allowed) return;

      // 이전에 다른 챕터에 있었으면 기존 presence 제거
      const prev = socketToPresence.get(socket.id);
      if (prev && prev.chapterId !== chapterId) {
        removePresence(io, socket.id);
      }

      // chapterPresence에 저장
      let chMap = chapterPresence.get(chapterId);
      if (!chMap) {
        chMap = new Map();
        chapterPresence.set(chapterId, chMap);
      }

      const existing = chMap.get(user.sub);
      chMap.set(user.sub, {
        pageId,
        socketId: socket.id,
        studentName: studentName || '이름 없음',
        joinedAt: existing?.joinedAt || new Date(),
      });

      // 역인덱스 업데이트
      socketToPresence.set(socket.id, { chapterId, studentId: user.sub });

      // 브로드캐스트
      io.to(`chapter:${chapterId}`).emit('presence:updated', {
        studentId: user.sub,
        studentName: studentName || '이름 없음',
        pageId,
        joinedAt: (existing?.joinedAt || new Date()).toISOString(),
      });
    });

    socket.on('presence:leave', () => {
      removePresence(io, socket.id);
    });

    socket.on('disconnect', () => {
      removePresence(io, socket.id);
    });
  }

  // 교사 이벤트
  if (user.role === 'teacher') {
    socket.on('presence:get', (data, callback) => {
      if (typeof callback !== 'function') return;
      const { chapterId } = data || {};
      if (!chapterId) { callback([]); return; }
      callback(getChapterPresence(chapterId));
    });
  }
}
