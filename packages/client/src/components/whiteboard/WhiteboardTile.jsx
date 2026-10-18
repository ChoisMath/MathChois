import { useEffect, useRef, useState } from 'react';
import { Lock, Users } from 'lucide-react';
import { renderBoardThumbnail } from '../../lib/whiteboardExportBrowser';

const RENDER_MS = 2000;

/**
 * 격자 보기 타일 — Excalidraw 편집기를 띄우지 않고 정적 캔버스로 2초 스로틀 렌더.
 * scene: { elements: Map, files, backgroundColor, users, rev, ready }
 */
export default function WhiteboardTile({ board, scene, onClick }) {
  const canvasRef = useRef(null);
  const lastRenderRef = useRef(0);
  const timerRef = useRef(null);
  const renderingRef = useRef(false);
  const [visible, setVisible] = useState(true);
  const rev = scene?.rev ?? 0;

  /* 화면 밖 타일은 그리지 않는다 */
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const obs = new IntersectionObserver((entries) => setVisible(entries.some((e) => e.isIntersecting)), { rootMargin: '200px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!scene?.ready || !visible) return undefined;
    const doRender = async () => {
      if (renderingRef.current) { timerRef.current = setTimeout(doRender, 300); return; }
      renderingRef.current = true;
      lastRenderRef.current = Date.now();
      try {
        const src = await renderBoardThumbnail({
          elements: Array.from(scene.elements.values()), files: scene.files, backgroundColor: scene.backgroundColor,
        });
        const dst = canvasRef.current;
        if (dst && src) {
          dst.width = src.width; dst.height = src.height;
          dst.getContext('2d').drawImage(src, 0, 0);
        }
      } catch (err) {
        console.warn('[whiteboard] tile render failed', err?.message);
      } finally {
        renderingRef.current = false;
      }
    };
    const wait = Math.max(0, lastRenderRef.current + RENDER_MS - Date.now());
    timerRef.current = setTimeout(doRender, wait);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [rev, visible, scene]);

  const users = scene?.users ?? [];
  return (
    <button
      type="button" onClick={onClick}
      className="group text-left bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all overflow-hidden cursor-pointer flex flex-col"
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b">
        <span className="font-medium text-sm text-gray-900 truncate flex-1">{board.name}</span>
        {board.locked && <Lock className="h-3.5 w-3.5 text-amber-600" title="편집 잠금" />}
        <span className="inline-flex items-center gap-1 text-xs text-gray-500" title={users.map((u) => u.name).join(', ')}>
          <Users className="h-3.5 w-3.5" /> {users.length}
        </span>
      </div>
      <div className="relative aspect-video bg-gray-50 flex items-center justify-center">
        <canvas ref={canvasRef} className="max-w-full max-h-full" />
        {!scene?.ready && <span className="absolute text-xs text-gray-400">연결 중...</span>}
      </div>
      <div className="px-3 py-1.5 text-xs text-gray-500 truncate">
        {board.members.length > 0 ? board.members.map((m) => m.name).join(', ') : '구성원 없음'}
      </div>
    </button>
  );
}
