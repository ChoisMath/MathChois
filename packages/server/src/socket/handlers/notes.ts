import type { Server, Socket } from 'socket.io';
import type { TokenPayload } from '@mathchois/shared';

/**
 * student-note 관련 Socket 이벤트
 *
 * Rooms:
 * - `chapter:{chapterId}` — ChapterMonitor에서 학생 진도 모니터링
 * - `work:{pageId}:{studentId}` — StudentWorkViewer에서 학생 필기 실시간 확인
 */
export function registerNoteHandlers(io: Server, socket: Socket, user: TokenPayload) {
  // 학생이 필기를 저장했을 때 (REST API에서 호출하는 대신 socket으로도 emit 가능)
  // 실제로는 notes 라우트의 upsert 후 서버에서 직접 emit
}

/**
 * 서버 라우트에서 호출: 학생 필기 변경 브로드캐스트
 */
export function emitStudentNoteUpdated(
  io: Server,
  chapterId: string,
  pageId: string,
  studentId: string,
  updatedAt: Date,
) {
  // ChapterMonitor: 학생 진도 갱신
  io.to(`chapter:${chapterId}`).emit('student-note:updated', {
    studentId,
    pageId,
    updatedAt: updatedAt.toISOString(),
  });

  // StudentWorkViewer: 학생 필기 실시간 확인
  io.to(`work:${pageId}:${studentId}`).emit('student-note:updated', {
    studentId,
    pageId,
    updatedAt: updatedAt.toISOString(),
  });
}

/**
 * 서버 라우트에서 호출: 교사 필기 변경 브로드캐스트
 * Room: `teacher-notes:{pageId}` — 해당 페이지를 보는 모든 학생에게 전송
 */
export function emitTeacherNoteUpdated(
  io: Server,
  pageId: string,
  updatedAt: Date,
) {
  io.to(`teacher-notes:${pageId}`).emit('teacher-note:updated', {
    pageId,
    updatedAt: updatedAt.toISOString(),
  });
}
