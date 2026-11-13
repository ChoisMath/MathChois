import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Pipette, RotateCcw } from 'lucide-react';
import { COLOR_SLOT_COUNT, DEFAULT_COLOR_SLOTS, PRESET_COLORS, normalizeHex } from '../../lib/toolPrefs';

/**
 * 색상 바로가기 5칸 편집 모달.
 * - 칸을 누르면 그 칸이 편집 대상이 되고 그 색이 현재 도구(onApply)에 적용된다.
 * - 격자·색상 선택기·HEX·스포이드로 고른 색은 선택 칸을 바꾸고(onSlotsChange) 현재 도구에도 적용된다.
 * - 「기본값으로」는 5칸을 기본값으로 되돌린다.
 * @param {{ slots: string[], currentColor: string, onApply: (hex: string) => void,
 *           onSlotsChange: (next: string[]) => void, onClose: () => void }} props
 */
export default function ColorSlotsModal({ slots, currentColor, onApply, onSlotsChange, onClose }) {
  const [sel, setSel] = useState(() => Math.max(0, slots.indexOf((currentColor || '').toLowerCase())));
  const [hexText, setHexText] = useState(slots[sel] ?? '');
  const canEyeDrop = typeof window !== 'undefined' && !!window.EyeDropper;

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const selectSlot = (i) => {
    setSel(i);
    setHexText(slots[i]);
    onApply(slots[i]);
  };

  const setSlotColor = (hex) => {
    const n = normalizeHex(hex);
    if (!n) return;
    const next = slots.slice(0, COLOR_SLOT_COUNT);
    next[sel] = n;
    setHexText(n);
    onSlotsChange(next);
    onApply(n);
  };

  const onHexInput = (e) => {
    const v = e.target.value;
    setHexText(v);
    if (/^#?[0-9a-fA-F]{6}$/.test(v.trim())) setSlotColor(v);
  };

  const onEyeDropper = async () => {
    if (!canEyeDrop) return;
    try {
      const r = await new window.EyeDropper().open();
      setSlotColor(r.sRGBHex);
    } catch { /* 취소 */ }
  };

  const onReset = () => {
    const next = [...DEFAULT_COLOR_SLOTS];
    setHexText(next[sel]);
    onSlotsChange(next);
    onApply(next[sel]);
  };

  return createPortal(
    <div
      data-testid="color-slots-backdrop"
      className="fixed inset-0 z-[70] bg-black/30 flex items-start justify-center pt-24 px-4"
      onClick={onClose}
    >
      <div
        role="dialog" aria-modal="true" aria-label="색상 설정"
        data-testid="color-slots-modal"
        className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-800">색상 설정</h2>
          <button type="button" data-testid="color-slots-close" onClick={onClose} title="닫기" aria-label="닫기"
            className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 바로가기 5칸 */}
        <p className="text-xs text-gray-500 mb-1.5">바로가기 색 (상단 바에 표시) — 칸을 고르고 아래에서 색을 바꿉니다</p>
        <div className="flex items-center gap-3 mb-4">
          {slots.map((hex, i) => (
            <button key={i} type="button" data-slot={i} aria-pressed={sel === i} title={hex}
              onClick={() => selectSlot(i)}
              className={`w-9 h-9 rounded-full border border-white cursor-pointer transition-transform ${
                sel === i ? 'ring-2 ring-offset-2 ring-blue-500 scale-110' : 'ring-1 ring-gray-200 hover:scale-105'
              }`}
              style={{ backgroundColor: hex }}
            />
          ))}
        </div>

        {/* 자주 쓰는 색 */}
        <div className="grid grid-cols-8 gap-2 mb-4">
          {PRESET_COLORS.map((hex) => (
            <button key={hex} type="button" data-preset={hex} title={hex}
              onClick={() => setSlotColor(hex)}
              className={`w-8 h-8 rounded-md border cursor-pointer hover:scale-105 transition-transform ${
                slots[sel] === hex ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200'
              }`}
              style={{ backgroundColor: hex }}
            />
          ))}
        </div>

        {/* 직접 입력 */}
        <div className="flex items-center gap-2 mb-4">
          <label className="relative w-9 h-9 rounded-md border border-gray-300 overflow-hidden cursor-pointer flex-shrink-0" title="색상 선택기">
            <input type="color" data-testid="color-slots-picker" value={slots[sel]}
              onChange={(e) => setSlotColor(e.target.value)}
              className="absolute -inset-2 w-[calc(100%+1rem)] h-[calc(100%+1rem)] cursor-pointer" />
          </label>
          <input type="text" data-testid="color-slots-hex" value={hexText} onChange={onHexInput}
            placeholder="#rrggbb" spellCheck={false} maxLength={7}
            className="flex-1 h-9 px-2 border border-gray-300 rounded-md text-sm font-mono" />
          <button type="button" data-testid="color-slots-eyedropper" onClick={onEyeDropper} disabled={!canEyeDrop}
            title={canEyeDrop ? '스포이드 — 화면에서 색상 추출' : '스포이드는 이 브라우저에서 지원되지 않습니다 (Chrome 95+)'}
            aria-label="스포이드"
            className="w-9 h-9 rounded-md border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
            <Pipette className="h-4 w-4" />
          </button>
        </div>

        <div className="flex justify-end">
          <button type="button" data-testid="color-slots-reset" onClick={onReset}
            className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-800 px-2 py-1 rounded-md hover:bg-gray-100 cursor-pointer">
            <RotateCcw className="h-3.5 w-3.5" /> 기본값으로
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
