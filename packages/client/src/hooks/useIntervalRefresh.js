import { useEffect, useRef } from 'react';

/**
 * enabled 동안 intervalMs 마다 cb 를 실행한다.
 * 소켓 실시간 동기화가 놓친 변경(탭 절전·네트워크 단절·재배포 등으로 끊긴 동안 emit된 이벤트)을
 * 주기적으로 보충(reconcile)하기 위한 백스톱.
 *
 * cb 는 ref 로 안정화하므로, cb 의 의존성이 매 렌더 바뀌어도 인터벌은 재생성되지 않는다.
 */
export function useIntervalRefresh(cb, intervalMs, enabled = true) {
  const cbRef = useRef(cb);
  useEffect(() => { cbRef.current = cb; }, [cb]);

  useEffect(() => {
    if (!enabled || !intervalMs) return undefined;
    const id = setInterval(() => { cbRef.current?.(); }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);
}
