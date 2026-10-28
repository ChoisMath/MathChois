import { useEffect, useId, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import IconButton from '../../common/IconButton';

/**
 * (i) 단추 + 설명 카드 — 오빠두 infoTip. 마우스를 올리거나 포커스하면 보이고, 누르면 고정(터치),
 * Esc·바깥 누름으로 닫힌다. link = [주소, 글] 이면 카드 끝에 새 창 링크.
 * autoOpen: 처음 그릴 때 열어 둔다(렌더링에서 Remotion 을 방금 고른 때).
 * align: 'start'(칸 왼쪽에 맞춤) | 'end'(단추 오른쪽 끝에 맞춰 왼쪽으로 펼침).
 */
export default function InfoTip({ name, text, link, autoOpen = false, align = 'start' }) {
  const [open, setOpen] = useState(autoOpen);
  const wrap = useRef(null);
  const tipId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const onKeyDown = (e) => {
    if (e.key === 'Escape' && open) {
      // 편집기의 Esc(창 닫기)까지 가지 않게 여기서 멈춘다
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      wrap.current?.querySelector('button')?.focus();
    }
  };

  return (
    <span ref={wrap} className={`ai-tipw ai-tipw--${align}${open ? ' is-open' : ''}`} onKeyDown={onKeyDown}>
      <IconButton
        icon={Info}
        label={`${name} 설명`}
        size="sm"
        className="ai-info"
        aria-describedby={tipId}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      />
      <span id={tipId} role="tooltip" className="ai-tip">
        {text}
        {link ? (
          <>
            {' '}
            <a href={link[0]} target="_blank" rel="noopener noreferrer" className="ai-tip-a">{link[1]}</a>
          </>
        ) : null}
      </span>
    </span>
  );
}
