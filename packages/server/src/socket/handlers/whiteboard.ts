import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import type { FastifyBaseLogger } from 'fastify';
import type {
  TokenPayload, WbUser, WbInitPayload, WbScenePayload, WhiteboardFileRef, WhiteboardSceneData,
} from '@mathchois/shared';
import { mergeElements, pruneDeleted, countLiveElements, type WbElement } from '@mathchois/shared';
import {
  getBoardRow, getBoardAccess, saveBoardScene, updateGroup, getProfileName, type BoardAccess,
} from '../../services/whiteboard.service.js';

/**
 * 화이트보드 실시간 협업 — room `wb:{boardId}`
 *
 * 서버가 보드별 권위 있는 장면을 메모리에 두고 요소 단위로 병합·브로드캐스트한다.
 * 저장: 변경 후 2초 디바운스, 첫 변경 후 최대 10초, 마지막 접속자 퇴장 시 즉시.
 * 단일 서버 인스턴스 전제(Railway).
 */

const SAVE_DEBOUNCE_MS = 2_000;
const SAVE_MAX_MS = 10_000;
const EVICT_MS = 5 * 60_000;
const ACCESS_TTL_MS = 30_000;
const PRUNE_DELETED_MS = 10 * 60_000;
const MAX_ELEMENTS_PER_BATCH = 500;
const MAX_ELEMENT_BYTES = 200 * 1024;
const MAX_FILES = 200;

interface BoardState {
  id: string;
  pageId: string;
  classroomId: string;
  elements: Map<string, WbElement>;
  files: Record<string, WhiteboardFileRef>;
  backgroundColor: string;
  locked: boolean;
  lockedAll: boolean;
  allowCrossGroupView: boolean;
  sceneVersion: number;
  dirty: boolean;
  saveTimer: NodeJS.Timeout | null;
  firstDirtyAt: number;
  saving: Promise<void> | null;
  users: Map<string, WbUser>;
  evictTimer: NodeJS.Timeout | null;
}

const boards = new Map<string, BoardState>();
const loading = new Map<string, Promise<BoardState | null>>();
/** socketId → 참여 중인 boardId 집합 (disconnect 정리) */
const socketBoards = new Map<string, Set<string>>();

let ioRef: Server | null = null;
let log: FastifyBaseLogger | null = null;

const room = (boardId: string) => `wb:${boardId}`;

/* ─── 적재 / 저장 / 해제 ─── */

async function loadBoard(boardId: string): Promise<BoardState | null> {
  const cached = boards.get(boardId);
  if (cached) return cached;
  const pending = loading.get(boardId);
  if (pending) return pending;

  const p = (async () => {
    const row = await getBoardRow(boardId);
    if (!row) return null;
    // settings 는 getBoardAccess 가 함께 읽으므로 여기서는 보드 행만 — lockedAll/allowCrossGroupView 는 join 시 갱신
    const state: BoardState = {
      id: row.id, pageId: row.pageId, classroomId: row.classroomId,
      elements: new Map(row.scene.elements.map((el) => [String((el as WbElement).id), el as WbElement])),
      files: { ...row.scene.files },
      backgroundColor: row.backgroundColor, locked: row.locked, lockedAll: false, allowCrossGroupView: false,
      sceneVersion: row.sceneVersion, dirty: false, saveTimer: null, firstDirtyAt: 0, saving: null,
      users: new Map(), evictTimer: null,
    };
    if (!boards.has(boardId)) boards.set(boardId, state);
    return boards.get(boardId)!;
  })();
  loading.set(boardId, p);
  try { return await p; } finally { loading.delete(boardId); }
}

function sceneOf(state: BoardState): WhiteboardSceneData {
  return { elements: Array.from(state.elements.values()), files: state.files };
}

async function flushBoard(state: BoardState): Promise<void> {
  if (state.saveTimer) { clearTimeout(state.saveTimer); state.saveTimer = null; }
  if (!state.dirty) return;
  if (state.saving) { await state.saving; if (!state.dirty) return; }
  state.dirty = false;
  state.firstDirtyAt = 0;
  const pruned = pruneDeleted(Array.from(state.elements.values()), PRUNE_DELETED_MS);
  if (pruned.length !== state.elements.size) {
    state.elements = new Map(pruned.map((el) => [el.id, el]));
  }
  const scene = sceneOf(state);
  const version = state.sceneVersion;
  state.saving = saveBoardScene(state.id, scene, version)
    .catch((err) => {
      state.dirty = true; // 다음 저장에서 재시도
      log?.error({ boardId: state.id, err }, 'whiteboard save failed');
    })
    .finally(() => { state.saving = null; });
  await state.saving;
}

function scheduleSave(state: BoardState): void {
  state.dirty = true;
  const now = Date.now();
  if (!state.firstDirtyAt) state.firstDirtyAt = now;
  if (state.saveTimer) clearTimeout(state.saveTimer);
  const remainingMax = Math.max(0, state.firstDirtyAt + SAVE_MAX_MS - now);
  const delay = Math.min(SAVE_DEBOUNCE_MS, remainingMax);
  state.saveTimer = setTimeout(() => { void flushBoard(state); }, delay);
}

function scheduleEvict(state: BoardState): void {
  if (state.evictTimer) clearTimeout(state.evictTimer);
  state.evictTimer = setTimeout(async () => {
    if (state.users.size > 0) return;
    await flushBoard(state);
    if (state.users.size === 0) boards.delete(state.id);
  }, EVICT_MS);
}

/** 종료 시 전체 저장 (index.ts shutdown 에서 호출) */
export async function flushAllWhiteboards(): Promise<void> {
  await Promise.all(Array.from(boards.values()).map((s) => flushBoard(s)));
}

/* ─── 외부(라우트)에서 호출하는 브로드캐스트 ─── */

export function emitBoardScene(boardId: string, scene: WhiteboardSceneData, backgroundColor: string, reason: WbScenePayload['reason']): void {
  const state = boards.get(boardId);
  if (state) {
    state.elements = new Map(scene.elements.map((el) => [String((el as WbElement).id), el as WbElement]));
    state.files = { ...scene.files };
    state.backgroundColor = backgroundColor;
    state.sceneVersion += 1;
    state.dirty = false; // DB 가 이미 최신
    if (state.saveTimer) { clearTimeout(state.saveTimer); state.saveTimer = null; }
  }
  ioRef?.to(room(boardId)).emit('wb:scene', {
    boardId, elements: scene.elements, files: scene.files, backgroundColor, reason,
  } satisfies WbScenePayload);
}

export function emitBoardLock(boardId: string, locked: boolean): void {
  const state = boards.get(boardId);
  if (state) state.locked = locked;
  ioRef?.to(room(boardId)).emit('wb:lock', { boardId, locked, lockedAll: state?.lockedAll ?? false });
}

export function emitPageSettings(boardIds: string[], pageId: string, classroomId: string, settings: { lockedAll: boolean; allowCrossGroupView: boolean }): void {
  for (const id of boardIds) {
    const state = boards.get(id);
    if (state) { state.lockedAll = settings.lockedAll; state.allowCrossGroupView = settings.allowCrossGroupView; }
    ioRef?.to(room(id)).emit('wb:lock', { boardId: id, locked: state?.locked ?? false, lockedAll: settings.lockedAll });
    ioRef?.to(room(id)).emit('wb:settings', { pageId, classroomId, ...settings });
  }
}

export function dropBoards(boardIds: string[]): void {
  for (const id of boardIds) {
    const state = boards.get(id);
    if (state) {
      if (state.saveTimer) clearTimeout(state.saveTimer);
      if (state.evictTimer) clearTimeout(state.evictTimer);
      boards.delete(id);
    }
    ioRef?.to(room(id)).emit('wb:removed', { boardId: id });
    ioRef?.in(room(id)).socketsLeave(room(id));
  }
}

/**
 * 템플릿 원자 적용: 메모리 장면(없으면 DB)의 살아있는 요소가 0개일 때만 삽입.
 * 동시에 두 클라이언트가 빈 보드에 템플릿을 넣으려 해도 한 번만 들어간다.
 */
export async function applyTemplateAtomic(boardId: string, elements: WbElement[], author: { id: string; name: string }): Promise<boolean> {
  const state = await loadBoard(boardId);
  if (!state) return false;
  if (countLiveElements(Array.from(state.elements.values())) > 0) return false;
  const stamped = elements.map((el) => ({
    ...el,
    customData: { ...(el.customData ?? {}), authorId: author.id, authorName: author.name },
  }));
  state.elements = new Map(stamped.map((el) => [el.id, el]));
  state.sceneVersion += 1;
  scheduleSave(state);
  ioRef?.to(room(boardId)).emit('wb:scene', {
    boardId, elements: stamped, files: state.files, backgroundColor: state.backgroundColor, reason: 'template',
  } satisfies WbScenePayload);
  return true;
}

export function getBoardUsers(boardId: string): WbUser[] {
  return Array.from(boards.get(boardId)?.users.values() ?? []);
}

/** 라우트의 GET groups/:gid 가 메모리 장면을 우선 쓰도록 */
export function getBoardSceneFromMemory(boardId: string): { scene: WhiteboardSceneData; backgroundColor: string } | null {
  const state = boards.get(boardId);
  if (!state) return null;
  return { scene: sceneOf(state), backgroundColor: state.backgroundColor };
}

/* ─── 핸들러 ─── */

const joinSchema = z.object({ boardId: z.string().uuid() });
const elementsSchema = z.object({
  boardId: z.string().uuid(),
  elements: z.array(z.record(z.unknown())).min(1).max(MAX_ELEMENTS_PER_BATCH),
});
const pointerSchema = z.object({
  boardId: z.string().uuid(), x: z.number(), y: z.number(),
  tool: z.enum(['pointer', 'laser']).default('pointer'), button: z.enum(['up', 'down']).default('up'),
});
const backgroundSchema = z.object({ boardId: z.string().uuid(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) });
const filesSchema = z.object({
  boardId: z.string().uuid(),
  files: z.record(z.object({
    id: z.string().min(1).max(200),
    url: z.string().startsWith('/api/files/whiteboard-files/').max(1000),
    mimeType: z.string().regex(/^image\/(png|jpe?g|gif|webp)$/),
  })).refine((f) => Object.keys(f).length <= 50, 'too many files'),
});

type AccessCache = Map<string, { access: BoardAccess; at: number }>;

export function registerWhiteboardHandlers(io: Server, socket: Socket, user: TokenPayload) {
  ioRef = io;
  const accessCache: AccessCache = new Map();
  let displayName: string | null = null;

  const getName = async () => {
    if (displayName === null) displayName = (await getProfileName(user.sub)) || (user.role === 'teacher' ? '교사' : '학생');
    return displayName;
  };

  const getAccess = async (boardId: string, force = false): Promise<BoardAccess | null> => {
    const c = accessCache.get(boardId);
    if (!force && c && Date.now() - c.at < ACCESS_TTL_MS) return c.access;
    const access = await getBoardAccess(boardId, user);
    if (access) accessCache.set(boardId, { access, at: Date.now() });
    return access;
  };

  const presence = (state: BoardState) => {
    io.to(room(state.id)).emit('wb:presence', { boardId: state.id, users: Array.from(state.users.values()) });
  };

  const leaveBoard = async (boardId: string) => {
    const state = boards.get(boardId);
    socketBoards.get(socket.id)?.delete(boardId);
    socket.leave(room(boardId));
    if (!state) return;
    if (state.users.delete(socket.id)) presence(state);
    if (state.users.size === 0) {
      await flushBoard(state);
      scheduleEvict(state);
    }
  };

  socket.on('wb:join', async (raw: unknown) => {
    const parsed = joinSchema.safeParse(raw);
    if (!parsed.success) return socket.emit('wb:rejected', { boardId: '', reason: 'invalid' });
    const { boardId } = parsed.data;
    try {
      const access = await getAccess(boardId, true);
      if (!access?.canRead) return socket.emit('wb:rejected', { boardId, reason: 'forbidden' });
      const state = await loadBoard(boardId);
      if (!state) return socket.emit('wb:rejected', { boardId, reason: 'forbidden' });
      state.locked = access.locked;
      state.lockedAll = access.lockedAll;
      state.allowCrossGroupView = access.allowCrossGroupView;
      if (state.evictTimer) { clearTimeout(state.evictTimer); state.evictTimer = null; }

      const name = await getName();
      const me: WbUser = { socketId: socket.id, userId: user.sub, name, role: user.role === 'teacher' ? 'teacher' : 'student' };
      state.users.set(socket.id, me);
      if (!socketBoards.has(socket.id)) socketBoards.set(socket.id, new Set());
      socketBoards.get(socket.id)!.add(boardId);
      socket.join(room(boardId));

      const readOnly = !access.canWrite || (!access.isTeacher && (state.locked || state.lockedAll));
      const init: WbInitPayload = {
        boardId,
        elements: Array.from(state.elements.values()),
        files: state.files,
        backgroundColor: state.backgroundColor,
        locked: state.locked,
        lockedAll: state.lockedAll,
        readOnly,
        allowCrossGroupView: state.allowCrossGroupView,
        users: Array.from(state.users.values()),
      };
      socket.emit('wb:init', init);
      presence(state);
    } catch (err) {
      log?.error({ boardId, userId: user.sub, err }, 'wb:join failed');
      socket.emit('wb:rejected', { boardId, reason: 'invalid' });
    }
  });

  socket.on('wb:leave', (raw: unknown) => {
    const parsed = joinSchema.safeParse(raw);
    if (parsed.success) void leaveBoard(parsed.data.boardId);
  });

  socket.on('wb:elements', async (raw: unknown) => {
    const parsed = elementsSchema.safeParse(raw);
    if (!parsed.success) return socket.emit('wb:rejected', { boardId: '', reason: 'invalid' });
    const { boardId } = parsed.data;
    const state = boards.get(boardId);
    if (!state || !state.users.has(socket.id)) return socket.emit('wb:rejected', { boardId, reason: 'forbidden' });

    const access = await getAccess(boardId);
    if (!access?.canWrite) return socket.emit('wb:rejected', { boardId, reason: 'forbidden' });
    if (!access.isTeacher && (state.locked || state.lockedAll)) {
      return socket.emit('wb:rejected', { boardId, reason: 'locked' });
    }

    const incoming: WbElement[] = [];
    for (const el of parsed.data.elements) {
      if (JSON.stringify(el).length > MAX_ELEMENT_BYTES) continue;
      incoming.push(el as unknown as WbElement);
    }
    const accepted = mergeElements(state.elements, incoming, {
      authorId: user.sub, authorName: await getName(), isStudent: user.role !== 'teacher',
    });
    if (accepted.length === 0) return;
    state.sceneVersion += 1;
    scheduleSave(state);
    socket.to(room(boardId)).emit('wb:elements', { boardId, elements: accepted });
  });

  socket.on('wb:pointer', async (raw: unknown) => {
    const parsed = pointerSchema.safeParse(raw);
    if (!parsed.success) return;
    const state = boards.get(parsed.data.boardId);
    const me = state?.users.get(socket.id);
    if (!state || !me) return;
    socket.to(room(state.id)).volatile.emit('wb:pointer', { ...parsed.data, ...me });
  });

  socket.on('wb:background', async (raw: unknown) => {
    const parsed = backgroundSchema.safeParse(raw);
    if (!parsed.success) return;
    const { boardId, color } = parsed.data;
    const state = boards.get(boardId);
    if (!state || !state.users.has(socket.id)) return;
    const access = await getAccess(boardId);
    if (!access?.canWrite) return socket.emit('wb:rejected', { boardId, reason: 'forbidden' });
    if (!access.isTeacher && (state.locked || state.lockedAll)) return socket.emit('wb:rejected', { boardId, reason: 'locked' });
    state.backgroundColor = color;
    io.to(room(boardId)).emit('wb:background', { boardId, color });
    updateGroup(boardId, { backgroundColor: color }).catch((err) => log?.error({ boardId, err }, 'wb:background save failed'));
  });

  socket.on('wb:files', async (raw: unknown) => {
    const parsed = filesSchema.safeParse(raw);
    if (!parsed.success) return socket.emit('wb:rejected', { boardId: '', reason: 'invalid' });
    const { boardId, files } = parsed.data;
    const state = boards.get(boardId);
    if (!state || !state.users.has(socket.id)) return;
    const access = await getAccess(boardId);
    if (!access?.canWrite) return socket.emit('wb:rejected', { boardId, reason: 'forbidden' });
    if (Object.keys(state.files).length + Object.keys(files).length > MAX_FILES) {
      return socket.emit('wb:rejected', { boardId, reason: 'invalid' });
    }
    for (const [id, ref] of Object.entries(files)) {
      if (!state.files[id]) state.files[id] = { ...ref, id };
    }
    scheduleSave(state);
    socket.to(room(boardId)).emit('wb:files', { boardId, files });
  });

  socket.on('disconnect', () => {
    const set = socketBoards.get(socket.id);
    if (!set) return;
    for (const boardId of Array.from(set)) void leaveBoard(boardId);
    socketBoards.delete(socket.id);
  });
}

export function setWhiteboardLogger(logger: FastifyBaseLogger): void {
  log = logger;
}
