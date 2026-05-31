# HTML 인터랙티브 도구 페이지 — 설계 문서

작성일: 2026-05-31
상태: 승인됨 (구현 계획 대기)

## 목적

교사가 claude로 제작한 인터랙티브 수학 시각화 도구(.html, 슬라이더·함수 입력 등 조작 가능)를
학습 챕터의 한 **페이지 콘텐츠 타입**으로 학생에게 제공한다. 학생은 도구를 조작하며 탐구한다.

## 범위

- **대상**: 챕터 학습 흐름 — `pages` 테이블 + 학생 `StudyViewer` + 교사 챕터 `Editor`.
- **제외(Phase 2)**: 과제(assignment) 흐름의 HTML 도구, 학생 조작 상태 저장, 별도 도구 라이브러리,
  HTML 페이지 위 Excalidraw 필기.

## 접근 방식 (A안 채택)

Volume에 .html 저장 → 기존 파일 서빙 라우트 재사용 → 학생 화면에서 `<iframe sandbox>` +
서버가 HTML 응답에 `Content-Security-Policy: sandbox` 헤더를 강제하는 **이중 격리**.

교사는 신뢰 주체이므로 별도 서브도메인(C안)의 DNS/인증서/라우팅 비용 없이도 충분히 안전하다.

## 데이터 모델

- `packages/server/src/db/schema.ts`: `pages` 테이블에 `htmlUrl: text('html_url')` 컬럼 추가.
  - 콘텐츠 타입은 기존 `imageUrl`/`videoUrl` 패턴과 동일하게 **어느 필드가 채워졌는지로 추론**
    (별도 `type` 컬럼 없음). 한 페이지 = 한 콘텐츠.
- `packages/shared/src/types/models.ts`: `Page` 인터페이스(line 29)에 `htmlUrl: string | null` 추가.
  - 동일 파일 line 108 부근의 또 다른 page-형 타입(과제 페이지)은 **이번 범위 아님 — 수정하지 않음**.
- 배포 시: `npx drizzle-kit push` 로 `html_url` 컬럼 생성.

## 저장 · 서빙 (보안 핵심)

### 버킷
- 새 버킷 `chapter-tools` (교사 전용). `STUDENT_ALLOWED_BUCKETS`에 미포함이므로 학생 업로드 기본 차단.

### 업로드
- 기존 `POST /api/files/upload` (`packages/server/src/routes/storage.ts`) 재사용.
- 버킷이 `chapter-tools`일 때 `text/html`만 허용하는 MIME 검증 추가.

### 서빙 (`GET /api/files/*`)
현재 이 라우트는 인증 없이 URL 기반 공개 서빙(이미지와 동일). HTML 서빙 시 두 가지를 처리:

1. **응답이 `text/html`일 때만** CSP를 sandbox 정책으로 override:
   ```
   Content-Security-Policy: sandbox allow-scripts allow-popups allow-forms allow-modals
   X-Content-Type-Options: nosniff
   ```
   - `sandbox allow-scripts` → 도구의 inline + CDN 스크립트는 실행되지만 응답은 **opaque origin**으로
     격리되어, 학생이 URL을 직접 열어도 앱 쿠키/localStorage에 접근 불가 (stored-XSS 방지).
   - CDN 외부 스크립트 로드는 sandbox가 막지 않으므로 정상 동작.

2. **helmet 전역 CSP 충돌 회피**: `@fastify/helmet`의 전역 CSP가 이 응답에 덧씌워지면
   inline/CDN 스크립트가 차단된다. helmet 설정(`app.ts`)에서 `/api/files/*`의 `text/html` 응답을
   예외 처리하거나, 전역 `contentSecurityPolicy`를 off 하고 라우트별로 지정한다.
   → 구현 시 실제 helmet 설정을 확인하고 가장 간섭이 적은 방법 선택.

## 학생 화면 — `StudyViewer.jsx`

- 현재 콘텐츠 분기: `currentPage?.videoUrl ? <video iframe> : <image + Excalidraw>`
  (대략 line 289, line 1021 두 렌더 블록).
- **세 번째 분기 추가**: `htmlUrl`이 있으면
  ```jsx
  <iframe
    sandbox="allow-scripts allow-popups allow-forms"
    src={currentPage.htmlUrl}
    className="w-full h-full"
  />
  ```
  이 페이지 영역 전체(`flex-1`, `100dvh` 기준)를 채운다. **Excalidraw·DrawingToolbar 없음**.
- 분기 우선순위: `htmlUrl` → `videoUrl` → `imageUrl`.
- 기존 `PageNavOverlay`(양쪽 가장자리 tap 이전/다음)는 래퍼에 그대로 유지 → 도구 페이지에서도 이동 가능.
- 필기 관련 가드(`!currentPage?.videoUrl` 조건들)는 `htmlUrl`도 함께 제외하도록 확장
  (예: `!currentPage?.videoUrl && !currentPage?.htmlUrl`).
- 썸네일 목록(`pg.videoUrl ? ... : <img>`): HTML 페이지는 아이콘 + 라벨로 표시.

## 교사 화면 — `Editor.jsx`

- 페이지 추가 경로에 "HTML 도구 업로드"(.html 선택) 추가 →
  `chapter-tools` 버킷 업로드 → `htmlUrl` 페이지 생성.
- 페이지 목록 썸네일: HTML은 미리보기 이미지가 없으므로 아이콘 + 파일명 표시
  (선택적으로 작은 라이브 `iframe` 미리보기).

## 반응형 / UI 규칙

- iframe은 `w-full h-full`로 페이지 영역을 꽉 채우고, 바깥 컨테이너의 `100dvh` 계산을 그대로 따른다.
- 도구 페이지에는 필기 툴바가 없으므로 모바일에서 전체 화면을 도구가 차지.
- 도구 내부의 반응형은 도구 HTML 자체 책임(교사/claude가 제작 시 보장).

## 테스트

- 교사: .html 업로드 → 페이지 생성 → 목록에 도구 페이지 표시 확인.
- 학생: 해당 페이지 진입 → iframe 렌더, 슬라이더/함수 입력 조작 동작 확인.
- 보안: 서빙 URL 직접 열기 → CSP sandbox 헤더로 opaque origin 격리 확인 (앱 스토리지 접근 불가).
- CDN 의존 도구 1개 + self-contained 도구 1개 모두 정상 동작 확인.
- 페이지 이동(PageNavOverlay)으로 이미지↔도구↔영상 페이지 간 전환 확인.

## 미해결/구현 시 확인 사항

- helmet 실제 CSP 설정 확인 후 간섭 회피 방식 확정.
- `chapter-tools` 버킷 업로드 시 `text/html` 외 `.html`이 `application/octet-stream` 등으로
  올 가능성 → 확장자 기반 보정 여부 결정.
