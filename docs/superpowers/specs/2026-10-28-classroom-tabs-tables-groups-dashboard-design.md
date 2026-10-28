# 학급 상세 탭 재구성 — 게시판 표 · 모둠 드래그 보드 · 학생 표 · 대시보드 보기 선택 — 설계

작성일: 2026-10-28
상태: 확정 (가정 B1~B5 모두 확인)

## 배경 / 문제

학급 상세(`pages/Classrooms/ClassroomDetail.jsx`)의 네 탭이 모두 **카드 나열**이라 화면을 많이 쓰고 한눈에 비교가 안 된다.

- **[게시판]** 글마다 둥근 카드(제목 위, 날짜 아래 두 줄). 글이 쌓이면 스크롤이 길다.
- **[학생] 모둠 설정** 모둠 카드에 이름 칩만 있고, 실제 배정은 그 아래 학생마다 `<select>` 로 한다. 교사가 원하는 "칩을 잡아 방에 넣는" 조작이 아니다.
- **[학생] 학생 목록** 학생마다 카드. AI 풀이 횟수 초기화는 교사 코칭 화면에서 **페이지별**로만 가능하다.
- **[대시보드]** 요약 4칸 + 학생마다 카드에 챕터 셀을 가로로 나열. 영상 시청 기록이 없고, 단원 구분도 없고, 한 학생만 보는 화면도 없다.

## 목표

1. 게시판은 **한 줄 한 글의 표**. 첨부 수·펼쳐서 첨부 바로 보기·수정 버튼은 그대로.
2. 모둠 설정은 **미배정 트레이 + 모둠 방**. 모둠 수를 정하면 방이 그 수만큼 생기고, 칩을 **드래그**해서 배정한다. 방은 가로폭에 맞게 한 줄에 여러 개.
3. 학생 목록은 **접었다 펼 수 있는 표**. 열: 이름 · 아이디(이메일) · 참여일 · 코칭 기록 · **AI 풀이 초기화**(행 끝).
4. 대시보드는 **보기 드롭다운**(챕터별 · 영상별 · 학생별) + 오른쪽 **대상 드롭다운**(단원 목록 / 학생 명렬). 학생별은 한 학생의 영상 시청·챕터 필기·AI 풀이 기록을 정리해 보여 준다.

### 비목표

- 게시판 표의 열 정렬·검색(B4: 최신순 고정).
- 모둠을 여러 학급에 복사하거나 화이트보드 페이지별 모둠의 데이터 모델 변경.
- 새 학생 식별자(B5: "아이디" 열은 이메일).
- AI 풀이 **시도 기록 삭제**(B1: 횟수만 리셋, 기록 보존 — 기존 페이지별 리셋과 같은 의미).
- 대시보드 내보내기·인쇄, 날짜 범위 필터.

## 확정 가정

| | 가정 |
|---|---|
| B1 | "AI 풀이 초기화" = 그 학생의 **이 학급 모든 페이지** AI 풀이 횟수를 한 번에 리셋(`coaching_quota.reset_at = now`). 시도 기록은 보존. |
| B2 | 모둠 드래그 보드는 공용 패널(`GroupAssignmentPanel`)이므로 **화이트보드 설정 서랍**에도 그대로 적용된다. |
| B3 | 대시보드 첫 화면은 **챕터별 · 전체**. 챕터별·영상별의 오른쪽 목록은 단원 + "전체" + "단원 미지정". |
| B4 | 게시판 표는 최신순 고정, 정렬 없음. |
| B5 | 학생 표의 "아이디" 열은 이메일. |

## 디자인 방향

학급 상세는 이미 공책 언어를 갖고 있다(`components/classrooms/classrooms.css`: 모눈 배경, 잉크 `#1c2b4a`, 보조 `#56627c`,
연필 파랑 `#2453a6`, 학급 표지색 `--nb-cover`/`--nb-deep`, IBM Plex Sans KR). 이번 작업은 그 언어를 탭 안으로 끌어온다.

- **표 셋(게시판·학생·대시보드)은 조용하게 — 장부(ledger) 줄.** 세로선 없음, 행 사이 1px `--rule`, 행 높이 44px(터치 영역),
  헤더 13px `--soft`, 날짜·숫자는 `tabular-nums`. 둥근 카드·그림자 없음. 표 왼쪽에 학급 표지색(`--nb-cover`) 3px 띠 하나.
- **힘은 모둠 방 하나에.** 방은 책상 묶음처럼 표지색을 아주 옅게 깐 판(`color-mix(in srgb, var(--nb-cover) 18%, white)`),
  비어 있으면 점선. 칩을 들면 `DragOverlay` 로 살짝 떠오르고, 올려놓을 수 있는 방은 연필 파랑 2px 테두리. 미배정 트레이는 노란 기운 없이
  회색 점선 — 경고가 아니라 출발점이다. 미배정 인원은 트레이 제목에 숫자로만.
- **모션은 두 곳.** 드래그 응답과 표의 펼침/접힘. `prefers-reduced-motion` 이면 즉시 전환.
- **폰 폭.** 게시판 표는 제목 열이 줄고 날짜는 `10.28` 꼴. 학생 표는 이메일 열이 숨고 이름 아래 작은 글씨로. 대시보드 행렬은 첫 열(이름) 고정,
  가로 스크롤. 모둠 방 격자는 `repeat(auto-fill, minmax(180px, 1fr))` 라 폰에서는 한 줄 하나.
- **아이콘 버튼은 `IconButton`.** 수정 `Pencil`, 초기화 `RotateCcw`(variant danger), 코칭 기록 `History`, 저장 `Save`, 자동 배분 `Shuffle`,
  모둠 추가 `Plus`, 모둠 삭제 `Trash2`, 펼침 `ChevronDown`/`ChevronUp`.
- 글은 짧고 동사로. 비어 있을 때: "이 클래스에 게시된 글이 없습니다." / "아직 참여한 학생이 없습니다." / "이 단원에 챕터가 없습니다." / "이 학생의 기록이 아직 없습니다."

## ① 게시판 표 (`components/board/BoardTab.jsx`)

```
┌──────────────────────────────────────────┬──────┬────────────┬────┬──┐
│ 제목                                     │ 📎 2 │ 2026.10.21 │ ✎  │ ⌄ │
├──────────────────────────────────────────┴──────┴────────────┴────┴──┤
│   내용(링크 자동)                                                      │
│   📎 파일명.pdf              1.2MB                                   │
└────────────────────────────────────────────────────────────────────┘
```

- `<table>` 한 개. 열: 제목(남는 폭, `truncate`) · 첨부(개수, 없으면 빈칸) · 게시일 · 수정(교사만) · 펼침.
- 행 전체가 버튼 역할(`<tr>` 안 제목 셀의 `<button>` 이 `aria-expanded` 를 갖고, `tr` 클릭도 같은 토글). 수정 버튼은 `stopPropagation`.
- 펼치면 바로 아래에 `<tr>` + `<td colSpan>` 한 줄: 내용(`splitLinkSegments`) + 첨부 목록(지금 마크업 유지: 다운로드 링크·크기).
- 열린 글 id 는 컴포넌트 상태(`Set`), 여러 글 동시에 펼 수 있음(지금과 같음).
- 날짜 포맷: 데스크톱 `2026.10.21`, `sm` 미만 `10.21`(`<span>` 두 개 + Tailwind `hidden sm:inline`).
- 교사의 "새 게시글"은 헤더의 `+` 버튼 그대로.

## ② 모둠 드래그 보드 (`components/whiteboard/GroupAssignmentPanel.jsx`)

```
모둠 수 [ 4 ] ⟲자동배분  +모둠추가                              💾저장
┌ 미배정 3 ────────────────────────────────────────────────────┐
│ (김민준) (이서연) (박지호)                                      │
└──────────────────────────────────────────────────────────────┘
┌ 1모둠 · 4명 🗑 ┐ ┌ 2모둠 · 4명 🗑 ┐ ┌ 3모둠 · 3명 🗑 ┐ ┌ 4모둠 · 0명 🗑 ┐
│ (최하늘)(정우진)│ │ …            │ │ …            │ │   비어 있음   │
│ (강민서)(윤도현)│ │              │ │              │ │ (점선)        │
└───────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

- **dnd-kit**(`@dnd-kit/core` 6.3, 이미 설치됨): `DndContext` + `useDraggable`(칩) + `useDroppable`(방·트레이) + `DragOverlay`.
  센서: `PointerSensor`(activationConstraint distance 6 — 칩 안 글자 선택·스크롤과 구분) + `KeyboardSensor`(한국어 `announcements`/`screenReaderInstructions`).
- 칩: 학생 이름(아바타 없음 — 요청대로 이름만), `cursor-grab`, 들고 있을 때 원자리는 반투명.
- 드롭: `onDragEnd` 에서 `over.id` 가 방 key(`groupKey`) 또는 `'unassigned'` → `moveStudent(groups, sid, key|null)`.
- **모둠 수** 입력(1~30)은 즉시 방 개수를 맞춘다: `resizeGroups(groups, count)`(새 순수 함수, `lib/groupAssign.js`) — 늘리면 빈 방 `${n}모둠` 추가,
  줄이면 뒤에서부터 제거하고 그 방의 학생은 미배정으로. 변경은 `onChange` 로 올려 보내 **저장 전까지는 로컬**(지금과 같은 dirty 흐름).
- 자동 배분은 같은 숫자로 `onAuto(count)`(서버/로컬 — 호출 측 그대로). 모둠 추가/삭제/이름 바꾸기 유지.
- 학생별 `<select>` 목록은 **제거**(키보드 조작은 KeyboardSensor 가 맡는다).
- `readOnly` 면 드래그 비활성, 조작 줄 숨김(지금과 같음).
- 서버 변경 없음: `PUT /api/classrooms/:id/groups`, `POST …/groups/auto` 그대로.

## ③ 학생 표 + AI 풀이 초기화 (`components/classrooms/StudentsTab.jsx`)

```
▾ 학생 12명
┌ 이름      │ 아이디(이메일)          │ 참여일     │ 코칭 │ 초기화 ┐
│ 김민준    │ minjun@gmail.com        │ 2026.09.01 │  🕘  │   ⟲    │
```

- 제목 줄 `<button aria-expanded>` "학생 N명" + chevron. 접힘 상태는 `localStorage['students-table:collapsed']`(try/catch, 기본 펼침).
- 열: 이름(아바타 24px + 이름) · 아이디(이메일, `sm` 미만 숨기고 이름 아래 작은 글씨) · 참여일(`joinedAt`) · 코칭 기록(교사) · AI 풀이 초기화(교사).
- 초기화: `IconButton icon={RotateCcw} variant="danger"` → `window.confirm('${이름} 학생의 이 학급 AI 풀이 횟수를 모두 초기화할까요? 풀이 기록은 지워지지 않습니다.')`
  → `POST /api/coaching/classrooms/:cid/students/:sid/reset` → 행에 "초기화됨 · 방금" 1줄 표시(5초 뒤 사라짐), 실패 시 행 아래 빨간 한 줄.
- 학생 본인(학생 역할)이 보는 학생 탭은 이름·아이디 두 열만.
- 학생 사전 등록 카드(`StudentInvitesCard`)와 모둠 보드는 그 위에 그대로.

## ④ 대시보드 (`components/dashboard/`)

```
보기 [챕터별 ▾]   대상 [1단원 다항식 ▾]
```

- **보기**: `chapters | videos | students`. **대상**: 보기가 챕터별·영상별이면 단원 목록(`전체`, 단원들…, `단원 미지정`), 학생별이면 학생 명렬(이름순).
- 주소: `?tab=dashboard&view=…&unit=<id|all|none>&student=<id>`. `unit` 은 챕터·영상 탭과 **같은 키**를 공유한다(영상 탭에서 보던 단원이 그대로 선택됨).
  `unit` 이 없으면 `all`. 학생별에서 `student` 가 없으면 명렬 첫 학생.
- 셀 계산은 `lib/dashboardViews.js` 순수 함수(단위 테스트): `accuracy(correct, attempts)`, `watchPercent(maxPositionSec, durationSec)`,
  `groupByUnit(units, items)`, `studentSummary(student, chapters, videos)`, `itemsForUnit(items, unitParam)`.

### 챕터별 (`ChapterMatrix.jsx`)
- 행=학생(첫 열 고정, `sticky left-0`), 열=선택 단원의 챕터. 셀: `필기 3/8` 가는 막대(`--nb-deep`) + 정답률 칩(기존 색 규칙: ≥70 초록, ≥40 호박, <40 장미, 시도 없음 회색 `–`).
- 맨 아래 **반 전체** 행: 챕터별 평균 필기율·정답률.

### 영상별 (`VideoMatrix.jsx`)
- 행=학생, 열=선택 단원의 영상. 셀: 시청률 막대 + `%` + 완료면 체크. 기록 없으면 `–`.
- 맨 아래 **반 전체** 행: 영상별 시청 학생 수 / 완료 수.

### 학생별 (`StudentReport.jsx`)
```
[아바타] 김민준  minjun@gmail.com                     코칭 기록 보기 →
┌ 영상 완료 5/8 ┐ ┌ 필기 페이지 21/40 ┐ ┌ AI 풀이 14회 · 정답률 71% ┐
1단원 다항식
  ▶ 다항식의 연산 1        ████████░░ 82%  ✓
  📖 1-1 다항식의 덧셈      필기 4/6        정답률 75%
단원 미지정
  …
```
- 단원별로 묶어 영상 줄·챕터 줄을 나열. 영상이 없는 단원은 챕터만, 둘 다 없으면 단원을 생략. 기록이 하나도 없으면 "이 학생의 기록이 아직 없습니다."
- "코칭 기록 보기" 는 기존 `/teacher/classrooms/:cid/students/:sid/coaching-history` 로.

### 서버 (`services/dashboard.service.ts`, `routes/dashboard.ts`, shared `types/dashboard.ts`)
`GET /api/dashboard/classrooms/:id` 응답을 **확장**(기존 필드 유지):

```ts
interface ClassroomDashboard {
  units: { id: string; title: string; position: number }[];               // 추가 (숨김 단원 포함 — 교사 화면)
  chapters: { id; title; totalPages; unitId: string | null; position }[]; // unitId·position 추가
  videos: { id: string; title: string; unitId: string | null; durationSec: number | null; position: number }[]; // 추가 (id = classroom_videos.id)
  students: {
    studentId; name; email: string | null; avatarUrl: string | null;      // email·avatarUrl 추가
    overall: { attempts; correct };
    cells: Record<chapterId, { attempts; correct; notedPages }>;
    videoCells: Record<classroomVideoId, { maxPositionSec: number; completed: boolean }>; // 추가
  }[];
  summary: { … 기존 … };
}
```
- `videoCells` 는 `video_progress` 를 `classroom_videos` 와 조인해 학급 구성원 것만. 제목은 `videos.title`, 길이는 `videos.duration_sec`.
- 요청 한 번, 클라이언트에서 자른다(학급 ≤ 수십 명 · 수십 영상이라 충분히 작다).

## 서버 — 학생 단위 AI 풀이 초기화

`POST /api/coaching/classrooms/:classroomId/students/:studentId/reset` (`routes/coaching.ts`, `authenticate + requireRole('teacher')`)
- 담당 교사 아니면 403, 구성원 아니면 403(기존 페이지별 리셋과 같은 검사).
- `resetQuotaForClassroom(studentId, classroomId)`(`coaching.service.ts`): 이 학급 챕터의 모든 `pages.id` 에 대해 `coaching_quota` upsert
  (`reset_at = now(), updated_at = now()`; 충돌 키 `(student_id, page_id)`). 한 트랜잭션. 응답 `{ resetPages: number }`.

## 오류 처리

- 모둠 저장 실패: 지금처럼 빨간 한 줄 + dirty 유지. 자동 배분 실패: 다시 읽기.
- 드래그 중 네트워크는 쓰지 않는다(저장 버튼에서만).
- 대시보드 로드 실패: 빨간 한 줄 + "다시 시도" 버튼. 단원·학생 `?unit=`/`?student=` 가 목록에 없으면 `all`/첫 학생로 되돌리고 주소를 고친다(`replace`).
- 초기화 실패: 그 행 아래 빨간 한 줄, 버튼 다시 활성.

## 테스트

- 단위(vitest): `groupAssign.test.js` 에 `resizeGroups`(늘림·줄임·학생 미배정 이동·경계 1/30), `dashboardViews.test.js`(정답률·시청률 0/길이 없음·단원 묶기·`none`/`all`·학생 요약), `board` 날짜 포맷.
- 서버 스모크(로컬 PostgreSQL): 대시보드 응답에 `units/videos/videoCells` 가 오고 기존 필드가 그대로인지; 학생 리셋 → `coaching_quota` 행 수 = 학급 페이지 수, 다른 교사 403.
- Playwright: 네 탭 스크린샷(데스크톱·폰 폭), 모둠 칩 드래그로 방 이동 후 저장 → 새로고침 후 유지, 학생 표 접기/펼치기, 대시보드 세 보기 전환과 주소 반영.
- `npm run lint`, `npm run build`.

## 영향 범위

- 클라이언트: `BoardTab.jsx`, `GroupAssignmentPanel.jsx`(+`WhiteboardSettingsDrawer` 는 변경 없이 새 패널 사용), `StudentsTab.jsx`,
  `dashboard/ClassroomDashboard.jsx` → `DashboardControls.jsx`·`ChapterMatrix.jsx`·`VideoMatrix.jsx`·`StudentReport.jsx`,
  `lib/dashboardViews.js`, `lib/groupAssign.js`, `lib/coaching.js`(리셋 함수), `components/classrooms/classrooms.css`(표·방 스타일).
- 서버: `services/dashboard.service.ts`, `services/coaching.service.ts`, `routes/coaching.ts`.
- shared: `types/dashboard.ts`.
- 문서: `CLAUDE.md`(대시보드·리셋 한 줄), `.claude/PROJECT_MAP.md`(라우트·파일).
