import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Square, AlignJustify, Grid3x3 } from 'lucide-react';
import './viewer.css';
import {
  STICKY_TYPES, STICKY_FRIENDS, STICKY_PATTERNS, TYPE_LABEL, FRIEND_LABEL, PATTERN_LABEL, stickyDataUrl,
} from '../../lib/stickyPads';

const PATTERN_ICON = { plain: Square, ruled: AlignJustify, grid: Grid3x3 };

/**
 * 메모지 고르기 팝오버 — 도구바 아래에 붙는다 (document.body 포털, position: fixed).
 * 유형 4줄 × 친구 6칸(현재 무늬로 만든 실제 메모지 미리보기) + 무늬 3칸.
 * 칸을 누르면 `onPick(spec)`, 무늬를 누르면 `onPatternChange(pattern)`(닫지 않음). Escape·바깥 pointerdown 은 `onClose`.
 * 포커스: 열리면 현재 칸, Tab 은 대화상자 안에서 돌고, 닫히면 `anchorEl`(메모지 단추)로 돌아간다.
 * 설계: docs/superpowers/specs/2026-11-01-sticky-pads-design.md
 *
 * @param {{ current: { type, friend, pattern }, anchorRect: { bottom: number }, anchorEl?: Element|null,
 *           onPick: (spec) => void, onPatternChange: (pattern) => void, onClose: () => void }} props
 */
export default function StickyPicker({ current, anchorRect, anchorEl, onPick, onPatternChange, onClose }) {
  const popRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    /* 바깥 누름은 닫기만 한다: 캡처 단계에서 삼켜 캔버스에 점이 찍히지 않게 (단추 자체는 토글이 처리) */
    const onDown = (e) => {
      const t = e.target;
      if (popRef.current?.contains(t)) return;
      if (anchorEl && anchorEl.contains(t)) return;
      e.stopPropagation();
      e.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown, true);
    };
  }, [anchorEl, onClose]);

  /* 포커스: 열릴 때 현재 칸(없으면 첫 단추), 닫힐 때 단추로 복귀 */
  useEffect(() => {
    const pop = popRef.current;
    const first = pop?.querySelector('[aria-current="true"]') || pop?.querySelector('button');
    first?.focus();
    return () => { anchorEl?.focus?.(); };
  }, [anchorEl]);

  /* Tab 은 대화상자 안에서 돈다 */
  const onKeyDown = (e) => {
    if (e.key !== 'Tab') return;
    const items = [...popRef.current.querySelectorAll('button')];
    if (!items.length) return;
    const i = items.indexOf(document.activeElement);
    if (!e.shiftKey && (i === items.length - 1 || i === -1)) { e.preventDefault(); items[0].focus(); }
    else if (e.shiftKey && (i === 0 || i === -1)) { e.preventDefault(); items[items.length - 1].focus(); }
  };

  const top = Math.round((anchorRect?.bottom ?? 0) + 6);

  return createPortal(
    <div ref={popRef} className="vw-tb-pop" role="dialog" aria-modal="true" aria-label="메모지 고르기" style={{ top: `${top}px` }} onKeyDown={onKeyDown}>
      {STICKY_TYPES.map((type) => (
        <div key={type} className="vw-tb-pop-row">
          <span className="vw-tb-pop-head">{TYPE_LABEL[type]}</span>
          {STICKY_FRIENDS.map((friend) => {
            const spec = { type, friend, pattern: current.pattern };
            const isCurrent = current.type === type && current.friend === friend;
            return (
              <button key={friend} type="button" className="vw-tb-pop-cell"
                data-sticky={`${type}:${friend}`}
                aria-current={isCurrent ? 'true' : undefined}
                aria-label={`${TYPE_LABEL[type]} · ${FRIEND_LABEL[friend]}`}
                title={`${TYPE_LABEL[type]} · ${FRIEND_LABEL[friend]}`}
                onClick={() => onPick(spec)}>
                <img src={stickyDataUrl(spec)} alt="" draggable={false} />
              </button>
            );
          })}
        </div>
      ))}
      <div className="vw-tb-pop-row vw-tb-pop-pattern" role="group" aria-label="무늬">
        {STICKY_PATTERNS.map((pattern) => {
          const Icon = PATTERN_ICON[pattern];
          return (
            <button key={pattern} type="button" data-sticky-pattern={pattern}
              aria-pressed={current.pattern === pattern}
              onClick={() => onPatternChange(pattern)}>
              <Icon aria-hidden="true" />
              {PATTERN_LABEL[pattern]}
            </button>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
