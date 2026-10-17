import type { Server, Socket } from 'socket.io';
import type { TokenPayload } from '@mathchois/shared';

/**
 * 학급 영상 댓글 실시간 갱신
 *
 * Room: `video:{classroomVideoId}` — 시청 화면(교사·학생)이 구독.
 * 비공개("교사만 확인") 스레드 필터링은 서버 조회에서만 수행하므로 이벤트에는 본문을 싣지 않고,
 * 클라이언트가 `GET /api/classroom-videos/:id/comments` 를 재조회한다.
 */
export function registerVideoHandlers(_io: Server, _socket: Socket, _user: TokenPayload) {
  // 서버 라우트에서 직접 emit — 클라이언트→서버 이벤트 없음
}

export function emitVideoCommentChanged(io: Server, classroomVideoId: string) {
  io.to(`video:${classroomVideoId}`).emit('video-comment:changed', { classroomVideoId });
}
