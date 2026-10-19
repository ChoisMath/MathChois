import { useEffect, useRef, useState } from 'react';
import { connectSocket, getSocket } from '../lib/socket';
import { mergeElements } from '@mathchois/shared';

const COMMIT_MS = 300;

/**
 * 교사 격자 보기 — 소켓 하나로 여러 보드에 join 해 보드별 장면을 state 로 유지한다.
 * 반환: { [boardId]: { elements: Map, files, backgroundColor, users, rev, ready } }
 * (요소 Map 은 가변 객체로 두고 rev 만 올려 타일이 2초 스로틀로 다시 그리게 한다)
 */
export function useWhiteboardGrid(boardIds, enabled = true) {
  const [scenes, setScenes] = useState({});
  const storeRef = useRef({});
  const dirtyRef = useRef(new Set());
  const timerRef = useRef(null);
  const key = boardIds.join(',');

  useEffect(() => {
    if (!enabled || boardIds.length === 0) return undefined;
    let socket = getSocket();
    if (!socket) { try { socket = connectSocket(); } catch { return undefined; } }
    const s = socket;
    const ids = new Set(boardIds);

    const ensure = (id) => {
      if (!storeRef.current[id]) {
        storeRef.current[id] = { elements: new Map(), files: {}, backgroundColor: '#ffffff', users: [], rev: 0, ready: false };
      }
      return storeRef.current[id];
    };
    const commit = (id) => {
      dirtyRef.current.add(id);
      if (timerRef.current) return;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const changed = Array.from(dirtyRef.current);
        dirtyRef.current = new Set();
        setScenes((prev) => {
          const next = { ...prev };
          for (const bid of changed) {
            const st = storeRef.current[bid];
            if (st) next[bid] = { ...st, rev: st.rev + 1 };
          }
          return next;
        });
      }, COMMIT_MS);
    };

    const handlers = {
      'wb:init': (d) => {
        if (!ids.has(d.boardId)) return;
        const st = ensure(d.boardId);
        st.elements = new Map(d.elements.map((el) => [el.id, el]));
        st.files = { ...d.files }; st.backgroundColor = d.backgroundColor; st.users = d.users; st.ready = true;
        commit(d.boardId);
      },
      'wb:elements': (d) => {
        if (!ids.has(d.boardId)) return;
        const st = ensure(d.boardId);
        // 수신 전용이므로 작성자 규칙은 교사(그대로 유지)로
        mergeElements(st.elements, d.elements, { authorId: '', authorName: '', isStudent: false });
        commit(d.boardId);
      },
      'wb:scene': (d) => {
        if (!ids.has(d.boardId)) return;
        const st = ensure(d.boardId);
        st.elements = new Map(d.elements.map((el) => [el.id, el]));
        st.files = { ...d.files }; st.backgroundColor = d.backgroundColor;
        commit(d.boardId);
      },
      'wb:background': (d) => { if (ids.has(d.boardId)) { ensure(d.boardId).backgroundColor = d.color; commit(d.boardId); } },
      'wb:files': (d) => { if (ids.has(d.boardId)) { const st = ensure(d.boardId); st.files = { ...st.files, ...d.files }; commit(d.boardId); } },
      'wb:presence': (d) => { if (ids.has(d.boardId)) { ensure(d.boardId).users = d.users; commit(d.boardId); } },
    };
    const joinAll = () => { for (const id of ids) s.emit('wb:join', { boardId: id }); };
    for (const [ev, h] of Object.entries(handlers)) s.on(ev, h);
    s.on('connect', joinAll);
    if (s.connected) joinAll();

    return () => {
      for (const [ev, h] of Object.entries(handlers)) s.off(ev, h);
      s.off('connect', joinAll);
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      if (s.connected) for (const id of ids) s.emit('wb:leave', { boardId: id });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  return scenes;
}
