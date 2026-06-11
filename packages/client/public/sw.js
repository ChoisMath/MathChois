// 최소 Service Worker — PWA 설치 조건만 충족하고 네트워크에 간섭하지 않는다.
// fetch 핸들러 의도적으로 없음: 모든 요청은 네트워크로 직행한다.
// Socket.IO / API / 이미지 로딩 등 기존 흐름과 완전 분리.

// 빌드마다 vite(sw-build-version)가 치환 — 바이트가 달라져야 브라우저가
// SW 업데이트(=새 배포)를 감지한다. lib/swUpdate.js 가 이 사이클로 자동 리로드.
const BUILD_VERSION = '__BUILD_VERSION__';
void BUILD_VERSION;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
