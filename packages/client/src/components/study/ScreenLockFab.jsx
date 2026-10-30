import { Lock, Unlock } from 'lucide-react';

/**
 * 화면 고정(확대/축소·이동 차단) 플로팅 버튼 — 필기 영역 우측 상단에 항상 떠 있다.
 * 도구바 안에 있던 버튼을 밖으로 빼서 보기 모드·도구바 접힘 상태에서도 바로 고정할 수 있게 한다.
 * 이미지 페이지의 Excalidraw 컨테이너(relative) 안에 둔다. 영상·HTML 페이지(항상 고정)에는 두지 않는다.
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
      className={`absolute top-2 right-2 z-30 w-8 h-8 rounded-full shadow-md border flex items-center justify-center cursor-pointer transition-colors ${
        locked
          ? 'bg-amber-100 border-amber-300 text-amber-600 hover:bg-amber-200'
          : 'bg-white/90 border-gray-200 text-gray-500 hover:bg-gray-100'
      } ${className}`}
    >
      {locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
    </button>
  );
}
