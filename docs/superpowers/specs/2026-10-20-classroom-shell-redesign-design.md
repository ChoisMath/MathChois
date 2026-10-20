# 앱 틀(상단 바 + 사이드바) 리디자인 + 교사 학급 색 선택 — 설계

작성일: 2026-10-20
상태: 질의응답으로 확정(시안 B "남색 상단 바 + 색 인덱스 탭", 화면 설계 1/2 · 데이터/API 설계 2/2 승인) → 구현 계획 작성 전
시안: https://claude.ai/artifact/UQv7Hu9uWBy6PqpCPbsam3 (B안)
선행: 1단계 클래스룸 목록 공책 표지(PR #12), 첫 화면 모눈 노트(PR #11)

## 배경 / 문제

1단계에서 클래스룸 목록 본문을 모눈 노트 위 공책 표지로 바꿨지만, 로그인 후 모든 화면을 감싸는
상단 바(`components/Navbar.jsx`)와 사이드바(`layouts/DashboardLayout.jsx`)는 회색·파랑의 이전 모습 그대로라
본문과 분위기가 어긋난다. 또 학급 색은 브라우저에서 자동 배정만 하므로
- 교사가 색을 고를 수 없고,
- 학생은 자기 학급만 보기 때문에 드물게 교사와 다른 색으로 보는 문제가 남아 있다.

## 목표

1. 상단 바와 사이드바를 시안 B로 바꾼다: 잉크 네이비 상단 바 + 공책 옆에 꽂힌 인덱스 탭 모양의 사이드바.
2. 사이드바의 학급 목록, 학급 상세 제목에 학급 색을 표시한다.
3. 교사가 학급 색(여섯 가지)을 고르고 바꿀 수 있게 한다. 고른 색은 학생 화면에도 같게 보인다.
4. 기존 학급은 1단계에서 보이던 색을 그대로 유지한다.

### 비목표

- 메뉴 구성·라우트 변경, 학급 상세 화면의 탭/기능 변경.
- 필기 화면(StudyViewer 등 DashboardLayout 밖의 전체화면 뷰어) 변경.
- 문제은행·게시판 등 개별 페이지 본문의 리디자인.
- 다크 모드.

## 핵심 설계 결정

| 결정 | 선택 | 이유 |
|---|---|---|
| 시안 | **B** 남색 상단 바 + 색 인덱스 탭 | 사용자 선택. 구조가 가장 또렷함. |
| 색 저장 | `classrooms.color text NULL` (여섯 색 이름) | 교사 선택을 서버에 저장해야 학생도 같은 색을 본다. |
| 기존 학급 색 | 서버 시작 시 1회 채움(색이 빈 학급만) | 1단계 자동 배정과 같은 규칙으로 채워 화면이 바뀌지 않게 하고, 이후 모든 학급이 색을 가진다. |
| 색 규칙 위치 | `@mathchois/shared` (`shared/src/classroom/color.ts`) | 서버(채움·생성 시 기본값)와 클라이언트(빈 값 보완·미리 선택)가 같은 코드를 쓴다. |
| 생성 시 기본 색 | 교사 학급 중 가장 적게 쓴 색 | 여섯 개까지 모두 다른 색이라는 1단계 성질 유지. |
| 본문 배경 | 본문 영역 전체를 종이색(#F8FAFD), 모눈 선은 클래스룸 목록 카드 안에만 | 선택한 탭이 본문과 같은 색으로 이어져 보이게. 작업 화면에 모눈을 깔면 표·입력칸이 어지럽다. |

## 화면

### 상단 바 (`components/Navbar.jsx`)

- 배경 잉크 네이비 `#1C2B4A`, 글자·아이콘 흰색 계열(보조 글자 `#AEBBD6`).
- 로고: 첫 화면과 같은 체크 노트 아이콘(흰 선 + 빨간 체크 `#D9372B`) + "ChoisClass" (IBM Plex Sans KR).
- 오른쪽: (관리자 패널) · 아바타(사진, 없으면 머스터드 `#F2B544` 원 + 이름 첫 글자) · 이름과 그 아래 역할("선생님"/"학생") · 로그아웃.
- 메뉴 버튼·관리자 패널·이름 변경(이메일 가입자)·로그아웃 동작은 그대로. 누르는 영역 44px 이상.
- MainLayout(역할 선택·개인정보처리방침·이용약관)도 같은 상단 바를 쓰므로 함께 바뀐다.

### 사이드바 (`layouts/DashboardLayout.jsx`)

- 배경 `#EEF2F8`. 제목 줄("교사 워크스페이스"/"학생 워크스페이스")은 작은 대문자 라벨.
- 메뉴 항목은 인덱스 탭: 왼쪽만 둥근 모서리로 사이드바 오른쪽 끝까지 붙는다. 선택한 탭은 종이색(`#F8FAFD`) + 굵게 + 오른쪽 안쪽에 펜 색(`#2453A6`) 선 → 본문과 이어져 보인다.
- 학급 목록: 각 학급의 연한 탭 색 배경 + 왼쪽 5px 진한 색 띠, 오른쪽 여백 14px(꽂힌 탭). 선택한 학급은 여백 없이 종이색으로 본문까지 이어진다. 영상 댓글 배지는 그대로.
- 학생 참여 코드: 흰 카드 안에 "선생님께 받은 참여 코드" 라벨 + 입력칸 + 글자 있는 "참여" 버튼.
- 교사·학생 사이드바에 반복되던 메뉴 링크 마크업은 `SideTab` 컴포넌트 하나로 정리한다(이번 변경 범위 안에서만).
- 유지: 메뉴 구성, `subscribeSidebarRefresh`, 영상 미읽음 배지, 데스크톱 고정 사이드바(접기 상태 `mc_sidebar_collapsed`), 태블릿·휴대폰 덮개 메뉴.
- 덮개 메뉴 머리: 상단 바와 같은 네이비, 닫기는 ✕ 문자 대신 `X` 아이콘(aria-label 유지).

### 본문

- `DashboardLayout`의 `<main>` 배경을 종이색으로. 1단계의 `.classrooms` 카드(모눈)는 그대로.

### 학급 색 선택 (교사)

- `ClassroomColorPicker` 컴포넌트: 여섯 개의 44px 원 버튼(`aria-pressed`, `aria-label`=색 이름, 선택 표시 체크), `role="group"` + 라벨 "표지 색".
- 새 학급 만들기 창(`ClassroomList`): 이름 아래에 색 원. 처음 선택값 = 교사 학급 중 가장 적게 쓴 색(`pickLeastUsedColor`).
- 학급 상세(`ClassroomDetail`) 제목 영역: 왼쪽에 학급 색 띠(교사·학생 공통). 교사에게 "표지 색 바꾸기" 버튼 → 누르면 색 원이 펼쳐지고, 고르면 바로 저장(`PATCH`) 후 접힌다. 저장 실패 시 원래 색으로 되돌리고 오류를 표시.
  - 변경(사용자 요청): 구현 후 사용자 요청으로 "표지 색 바꾸기" 토글을 없애고, 교사 헤더에 작은 색 원(`ClassroomColorPicker size="sm"`, 보이는 30px·누르는 영역 44px, 그룹 `aria-label="표지 색"`)을 항상 보이게 했다. 누르면 바로 저장하며 접힘 단계는 없다.
  - 변경(사용자 요청 2): 색 원은 제목 옆 `#`(클래스 코드) 버튼을 눌렀을 때만 코드와 함께 나타난다(`aria-expanded`). 저장 실패 문구는 접혀 있어도 보인다.

### 공통 색 모듈

- `client/src/lib/classroomColor.js`: shared 규칙을 다시 내보내고, 화면용 값 `COLOR_STYLES = { coral: { cover, tint, deep, label }, … }`을 둔다(1단계 `classrooms.css`의 `.nb-*` 값과 동일).
  - cover(표지) / tint(연한 탭) / deep(진한 글자·띠) / label(한국어 이름)
- `resolveClassroomColor(classroom, autoMap)`: 저장된 `color`가 유효하면 그 값, 아니면 자동 배정 값.
- 목록·사이드바·상세·색 원이 모두 이 모듈을 쓴다. `.nb-*` CSS 클래스는 CSS 변수(`--nb-cover`, `--nb-deep`)를 인라인 style 로 받도록 바꾼다.

## 데이터 / API

### DB

- 스키마(`server/src/db/schema.ts`): `classrooms.color: text('color')` (NULL 허용).
- 시작 마이그레이션(`server/src/db/startupMigrate.ts`):
  1. `ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS color text`
  2. 색이 빈 학급 채움: `color IS NULL` 인 학급이 있는 교사마다 그 교사의 모든 학급(id, created_at, color)을 읽고, shared `assignClassroomColors`로 정한 값을 빈 학급에만 `UPDATE … WHERE id = $1 AND color IS NULL`. 이미 색이 있는 학급은 "사용 중"으로 먼저 센다. 재실행 안전(빈 값만 채움).

### shared (`shared/src/classroom/color.ts`, `index.ts`에서 export)

- `CLASSROOM_COLORS = ['coral','mustard','sage','sky','lavender','rose'] as const`, `type ClassroomColor`.
- `isClassroomColor(v): v is ClassroomColor`
- `classroomColor(id)` — id 해시(FNV-1a + murmur fmix32) 고유 색(1단계와 동일).
- `assignClassroomColors(rooms: {id, createdAt, color?}[]): Map<id, ClassroomColor>` — 저장된 색이 유효하면 그대로 쓰고 사용 수에 반영, 나머지는 만든 순서대로 고유 색 → 가장 적게 쓴 색(1단계 규칙). 저장 색이 하나도 없을 때 결과는 1단계와 동일해야 한다.
- `pickLeastUsedColor(rooms)` — 새 학급 기본 색: `assignClassroomColors(rooms)`로 정해진 최종 색(저장 색 + 빈 값 보완)의 사용 수를 세어, 가장 적게 쓴 색 중 `CLASSROOM_COLORS` 순서상 첫 번째.
- 공용 타입 `Classroom`에 `color: ClassroomColor | null` 추가.

### API (`server/src/routes/classrooms.ts`, `services/classroom.service.ts`)

- `POST /api/classrooms` body `{ name, color? }`:
  - `color`가 있으면 `isClassroomColor` 검사(아니면 400 `Invalid color`).
  - 없으면 그 교사의 학급 색으로 `pickLeastUsedColor` → 저장.
- `PATCH /api/classrooms/:id` body `{ name?, color? }`: 소유자 확인 기존 그대로. `color` 검사(400). 허용 필드만 `updateClassroom`에 전달.
- `getTeacherClassrooms` / `getStudentClassrooms` / `getClassroomById` select 에 `color` 포함.

### 화면 갱신

- 색 변경 후: 상세 화면 상태 갱신 + `refreshSidebar()` → 사이드바 다시 불러옴. 목록은 재진입 시(`location.key`) 다시 불러온다.

## 오류 처리

- 잘못된 색 → 400, 클라이언트는 색 원 아래에 메시지("표지 색을 바꾸지 못했어요. 다시 시도해 주세요.") + 이전 색 복원.
- 마이그레이션 채움 실패는 로그만 남기고 부팅을 막지 않는다(색이 비어도 화면은 자동 배정으로 보완).

## 테스트 / 검증

- Vitest(client 워크스페이스에서 shared 포함):
  - shared 색 규칙: 6개까지 모두 다름, 새 학급 추가 시 기존 색 유지, 입력 순서 무관, 저장 색 우선·사용 수 반영, 저장 색이 없을 때 1단계 결과와 동일, `pickLeastUsedColor`, `isClassroomColor`.
  - client `resolveClassroomColor`.
- 서버: `tsc --noEmit`(server, shared). 로컬 PostgreSQL 이 가능하면 마이그레이션(칸 추가 + 채움 재실행 안전)과 POST/PATCH 검증 400 을 실제 호출로 확인, 불가능하면 그 사실을 보고.
- Playwright(빌드 + 모의 API): 교사/학생 × 1280·800·375 폭, 사이드바 접기, 덮개 메뉴, 새 학급 창 색 원, 학급 상세 제목 색 띠와 색 바꾸기, 가로 스크롤 없음, 페이지 오류 0.
- 필기 뷰어 경로가 DashboardLayout 밖인지 확인(영향 없음).

## 배포

- 서버 부팅 시 `runStartupMigrations`가 칸 추가와 색 채움을 마친 뒤 요청을 받는다. 별도 작업 없음.
- 롤백 시: `color` 칸은 남아도 이전 코드가 읽지 않으므로 무해.
