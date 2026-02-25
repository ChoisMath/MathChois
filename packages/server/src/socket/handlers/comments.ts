import type { Server, Socket } from 'socket.io';
import type { TokenPayload } from '@mathchois/shared';

/**
 * teacher-comment 관련 Socket 이벤트
 *
 * Room: `comments:{pageId}:{studentId}` — StudyViewer에서 교사 코멘트 실시간 수신
 */
export function registerCommentHandlers(io: Server, socket: Socket, user: TokenPayload) {
  // 서버 라우트에서 직접 emit하므로 클라이언트→서버 이벤트 불필요
}

/**
 * 서버 라우트에서 호출: 교사 코멘트 변경 브로드캐스트
 */
export function emitTeacherCommentUpdated(
  io: Server,
  pageId: string,
  studentId: string,
  updatedAt: Date,
) {
  io.to(`comments:${pageId}:${studentId}`).emit('teacher-comment:updated', {
    pageId,
    studentId,
    updatedAt: updatedAt.toISOString(),
  });
}
