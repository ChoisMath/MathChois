import { useEffect, useRef, useCallback } from 'react';
import { diffChangedElements, markVersions } from '@mathchois/shared';
import { connectSocket, getSocket } from '../lib/socket';

const ELEMENTS_THROTTLE_MS = 100;
const POINTER_THROTTLE_MS = 50;
const MAX_BATCH = 400;

/**
 * 화이트보드 소켓 협업 훅 (보드 하나).
 *
 * 콜백은 ref 로 보관하므로 매 렌더마다 바뀌어도 재구독하지 않는다.
 * 반환 함수는 안정적(useCallback, deps 없음).
 */
export function useWhiteboardCollab({
  boardId, enabled = true,
  onInit, onElements, onScene, onLock, onSettings, onBackground, onFiles, onPresence, onPointer, onRejected, onRemoved,
}) {
  const cbs = useRef({});
  const boardIdRef = useRef(boardId);
  useEffect(() => {
    cbs.current = { onInit, onElements, onScene, onLock, onSettings, onBackground, onFiles, onPresence, onPointer, onRejected, onRemoved };
  });
  useEffect(() => { boardIdRef.current = boardId; }, [boardId]);

  const lastVersionsRef = useRef(new Map());
  const pendingRef = useRef(new Map());     // id → element (마지막 값)
  const flushTimerRef = useRef(null);
  const lastPointerAtRef = useRef(0);
  const pointerTimerRef = useRef(null);
  const pointerPendingRef = useRef(null);

  const emit = useCallback((event, payload) => {
    const s = getSocket();
    if (s?.connected) s.emit(event, payload);
  }, []);

  const flushElements = useCallback(() => {
    flushTimerRef.current = null;
    const id = boardIdRef.current;
    if (!id || pendingRef.current.size === 0) return;
    const all = Array.from(pendingRef.current.values());
    pendingRef.current = new Map();
    for (let i = 0; i < all.length; i += MAX_BATCH) {
      emit('wb:elements', { boardId: id, elements: all.slice(i, i + MAX_BATCH) });
    }
  }, [emit]);

  /** onChange 의 전체 요소를 넘기면 바뀐 것만 골라 100ms 스로틀로 전송 */
  const sendElements = useCallback((elements) => {
    const changed = diffChangedElements(elements, lastVersionsRef.current);
    if (changed.length === 0) return;
    for (const el of changed) pendingRef.current.set(el.id, el);
    if (!flushTimerRef.current) flushTimerRef.current = setTimeout(flushElements, ELEMENTS_THROTTLE_MS);
  }, [flushElements]);

  /** init / scene 수신 요소의 version 을 기록만 (재전송 방지) */
  const markKnown = useCallback((elements) => { markVersions(elements, lastVersionsRef.current); }, []);
  const resetKnown = useCallback(() => { lastVersionsRef.current = new Map(); pendingRef.current = new Map(); }, []);

  const sendPointer = useCallback((x, y, tool = 'pointer', button = 'up') => {
    const id = boardIdRef.current;
    if (!id) return;
    const now = Date.now();
    const payload = { boardId: id, x, y, tool, button };
    if (now - lastPointerAtRef.current >= POINTER_THROTTLE_MS) {
      lastPointerAtRef.current = now;
      const s = getSocket();
      if (s?.connected) s.volatile.emit('wb:pointer', payload);
      return;
    }
    pointerPendingRef.current = payload;
    if (!pointerTimerRef.current) {
      pointerTimerRef.current = setTimeout(() => {
        pointerTimerRef.current = null;
        const p = pointerPendingRef.current;
        pointerPendingRef.current = null;
        if (p && p.boardId === boardIdRef.current) {
          lastPointerAtRef.current = Date.now();
          const s = getSocket();
          if (s?.connected) s.volatile.emit('wb:pointer', p);
        }
      }, POINTER_THROTTLE_MS);
    }
  }, []);

  const sendBackground = useCallback((color) => {
    if (boardIdRef.current) emit('wb:background', { boardId: boardIdRef.current, color });
  }, [emit]);

  const sendFiles = useCallback((files) => {
    if (boardIdRef.current && files && Object.keys(files).length > 0) {
      emit('wb:files', { boardId: boardIdRef.current, files });
    }
  }, [emit]);

  useEffect(() => {
    if (!enabled || !boardId) return undefined;
    let socket = getSocket();
    if (!socket) {
      try { socket = connectSocket(); } catch { return undefined; }
    }
    const s = socket;
    lastVersionsRef.current = new Map();
    pendingRef.current = new Map();

    const forBoard = (fn) => (data) => { if (data?.boardId === boardId) fn?.(data); };
    const handlers = {
      'wb:init':       forBoard((d) => cbs.current.onInit?.(d)),
      'wb:elements':   forBoard((d) => cbs.current.onElements?.(d.elements)),
      'wb:scene':      forBoard((d) => cbs.current.onScene?.(d)),
      'wb:lock':       forBoard((d) => cbs.current.onLock?.(d)),
      'wb:settings':   (d) => cbs.current.onSettings?.(d),
      'wb:background': forBoard((d) => cbs.current.onBackground?.(d.color)),
      'wb:files':      forBoard((d) => cbs.current.onFiles?.(d.files)),
      'wb:presence':   forBoard((d) => cbs.current.onPresence?.(d.users)),
      'wb:pointer':    forBoard((d) => cbs.current.onPointer?.(d)),
      'wb:rejected':   forBoard((d) => cbs.current.onRejected?.(d.reason)),
      'wb:removed':    forBoard(() => cbs.current.onRemoved?.()),
    };
    const join = () => s.emit('wb:join', { boardId });
    for (const [ev, h] of Object.entries(handlers)) s.on(ev, h);
    s.on('connect', join);
    if (s.connected) join();

    return () => {
      for (const [ev, h] of Object.entries(handlers)) s.off(ev, h);
      s.off('connect', join);
      if (flushTimerRef.current) { clearTimeout(flushTimerRef.current); flushTimerRef.current = null; }
      if (pointerTimerRef.current) { clearTimeout(pointerTimerRef.current); pointerTimerRef.current = null; }
      pendingRef.current = new Map();
      if (s.connected) s.emit('wb:leave', { boardId });
    };
  }, [boardId, enabled]);

  return { sendElements, markKnown, resetKnown, sendPointer, sendBackground, sendFiles };
}
