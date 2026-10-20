import { Loader2 } from 'lucide-react';
import './IconButton.css';

/**
 * 아이콘만 있는 버튼 — `label` 하나로 마우스 올림 이름(title)과 화면 읽기 이름(aria-label)을 함께 붙인다.
 * 누르는 영역은 항상 44px. 설계: docs/superpowers/specs/2026-10-20-icon-buttons-design.md
 *
 * @param {object} props
 * @param {import('react').ComponentType<{className?: string}>} props.icon lucide 아이콘
 * @param {string} props.label 버튼 이름
 * @param {'ghost'|'primary'|'danger'|'danger-solid'} [props.variant='ghost']
 * @param {'md'|'sm'} [props.size='md'] sm 은 보이는 크기만 36px(누르는 영역은 44px 유지)
 * @param {boolean} [props.busy] 진행 중 — 돌아가는 아이콘을 보이고 누름을 막는다
 * @param {string} [props.busyLabel] 진행 중 이름(예: '만드는 중...')
 * @param {import('react').ElementType} [props.as='button'] `Link`·`a` 등
 */
export default function IconButton({
  icon: Icon,
  label,
  variant = 'ghost',
  size = 'md',
  busy = false,
  busyLabel,
  as: Component = 'button',
  className = '',
  disabled,
  ...rest
}) {
  const name = busy && busyLabel ? busyLabel : label;
  const isButton = Component === 'button';
  const classes = ['icon-btn', `icon-btn--${variant}`, size === 'sm' && 'icon-btn--sm', className]
    .filter(Boolean)
    .join(' ');

  return (
    <Component
      {...(isButton ? { type: 'button', disabled: disabled || busy } : { 'aria-disabled': disabled || busy || undefined })}
      {...rest}
      className={classes}
      title={name}
      aria-label={name}
      aria-busy={busy || undefined}
    >
      <span className="icon-btn-face" aria-hidden="true">
        {busy ? <Loader2 className="icon-btn-spin" /> : <Icon />}
      </span>
    </Component>
  );
}
