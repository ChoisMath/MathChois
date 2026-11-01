import { Lock, Unlock } from 'lucide-react';
import './viewer.css';

/**
 * 화면 고정(확대/축소·이동 차단) 플로팅 버튼 — 필기 영역 우측 상단에 항상 떠 있다.
 * 도구바 안에 있던 버튼을 밖으로 빼서 보기 모드·도구바 접힘 상태에서도 바로 고정할 수 있게 한다.
 * 이미지 페이지의 Excalidraw 컨테이너(relative) 안에 둔다. 영상·HTML 페이지(항상 고정)에는 두지 않는다.
 * 겉모양: viewer.css `.vw-fab`(고정 중은 머스터드 칠).
 */
export default function ScreenLockFab({ locked, onToggle, className = '' }) {
  const label = locked ? '화면 고정 해제' : '화면 고정 — 확대/축소·이동 차단';
  return (
    <button
      type="button"
      onClick={onToggle}
      title={label}
      aria-label={label}
      aria-pressed={!!locked}
      className={`vw-fab${locked ? ' is-locked' : ''}${className ? ` ${className}` : ''}`}
    >
      {locked ? <Lock /> : <Unlock />}
    </button>
  );
}
