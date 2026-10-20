import { Check } from 'lucide-react';
import { CLASSROOM_COLORS, COLOR_STYLES } from '../../lib/classroomColor';
import './classrooms.css';

/**
 * 학급 표지 색 고르기 — 44px 원 6개. 라벨("표지 색")은 부모가 labelId 로 그린다.
 * 선택은 aria-pressed + 체크 + 진한 테두리로 표시한다(색만으로 구분하지 않음).
 */
export default function ClassroomColorPicker({ value, onChange, disabled = false, labelId }) {
  return (
    <div className="color-picker" role="group" aria-labelledby={labelId}>
      {CLASSROOM_COLORS.map((c) => {
        const s = COLOR_STYLES[c];
        return (
          <button
            key={c}
            type="button"
            className="color-swatch"
            style={{ '--swatch': s.cover, '--swatch-deep': s.deep }}
            aria-pressed={value === c}
            aria-label={s.label}
            disabled={disabled}
            onClick={() => onChange(c)}
          >
            <Check className="h-[18px] w-[18px]" strokeWidth={3} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
