import { useEffect, useId, useState } from 'react';
import { ListPlus, X } from 'lucide-react';
import IconButton from '../common/IconButton';

/**
 * 기존 항목 가져오기: 미분류 항목을 체크 목록으로 보여 주고 고른 것을 한 번에 넣는다.
 * onSubmit 이 실패(throw)하면 창을 닫지 않고 오류 문구를 보인다. 성공 시 닫기는 부모 몫.
 *
 * @param {object} props
 * @param {string} props.title 창 제목(예: "1단원 다항식에 챕터 가져오기")
 * @param {{ id: string }[]} props.items
 * @param {(item: object) => import('react').ReactNode} props.renderLabel
 * @param {(ids: string[]) => Promise<void>|void} props.onSubmit
 * @param {() => void} props.onClose
 */
export default function UnitItemPickerModal({ title, items, renderLabel, onSubmit, onClose }) {
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const uid = useId();

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  // 목록이 바뀌어도(다른 기기에서 옮김 등) 지금 있는 항목만 센다
  const chosen = items.filter((it) => selected.has(it.id)).map((it) => it.id);
  const allChecked = items.length > 0 && chosen.length === items.length;

  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(items.map((it) => it.id)));

  const handleSubmit = async () => {
    if (chosen.length === 0 || busy) return;
    setBusy(true);
    setError('');
    try {
      await onSubmit(chosen);
    } catch (err) {
      setError(err?.message || '넣지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-heading`}
        className="bg-white rounded-xl shadow-xl p-5 w-full max-w-md max-h-[90dvh] flex flex-col"
      >
        <div className="flex items-start justify-between gap-2 mb-3">
          <h2 id={`${uid}-heading`} className="text-lg font-bold text-gray-900 break-keep [overflow-wrap:anywhere] pt-2">{title}</h2>
          <IconButton icon={X} label="닫기" onClick={onClose} disabled={busy} className="-mr-2" />
        </div>

        {items.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">미분류 항목이 없습니다</p>
        ) : (
          <>
            <label className="flex items-center gap-3 min-h-11 px-3 text-sm text-gray-600 border-b border-gray-200 cursor-pointer select-none">
              <input type="checkbox" checked={allChecked} onChange={toggleAll} className="h-4 w-4 shrink-0" />
              모두 선택
            </label>
            <ul className="flex-1 min-h-0 overflow-y-auto divide-y divide-gray-100">
              {items.map((item) => (
                <li key={item.id}>
                  <label className="flex items-center gap-3 min-h-11 px-3 py-1.5 text-sm text-gray-800 cursor-pointer hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={selected.has(item.id)}
                      onChange={() => toggle(item.id)}
                      className="h-4 w-4 shrink-0"
                    />
                    <span className="min-w-0 flex-1 break-keep [overflow-wrap:anywhere]">{renderLabel(item)}</span>
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}

        {error && <p className="text-sm text-red-600 mt-3" role="alert">{error}</p>}

        {items.length > 0 && (
          <div className="flex justify-end mt-4">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={chosen.length === 0 || busy}
              aria-busy={busy || undefined}
              className="inline-flex items-center gap-2 min-h-11 px-4 rounded-xl bg-[#1c2b4a] text-white text-sm font-medium hover:bg-[#142039] disabled:opacity-50 disabled:cursor-default cursor-pointer focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#2453a6]"
            >
              <ListPlus className="h-5 w-5" aria-hidden="true" />
              {busy ? '넣는 중...' : `${chosen.length}개 넣기`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
