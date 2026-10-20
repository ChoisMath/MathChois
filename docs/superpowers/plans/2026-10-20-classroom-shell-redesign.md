# 앱 틀 리디자인 + 교사 학급 색 선택 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 상단 바·사이드바를 시안 B(남색 상단 바 + 색 인덱스 탭)로 바꾸고, 교사가 학급 색을 골라 서버에 저장해 교사·학생이 같은 색을 보게 한다.

**Architecture:** 색 규칙은 `@mathchois/shared`(서버·클라이언트 공용)에 두고, 서버는 `classrooms.color` 칸 + 부팅 시 빈 색 1회 채움 + POST/PATCH 검증을 담당한다. 클라이언트는 공통 색 모듈(`lib/classroomColor.js`)의 화면용 색 값으로 목록·사이드바·상세·색 원을 그린다.

**Tech Stack:** React 19 + Vite 7 + Tailwind 4 (client), Fastify 5 + Drizzle 0.45 + PostgreSQL (server), TypeScript (shared), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-20-classroom-shell-redesign-design.md`

## Global Constraints

- 학급 색은 정확히 6개, 순서 고정: `['coral','mustard','sage','sky','lavender','rose']`.
- 색 값(1단계 `classrooms.css`와 동일) — cover / tint / deep / label:
  coral `#f2836b` / `#fde3dc` / `#a63b24` / 코랄 · mustard `#f2b544` / `#fcefc7` / `#7d5200` / 머스터드 · sage `#8fc28a` / `#dff0dc` / `#2c6537` / 세이지 · sky `#6fa8dc` / `#dcebfa` / `#1d5893` / 하늘 · lavender `#a78bda` / `#ece4fa` / `#563a99` / 라벤더 · rose `#ee8ab1` / `#fbe1ec` / `#932a56` / 로즈.
- 셸 색: 상단 바 `#1C2B4A`, 상단 바 보조 글자 `#AEBBD6`, 아바타 `#F2B544`, 사이드바 `#EEF2F8`, 종이(본문·선택 탭) `#F8FAFD`, 펜 `#2453A6`, 빨간 체크 `#D9372B`.
- 글꼴: IBM Plex Sans KR(본문), Gaegu(손글씨) — `@fontsource` 로 이미 설치됨.
- 누르는 영역 44px 이상, `prefers-reduced-motion` 존중, 키보드 포커스 표시.
- 기존 동작 유지: 메뉴 구성, 영상 미읽음 배지, `subscribeSidebarRefresh`, 사이드바 접기(`mc_sidebar_collapsed`), 덮개 메뉴, 관리자 패널, 이름 변경, 로그아웃.
- 잘못된 색 → HTTP 400 `{ error: 'Invalid color' }`.

## Review Focus

- **색이 없거나 알 수 없는 학급**(구 서버 응답, `color: null`, DB에 `"red"` 같은 값) → 화면이 깨지지 않고 자동 색을 쓴다. → Task 2 테스트 `resolveClassroomColor`.
- **PATCH 본문의 다른 필드**(`teacherId`, `classCode` 등) → 무시되고 `name`/`color`만 바뀐다. 현재 `updateClassroom(id, request.body)`가 본문을 그대로 넘기므로 이번에 허용 필드만 넘기도록 막는다. → Task 3 단계 + 검증.
- **부팅 채움 재실행·혼합 상태**(일부 학급만 색 있음) → 빈 학급만 채우고 이미 있는 색은 바꾸지 않으며, 이미 있는 색을 사용 수에 반영한다. → Task 1 테스트(저장 색 우선) + Task 3 검증.
- **색 변경 저장 실패**(네트워크/400) → 이전 색으로 되돌리고 오류 문구를 보인다. → Task 6 단계.
- **긴 학급 이름**이 사이드바 탭에서 넘치지 않고 말줄임된다. → Task 5 단계 + Task 7 Playwright(긴 이름 데이터).

---

### Task 1: shared 색 규칙

**Files:**
- Create: `packages/shared/src/classroom/color.ts`
- Modify: `packages/shared/src/index.ts` (export 추가), `packages/shared/src/types/models.ts` (`Classroom.color`)
- Test: `packages/client/src/lib/classroomColorShared.test.js` (client Vitest 가 shared 를 불러오는 기존 방식 — `lib/whiteboardSync.test.js` 참고)

**Interfaces:**
- Produces (from `@mathchois/shared`):
  - `CLASSROOM_COLORS: readonly ['coral','mustard','sage','sky','lavender','rose']`, `type ClassroomColor`
  - `isClassroomColor(v: unknown): v is ClassroomColor`
  - `classroomColor(id: string | null | undefined): ClassroomColor` — 1단계와 동일(FNV-1a + murmur fmix32, 없으면 `'coral'`)
  - `assignClassroomColors(rooms: { id: string; createdAt?: string | Date | null; color?: string | null }[]): Map<string, ClassroomColor>`
  - `pickLeastUsedColor(rooms: 같은 타입[]): ClassroomColor`
  - `Classroom.color: ClassroomColor | null`

- [ ] **Step 1: 실패하는 테스트 작성** — `classroomColorShared.test.js`
  - `assignClassroomColors` 저장 색 없음: 1~6번 학급 모두 다른 색; 1단계와 같은 결과 — 테스트 작성 전에 **현재** `client/src/lib/classroomColor.js`(1단계 구현)로 고정 id 13개(`c0a8f{i}d2-4b1e-4c3a-9e7f-1a2b3c4d5e{ii}`, createdAt 2026-03-01부터 하루씩)의 결과를 계산해 기대값 배열(골든 값)로 테스트에 적어 둔다. Task 2 에서 client 구현이 shared 재수출로 바뀌어도 이 골든 값으로 1단계 호환을 계속 확인한다.
  - 저장 색 우선: `[{id:a,color:'sky'},{id:b,color:null},…]` → a 는 `'sky'`, 나머지 5개는 `'sky'`를 피해 모두 다른 색.
  - 알 수 없는 저장 색 `'red'`는 빈 값처럼 자동 배정.
  - 새 학급 추가 시 기존 학급 색 불변, 입력 순서 무관(1단계 테스트와 같은 형태).
  - `pickLeastUsedColor([])` → `'coral'`; coral·mustard 사용 중 → `'sage'`; 여섯 색 모두 1번씩 + coral 2번 → `'mustard'`.
  - `isClassroomColor('rose')` true, `'red'`/`null`/`3` false.
- [ ] **Step 2: 실행해 실패 확인** — `npx vitest run src/lib/classroomColorShared.test.js` (cwd `packages/client`) → "does not provide an export named" 실패.
- [ ] **Step 3: `color.ts` 구현 + `index.ts`에 `export * from './classroom/color.js';` + `Classroom`에 `color` 추가.** `assignClassroomColors`: 유효한 저장 색을 먼저 결과에 넣고 사용 수에 더한 뒤, 나머지를 (createdAt, id) 순으로 1단계 규칙(고유 색부터 돌며 최소 사용 색)으로 배정. `pickLeastUsedColor`: `assignClassroomColors` 결과의 사용 수 기준, 최소 사용 색 중 `CLASSROOM_COLORS` 순서상 첫 번째.
- [ ] **Step 4: 통과 확인** — 위 명령 PASS, `npm run typecheck -w @mathchois/shared` 오류 0.
- [ ] **Step 5: 커밋** — `feat(shared): 학급 색 규칙(assign/pickLeastUsed/isClassroomColor)`

### Task 2: 클라이언트 공통 색 모듈 + 목록 적용

**Files:**
- Modify: `packages/client/src/lib/classroomColor.js` (shared 재수출 + 화면용 값), `packages/client/src/components/classrooms/classrooms.css` (`.nb-*` 클래스 삭제 → 변수), `packages/client/src/pages/Classrooms/ClassroomList.jsx`
- Test: `packages/client/src/lib/classroomColor.test.js` (기존 유지 + 추가)

**Interfaces:**
- Consumes: Task 1 의 shared 함수 전부.
- Produces (`lib/classroomColor.js`):
  - 재수출: `CLASSROOM_COLORS`, `classroomColor`, `assignClassroomColors`, `pickLeastUsedColor`, `isClassroomColor`
  - `COLOR_STYLES: Record<ClassroomColor, { cover: string; tint: string; deep: string; label: string }>` (Global Constraints 값)
  - `resolveClassroomColor(classroom: { id, color? }, autoMap?: Map<string, ClassroomColor>): ClassroomColor` — 유효한 `color` → 그 값, 아니면 `autoMap?.get(id)`, 그것도 없으면 `classroomColor(id)`
  - `colorVars(color: ClassroomColor): { '--nb-cover': string; '--nb-tint': string; '--nb-deep': string }` — 인라인 style 용

- [ ] **Step 1: 실패하는 테스트 추가** — `resolveClassroomColor({id:'x',color:'sage'})` → `'sage'`; `{id:'x',color:null}` + autoMap(`x→'sky'`) → `'sky'`; `{id:'x',color:'red'}` autoMap 없음 → `classroomColor('x')`; `colorVars('rose')['--nb-cover']` → `'#ee8ab1'`; `COLOR_STYLES` 키가 `CLASSROOM_COLORS`와 같은 순서.
- [ ] **Step 2: 실패 확인** — `npx vitest run src/lib/classroomColor.test.js` FAIL.
- [ ] **Step 3: 구현.** 1단계의 해시·배정 코드는 지우고 shared 재수출로 대체. `classrooms.css`의 `.nb-coral … .nb-rose` 6줄 삭제(`.notebook`은 `var(--nb-cover)`/`var(--nb-deep)` 그대로). `ClassroomList`: `const auto = useMemo(() => assignClassroomColors(classrooms), [classrooms])`, 카드 링크 `style={colorVars(resolveClassroomColor(c, auto))}`(className 의 `nb-${…}` 제거).
- [ ] **Step 4: 통과 확인** — `npx vitest run` 전체 PASS, `npx eslint src/lib/classroomColor.js src/pages/Classrooms/ClassroomList.jsx` 오류 0.
- [ ] **Step 5: 커밋** — `refactor(classrooms): 학급 색을 shared 규칙 + 공통 색 모듈로`

### Task 3: 서버 — color 칸, 부팅 채움, API

**Files:**
- Modify: `packages/server/src/db/schema.ts:23-29` (`color: text('color')`), `packages/server/src/db/startupMigrate.ts` (함수 끝 `:217` 뒤에 추가), `packages/server/src/services/classroom.service.ts` (`getTeacherClassrooms`·`getStudentClassrooms` select 에 `color`, `createClassroom`, `updateClassroom`), `packages/server/src/routes/classrooms.ts` (POST `:38-50`, PATCH `:93-108`)

**Interfaces:**
- Consumes: `isClassroomColor`, `assignClassroomColors`, `pickLeastUsedColor` (`@mathchois/shared`).
- Produces: `createClassroom(teacherId: string, name: string, color?: ClassroomColor)`, `updateClassroom(id: string, data: { name?: string; color?: ClassroomColor })`, `backfillClassroomColors(log)`(startupMigrate 내부), 응답 JSON 의 `color`.

- [ ] **Step 1: 스키마 + 마이그레이션.** `ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS color text` 후 `backfillClassroomColors`: `SELECT DISTINCT teacher_id FROM classrooms WHERE color IS NULL` → 교사마다 `SELECT id, created_at, color FROM classrooms WHERE teacher_id = $1` → `assignClassroomColors` → 빈 학급만 `UPDATE classrooms SET color = $2 WHERE id = $1 AND color IS NULL`. try/catch 로 감싸 실패 시 `log.warn` 만(부팅 계속). 끝에 `log.info('startup migration: classrooms.color ensured (filled N)')`.
- [ ] **Step 2: 서비스.** 두 목록 select 에 `color: classrooms.color`. `createClassroom`의 values 에 `color`. `color` 인자가 없으면 라우트에서 `pickLeastUsedColor(await getTeacherClassrooms(teacherId))`로 정해 넘긴다.
- [ ] **Step 3: 라우트.** POST body `{ name: string; color?: string }`, PATCH body `{ name?: string; color?: string }`. `color !== undefined && !isClassroomColor(color)` → `reply.status(400).send({ error: 'Invalid color' })`. PATCH 는 `updateClassroom(id, { ...(name !== undefined && { name: name.trim() }), ...(color !== undefined && { color }) })` 로 **허용 필드만** 전달(본문 통째 전달 금지). 빈 객체면 400 `Nothing to update`.
- [ ] **Step 4: 타입 검사** — `npx tsc --noEmit -p packages/server/tsconfig.json` 오류 0.
- [ ] **Step 5: 실제 DB 검증(가능하면).** 로컬 PostgreSQL(`apt`/docker) 로 `DATABASE_URL` 을 잡고 서버를 띄워: 색 없는 학급 3개 생성(SQL) → 재시작 → 모두 서로 다른 색 / 한 번 더 재시작 → 값 불변 / `PATCH {color:'red'}` → 400 / `PATCH {color:'sky', teacherId:'…'}` → color 만 변경, teacher_id 불변 / `POST {name}` → least-used 색. 띄울 수 없으면 그 사실과 이유를 PR 에 적는다.
- [ ] **Step 6: 커밋** — `feat(server): classrooms.color 칸·부팅 채움·POST/PATCH 색 검증`

### Task 4: 상단 바 (Navbar)

**Files:**
- Modify: `packages/client/src/components/Navbar.jsx`
- Create: `packages/client/src/components/shell/shell.css` (상단 바·사이드바 공용 스타일, Task 5 도 사용) — `@fontsource/ibm-plex-sans-kr` 400/500/700 import 는 Navbar 에서

**Interfaces:**
- Produces: `components/shell/BrandMark.jsx` — `BrandMark({ className, onDark = false })` 체크 노트 아이콘(onDark 면 선 흰색, 체크는 항상 `#D9372B`). Task 5 덮개 메뉴 머리에서 사용.

- [ ] **Step 1: 구현.** 배경 `#1C2B4A`, 메뉴 버튼·로그아웃 `#C9D4EE`(hover 흰색, 배경 `rgba(255,255,255,.08)`), 로고 `BrandMark onDark` + "ChoisClass" 흰색. 이름 아래 역할 `teacher→선생님 / student→학생` (`#AEBBD6`, 11px). 아바타 대체 원 `#F2B544` + `#1C2B4A` 글자. 관리자 패널 링크는 `#FCEFC7` 배경 + `#7D5200` 글자. 이름 편집 입력은 흰 배경 유지. 이름 변경 실패 시 `alert` 사용은 기존 그대로(변경 범위 밖).
- [ ] **Step 2: 확인** — `npx eslint src/components/Navbar.jsx src/components/shell` 오류 0, `npm run build -w @mathchois/client` 성공.
- [ ] **Step 3: 커밋** — `feat(shell): 남색 상단 바 + 체크 노트 로고`

### Task 5: 사이드바 (인덱스 탭) + 본문 종이색

**Files:**
- Modify: `packages/client/src/layouts/DashboardLayout.jsx`, `packages/client/src/components/shell/shell.css`
- Create: `packages/client/src/components/shell/SideTab.jsx`

**Interfaces:**
- Consumes: `BrandMark`(Task 4), `assignClassroomColors`, `resolveClassroomColor`, `colorVars`(Task 2).
- Produces: `SideTab({ to, icon: Icon, active, children, badge })` — 메뉴 탭(아이콘 18px, `aria-current="page"` when active). `ClassTab({ classroom, color, active, badge })` — 학급 탭.

- [ ] **Step 1: 구현.** `<aside>` 배경 `#EEF2F8`, 오른쪽 테두리 없음(탭이 본문으로 이어짐). 제목 줄("교사 워크스페이스"/"학생 워크스페이스", 그 아래 "학급")은 11px 굵게, 대문자 간격 `.06em`, `#56627C`. 메뉴: `SideTab` — 높이 40px 이상, 왼쪽만 둥근 모서리(10px), 사이드바 오른쪽 끝까지; active → 배경 `#F8FAFD`, 굵게, `box-shadow: inset -2px 0 0 #2453A6`. 학급: `ClassTab` — 배경 `var(--nb-tint)`, `border-left: 5px solid var(--nb-cover)`, `margin-right: 14px`, 이름 `truncate`; active → `margin-right: 0`, 배경 `#F8FAFD`, 굵게. 사이드바가 불러온 목록으로 `assignClassroomColors` → `resolveClassroomColor`. 학생 참여 폼: 흰 카드 + 라벨 "선생님께 받은 참여 코드" + 입력 + "참여" 글자 버튼(로딩 시 스피너), 기존 검증·오류 문구 유지. 덮개 메뉴 머리: 배경 `#1C2B4A`, `BrandMark onDark` + "메뉴", 닫기 `X` 아이콘(`aria-label="메뉴 닫기"`). `<main>` 과 바깥 래퍼 배경 `#F8FAFD`.
- [ ] **Step 2: 확인** — eslint 오류 0, 빌드 성공.
- [ ] **Step 3: 커밋** — `feat(shell): 색 인덱스 탭 사이드바 + 종이색 본문`

### Task 6: 학급 색 선택 (새 학급 창 + 학급 상세)

**Files:**
- Create: `packages/client/src/components/classrooms/ClassroomColorPicker.jsx`
- Modify: `packages/client/src/pages/Classrooms/ClassroomList.jsx` (만들기 창), `packages/client/src/pages/Classrooms/ClassroomDetail.jsx` (헤더 `:445-480` 부근)

**Interfaces:**
- Consumes: `CLASSROOM_COLORS`, `COLOR_STYLES`, `pickLeastUsedColor`, `resolveClassroomColor`, `colorVars`, `refreshSidebar`.
- Produces: `ClassroomColorPicker({ value: ClassroomColor, onChange(color), disabled = false, labelId })` — `role="group"` + `aria-labelledby={labelId}`, 44px 원 버튼 6개(`aria-pressed`, `aria-label`=`COLOR_STYLES[c].label`, 선택 시 `Check` 아이콘).

- [ ] **Step 1: 만들기 창.** 이름 아래 라벨 "표지 색"(`id="new-classroom-color-label"`) + picker. 창을 열 때 초기값 `pickLeastUsedColor(classrooms)`. POST 본문 `{ name, color }`.
- [ ] **Step 2: 상세 헤더.** 제목 줄을 감싸는 요소에 `border-left: 6px solid var(--nb-cover)` + 배경 `var(--nb-tint)` + 둥근 모서리(교사·학생 공통, `colorVars(resolveClassroomColor(classroom))`). 교사에게 "표지 색 바꾸기" 버튼(현재 색 점 + 글자, 44px) → 펼침 시 picker. 선택 즉시 낙관적 갱신 → `api.patch('/api/classrooms/:id', { color })` → 성공 시 접고 `refreshSidebar()`; 실패 시 이전 색 복원 + picker 아래 `role="alert"` 문구 "표지 색을 바꾸지 못했어요. 다시 시도해 주세요."
- [ ] **Step 3: 확인** — eslint 오류 0, `npx vitest run` PASS, 빌드 성공.
- [ ] **Step 4: 커밋** — `feat(classrooms): 교사 학급 색 선택(새 학급 창 + 상세 헤더)`

### Task 7: 화면 검증 + 문서

**Files:**
- Modify: `.claude/PROJECT_MAP.md` (shell 컴포넌트, `classrooms.color`, shared `classroom/color.ts`), `CLAUDE.md` (Data model 의 `classrooms` 에 color 언급 1줄)
- Script(커밋 안 함): 스크래치패드의 Playwright 스크립트(1단계 `class-shots.mjs` 확장)

- [ ] **Step 1: Playwright.** 빌드 + `vite preview` + 모의 API(`/api/auth/refresh`, `/api/classrooms` — 학급 7개, 그중 1개 `color:null`, 1개 이름 40자, 1개 `color:'red'`; `/api/classrooms/:id`; PATCH 성공/실패 각각). 확인: 교사·학생 × 1280/800/375 가로 스크롤 없음, 상단 바 역할 표시, 선택 탭 종이색, 긴 이름 말줄임, null/'red' 학급이 자동 색, 1024 미만 덮개 메뉴 열고 닫기, 데스크톱 접기, 새 학급 창 초기 색 = least-used, 상세 색 바꾸기 성공(사이드바 색 갱신)·실패(복원 + 문구), 페이지 오류 0. 필기 뷰어 경로(`/student/study/...`)는 DashboardLayout 밖인지 App.jsx 로 확인.
- [ ] **Step 2: 문서 갱신 후 전체 확인** — `npx vitest run`, 변경 파일 eslint, `npx tsc --noEmit -p packages/server/tsconfig.json`, 클라이언트 빌드 모두 통과.
- [ ] **Step 3: 커밋** — `docs: 앱 틀 리디자인·학급 색 반영`
