import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import './aiHubSlide.css';

const SORT_LABEL = { pop: '인기순', no: '번호순', new: '최신순' };

/** 정렬 메뉴 — 바깥을 누르거나 Esc 로 닫는다. */
export default function SlideSortMenu({ value, onChange }) {
  const [isOpen, setOpen] = useState(false);
  const box = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onDown = (e) => {
      if (!box.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen]);

  return (
    <div ref={box} className="ai-sort" data-testid="slide-sort">
      <button type="button" aria-haspopup="menu" aria-expanded={isOpen} onClick={() => setOpen(!isOpen)} className="ai-sort-btn">
        <span className="sr-only">정렬: </span>
        {SORT_LABEL[value]}
        <ChevronDown aria-hidden="true" className="ai-sort-chevron" />
      </button>
      {isOpen ? (
        <div role="menu" className="ai-sort-menu">
          {Object.keys(SORT_LABEL).map((key) => (
            <button
              key={key}
              type="button"
              role="menuitemradio"
              aria-checked={value === key}
              onClick={() => {
                onChange(key);
                setOpen(false);
              }}
              className="ai-sort-item"
            >
              <span aria-hidden="true" className="ai-sort-check">{value === key ? '✓' : ''}</span>
              {SORT_LABEL[key]}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
