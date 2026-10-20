import { Check } from 'lucide-react';
import { CLASSROOM_COLORS, COLOR_STYLES } from '../../lib/classroomColor';
import './classrooms.css';

/**
 * 학급 표지 색 고르기 — 누르는 영역 44px 원 6개. 라벨("표지 색")은 부모가 labelId 로 그리거나, 글자 없이 ariaLabel 로 이름만 준다.
 * size="sm" 은 누르는 영역은 44px 그대로 두고 보이는 원만 30px 로 줄인다(학급 상세 헤더용).
 * 선택은 aria-pressed + 체크 + 진한 테두리로 표시한다(색만으로 구분하지 않음).
 * 좁은 곳(컨테이너 263px 이하)에서는 3×2 로 정돈된다(classrooms.css).
 * 저장 중에는 disabled 대신 aria-disabled 로 막아, 키보드 포커스가 원에 남게 한다.
 */
export default function ClassroomColorPicker({ value, onChange, disabled = false, labelId, ariaLabel, size }) {
  return (
    <div className="color-picker-wrap">
      <div
        className={size === 'sm' ? 'color-picker color-picker--sm' : 'color-picker'}
        role="group"
        aria-labelledby={labelId}
        aria-label={labelId ? undefined : ariaLabel}
      >
        {CLASSROOM_COLORS.map((c) => {
          const s = COLOR_STYLES[c];
          return (
            <button
              key={c}
              type="button"
              className="color-swatch"
              style={{ '--swatch': s.cover }}
              aria-pressed={value === c}
              aria-label={s.label}
              aria-disabled={disabled || undefined}
              onClick={() => { if (!disabled) onChange(c); }}
            >
              <Check className="h-[18px] w-[18px]" strokeWidth={3} aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
