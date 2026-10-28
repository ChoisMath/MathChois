import { useLayoutEffect, useRef, useState } from 'react';

const TEXTAREA_OVER = 40; // 이보다 긴 예시 값은 여러 줄 칸(값 자체는 한 줄 — Enter 막음)
const STACK_OVER = 80; // 이보다 길면 이름 알약을 위에 두고 칸을 아래 전체 폭으로

/** 여러 줄 칸 높이를 글에 맞춘다(최대 172px, 그 뒤는 칸 안에서 스크롤) */
function grow(el) {
  if (!el || el.tagName !== 'TEXTAREA') return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight + 2, 172)}px`;
}

/**
 * 빈칸 한 줄 — 「이름 알약 : 입력칸」(오빠두 buildRows).
 * 선택 칸은 알약 안 체크로 켜고 끄며, 끄면 입력칸이 잠기고 그 줄이 프롬프트에서 빠진다.
 * 내 주제에 맞게(emptyMode) = 입력칸 비움·자리표시 없음 / 그 밖 = 예시 값으로 채우고 자리표시도 예시.
 */
export default function BlankRow({ blank, id, value, off, emptyMode, onValue, onCheck }) {
  const len = Array.from(blank.def).length;
  const multi = len > TEXTAREA_OVER;
  const field = useRef(null);
  // 입력하는 동안은 적은 글 그대로 보인다(칸을 비우면 저장 값은 지워져 예시 값으로 돌아가지만, 그건 칸을 떠난 뒤에 보인다)
  const [typed, setTyped] = useState(null);
  const shown = typed ?? value;
  useLayoutEffect(() => { grow(field.current); }, [shown, multi]);

  const props = {
    ref: field,
    id,
    className: `ai-in${multi ? ' ai-in--ta' : ''}`,
    value: shown,
    placeholder: emptyMode ? '' : (blank.def || '여기에 적어 주세요'),
    spellCheck: false,
    autoComplete: 'off',
    disabled: off,
    'aria-label': blank.opt ? blank.label : undefined,
    onChange: (e) => { setTyped(e.target.value.replace(/\s*[\r\n]+\s*/g, ' ')); onValue(e.target.value); },
    onBlur: () => setTyped(null),
  };

  return (
    <div
      className={`ai-row${blank.opt ? ' is-opt' : ''}${len > STACK_OVER ? ' is-long' : ''}${off ? ' is-off' : ''}`}
      data-k={blank.key}
    >
      <label className="ai-chip-l" htmlFor={blank.opt ? undefined : id}>
        {blank.opt ? (
          <input
            type="checkbox"
            className="ai-cb"
            checked={!off}
            aria-label={`${blank.label} 넣기`}
            onChange={(e) => onCheck(e.target.checked)}
          />
        ) : null}
        {blank.label}
      </label>
      {multi ? (
        <textarea {...props} rows={1} onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} />
      ) : (
        <input {...props} type="text" />
      )}
    </div>
  );
}
