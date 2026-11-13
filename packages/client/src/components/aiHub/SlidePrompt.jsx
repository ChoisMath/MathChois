import { COPY_FAILED, useCopyFeedback } from '../../hooks/useCopyFeedback';
import './aiHubMotion.css';
import './aiHubSlide.css';

/**
 * 스타일 프롬프트 — 읽기 상자와 복사 단추. 프롬프트는 누구나 볼 수 있다(오빠두엑셀 허락).
 * 데이터가 없을 때만 안내 문구를 두고 단추를 막는다. 복사하지 못하면 3초간 직접 복사 안내를 보인다.
 */
export default function SlidePrompt({ id, prompt }) {
  const { copied, failed, copy } = useCopyFeedback();

  return (
    <div className="ai-slide-prompt">
      <p className="ai-viewer-label">스타일 프롬프트</p>
      {prompt ? (
        <p data-testid="slide-prompt" lang="en" className="ai-slide-prompt-text">{prompt}</p>
      ) : (
        <p data-testid="slide-prompt-empty" className="ai-slide-prompt-empty">프롬프트 데이터 준비 중</p>
      )}
      <button
        type="button"
        data-testid="copy-slide-prompt"
        disabled={!prompt}
        onClick={() => prompt && copy(prompt, id)}
        className={`ai-pill ai-slide-copy${copied === id ? ' is-done' : ''}`}
      >
        {copied === id ? '복사됨' : '프롬프트 복사'}
      </button>
      {failed ? <p role="status" data-testid="copy-failed" className="ai-slide-copy-failed">{COPY_FAILED}</p> : null}
    </div>
  );
}
