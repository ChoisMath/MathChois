import type { Server, Socket } from 'socket.io';
import type { TokenPayload } from '@mathchois/shared';

/**
 * 과제 관련 Socket 이벤트
 *
 * Rooms:
 * - `assignment:{assignmentId}` — AssignmentMonitor에서 제출 현황 모니터링
 * - `asn-comments:{pageId}:{studentId}` — 과제 교사 코멘트 실시간 수신
 */
export function registerAssignmentHandlers(io: Server, socket: Socket, user: TokenPayload) {
  // 서버 라우트에서 직접 emit
}

/** 제출 상태 변경 브로드캐스트 */
export function emitSubmissionUpdated(
  io: Server,
  assignmentId: string,
  studentId: string,
  status: string,
  score?: number | null,
) {
  io.to(`assignment:${assignmentId}`).emit('submission:updated', {
    studentId,
    status,
    score,
  });
}

/** 과제 교사 코멘트 변경 브로드캐스트 */
export function emitAssignmentCommentUpdated(
  io: Server,
  pageId: string,
  studentId: string,
  updatedAt: Date,
) {
  io.to(`asn-comments:${pageId}:${studentId}`).emit('asn-comment:updated', {
    pageId,
    studentId,
    updatedAt: updatedAt.toISOString(),
  });
}
