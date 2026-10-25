import { useEffect, useId, useState } from 'react';
import { Plus, Save, X } from 'lucide-react';
import { UNIT_TITLE_MAX, UNIT_DESCRIPTION_MAX } from '@mathchois/shared';
import IconButton from '../common/IconButton';

/**
 * 새 단원 / 단원 수정 창. 이름(필수)·설명(선택)·"학생에게 숨김".
 * onSubmit 이 실패(throw)하면 창을 닫지 않고 오류 문구를 보인다. 성공 시 닫기는 부모 몫.
 *
 * @param {object} props
 * @param {{ title: string, description?: string|null, isHidden?: boolean }} [props.initial] 있으면 수정
 * @param {(body: { title: string, description: string|null, isHidden: boolean }) => Promise<void>|void} props.onSubmit
 * @param {() => void} props.onClose
 */
export default function UnitFormModal({ initial, onSubmit, onClose }) {
  const isEdit = !!initial;
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [isHidden, setIsHidden] = useState(initial?.isHidden ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const uid = useId();

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      await onSubmit({ title: title.trim(), description: description.trim() || null, isHidden });
    } catch (err) {
      setError(err?.message || '저장하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-heading`}
        className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md max-h-[90dvh] overflow-y-auto"
      >
        <h2 id={`${uid}-heading`} className="text-lg font-bold text-gray-900 mb-4">{isEdit ? '단원 수정' : '새 단원'}</h2>

        <label htmlFor={`${uid}-title`} className="block text-sm text-gray-600 mb-1">단원 이름</label>
        <input
          id={`${uid}-title`}
          autoFocus
          type="text"
          value={title}
          maxLength={UNIT_TITLE_MAX}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 1단원 다항식"
          className="w-full px-4 py-2 border border-gray-300 rounded-md mb-3 focus:ring-blue-500 focus:border-blue-500"
        />

        <label htmlFor={`${uid}-desc`} className="block text-sm text-gray-600 mb-1">설명 (선택)</label>
        <textarea
          id={`${uid}-desc`}
          value={description}
          maxLength={UNIT_DESCRIPTION_MAX}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full px-4 py-2 border border-gray-300 rounded-md mb-3 focus:ring-blue-500 focus:border-blue-500 resize-none break-keep"
        />

        <label className="flex items-center gap-2 min-h-11 text-sm text-gray-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isHidden}
            onChange={(e) => setIsHidden(e.target.checked)}
            className="h-4 w-4"
          />
          학생에게 숨김
        </label>

        {error && <p className="text-sm text-red-600 mt-2" role="alert">{error}</p>}

        <div className="flex justify-end gap-2 mt-4">
          <IconButton icon={X} label="취소" onClick={onClose} disabled={busy} />
          <IconButton
            icon={isEdit ? Save : Plus}
            label={isEdit ? '저장' : '만들기'}
            variant="primary"
            type="submit"
            disabled={!title.trim()}
            busy={busy}
            busyLabel={isEdit ? '저장하는 중...' : '만드는 중...'}
          />
        </div>
      </form>
    </div>
  );
}
