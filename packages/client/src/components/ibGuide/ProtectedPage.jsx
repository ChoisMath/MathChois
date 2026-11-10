import { useEffect, useRef, useState } from 'react';
import { RotateCw } from 'lucide-react';
import { IA_DOC_LABELS } from '../../lib/ibGuide/labels';
import { fetchPageBitmap, isAbort } from '../../lib/ibGuide/pageFetch';

const DEFAULT_RATIO = 1600 / 2263;
const stop = (e) => e.preventDefault();

/**
 * 워터마크 찍힌 IA 쪽 하나를 <canvas> 에 그린다. <img>·object URL 은 쓰지 않는다(쪽 파일을 꺼낼 길을 만들지 않으려고).
 * load 가 true 가 되면 queue 에 줄을 서서 받고, false 가 되면 받던 것을 취소하고 캔버스를 비운다(메모리 반환).
 * 비트맵·Blob 은 그리는 동안만 지역 변수로 들고 있고 그린 뒤 바로 close 한다.
 *
 * @param {{ exId: string, doc: string, n: number, load: boolean, width: number, queue: ReturnType<import('../../lib/ibGuide/pageFetch').createFetchQueue>, onDenied: () => void }} props
 */
export default function ProtectedPage({ exId, doc, n, load, width, queue, onDenied }) {
  const canvasRef = useRef(null);
  const [status, setStatus] = useState('idle'); // idle | loading | drawn | error
  const [ratio, setRatio] = useState(DEFAULT_RATIO);
  const [attempt, setAttempt] = useState(0);
  // 부모가 렌더마다 새 함수를 줘도 다시 받지 않도록 ref 로 든다
  const onDeniedRef = useRef(onDenied);
  useEffect(() => { onDeniedRef.current = onDenied; }, [onDenied]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!load) {
      if (canvas && canvas.width) { canvas.width = 0; canvas.height = 0; }
      setStatus('idle');
      return undefined;
    }
    setStatus('loading');
    const job = queue.run(n, async (signal) => {
      const bitmap = await fetchPageBitmap(exId, doc, n, { signal });
      try {
        if (signal.aborted || !canvasRef.current) throw new DOMException('Aborted', 'AbortError');
        const c = canvasRef.current;
        c.width = bitmap.width;
        c.height = bitmap.height;
        c.getContext('2d').drawImage(bitmap, 0, 0);
        return bitmap.width / bitmap.height;
      } finally {
        bitmap.close();
      }
    });
    job.promise.then(
      (r) => { setRatio(r); setStatus('drawn'); },
      (err) => {
        if (isAbort(err)) return; // 화면에서 벗어나 취소된 것 — 오류가 아니다
        // refresh 뒤에도 401 이면 403 처럼 본다(권한이 사라진 것)
        if (err?.status === 403 || err?.status === 401) { onDeniedRef.current?.(); return; }
        setStatus('error');
      },
    );
    return () => job.cancel();
  }, [load, attempt, exId, doc, n, queue]);

  const label = `${IA_DOC_LABELS[doc] ?? ''} ${n}쪽`;

  return (
    <div className="ia-page" style={{ width, aspectRatio: ratio }} data-page={n} data-status={status}>
      <canvas
        ref={canvasRef}
        className="ia-page-canvas"
        aria-label={label}
        role="img"
        draggable={false}
        onContextMenu={stop}
        onDragStart={stop}
      />
      {status !== 'drawn' && status !== 'error' && (
        <span className="ia-page-placeholder" aria-hidden="true">{n}</span>
      )}
      {status === 'error' && (
        <div className="ia-page-error" role="alert">
          <p>이 쪽을 불러오지 못했어요</p>
          <button type="button" className="ia-page-retry" onClick={() => setAttempt((a) => a + 1)}>
            <RotateCw aria-hidden="true" />
            다시 시도
          </button>
        </div>
      )}
    </div>
  );
}
