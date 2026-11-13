# 학급 상세 탭 재구성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 게시판·학생 목록은 장부식 표로, 모둠 설정은 칩 드래그 보드로, 대시보드는 보기(챕터별·영상별·학생별)×대상(단원/학생) 드롭다운으로 바꾼다.

**Architecture:** 서버는 두 곳만 — `GET /api/dashboard/classrooms/:id` 응답 확장(단원·영상·시청 셀), 학생 단위 AI 풀이 리셋 라우트 추가.
클라이언트는 순수 계산(`lib/groupAssign.js`, `lib/dashboardViews.js`)을 먼저 테스트로 고정하고, 네 탭 컴포넌트를 그 위에 올린다.
표·방 스타일은 `components/classrooms/classroomTabs.css` 한 파일(공책 토큰 재사용).

**Tech Stack:** React 19 · @dnd-kit/core 6.3.1(설치됨) · Tailwind 4 · lucide-react · Vitest · Fastify 5 · Drizzle 0.45

**Spec:** `docs/superpowers/specs/2026-10-28-classroom-tabs-tables-groups-dashboard-design.md`

## Global Constraints

- 아이콘 버튼은 `components/common/IconButton.jsx`(label 필수). 아이콘: 수정 `Pencil`, 초기화 `RotateCcw`(danger), 코칭 기록 `History`, 저장 `Save`, 자동 배분 `Shuffle`, 모둠 추가 `Plus`, 모둠 삭제 `Trash2`, 펼침 `ChevronDown`/`ChevronUp`.
- 컴포넌트 파일은 컴포넌트만 export(ESLint `react-refresh/only-export-components`) — 순수 함수는 `lib/` 로.
- 색 토큰은 `classrooms.css` 의 것(`--ink #1c2b4a`, `--soft #56627c`, `--pen #2453a6`, `--rule #e3eaf4`, `--nb-cover/--nb-deep`). 표: 세로선 없음, 행 44px, 헤더 13px, 숫자·날짜 `tabular-nums`. 방 배경 `color-mix(in srgb, var(--nb-cover) 18%, white)`.
- 주소 키: `view`(`chapters|videos|students`), `unit`(단원 id | `none` | 없음=전체 — 챕터·영상 탭과 공유), `student`(id).
- 정답률 색: ≥70 초록, ≥40 호박, <40 장미, 시도 없음 회색 `–`(기존 `accColor`).
- 서버 변경 전 `npx tsc -p packages/shared`; 서버 타입체크 `npx tsc --noEmit -p packages/server`.
- 커밋: `feat(classroom): …` 한국어 요약 + 세션 attribution 두 줄. 모델 이름 금지.

## Review Focus

1. 모둠 수를 학생이 있는 방 수보다 작게 줄임 → 잘린 방의 학생은 미배정 트레이에 나타나고 저장하면 서버에도 미배정. (Task 1 `resizeGroups` 테스트)
2. 길이(`durationSec`)가 null 인 영상 → 시청률 `null`로 `–` 표시, 완료 체크만. (Task 2 `watchPercent` 테스트)
3. `?unit=` 이 삭제된 단원 id → 전체로 되돌리고 주소 `replace`. `?student=` 가 탈퇴 학생 → 첫 학생. (Task 8 `resolveDashboardSelection` 테스트)
4. 학생 리셋을 다른 학급 교사가 호출 → 403, 구성원 아닌 학생 → 403, 페이지가 0개인 학급 → `{ resetPages: 0 }`. (Task 4 스모크)
5. 게시판 행의 수정 버튼 클릭이 행 펼침을 토글하지 않음(`stopPropagation`). (Task 5 수동 확인 + Playwright)

---

### Task 1: `resizeGroups` 순수 함수

**Files:**
- Modify: `packages/client/src/lib/groupAssign.js`
- Test: `packages/client/src/lib/groupAssign.test.js`

**Interfaces:**
- Produces: `resizeGroups(groups, count) → groups` — `count` 는 1~30 으로 clamp. 늘리면 `{ name: \`${i+1}모둠\`, position: i, studentIds: [] }` 를 뒤에 추가. 줄이면 뒤에서부터 잘라내고(잘린 방의 학생은 어느 모둠에도 없게 됨 = 미배정) 남은 방 `position` 을 0..n-1 로 재부여. 같은 수면 같은 참조 반환.

- [ ] **Step 1: 실패하는 테스트**

```js
describe('resizeGroups', () => {
  const g = (n, ids = []) => ({ name: `${n}모둠`, position: n - 1, studentIds: ids });
  it('늘리면 빈 모둠을 뒤에 추가한다', () => {
    const r = resizeGroups([g(1, ['a'])], 3);
    expect(r.map((x) => x.name)).toEqual(['1모둠', '2모둠', '3모둠']);
    expect(r[2]).toEqual({ name: '3모둠', position: 2, studentIds: [] });
  });
  it('줄이면 뒤 모둠을 잘라내고 그 학생은 미배정이 된다', () => {
    const r = resizeGroups([g(1, ['a']), g(2, ['b']), g(3, ['c'])], 1);
    expect(r).toHaveLength(1);
    expect(unassignedStudents([{ studentId: 'a' }, { studentId: 'b' }, { studentId: 'c' }], r).map((m) => m.studentId)).toEqual(['b', 'c']);
  });
  it('1~30 으로 제한하고 같은 수면 같은 배열을 돌려준다', () => {
    const base = [g(1), g(2)];
    expect(resizeGroups(base, 0)).toHaveLength(1);
    expect(resizeGroups(base, 99)).toHaveLength(30);
    expect(resizeGroups(base, 2)).toBe(base);
  });
  it('id 가 있는 모둠은 id 를 유지한다', () => {
    const r = resizeGroups([{ id: 'x', name: 'A', position: 0, studentIds: [] }], 2);
    expect(r[0].id).toBe('x');
  });
});
```

- [ ] **Step 2: 실패 확인** — `npm test -w @mathchois/client -- groupAssign` → `resizeGroups is not a function`
- [ ] **Step 3: 구현** `export function resizeGroups(groups, count)` in `lib/groupAssign.js`
- [ ] **Step 4: 통과 확인**
- [ ] **Step 5: 커밋** `feat(classroom): 모둠 수로 방 개수를 맞추는 resizeGroups`

---

### Task 2: `lib/dashboardViews.js` 순수 계산

**Files:**
- Create: `packages/client/src/lib/dashboardViews.js`
- Test: `packages/client/src/lib/dashboardViews.test.js`

**Interfaces:**
- Produces:
  - `accuracy(correct, attempts) → number|null` (attempts 0 → null, 반올림 %)
  - `watchPercent(maxPositionSec, durationSec) → number|null` (duration null/0 → null, 100 상한)
  - `itemsForUnit(items, unitParam) → items` — `unitParam` null/undefined → 전체, `'none'` → `unitId == null`, 그 외 `unitId === unitParam`
  - `groupByUnit(units, chapters, videos) → [{ unit: {id,title}|null, chapters, videos }]` — 단원 position 순, 마지막에 미지정(null) 그룹; 챕터·영상 모두 비면 그룹 생략
  - `studentSummary(student, chapters, videos) → { videosCompleted, videosTotal, notedPages, totalPages, attempts, correct }`
  - `classRowForChapter(students, chapter) → { notedRate: number|null, accuracy: number|null }` (필기율 = Σnoted / (학생수×totalPages))
  - `classRowForVideo(students, video) → { watched, completed }`
  - `resolveDashboardSelection({ view, unit, student }, { units, students }) → { view, unit, student, changed }` — view 가 셋 중 아니면 `chapters`; unit 이 `none` 이거나 단원 id 면 유지, 아니면 null; view=students 에서 student 가 없거나 명렬에 없으면 첫 학생 id(학생 0명 → null); `changed` 는 입력과 달라졌는지.

- [ ] **Step 1: 실패하는 테스트** — 위 함수마다 1~3개:
  - `accuracy(0,0)` null, `accuracy(2,3)` 67
  - `watchPercent(50, null)` null, `watchPercent(120, 100)` 100, `watchPercent(45, 90)` 50
  - `itemsForUnit` 세 분기
  - `groupByUnit`: 단원 2개 + 미지정 영상 1 → 길이 3, 빈 단원 생략, 순서 position
  - `studentSummary`: completed 2/3, noted 5/12, attempts/correct 합
  - `resolveDashboardSelection`: 잘못된 view → chapters, 삭제된 unit → null+changed, students 뷰 student 누락 → 첫 학생, 학생 0명 → null
- [ ] **Step 2: 실패 확인** `npm test -w @mathchois/client -- dashboardViews`
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인**
- [ ] **Step 5: 커밋** `feat(classroom): 대시보드 보기 계산 함수`

---

### Task 3: 대시보드 응답 확장 (서버 + shared)

**Files:**
- Modify: `packages/shared/src/types/dashboard.ts`
- Modify: `packages/server/src/services/dashboard.service.ts`

**Interfaces:**
- Produces(`ClassroomDashboard`, 기존 필드 유지):
  ```ts
  units: { id: string; title: string; position: number }[];
  chapters: { id: string; title: string; totalPages: number; unitId: string | null; position: number }[];
  videos: { id: string; title: string; unitId: string | null; durationSec: number | null; position: number }[]; // id = classroom_videos.id
  students[].email: string | null; students[].avatarUrl: string | null;
  students[].videoCells: Record<string, { maxPositionSec: number; completed: boolean }>;
  ```

- [ ] **Step 1: 타입 확장** (`DashboardUnit`, `DashboardVideo`, `DashboardVideoCell` 추가)
- [ ] **Step 2: 서비스 구현** — `units` 는 `units` 테이블(숨김 포함) position 순; `videos` 는 `classroomVideos ⨝ videos` (title, durationSec) position 순; `videoCells` 는 `videoProgress ⨝ classroomVideos where classroomId` 로 학생별 맵; `email/avatarUrl` 은 `getClassroomMembers` 의 `student` 에서.
- [ ] **Step 3: 타입체크** `npx tsc -p packages/shared && npx tsc --noEmit -p packages/server` → 오류 0
- [ ] **Step 4: 커밋** `feat(dashboard): 응답에 단원·영상·시청 기록·학생 이메일 추가`

---

### Task 4: 학생 단위 AI 풀이 리셋

**Files:**
- Modify: `packages/server/src/services/coaching.service.ts`
- Modify: `packages/server/src/routes/coaching.ts`
- Modify: `packages/client/src/lib/coaching.js`

**Interfaces:**
- Produces: `resetQuotaForClassroom(studentId: string, classroomId: string): Promise<{ resetPages: number }>` — 학급 챕터의 모든 `pages.id` 를 `coaching_quota` 에 upsert(`reset_at=now(), updated_at=now()`, 충돌 키 `(student_id, page_id)`), 한 트랜잭션. 페이지 0개 → `{ resetPages: 0 }` (insert 생략).
- Produces: `POST /api/coaching/classrooms/:classroomId/students/:studentId/reset` → 200 `{ resetPages }`; 담당 교사 아니면 403, 구성원 아니면 403.
- Produces(client): `resetStudentClassroomQuota(classroomId, studentId)`.

- [ ] **Step 1: 서비스 + 라우트 구현** (기존 페이지별 리셋 바로 아래, 같은 403 메시지 재사용)
- [ ] **Step 2: 클라이언트 함수 추가**
- [ ] **Step 3: 타입체크** 통과
- [ ] **Step 4: 커밋** `feat(coaching): 학생의 학급 전체 AI 풀이 횟수 리셋 라우트`

---

### Task 5: 게시판 표

**Files:**
- Create: `packages/client/src/components/classrooms/classroomTabs.css` (장부 표 `.ledger`, 방 `.desk*`, 칩 `.chip*` — 이후 Task 6·7·8 이 같은 파일에 추가)
- Modify: `packages/client/src/components/board/BoardTab.jsx`
- Modify: `packages/client/src/pages/Classrooms/ClassroomDetail.jsx` (`import '../../components/classrooms/classroomTabs.css'`)
- Create: `packages/client/src/lib/formatDate.js` + `formatDate.test.js` (`formatYmd(iso) → '2026.10.21'`, `formatMd(iso) → '10.21'`, 빈 값 → `''`)

- [ ] **Step 1: 날짜 포맷 테스트 → 구현**
- [ ] **Step 2: `BoardTab` 을 `<table class="ledger">` 로** — `<thead>`: 제목 · 첨부 · 게시일 · (교사) 수정 · 펼침(sr-only 헤더). 행: `<tr onClick=toggle>`; 제목 셀 안 `<button aria-expanded aria-controls>`; 첨부 셀 `Paperclip + n`(0이면 빈칸); 게시일 `<span class="hidden sm:inline">{ymd}</span><span class="sm:hidden">{md}</span>`; 수정 `IconButton Pencil size="sm"` + `stopPropagation`; 펼침 chevron. 펼친 글은 바로 아래 `<tr id=…><td colSpan>` 에 기존 내용·첨부 마크업. 열린 id 는 `Set`.
- [ ] **Step 3: CSS** `.ledger`(폭 100%, `border-collapse`, 왼쪽 3px `--nb-cover` 띠는 감싸는 `.ledger-wrap`), `th`(13px `--soft`, 좌측 정렬, 400), `td`(높이 44px, `border-top: 1px solid var(--rule)`), `.ledger .num`(`tabular-nums`), 펼침 행 `.ledger-detail`(배경 `--paper`), `@media (prefers-reduced-motion: no-preference)` 에서 chevron 회전 .15s.
- [ ] **Step 4: lint·수동 확인** (`npm run lint`, 브라우저에서 펼침/수정 클릭)
- [ ] **Step 5: 커밋** `feat(classroom): 게시판을 한 줄 한 글의 표로`

---

### Task 6: 모둠 드래그 보드

**Files:**
- Modify: `packages/client/src/components/whiteboard/GroupAssignmentPanel.jsx` (전면 교체)
- Create: `packages/client/src/components/whiteboard/GroupDesk.jsx` (방 하나: `useDroppable`), `packages/client/src/components/whiteboard/StudentChip.jsx` (`useDraggable`)
- Modify: `classroomTabs.css` (`.desk-grid`, `.desk`, `.desk--empty`, `.desk--over`, `.tray`, `.chip`, `.chip--ghost`)

**Interfaces:**
- Consumes: `resizeGroups`, `moveStudent`, `groupKey`, `unassignedStudents`(Task 1·기존)
- props 불변: `{ members, groups, onChange, onAuto, readOnly, warnOnRemove }`(호출 측 `ClassroomGroupSettings`, `WhiteboardSettingsDrawer` 변경 없음)
- 드롭 id: 방 = `groupKey(g)`, 트레이 = `'unassigned'`; 드래그 id = `studentId`.

- [ ] **Step 1: dnd-kit 최신 문서 확인** (Context7 `@dnd-kit/core` — `DndContext`, `useDraggable`, `useDroppable`, `DragOverlay`, `PointerSensor activationConstraint`, `KeyboardSensor`, `accessibility.announcements/screenReaderInstructions`)
- [ ] **Step 2: 구현** — 조작 줄: 모둠 수 `<input type=number min=1 max=30>` `onChange → onChange(resizeGroups(groups, n))`; `Shuffle`(기존 confirm) `onAuto(n)`; `Plus`; 트레이 `GroupDesk id='unassigned' title="미배정 N"`; `.desk-grid` 에 방들(이름 input, `N명`, `Trash2`); `DragOverlay` 에 칩 복제. 센서 `useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor))`. `onDragEnd({active, over})` → `over` 없으면 무시, `'unassigned'` → `moveStudent(groups, active.id, null)`, 그 외 → `moveStudent(groups, active.id, over.id)`. 한국어 `announcements`. 학생별 `<select>` 목록 삭제. `readOnly` 면 `disabled` 센서 없이 칩 `useDraggable({ disabled: true })`.
- [ ] **Step 3: lint + vitest(기존 groupAssign) 통과, 브라우저에서 드래그·키보드(Space→화살표→Space) 확인, 화이트보드 설정 서랍에서도 열어 확인**
- [ ] **Step 4: 커밋** `feat(classroom): 모둠 설정을 칩 드래그 보드로`

---

### Task 7: 학생 표 + AI 풀이 초기화

**Files:**
- Modify: `packages/client/src/components/classrooms/StudentsTab.jsx`
- Create: `packages/client/src/components/classrooms/StudentsTable.jsx`
- Modify: `classroomTabs.css` (`.fold-head`)

**Interfaces:**
- Consumes: `resetStudentClassroomQuota`(Task 4), `formatYmd`(Task 5)
- `StudentsTable({ classroomId, members, isTeacher })`

- [ ] **Step 1: 구현** — 제목 줄 `<button aria-expanded>` "학생 N명" + chevron; 접힘은 `localStorage['students-table:collapsed']` try/catch. 표 열: 이름(아바타 24px) · 아이디(이메일; `sm` 미만 `hidden`, 이름 아래 `sm:hidden` 작은 글씨) · 참여일(`formatYmd(joinedAt)`) · (교사) 코칭 기록 `History` · (교사) 초기화 `RotateCcw variant=danger`. 초기화: `confirm(\`${name} 학생의 이 학급 AI 풀이 횟수를 모두 초기화할까요? 풀이 기록은 지워지지 않습니다.\`)` → 호출 → 행 아래 `초기화됨 · 페이지 N개` 5초, 실패 시 빨간 한 줄. 학생 역할은 이름·아이디만.
- [ ] **Step 2: `StudentsTab` 에서 카드 목록을 `StudentsTable` 로 교체**
- [ ] **Step 3: lint, 브라우저 확인(접기 → 새로고침 유지)**
- [ ] **Step 4: 커밋** `feat(classroom): 학생 목록을 접히는 표로, 행 끝에 AI 풀이 초기화`

---

### Task 8: 대시보드 보기 선택

**Files:**
- Modify: `packages/client/src/components/dashboard/ClassroomDashboard.jsx` (데이터 로드 + 선택 해석 + 분기만)
- Create: `components/dashboard/DashboardControls.jsx`, `ChapterMatrix.jsx`, `VideoMatrix.jsx`, `StudentReport.jsx`, `AccuracyChip.jsx`, `Meter.jsx`
- Modify: `packages/client/src/pages/Classrooms/ClassroomDetail.jsx` — `ClassroomDashboard` 에 `searchParams/setSearchParams` 대신 `selection={{ view, unit: unitParam, student }}` 와 `onSelectionChange({ view?, unit?, student? }, { replace })` 전달
- Modify: `classroomTabs.css` (`.matrix`(첫 열 sticky), `.meter`, `.report`, `.tiles`)

**Interfaces:**
- Consumes: Task 2 함수들, Task 3 응답
- `DashboardControls({ view, unitParam, studentId, units, students, onChange })` — `<select aria-label="보기">` + `<select aria-label="대상">`
- `ChapterMatrix({ students, chapters })`, `VideoMatrix({ students, videos })`, `StudentReport({ student, groups, classroomId })`
- `AccuracyChip({ correct, attempts })`, `Meter({ value, label })`(0~100, null → `–`)

- [ ] **Step 1: 구현** — `ClassroomDashboard`: 로드 후 `resolveDashboardSelection` → `changed` 면 `onSelectionChange(resolved, { replace: true })`. 보기별 렌더: `chapters` → `ChapterMatrix(itemsForUnit(chapters, unit))` + 반 전체 행; `videos` → `VideoMatrix(itemsForUnit(videos, unit))`; `students` → `StudentReport(student, groupByUnit(units, chapters, videos))`. 빈 상태 문구 spec 그대로. 실패 시 빨간 한 줄 + "다시 시도".
- [ ] **Step 2: `ClassroomDetail` 연결** — `view`/`student` 쿼리 읽기·쓰기(`unit` 은 기존 `setUnitParam` 과 같은 키), 대시보드에서 바꾼 값은 `replace: true`.
- [ ] **Step 3: lint, 브라우저에서 세 보기·주소 반영·영상 탭 단원 승계 확인**
- [ ] **Step 4: 커밋** `feat(classroom): 대시보드를 챕터별·영상별·학생별 보기로`

---

### Task 9: 문서 · 검증 · PR · 병합

**Files:**
- Modify: `CLAUDE.md`(대시보드·리셋 한 줄), `.claude/PROJECT_MAP.md`(라우트·파일)

- [ ] **Step 1: 문서 갱신**
- [ ] **Step 2: `npm run build`, `npm run lint`, `npm test -w @mathchois/client` 모두 통과**
- [ ] **Step 3: 로컬 PostgreSQL 스모크** — 대시보드 응답 필드, 학생 리셋(200·403·403·페이지 0개)
- [ ] **Step 4: Playwright** — 네 탭 데스크톱/폰 스크린샷, 칩 드래그→저장→새로고침 유지, 학생 표 접기, 대시보드 세 보기 전환과 주소
- [ ] **Step 5: 커밋·push, PR 생성(main), 병합**
