/* HTML 도구 위 투명 필기 오버레이의 입력 라우팅 + 뷰포트 고정 상수.
   오버레이와 iframe 중 한쪽만 포인터 입력을 받게 해 도구 조작 ↔ 필기를 전환한다. */

export const HTML_OVERLAY_LOCK_BASE = { zoom: 1, scrollX: 0, scrollY: 0 };

export function overlayPointerEvents(drawing) {
  return drawing ? 'auto' : 'none';
}

export function iframePointerEvents(drawing) {
  return drawing ? 'none' : 'auto';
}
