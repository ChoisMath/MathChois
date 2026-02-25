import { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { TokenPayload } from '@mathchois/shared';
import { registerNoteHandlers } from './handlers/notes.js';
import { registerCommentHandlers } from './handlers/comments.js';
import { registerAssignmentHandlers } from './handlers/assignments.js';

let io: Server | null = null;

export function getIO(): Server {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
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
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  // ─── Connection handler ────────────────────────

  io.on('connection', (socket) => {
    const user = socket.data.user as TokenPayload;

    // Room join/leave
    socket.on('join-room', (room: string) => {
      socket.join(room);
    });

    socket.on('leave-room', (room: string) => {
      socket.leave(room);
    });

    // Register domain-specific handlers
    registerNoteHandlers(io!, socket, user);
    registerCommentHandlers(io!, socket, user);
    registerAssignmentHandlers(io!, socket, user);
  });

  return io;
}
