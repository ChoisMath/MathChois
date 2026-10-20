import { Link } from 'react-router-dom';
import { colorVars } from '../../lib/classroomColor';
import './shell.css';

/** 사이드바 메뉴 탭 — 왼쪽만 둥근 인덱스 탭. 선택되면 종이색으로 본문과 이어진다. */
export function SideTab({ to, icon: Icon, active, children, badge }) {
  return (
    <Link
      to={to}
      className={`shell-tab${active ? ' is-active' : ''}`}
      aria-current={active ? 'page' : undefined}
    >
      {Icon && <Icon className="shell-tab-icon" size={18} aria-hidden="true" />}
      <span className="shell-tab-label">{children}</span>
      {badge}
    </Link>
  );
}

/** 학급 탭 — 학급 색의 옅은 배경 + 왼쪽 색 띠. 선택되면 오른쪽으로 길어져 종이색 본문과 이어진다. */
export function ClassTab({ classroom, color, active, badge, to }) {
  return (
    <Link
      to={to}
      style={colorVars(color)}
      className={`shell-class${active ? ' is-active' : ''}`}
      aria-current={active ? 'page' : undefined}
      title={classroom.name}
    >
      <span className="shell-tab-label">{classroom.name}</span>
      {badge}
    </Link>
  );
}
