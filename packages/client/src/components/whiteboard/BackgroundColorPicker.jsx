import { useEffect, useRef, useState } from 'react';
import { Palette } from 'lucide-react';

const BG_PRESETS = [
  '#ffffff', '#fff9db', '#e7f5ff', '#f1f3f5', '#fff0f6', '#ebfbee', '#fff4e6', '#1e1e1e',
];

/** 바탕색 프리셋 8 + 자유 선택 */
export default function BackgroundColorPicker({ value, onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button" disabled={disabled} onClick={() => setOpen((v) => !v)} title="바탕색"
        className="inline-flex items-center gap-1.5 px-2 min-h-9 rounded-md border bg-white hover:bg-gray-50 disabled:opacity-40 cursor-pointer"
      >
        <Palette className="h-4 w-4 text-gray-600" />
        <span className="h-4 w-4 rounded border border-gray-300" style={{ background: value }} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-white border rounded-lg shadow-lg p-2 w-48">
          <div className="grid grid-cols-4 gap-1.5 mb-2">
            {BG_PRESETS.map((c) => (
              <button
                key={c} type="button" title={c}
                onClick={() => { onChange(c); setOpen(false); }}
                className={`h-8 rounded border-2 cursor-pointer ${value?.toLowerCase() === c ? 'border-blue-500' : 'border-gray-200'}`}
                style={{ background: c }}
              />
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <input
              type="color" value={value || '#ffffff'}
              onChange={(e) => onChange(e.target.value)}
              className="h-7 w-10 p-0 border rounded cursor-pointer"
            />
            직접 선택
          </label>
        </div>
      )}
    </div>
  );
}
