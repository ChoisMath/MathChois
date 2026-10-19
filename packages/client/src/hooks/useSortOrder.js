import { useCallback, useEffect, useState } from 'react';
import { loadSortOrder, saveSortOrder } from '../lib/sortOrder';

/**
 * 목록 정렬 순서 상태. localStorage 에 사용자별로 유지된다.
 * @param {'chapters'|'videos'} kind 목록 종류
 * @param {string|undefined} userId 로그인 사용자 id
 * @returns {[string, (order: string) => void]}
 */
export function useSortOrder(kind, userId) {
  const [order, setOrderState] = useState(() => loadSortOrder(kind, userId));

  // 로그인 사용자가 바뀌면(로그아웃→다른 계정) 그 사용자의 저장값으로 다시 읽는다
  useEffect(() => { setOrderState(loadSortOrder(kind, userId)); }, [kind, userId]);

  const setOrder = useCallback((next) => {
    setOrderState(next);
    saveSortOrder(kind, userId, next);
  }, [kind, userId]);

  return [order, setOrder];
}
