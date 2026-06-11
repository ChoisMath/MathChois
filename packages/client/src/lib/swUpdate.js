// 설치형 PWA는 "앱 열기"가 대부분 떠 있는 페이지의 재개(resume)라 index.html 을
// 다시 받지 않는다 → 옛 번들이 며칠씩 계속 돈다. 배포마다 sw.js 바이트가 바뀌므로
// (vite.config.js 의 sw-build-version 플러그인) SW 업데이트 사이클을 "새 배포 신호"로 쓴다:
// 주기 + 화면 복귀 시 update() 체크 → 새 SW 활성화(controllerchange) 시 리로드.
// 필기 중 끊김·미저장 획 손실을 막기 위해, 화면이 보이는 동안엔 리로드를 보류했다가
// 백그라운드 전환 시 적용한다. sw.js 자체는 fetch 핸들러 없음(네트워크 무간섭) 유지.

const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;

export function setupSwAutoUpdate({
  serviceWorker = navigator.serviceWorker,
  doc = document,
  win = window,
  intervalMs = UPDATE_CHECK_INTERVAL_MS,
} = {}) {
  let hadController = Boolean(serviceWorker.controller);
  let reloaded = false;
  let pendingReload = false;

  const reloadOnce = () => {
    if (reloaded) return;
    reloaded = true;
    win.location.reload();
  };

  serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) {
      hadController = true;
      return;
    }
    if (doc.visibilityState === 'hidden') reloadOnce();
    else pendingReload = true;
  });

  return serviceWorker
    .register('/sw.js', { updateViaCache: 'none' })
    .then((registration) => {
      const checkForUpdate = () => registration.update().catch(() => {});

      win.setInterval(checkForUpdate, intervalMs);
      doc.addEventListener('visibilitychange', () => {
        if (doc.visibilityState === 'hidden') {
          if (pendingReload) reloadOnce();
          return;
        }
        checkForUpdate();
      });

      return registration;
    })
    .catch(() => null); // SW 등록 실패는 앱 동작을 막지 않는다
}
