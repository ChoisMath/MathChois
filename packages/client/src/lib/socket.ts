/**
 * Socket.IO 클라이언트 — Supabase Realtime 대체
 *
 * - 싱글톤 패턴으로 연결 관리
 * - access token 변경 시 재연결
 * - room join/leave 헬퍼 제공
 * - 모바일 visibilitychange 재연결
 */

import { io, Socket } from 'socket.io-client';
import { getAccessToken } from './api';

let socket: Socket | null = null;
const joinedRooms = new Set<string>();

/** Socket.IO 서버 URL (dev: Vite proxy 사용) */
const SOCKET_URL = import.meta.env.VITE_API_URL ?? '';

/**
 * Socket.IO 연결을 가져오거나 생성
 * access token이 변경되면 기존 연결을 끊고 새로 연결
 */
export function getSocket(): Socket | null {
  return socket;
}

export function connectSocket(): Socket {
  const token = getAccessToken();
  if (!token) {
    throw new Error('Cannot connect socket without access token');
  }

  // 이미 연결되어 있으면 반환
  if (socket?.connected) {
    return socket;
  }

  // 기존 연결이 있으면 정리
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }

  socket = io(SOCKET_URL, {
    auth: { token },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    transports: ['websocket', 'polling'],
  });

  // 재연결 시 기존 room 자동 재참가
  socket.on('connect', () => {
    for (const room of joinedRooms) {
      socket!.emit('join-room', room);
    }
  });

  return socket;
}

/** 연결 종료 */
export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  joinedRooms.clear();
}

/** access token 갱신 시 호출 — 재연결 */
export function reconnectWithToken(): void {
  const wasConnected = socket?.connected;
  if (wasConnected || joinedRooms.size > 0) {
    connectSocket();
  }
}

// ─── Room 관리 ─────────────────────────────────

export function joinRoom(room: string): void {
  joinedRooms.add(room);
  if (socket?.connected) {
    socket.emit('join-room', room);
  }
}

export function leaveRoom(room: string): void {
  joinedRooms.delete(room);
  if (socket?.connected) {
    socket.emit('leave-room', room);
  }
}

export function leaveAllRooms(): void {
  for (const room of joinedRooms) {
    if (socket?.connected) {
      socket.emit('leave-room', room);
    }
  }
  joinedRooms.clear();
}

// ─── 이벤트 구독 헬퍼 ──────────────────────────

type EventCallback = (...args: any[]) => void;

/**
 * room에 참가하고 이벤트를 구독, 정리 함수 반환
 * React useEffect에서 사용:
 * ```
 * useEffect(() => {
 *   return subscribeToRoom('chapter:abc', 'student-note:updated', (data) => { ... });
 * }, []);
 * ```
 */
export function subscribeToRoom(
  room: string,
  event: string,
  callback: EventCallback,
): () => void {
  joinRoom(room);
  socket?.on(event, callback);

  return () => {
    socket?.off(event, callback);
    leaveRoom(room);
  };
}

// ─── 모바일 visibilitychange 재연결 ───────────

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && socket && !socket.connected) {
      socket.connect();
    }
  });
}
