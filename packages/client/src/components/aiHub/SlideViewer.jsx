import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Maximize, X } from 'lucide-react';
import IconButton from '../common/IconButton';
import { stepSlide, stepStyle } from '../../lib/aiHub/slideOrder';
import OriginalCredit from './OriginalCredit';
import SlidePrompt from './SlidePrompt';
import './aiHubMotion.css';
import './aiHubSlide.css';

const SWIPE_PX = 40;

/**
 * 슬라이드 상세 창 — 전체 화면 <dialog>(showModal). 열림 여부는 #id 해시가 정하고(SlideGallery),
 * 닫기는 dialog 의 close 이벤트(Esc·닫기 단추 공통)에서 onClose 로 올린다.
 * list: 지금 넘길 순서의 스타일들, pos: { style, slide }, onMove(pos).
 */
export default function SlideViewer({ list, pos, onMove, onClose, familyLabel }) {
  const dialog = useRef(null);
  const stage = useRef(null);
  const closeBtn = useRef(null);
  const swipeStart = useRef(null);
  const counts = list.map((s) => s.slides);

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    // showModal 은 첫 포커스 가능 요소(이전 장 단추)를 잡으므로, 닫기 단추로 옮겨 Esc·Enter 흐름을 예측 가능하게 한다.
    closeBtn.current?.focus();
  }, []);

  // 의존성 배열 없이 매 렌더 다시 건다 — 최신 pos 로 넘겨야 한다.
  useEffect(() => {
    const onKey = (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'ArrowRight') onMove(stepSlide(pos, 1, counts));
      if (e.key === 'ArrowLeft') onMove(stepSlide(pos, -1, counts));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const style = list[pos.style];
  if (!style) return null;
  const go = (dir) => onMove(stepSlide(pos, dir, counts));
  const goStyle = (dir) => onMove(stepStyle(pos, dir, list.length));
  // iPhone Safari 처럼 요소 전체 화면을 지원하지 않는 브라우저에서는 단추를 숨긴다.
  const canFullscreen = document.fullscreenEnabled;
  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else stage.current?.requestFullscreen();
  };

  return (
    <dialog ref={dialog} data-testid="slide-viewer" aria-labelledby="slide-viewer-name" onClose={onClose} className="ai-viewer">
      <div className="ai-viewer-body">
        <div className="ai-viewer-main">
          <div
            ref={stage}
            data-testid="slide-stage"
            className="ai-viewer-stage"
            onPointerDown={(e) => { swipeStart.current = e.clientX; }}
            onPointerUp={(e) => {
              const start = swipeStart.current;
              swipeStart.current = null;
              if (start !== null && Math.abs(e.clientX - start) >= SWIPE_PX) go(e.clientX < start ? 1 : -1);
            }}
          >
            <img data-testid="slide-viewer-img" src={style.images[pos.slide]} alt={`${style.name} ${pos.slide + 1}번째 장`} width={1376} height={768} draggable={false} />
            <IconButton icon={ChevronLeft} label="이전 슬라이드 (←)" variant="ghost" className="ai-viewer-nav ai-viewer-nav--prev" onClick={() => go(-1)} />
            <IconButton icon={ChevronRight} label="다음 슬라이드 (→)" variant="ghost" className="ai-viewer-nav ai-viewer-nav--next" onClick={() => go(1)} />
            {canFullscreen ? (
              <IconButton icon={Maximize} label="전체 화면 전환" variant="ghost" className="ai-viewer-nav ai-viewer-full" onClick={toggleFull} />
            ) : null}
          </div>
          <div className="ai-viewer-strip">
            <div role="group" aria-label="이 스타일의 예시 슬라이드" className="ai-viewer-thumbs">
              {style.thumbs.map((src, k) => (
                <button
                  key={src}
                  type="button"
                  aria-label={`${k + 1}번째 장`}
                  aria-current={k === pos.slide ? 'true' : undefined}
                  onClick={() => onMove({ style: pos.style, slide: k })}
                  className="ai-viewer-thumb"
                >
                  <img src={src} alt="" width={172} height={96} />
                </button>
              ))}
            </div>
            <span data-testid="slide-pos" className="ai-viewer-pos">{pos.slide + 1} / {style.slides}</span>
          </div>
        </div>

        <aside className="ai-viewer-side">
          <div className="ai-viewer-bar">
            <div className="ai-viewer-bar-nav">
              <IconButton icon={ChevronLeft} label="이전 스타일" onClick={() => goStyle(-1)} />
              <span data-testid="slide-style-count" className="ai-viewer-pos">{pos.style + 1} / {list.length}</span>
              <IconButton icon={ChevronRight} label="다음 스타일" onClick={() => goStyle(1)} />
            </div>
            <IconButton ref={closeBtn} icon={X} label="닫기" onClick={() => dialog.current?.close()} />
          </div>
          <p className="ai-viewer-kicker">{familyLabel(style.family)} · {style.no}</p>
          <h2 id="slide-viewer-name" className="ai-viewer-name">{style.name}</h2>
          <p className="ai-viewer-look">{style.look}</p>
          <p className="ai-viewer-line"><span className="ai-viewer-label">이럴 때 좋아요</span>{style.use}</p>
          {style.topic ? <p className="ai-viewer-line"><span className="ai-viewer-label">예시 주제</span>{style.topic}</p> : null}
          {style.source === 'oppadu' ? <OriginalCredit tab="slide" /> : null}
          <SlidePrompt id={style.id} prompt={style.prompt} />
        </aside>
      </div>
    </dialog>
  );
}
