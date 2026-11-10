import { createContext, useContext } from 'react';

/**
 * IB교육과정 안내 허브 데이터 — `IbGuideRoute` 가 채워 내린다.
 * 값: { access: { allowed }, examples: IaExample[], status: 'loading'|'ready'|'error', reload(), from: string|null }
 */
export const IbGuideDataContext = createContext(null);

export function useIbGuideData() {
  return useContext(IbGuideDataContext);
}
