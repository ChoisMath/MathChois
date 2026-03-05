import { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { eq, and } from 'drizzle-orm';
import { env } from '../config/env.js';
import { db } from '../config/database.js';
import { chapters, pages, classrooms, classroomMembers, assignments, assignmentPages } from '../db/schema.js';
import type { TokenPayload } from '@mathchois/shared';
import { registerNoteHandlers } from './handlers/notes.js';
import { registerCommentHandlers } from './handlers/comments.js';
import { registerAssignmentHandlers } from './handlers/assignments.js';
import { registerPresenceHandlers } from './handlers/presence.js';

let io: Server | null = null;

export function getIO(): Server {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
}

// ─── Room 패턴 정규식 ─────────────────────────

const ROOM_PATTERNS = {
  chapter:      /^chapter:([\w-]+)$/,
  work:         /^work:([\w-]+):([\w-]+)$/,
  comments:     /^comments:([\w-]+):([\w-]+)$/,
  teacherNotes: /^teacher-notes:([\w-]+)$/,
  assignment:   /^assignment:([\w-]+)$/,
  asnComments:  /^asn-comments:([\w-]+):([\w-]+)$/,
  asnWork:      /^asn-work:([\w-]+):([\w-]+)$/,
};

/** page → chapter → classroom → teacherId 추적 */
async function getPageOwnerTeacherId(pageId: string): Promise<string | null> {
  const page = await db.select({ chapterId: pages.chapterId })
    .from(pages).where(eq(pages.id, pageId)).limit(1);
  if (!page[0]) return null;
  const chapter = await db.select({ classroomId: chapters.classroomId })
    .from(chapters).where(eq(chapters.id, page[0].chapterId)).limit(1);
  if (!chapter[0]) return null;
  const cls = await db.select({ teacherId: classrooms.teacherId })
    .from(classrooms).where(eq(classrooms.id, chapter[0].classroomId)).limit(1);
  return cls[0]?.teacherId ?? null;
}

/** room 접근 권한 검증 */
async function validateRoomAccess(user: TokenPayload, room: string): Promise<boolean> {
  let m: RegExpMatchArray | null;

  // chapter:{chapterId} → teacher만 (교실 소유자)
  m = room.match(ROOM_PATTERNS.chapter);
  if (m) {
    if (user.role !== 'teacher') return false;
    const ch = await db.select({ classroomId: chapters.classroomId })
      .from(chapters).where(eq(chapters.id, m[1])).limit(1);
    if (!ch[0]) return false;
    const cls = await db.select({ teacherId: classrooms.teacherId })
      .from(classrooms).where(eq(classrooms.id, ch[0].classroomId)).limit(1);
    return cls[0]?.teacherId === user.sub;
  }

  // work:{pageId}:{studentId} → teacher만 (교실 소유자)
  m = room.match(ROOM_PATTERNS.work);
  if (m) {
    if (user.role !== 'teacher') return false;
    const teacherId = await getPageOwnerTeacherId(m[1]);
    return teacherId === user.sub;
  }

  // comments:{pageId}:{studentId} → teacher (교실 소유자) 또는 본인 학생
  m = room.match(ROOM_PATTERNS.comments);
  if (m) {
    const [, pageId, studentId] = m;
    if (user.role === 'student' && user.sub === studentId) return true;
    if (user.role !== 'teacher') return false;
    const teacherId = await getPageOwnerTeacherId(pageId);
    return teacherId === user.sub;
  }

  // assignment:{assignmentId} → teacher (소유자) 또는 교실 소속 학생
  m = room.match(ROOM_PATTERNS.assignment);
  if (m) {
    const asn = await db.select({
      teacherId: assignments.teacherId,
      classroomId: assignments.classroomId,
    }).from(assignments).where(eq(assignments.id, m[1])).limit(1);
    if (!asn[0]) return false;

    if (user.role === 'teacher') return asn[0].teacherId === user.sub;

    if (user.role === 'student') {
      const member = await db.select({ id: classroomMembers.id })
        .from(classroomMembers)
        .where(and(
          eq(classroomMembers.classroomId, asn[0].classroomId),
          eq(classroomMembers.studentId, user.sub),
        ))
        .limit(1);
      return member.length > 0;
    }
    return false;
  }

  // asn-comments:{pageId}:{studentId} → teacher (과제 소유자) 또는 본인 학생
  m = room.match(ROOM_PATTERNS.asnComments);
  if (m) {
    const [, pageId, studentId] = m;
    if (user.role === 'student' && user.sub === studentId) return true;
    if (user.role !== 'teacher') return false;
    const asnPage = await db.select({ assignmentId: assignmentPages.assignmentId })
      .from(assignmentPages).where(eq(assignmentPages.id, pageId)).limit(1);
    if (!asnPage[0]) return false;
    const asn = await db.select({ teacherId: assignments.teacherId })
      .from(assignments).where(eq(assignments.id, asnPage[0].assignmentId)).limit(1);
    return asn[0]?.teacherId === user.sub;
  }

  // asn-work:{pageId}:{studentId} → teacher만 (과제 소유자)
  m = room.match(ROOM_PATTERNS.asnWork);
  if (m) {
    if (user.role !== 'teacher') return false;
    const [, pageId] = m;
    const asnPage = await db.select({ assignmentId: assignmentPages.assignmentId })
      .from(assignmentPages).where(eq(assignmentPages.id, pageId)).limit(1);
    if (!asnPage[0]) return false;
    const asn = await db.select({ teacherId: assignments.teacherId })
      .from(assignments).where(eq(assignments.id, asnPage[0].assignmentId)).limit(1);
    return asn[0]?.teacherId === user.sub;
  }

  // teacher-notes:{pageId} → 교실 소속 학생 또는 교실 소유 교사
  m = room.match(ROOM_PATTERNS.teacherNotes);
  if (m) {
    const pageId = m[1];
    // page → chapter → classroom 추적
    const page = await db.select({ chapterId: pages.chapterId })
      .from(pages).where(eq(pages.id, pageId)).limit(1);
    if (!page[0]) return false;
    const chapter = await db.select({ classroomId: chapters.classroomId })
      .from(chapters).where(eq(chapters.id, page[0].chapterId)).limit(1);
    if (!chapter[0]) return false;
    const cls = await db.select({ teacherId: classrooms.teacherId })
      .from(classrooms).where(eq(classrooms.id, chapter[0].classroomId)).limit(1);
    if (!cls[0]) return false;

    // 교사: 교실 소유자만
    if (user.role === 'teacher') {
      return cls[0].teacherId === user.sub;
    }

    // 학생: 교실 구성원만
    if (user.role === 'student') {
      const member = await db.select({ id: classroomMembers.id })
        .from(classroomMembers)
        .where(and(
          eq(classroomMembers.classroomId, chapter[0].classroomId),
          eq(classroomMembers.studentId, user.sub),
        ))
        .limit(1);
      return member.length > 0;
    }

    return false;
  }

  return false; // 알 수 없는 room 패턴
}

export function setupSocketIO(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: env.NODE_ENV === 'production' ? false : 'http://localhost:3000',
      credentials: true,
    },
    pingInterval: 25000,
    pingTimeout: 60000,
  });

  // ─── JWT 인증 미들웨어 ─────────────────────────

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
      socket.data.user = payload;
      socket.data.validatedRooms = new Set<string>();
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  // ─── Connection handler ────────────────────────

  io.on('connection', (socket) => {
    const user = socket.data.user as TokenPayload;
    console.log('[Socket] Connected:', user.sub, user.role);

    socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', user.sub, reason);
    });

    // Room join with authorization
    socket.on('join-room', async (room: string) => {
      try {
        // 이미 검증된 room은 바로 join
        if (socket.data.validatedRooms.has(room)) {
          socket.join(room);
          return;
        }

        const allowed = await validateRoomAccess(user, room);
        if (allowed) {
          socket.data.validatedRooms.add(room);
          socket.join(room);
        } else {
          console.warn('[Socket] Access denied:', { room, userId: user.sub, role: user.role });
          socket.emit('error', { message: 'Access denied', room });
        }
      } catch (err) {
        console.error('[Socket] Room join error:', { room, userId: user.sub, error: err });
        socket.emit('error', { message: 'Room join failed', room });
      }
    });

    socket.on('leave-room', (room: string) => {
      socket.leave(room);
    });

    // Register domain-specific handlers
    registerNoteHandlers(io!, socket, user);
    registerCommentHandlers(io!, socket, user);
    registerAssignmentHandlers(io!, socket, user);
    registerPresenceHandlers(io!, socket, user);
  });

  return io;
}
