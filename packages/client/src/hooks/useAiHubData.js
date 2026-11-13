import { createContext, useContext } from 'react';

/**
 * AI활용 허브 데이터 — `AiHubRoute` 가 채워 내린다.
 * 값: { access: { allowed, canEdit, canEditOriginal }, motion: [], slide: [], status: 'loading'|'ready'|'error', reload(), from: string|null }
 */
export const AiHubDataContext = createContext(null);

export function useAiHubData() {
  return useContext(AiHubDataContext);
}
