/* ── 사이드바 갱신 이벤트 ── */
let _refreshKey = 0;
const _listeners = new Set();

export function refreshSidebar() {
  _refreshKey++;
  _listeners.forEach((fn) => fn(_refreshKey));
}

export function subscribeSidebarRefresh(listener) {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}
