# 시각화자료 라이브러리 (Visualization Library) — 설계

작성일: 2026-06-03
상태: 설계 승인 완료 → 구현 계획 대기

## 배경 / 문제

현재 교사가 챕터에 HTML 도구 페이지를 추가하는 방식은 일회성이다.

- `Editor.jsx`에서 HTML 파일 업로드 → `chapter-tools` 버킷에 원본 1개 저장 → 그 `url`을 `pages.htmlUrl`에 문자열로 기록.
- 페이지를 열면 iframe이 `toolUrl(htmlUrl)`로 저장 파일을 참조해 렌더.
- 메타데이터(과목/단원/설명)·재사용·교사 간 공유 개념이 전혀 없다. 같은 HTML을 다른 챕터에 다시 쓰려면 매번 다시 업로드해야 한다.

## 목표

교사가 등록한 HTML을 **재사용**하고 **교사 간 공유**할 수 있는 별도의 **[시각화자료]** 라이브러리를 만든다.

- 저장 시 **제목 / 과목 / 대단원 / 소단원 / 설명** 을 함께 기록한다.
- 챕터의 HTML 삽입 버튼을 누르면 저장된 자료를 **검색·선택**하는 리스트가 먼저 뜨고, 우측 상단 **[새html등록]** 버튼으로 본인 HTML을 새로 등록할 수 있다.
- 모든 교사가 서로의 자료를 검색·삽입할 수 있다(공유). 수정/삭제는 본인 자료만 가능하다.

### 비목표 (Out of scope)

- HTML 내부 콘텐츠를 세부 편집하는 기능 (수정은 파일 통째 교체 / 단원·설명·제목 수정만).
- 기존에 이미 챕터에 직접 업로드된 HTML 페이지를 라이브러리로 마이그레이션하는 작업.
- 학생의 라이브러리 접근 (교사 전용).

## 핵심 설계 결정

| 결정 | 선택 | 비고 |
|---|---|---|
| 원본 ↔ 페이지 연결 | **복사본(독립)** | 삽입 시점에 원본 HTML을 페이지 전용으로 복제. 원본 교체/삭제가 과거 삽입 페이지에 영향 없음. 새로 삽입하는 페이지부터 교체본 적용. |
| 분류 체계 | 과목 + 대단원 + 소단원 + 설명 | 문제은행(`problems`)과 동일한 3단계 taxonomy로 일관성 유지. |
| 식별 이름 | 제목(title) 필드 추가, 필수 | 리스트에 제목 크게, 설명 보조 표시. |
| 검색 | 텍스트(제목/설명) + 과목/단원 필터 | 문제은행 `RegisteredProblems`와 동일한 서버사이드 검색·필터·페이지네이션. |
| [새html등록] 직후 | 등록 + 즉시 현재 페이지에 삽입 | 대부분 본인이 쓸 자료를 올리므로 한 번에 처리. |
| 관리 위치 | 별도 관리 페이지 `/teacher/visualizations` | 사이드바 메뉴. 본인 자료 목록·수정·삭제. |
| standalone 요건 | 등록 폼에 안내문 상시 노출 | "외부 의존 없이 단독 실행 가능한 standalone HTML이어야 함". |

## 데이터 모델

**새 테이블 `visualizations`** (Drizzle: `packages/server/src/db/schema.ts`)

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | uuid PK | |
| `createdBy` | uuid → `profiles` (cascade) | 소유자 |
| `title` | text NOT NULL | 제목(필수) |
| `subject` | text | 과목 |
| `majorUnit` | text | 대단원 |
| `minorUnit` | text | 소단원 |
| `description` | text | 간단한 설명 |
| `htmlUrl` | text NOT NULL | 원본 HTML 파일 위치(`visualizations` 버킷) |
| `createdAt` | timestamp default now | |
| `updatedAt` | timestamp | |

인덱스: `(createdBy)`, `(subject, majorUnit, minorUnit)`.

마이그레이션: `db:push` + `db/startupMigrate.ts`에 멱등 DDL 추가(기존 패턴 — 테이블·컬럼 보장).

## 스토리지

- **새 버킷 `visualizations`** (HTML 전용). 라이브러리 원본 HTML을 보관.
- `routes/storage.ts`의 `chapter-tools` HTML-only(`text/html`) mimetype 검사에 `visualizations`도 포함.
- **복사본 동작**: 페이지 삽입 시 서버가 원본(`visualizations`)을 읽어 `chapter-tools`로 복제하고 그 URL을 `pages.htmlUrl`로 사용. 페이지는 자신의 복사본을 참조 → 독립.

## 서버 API

`routes/visualizations.ts` (모두 `/api/visualizations`, `authenticate` + 교사 역할)

| 메서드 | 경로 | 권한 | 설명 |
|---|---|---|---|
| GET | `/visualizations` | 교사 | 목록. `q`(제목/설명 텍스트) + `subject`/`majorUnit`/`minorUnit` 필터 + 페이지네이션. 기본 전체 공유. `mine=1`이면 본인 것만(관리 페이지). |
| GET | `/visualizations/facets` | 교사 | 과목/단원 필터 옵션. |
| GET | `/visualizations/:id` | 교사 | 단건. |
| POST | `/visualizations` | 교사 | 등록. body: `title`/`subject`/`majorUnit`/`minorUnit`/`description`/`htmlUrl`. |
| PATCH | `/visualizations/:id` | 소유자 | 제목·단원·설명 수정, `htmlUrl` 교체. 소유자 아니면 403. |
| DELETE | `/visualizations/:id` | 소유자 | 레코드 + 원본 파일 삭제. 소유자 아니면 403. |

**`services/visualization.service.ts`**
- `listVisualizations(filters)` / `getFacets()` / `getById(id)` / `create(data)` / `update(id, data)` / `remove(id)`(원본 파일 `removeFile` 포함).
- `copyHtmlToChapterTools(htmlUrl)`: 원본 `readFile` → `chapter-tools`에 `uploadFile` → 새 URL 반환. 실패 시 throw.

**기존 페이지 생성 라우트 재사용**
- `POST /api/chapters/:chapterId/pages`에 옵션 필드 `fromVisualizationId` 추가.
- `page.service.createPage`가 `fromVisualizationId` 존재 시 `copyHtmlToChapterTools`로 복제 후 그 URL을 `htmlUrl`로 설정. 한 번의 호출로 원자적 처리(고아 파일 방지).

**공유 타입** `shared/src/types/visualization.ts`
- `Visualization`, `VisualizationListResult`, `VisualizationFacets`, `VisualizationFilters`.

## 클라이언트

### 1) 삽입 모달 — `components/visualizations/VisualizationPickerModal.jsx`

`components/problems/ProblemPickerModal.jsx` 패턴 차용. Editor의 HTML 삽입 버튼(`FileCode2`)이 연다.

- 상단: 검색창(제목/설명) + 과목/대단원/소단원 필터 드롭다운 + **우측 상단 [새html등록] 버튼**.
- 본문: 서버사이드 검색·페이지네이션 카드 리스트(제목 크게, 과목·단원 칩, 설명 보조). 카드 클릭 → 선택.
- [삽입] → `POST /api/chapters/:chapterId/pages { fromVisualizationId, position }` → 복제 페이지 생성 → 모달 닫고 Editor 갱신.
- **[새html등록]** → 같은 모달 내 등록 폼(파일 업로드 + 제목/과목/대단원/소단원/설명 + standalone 안내문) → `POST /visualizations` → 그 id로 즉시 현재 페이지에 삽입 → 모달 닫힘.

### 2) 관리 페이지 — `pages/Visualizations/VisualizationsPage.jsx` (`/teacher/visualizations`)

`pages/Problems/ProblemsPage.jsx` 패턴. 본인 자료(`mine=1`) 목록 + 검색/필터.

- **수정**: ① HTML 파일 통째 교체, ② 과목/대단원/소단원 수정, ③ 제목·설명 수정 — 이 3가지만. HTML 내부 편집 없음.
- **삭제**: 레코드 + 원본 파일.
- 등록/수정 폼은 모달과 공용 컴포넌트 `VisualizationForm`으로 재사용.

### 3) 연결

- `App.jsx`: `/teacher/visualizations` 라우트(DashboardLayout).
- `layouts/DashboardLayout.jsx` TeacherSidebar: "문제은행" 아래 **"시각화자료"** 메뉴 추가(아이콘 예: `LayoutTemplate`).
- `lib/visualizations.js`: API 래퍼(list/facets/get/create/update/remove + insertToChapter).
- `Editor.jsx`: 기존 `handleUploadHtml`(직접 업로드)을 **모달 오픈으로 교체**, `htmlInputRef` 직접 업로드 제거.

## 흐름

### 삽입 (기존 자료 선택)
1. Editor HTML 삽입 버튼 → 모달 → 검색·필터 → 카드 선택 → [삽입].
2. `POST /api/chapters/:id/pages { fromVisualizationId, position }` → 서버가 원본을 `chapter-tools`로 복제 → `htmlUrl`로 페이지 생성 → 반환.
3. Editor 페이지 목록 갱신.

### 등록 + 삽입 ([새html등록])
1. 모달 내 폼 → 파일 업로드(`POST /files/upload?bucket=visualizations`) → `htmlUrl` 획득.
2. `POST /visualizations { title, subject, majorUnit, minorUnit, description, htmlUrl }` → 레코드 생성.
3. 이어서 삽입 흐름(`fromVisualizationId`)으로 현재 페이지에 복제 삽입.

## 엣지케이스

- 원본 파일 누락/읽기 실패 시 페이지 생성 400, 고아 페이지 미생성.
- 삭제 시 원본 파일도 제거. 이미 삽입된 챕터 페이지(복사본)는 무관(독립).
- 비-HTML 업로드 차단(버킷 mimetype 검사).
- PATCH/DELETE는 `createdBy === req.user.sub` 아니면 403.
- 빈 검색 결과 안내. standalone 안내문 상시 노출.

## 테스트

- **서버 단위**: `copyHtmlToChapterTools`(복제 후 독립성), `listVisualizations`(필터/페이지네이션), 권한 403.
- **클라이언트(Vitest)**: `lib/visualizations.js` 쿼리 빌드, 모달 검색 상태.
- **수동 E2E**: 등록 → 삽입 → 원본 교체 후 과거 페이지 불변 확인.

## 영향받는 파일 요약

**서버**
- `db/schema.ts` (테이블 추가), `db/startupMigrate.ts` (멱등 DDL)
- `routes/visualizations.ts` (신규), `app.ts` (라우트 등록)
- `services/visualization.service.ts` (신규)
- `services/page.service.ts` (`createPage`에 `fromVisualizationId`)
- `routes/pages.ts` (body 필드 허용), `routes/storage.ts` (버킷 mimetype)

**공유**
- `shared/src/types/visualization.ts` (신규)

**클라이언트**
- `components/visualizations/VisualizationPickerModal.jsx`, `VisualizationForm.jsx` (신규)
- `pages/Visualizations/VisualizationsPage.jsx` (신규)
- `lib/visualizations.js` (신규)
- `pages/Chapters/Editor.jsx` (모달 연동), `App.jsx` (라우트), `layouts/DashboardLayout.jsx` (사이드바)
