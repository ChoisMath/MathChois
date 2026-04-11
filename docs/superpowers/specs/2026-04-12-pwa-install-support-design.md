# PWA 설치 지원 (최소 침습 방식)

**작성일:** 2026-04-12
**대상 앱:** ChoisClass (`class.chois.ai.kr`)
**범위:** `packages/client`

## 목표

Chrome/Edge의 "홈 화면에 추가" 기능으로 ChoisClass 웹앱을 설치 가능하게 만든다. 설치 후에는 standalone 창으로 독립 실행되어 앱처럼 느껴진다.

## 비목표 (Non-Goals)

- 오프라인 동작 및 자산 캐싱
- 푸시 알림
- 백그라운드 동기화
- iOS Safari 전용 설치 유도 UI
- 커스텀 "앱으로 설치" 버튼 (브라우저 기본 설치 아이콘만 사용)

**핵심 원칙:** Socket.IO 실시간 통신, JWT 리프레시, Excalidraw 이미지 로딩 등 기존 네트워크 흐름에 어떠한 간섭도 없어야 한다.

## 구성 요소

### 신규 파일 (5개)

| 경로 | 용도 |
|---|---|
| `packages/client/public/manifest.webmanifest` | PWA 메타데이터 |
| `packages/client/public/icon-192.png` | 192×192 일반 아이콘 |
| `packages/client/public/icon-512.png` | 512×512 일반 아이콘 |
| `packages/client/public/icon-maskable-512.png` | 512×512 maskable 아이콘 (안전 영역 20% 패딩) |
| `packages/client/public/sw.js` | 최소 Service Worker (fetch 핸들러 없음) |
| `packages/client/scripts/generate-pwa-icons.mjs` | `favicon.svg` → PNG 3종 생성 1회성 스크립트 |

### 수정 파일 (3개)

| 경로 | 변경 |
|---|---|
| `packages/client/index.html` | `<link rel="manifest">`, `<meta name="theme-color">`, `<link rel="apple-touch-icon">` 추가 |
| `packages/client/src/main.jsx` | production 빌드에서만 `navigator.serviceWorker.register('/sw.js')` 호출 |
| `packages/client/package.json` | devDependency `sharp` 추가, `"generate:pwa-icons"` 스크립트 등록 |

## manifest.webmanifest

```json
{
  "name": "ChoisClass - 수학 학습 플랫폼",
  "short_name": "ChoisClass",
  "description": "교사와 학생을 위한 수학 학습 플랫폼",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "any",
  "background_color": "#ffffff",
  "theme_color": "#ffffff",
  "lang": "ko",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

**결정 근거:**
- `display: "standalone"` — 주소창/탭 없이 독립 앱처럼 표시. StudyViewer의 기존 풀스크린 로직은 그대로 동작.
- `orientation: "any"` — 태블릿 가로/세로 양쪽 학습 지원.
- `theme_color` / `background_color`는 일단 `#ffffff`. 브랜드 컬러 확정 시 교체.

## Service Worker (sw.js)

```js
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
// fetch 핸들러 의도적으로 없음 → 모든 요청이 네트워크로 직행
```

**fetch 핸들러를 등록하지 않는 것이 핵심 설계 결정이다.** Chrome은 빈 SW만으로도 설치 프롬프트를 트리거하며, fetch 가로채기가 없으면 브라우저가 Socket.IO/API/이미지 요청을 전혀 건드리지 않는다. 이로써 기존 네트워크 로직과의 간섭 위험이 원천 제거된다.

`skipWaiting` + `clients.claim`은 향후 SW 업데이트 시 사용자가 새로고침 없이 새 버전을 즉시 받도록 하는 표준 패턴.

## 아이콘 생성 (generate-pwa-icons.mjs)

`packages/client/public/favicon.svg` (현존)를 입력으로 `sharp`를 사용해 3개 PNG 생성:

- `icon-192.png`: 192×192 단순 래스터화
- `icon-512.png`: 512×512 단순 래스터화
- `icon-maskable-512.png`: 512×512 흰색 캔버스 중앙에 SVG를 **80% 크기로** 배치 (안전 영역 20% 패딩 — Android adaptive icon 권장치)

**실행 방식:** `npm run generate:pwa-icons` (1회성, 생성된 PNG는 git에 커밋). 빌드 시점마다 재생성하지 않는다. `sharp`는 devDependency.

## index.html 추가 태그

```html
<link rel="manifest" href="/manifest.webmanifest" />
<meta name="theme-color" content="#ffffff" />
<link rel="apple-touch-icon" href="/icon-192.png" />
```

`apple-touch-icon`은 iOS Safari의 "홈 화면에 추가" 시에도 아이콘이 제대로 나오게 하기 위한 보조책(설치 프롬프트 자동 노출은 여전히 안 됨).

## Service Worker 등록 (main.jsx)

```js
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
```

**결정 근거:**
- **production 빌드에서만 등록** — `npm run dev` 중 Vite HMR 및 dev server와의 간섭 방지.
- **`load` 이벤트 이후 등록** — 초기 렌더 경로에 SW 등록이 끼어들지 않음.
- **실패 시 silent catch** — SW 등록 실패가 앱 동작을 막아서는 안 됨.

## 수용 기준 (수동 검증)

1. `npm run build && npm run preview` (또는 배포 환경 `class.chois.ai.kr`)에서 검증
2. Chrome DevTools → Application → Manifest 탭: manifest 로드 성공, 아이콘 3개 표시, 에러 없음
3. Application → Service Workers 탭: `sw.js` activated & running
4. 주소창 우측에 설치 아이콘 등장 → 클릭 시 설치 다이얼로그 표시
5. 설치 후 앱 실행 → standalone 모드로 열림
6. **회귀 검증:** 설치된 앱에서 로그인 → 클래스룸 진입 → StudyViewer에서 필기 → 교사 화면에서 실시간 수신 확인. 모든 기능이 설치 전과 동일하게 동작해야 함.
7. Lighthouse PWA 감사 → "Installable" 항목 통과
8. 개발 모드(`npm run dev`)에서 DevTools → Application → Service Workers에 `sw.js` 등록되지 않음을 확인

## 영향 범위 및 리스크

- **기존 기능 영향:** 없음 (설계상). SW가 fetch를 가로채지 않고, 추가 파일은 전부 신규이며, `main.jsx` 변경은 production-only 부가 로직 1개.
- **빌드 영향:** `sharp` devDependency 추가로 `npm install` 용량이 소폭 증가. Vite 번들에는 포함되지 않음.
- **배포 영향:** Railway 배포 시 `public/` 정적 파일이 그대로 서빙되므로 특별 조치 불필요. 단, `manifest.webmanifest`와 `sw.js`는 반드시 **동일 오리진**에서 서빙되어야 한다(현재 구조상 자동 충족).
- **롤백:** 문제 발생 시 `main.jsx`의 SW 등록 블록 1개를 제거하면 즉시 원복 가능. 설치된 사용자에게는 SW가 남아 있을 수 있으나 fetch 핸들러가 없어 실질 영향 없음.

## 향후 확장 포인트 (본 스펙의 범위 아님)

- 커스텀 "앱으로 설치" 버튼 (`beforeinstallprompt` 가로채기)
- 앱 셸 precache (network-first)
- 오프라인 필기 + 동기화
- 푸시 알림 (과제 알림, 교사 코멘트 등)

이 항목들은 본 스펙 완료 후 별도 설계 사이클로 진행한다.
