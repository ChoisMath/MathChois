import { state, DEF } from '@mathchois/shared';

/**
 * 상세 [프롬프트 복사] 가 쓸 상태. 오빠두 원본의 v2 틀은 방식 a(「예시 그대로」) + 그 편의 길이로 완성한다.
 * 그 밖(변형본·옛 틀·프롬프트 없음)은 null — finalPrompt 의 기본 상태를 그대로 쓴다.
 */
export function detailCopyState(item) {
  if (item?.source !== 'oppadu' || !item.prompt?.v2) return null;
  return state({ style: 'a', len: item.secs ?? DEF.len });
}
