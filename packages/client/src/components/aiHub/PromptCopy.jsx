import { Link } from 'react-router-dom';
import { finalPrompt } from '@mathchois/shared';
import { COPY_FAILED, useCopyFeedback } from '../../hooks/useCopyFeedback';
import './aiHubMotion.css';

const LABEL = { en: '프롬프트 복사 (영문)', ko: '프롬프트 복사 (국문)' };

/**
 * 프롬프트 복사 단추 둘 + (교사·관리자) 빈칸 편집 링크.
 * 기본 상태(방식 b·길이 10·16:9·ko…)로 완성한 글 + 장면표·소리 큐 표를 복사한다.
 * prompt: { en, ko, shots, cues } | null
 */
export default function PromptCopy({ id, prompt, canEdit }) {
  const { copied, failed, copy } = useCopyFeedback();

  const onCopy = (lang) => {
    if (!prompt) return;
    copy(finalPrompt({ tpl: prompt[lang], lang, withTables: true, tables: prompt }), lang);
  };

  return (
    <div className="ai-actions">
      {['en', 'ko'].map((lang) => (
        <button
          key={lang}
          type="button"
          data-testid={`copy-prompt-${lang}`}
          className={`ai-pill${copied === lang ? ' is-done' : ''}`}
          disabled={!prompt}
          onClick={() => onCopy(lang)}
        >
          {copied === lang ? '복사됨' : LABEL[lang]}
        </button>
      ))}
      {canEdit ? (
        <Link to={`/ai/motion/${id}/edit`} className="ai-pill ai-pill--ghost">빈칸 편집·장면표</Link>
      ) : null}
      {!prompt ? <span className="ai-note">프롬프트 데이터 준비 중</span> : null}
      {failed ? <span role="status" data-testid="copy-failed" className="ai-note ai-note--warn">{COPY_FAILED}</span> : null}
    </div>
  );
}
