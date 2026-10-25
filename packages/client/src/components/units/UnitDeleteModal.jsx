import { useEffect, useId, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import IconButton from '../common/IconButton';

/**
 * 단원 삭제 확인 창. 항목은 지우지 않고 미분류로 옮긴다는 것을 알린다.
 * onConfirm 이 실패(throw)하면 창을 닫지 않고 오류 문구를 보인다. 성공 시 닫기는 부모 몫.
 *
 * @param {object} props
 * @param {{ title: string, chapterCount?: number, videoCount?: number }} props.unit
 * @param {() => Promise<void>|void} props.onConfirm
 * @param {() => void} props.onClose
 */
export default function UnitDeleteModal({ unit, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const uid = useId();

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const handleConfirm = async () => {
    setBusy(true);
    setError('');
    try {
      await onConfirm();
    } catch (err) {
      setError(err?.message || '삭제하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${uid}-heading`}
        aria-describedby={`${uid}-desc`}
        className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm"
      >
        <h2 id={`${uid}-heading`} className="text-lg font-bold text-gray-900 mb-1">단원 삭제</h2>
        <p className="font-medium text-gray-900 mb-2 break-keep [overflow-wrap:anywhere]">{unit.title}</p>
        <p id={`${uid}-desc`} className="text-sm text-gray-600 mb-6 break-keep">
          단원만 삭제됩니다. 안에 있던 챕터 {unit.chapterCount ?? 0}개와 영상 {unit.videoCount ?? 0}개는 미분류로 옮겨집니다.
        </p>
        {error && <p className="text-sm text-red-600 -mt-4 mb-4" role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <IconButton icon={X} label="취소" onClick={onClose} disabled={busy} />
          <IconButton
            icon={Trash2}
            label="삭제"
            variant="danger-solid"
            onClick={handleConfirm}
            busy={busy}
            busyLabel="삭제하는 중..."
          />
        </div>
      </div>
    </div>
  );
}
