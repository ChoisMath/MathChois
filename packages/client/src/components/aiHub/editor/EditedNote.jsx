import { useState } from 'react';
import { api } from '../../../lib/api';

/**
 * 웹에서 고친 오빠두 원본 표시(관리자) — 편집기 머리 바로 밑 띠. 원본 편집을 켜지 않아도 보인다.
 * 이 행은 `ai:push --sync-prompts` 가 건너뛴다. 단추는 표시만 지운다(DELETE /edited) — 다음 동기화가 오빠두 원본으로 덮어쓴다.
 */
export default function EditedNote({ id, reload }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const unmark = async () => {
    setError('');
    setBusy(true);
    try {
      await api.delete(`/api/ai/motion/${id}/edited`);
      reload();
    } catch (err) {
      setError(err?.status === 403 ? '관리자만 할 수 있어요' : '표시를 지우지 못했어요 — 잠시 뒤 다시 시도하세요');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ai-ed-edited" data-testid="original-edited">
      <p className="ai-ed-edited-note" role="note">웹에서 고친 원본 · 오빠두 동기화에서 제외됨</p>
      <button type="button" className="ai-btn" data-testid="original-unmark" disabled={busy} onClick={unmark}>
        다음 동기화에서 오빠두 원본 받기
      </button>
      {error ? <p className="ai-ed-edited-err" role="alert">{error}</p> : null}
    </div>
  );
}
