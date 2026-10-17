# 영상 2분할 필기 (Video Split-Note) — 설계

작성일: 2026-10-17
상태: 질의응답으로 확정(Q1 챕터 1개 연결 · Q2 학생만 사용 · Q3 영상 패널은 플레이어 + 접힘 댓글 서랍 · Q4 좁은 화면은 위/아래 분할 자동 전환) → 구현 완료 (2026-10-17, 계획 `docs/superpowers/plans/2026-10-17-video-split-note.md`; 태블릿 실기기 검증은 배포 후)

## 배경 / 문제

학생은 영상을 들으면서 동시에 필기하는 경우가 많다. 지금은 학급 영상 시청 화면(`ClassroomVideoWatch`)과
챕터 필기 뷰어(`StudyViewer`)가 완전히 분리된 화면이어서, 영상을 보다가 필기하려면 다른 탭/창을 열어
직접 나란히 배치해야 한다. 태블릿(S-Pen)에서는 그마저도 어렵다.

## 목표

1. 교사가 학급 [영상] 탭에서 배정된 영상에 **해당 학급의 챕터 1개**를 연결할 수 있다("필기 챕터").
2. 챕터가 연결된 영상의 학생 시청 화면에 **[2분할로 필기하며 보기]** 버튼이 생긴다.
3. 2분할 화면: 한쪽은 영상(기본 좌측), 다른 쪽은 연결된 챕터의 **학생 필기 뷰어(①)**. 교사 코멘트(③)·교사 필기 모달 등 StudyViewer 기능은 그대로 동작한다.
4. 가운데 **분할선을 드래그**해 비율을 바꾸고, **좌/우 바꾸기** 버튼으로 왼손잡이 배치를 지원한다. 비율·배치는 기기에 저장되어 다음에도 유지된다.
5. 영상의 **전체화면** 버튼은 2분할 화면 전체를 전체화면으로 올린다 → 영상은 자기 반쪽을 꽉 채우고 나머지 반쪽은 필기창으로 남는다.
6. 영상 쪽 패널은 플레이어 위주로 두고, 댓글은 아래 **접힘 서랍**으로 둔다(시각 첨부·이동은 그대로).
7. 세로(포트레이트) 화면에서는 자동으로 **위(영상)/아래(필기)** 분할로 전환된다.
8. 2분할 안에서 챕터 페이지를 넘겨도 **영상 재생이 끊기지 않는다**.

### 비목표 (Out of scope, v1)

- 교사용 2분할(교사 필기 ② 뷰어를 옆에 두는 것). TeacherStudyViewer 도 같은 임베드 리팩터링이 필요해 후속으로 뺀다. (Q2)
- 영상 1개에 챕터 여러 개 연결, 시작 페이지 지정. (Q1)
- 과제 페이지(④) 연결. 챕터만 대상으로 한다.
- 영상 시각 ↔ 필기 페이지 자동 동기화(예: 3분 지점에 2페이지로 이동). 학생이 직접 넘긴다.
- AI 코칭 페이지(`pages.aiProblemId`)를 분할 화면 안에서 풀기. 해당 페이지는 안내 문구 + "전체 화면으로 열기" 링크만 보여 준다.

## 사전 조사 결과 (실현 가능성)

| 확인 항목 | 결과 |
|---|---|
| Excalidraw 가 반쪽 폭에서 동작하는가 | 가능. 배경 맞춤은 `waitForLayout`/`calculateBgPosition` 이 **컨테이너** 크기를 쓰고, Excalidraw 자체도 컨테이너 ResizeObserver 로 캔버스를 다시 잡는다. |
| 펜 훅이 옆 패널 입력을 가로채지 않는가 | 가능. `useExcalidrawTouch`/`useWetInk`/`useScribbleErase` 는 window 캡처 리스너지만 `e.target.closest('.excalidraw')` 로 캔버스 위 입력만 처리한다. 영상 패널은 `.excalidraw` 바깥이므로 영향 없음. |
| StudyViewer 를 다른 화면 안에 넣을 수 있는가 | **리팩터링 1건 필요.** 현재 `useParams()`(chapterId/pageId) 와 `navigate('/student/study/...')` 에 묶여 있어 페이지 이동이 라우트 변경 = 영상 언마운트가 된다. props 로 챕터/페이지/이동 콜백을 주입하는 "임베드 모드"를 추가한다(기존 라우트 동작은 그대로). |
| 반쪽 전체화면 | 가능. `VideoPlayer.toggleFullscreen` 이 자기 컨테이너를 `requestFullscreen` 하는데, 대상 요소를 prop 으로 바꿀 수 있게 하면 분할 루트를 전체화면으로 올릴 수 있다. iPhone Safari 는 임의 요소 전체화면 미지원 → CSS 전체화면(`fixed inset-0`) 폴백. iPad·갤럭시탭 Chrome 은 정상. |
| 단축키 충돌 | 플레이어 `Space/←→/0~9` 와 Excalidraw 조작(요소 이동·도구 전환)이 겹친다. 분할 모드에서는 **마지막으로 포인터가 닿은 패널**에만 단축키를 준다. |
| 분할선 드래그 | 가능. CSS grid `gridTemplateColumns`(또는 rows) 를 비율 상태로 렌더, 드래그 중에는 투명 오버레이로 `<video>`/캔버스가 pointermove 를 먹지 않게 한다. |

## 핵심 설계 결정

| 결정 | 선택 | 비고 |
|---|---|---|
| 연결 저장 위치 | `classroom_videos.chapter_id` (nullable FK → `chapters`, `ON DELETE SET NULL`) | 영상은 라이브러리(교사 공유)지만 챕터는 학급 소속이므로 **학급 배정 행**에 붙인다. 같은 학급의 챕터만 허용(서버 검증 400). (Q1) |
| 사용 대상 | 학생만 | 교사 시청 화면은 "연결된 챕터" 칩만 표시. (Q2) |
| 분할 화면 라우트 | `/student/classrooms/:classroomId/videos/:cvId/split?page=<pageId>` — **DashboardLayout 바깥** | 필기 뷰어들과 같이 네비바/사이드바 없는 전체화면 레이아웃. 현재 페이지는 쿼리스트링으로 들고 다녀 새로고침·뒤로가기에 안전. |
| StudyViewer 임베드 | 선택적 props `{ chapterId, pageId, onNavigatePage, onExit, embedded }` | 없으면 기존처럼 `useParams/navigate` 사용. 임베드 시 사이드바 `<Link>`·이전/다음·`PageNavOverlay` 는 `onNavigatePage(pageId)` 호출, 뒤로가기 버튼은 `onExit`. 1,194줄 파일이라 **동작 변경 없는 치환**으로만 진행. |
| 영상 패널 구성 | 플레이어 + 제목 1줄 + 접힘 `댓글` 서랍 (기본 접힘) | 시청현황·설명·다른 영상 목록은 분할 화면에서 제외(일반 상세로). (Q3) |
| 비율/배치 저장 | `localStorage['mc_video_split']` = `{ ratio: 0.5, videoSide: 'start' \| 'end' }` | 플레이어 설정(`mc_video_player`)과 같은 기기별 방식. 비율은 0.2~0.8 로 클램프. `start` = 좌측(가로)/위(세로). |
| 마지막 페이지 기억 | `localStorage['mc_video_split_page:<cvId>']` = pageId, URL `?page=` 가 있으면 우선 | 서버 저장 안 함(기기별). |
| 방향 전환 | `matchMedia('(orientation: portrait)')` → 세로 분할(위/아래), 그 외 가로 분할(좌/우) | 비율·`videoSide` 값은 공유(`start` 가 위/좌). (Q4) |
| 전체화면 대상 | `VideoPlayer` 에 `fullscreenTargetRef` prop 추가 → 분할 루트 요소 | 전체화면 중 상단 바는 숨기고 분할선·바꾸기 버튼만 유지. `requestFullscreen` 이 없으면 `fixed inset-0` 폴백(`fullscreenchange` 대신 내부 state). |
| 단축키 | `VideoPlayer hotkeys={activePane === 'video'}` | `activePane` 은 각 패널의 `pointerdown`(capture) 으로 갱신. Excalidraw 쪽은 변경 없음(자체 포커스 기준). |
| 시청 기록 | 기존 `onProgress → PUT /classroom-videos/:id/progress` 그대로 | 분할 화면에서 본 것도 진도에 포함. |
| 챕터 삭제 시 | FK `SET NULL` → 버튼이 사라짐 | 삭제된 챕터 id 를 들고 있는 분할 URL 로 진입하면 상세 화면으로 돌려보낸다. |

## 데이터 모델 (Drizzle `schema.ts` + `startupMigrate.ts` 멱등 DDL)

### `classroom_videos` 변경
```
chapter_id uuid NULL REFERENCES chapters(id) ON DELETE SET NULL
CREATE INDEX IF NOT EXISTS idx_classroom_videos_chapter ON classroom_videos (chapter_id)
```
- `startupMigrate.ts`: `ALTER TABLE classroom_videos ADD COLUMN IF NOT EXISTS chapter_id uuid REFERENCES chapters(id) ON DELETE SET NULL` + 인덱스.
- 다른 테이블 변경 없음.

## 서버 API

### `routes/classroomVideos.ts`
- `PATCH /api/classroom-videos/:id` (교사) — body 확장: `{ note?: string|null, chapterId?: string(uuid)|null }`
  - `chapterId` 가 주어지면 `chapters.id = chapterId AND chapters.classroom_id = cv.classroom_id` 확인, 아니면 400 `"이 학급의 챕터가 아닙니다."`
  - 두 필드 모두 optional. 주어진 필드만 갱신(현재 구현은 `note` 를 항상 덮어쓰므로 "주어진 키만 set" 으로 수정).
- `GET /api/classrooms/:cid/videos`, `GET /api/classroom-videos/:id` — 응답에 `chapterId` 와 `chapter: { id, title } | null` 포함.

### `services/classroomVideo.service.ts`
- `classroomVideoSelect` 에 `chapterId`, `chapter` 추가. `chapters` 를 **left join** (연결 없거나 삭제된 경우 null).
- `updateClassroomVideo(id, patch: { note?, chapterId? })` — 전달된 키만 set.
- `assertChapterInClassroom(chapterId, classroomId)` 헬퍼(400).

### 공유 타입 — `shared/src/types/video.ts`
```ts
export interface ClassroomVideo {
  // ...기존
  chapterId: string | null;
  /** 연결된 필기 챕터 (left join) */
  chapter: { id: string; title: string } | null;
}
```

## 클라이언트

### 1) 라우트 — `App.jsx`
- 학생, `ProtectedRoute(student)` 안·**DashboardLayout 밖**:
  `/student/classrooms/:classroomId/videos/:cvId/split` → `pages/Videos/ClassroomVideoSplit.jsx`

### 2) 교사: 필기 챕터 연결 — `components/videos/ClassroomVideoTab.jsx`
- 탭 마운트 시 `GET /api/classrooms/:cid/chapters` 1회 로드(교사만).
- `VideoCard` 하단에 **필기 챕터** `<select>`(없음 / 챕터 목록, position 순). 변경 즉시 `updateClassroomVideo(cv.id, { chapterId })` → 카드 상태 갱신.
- 연결된 챕터는 카드에 칩(`BookOpen` 아이콘 + 챕터명)으로 표시 — 학생 카드에도 동일 칩("필기 챕터: …").

### 3) 학생 시청 화면 — `pages/Videos/ClassroomVideoWatch.jsx`
- `detail.chapter` 가 있고 학생이면 플레이어 아래 제목 줄 옆에 **[2분할로 필기하며 보기]**(`Columns2`) 버튼 → `/split` 로 이동.
  저장된 마지막 페이지가 있으면 `?page=` 로 붙여 이동.
- 교사 화면: 버튼 대신 "연결된 챕터: {title}" 칩만.

### 4) 분할 화면 — `pages/Videos/ClassroomVideoSplit.jsx` (신규)
```
┌ 상단 바 (h-12) ─────────────────────────────────────────────────┐
│ ← 영상으로 돌아가기 │ 제목 │          [⇄ 좌우 바꾸기] [⤢ 전체화면] │
├──────────────────────┬─╂─┬───────────────────────────────────────┤
│ 영상 패널            │ ┃ │ StudyViewer (embedded)                 │
│  VideoPlayer         │ ┃ │  - 자체 내비바(페이지 n/m, 필기모드…)    │
│  제목 1줄            │ ┃ │  - 사이드바(페이지 목록)                 │
│  ▸ 댓글 (접힘 서랍)  │ ┃ │  - Excalidraw                           │
└──────────────────────┴─╂─┴───────────────────────────────────────┘
```
- 데이터: `getClassroomVideo(cvId)` + `getVideoProgress(cvId)`(실패 시 null) + `getCachedChapterAndPages(detail.chapterId)`.
  `detail.chapter` 가 null 이면 `/student/classrooms/:classroomId/videos/:cvId` 로 replace.
- 현재 페이지: `?page=` → 없으면 `localStorage['mc_video_split_page:<cvId>']` → 없으면 첫 페이지. 바뀔 때마다 둘 다 갱신(`setSearchParams(..., { replace: true })`).
- `SplitPane`(아래) 안에 `videoSide` 에 따라 [영상 패널, StudyViewer] 순서를 바꿔 렌더. 좌우 바꾸기는 **순서만** 바꾸고 비율은 그대로(비율은 "영상 쪽" 기준으로 저장).
- 영상 패널: `VideoPlayer`(`ref`, `storageKey="cv:<id>"`, `initialPosition`, `onProgress`, `hotkeys={activePane==='video'}`, `fullscreenTargetRef={rootRef}`) + 제목 + `CollapsibleSection("댓글")` 안에 `VideoComments`(기존 `getCurrentTime`/`onSeek` 연결).
  전체화면 중에는 제목·댓글 서랍을 숨기고 플레이어만 패널을 채운다(`object-fit: contain`).
- 필기 패널: `<StudyViewer embedded chapterId pageId onNavigatePage={setPage} onExit={goBackToWatch} />`.
  `page.aiProblemId` 인 경우 StudyViewer 대신 안내 패널("AI 코칭 페이지는 전체 화면에서 풀 수 있어요" + `/student/study/:chapterId/page/:pageId` 링크).
- `activePane`: 루트에 `onPointerDownCapture` 로 어느 패널 안인지 판정해 저장.
- 페이지 이탈(언마운트) 시 StudyViewer 의 기존 pending 저장 flush 로직이 그대로 동작한다(라우트 뷰어와 동일 코드).

### 5) 분할 컨테이너 — `components/common/SplitPane.jsx` (신규)
- props: `orientation: 'horizontal' | 'vertical'`, `ratio`(첫 패널 비율), `onRatioChange`, `min=0.2`, `max=0.8`, `children: [first, second]`.
- 렌더: `display:grid; grid-template-columns: ${ratio}fr 12px ${1-ratio}fr`(세로는 rows). 두 패널 모두 `min-w-0 min-h-0 overflow-hidden`.
- 손잡이(12px, 가운데 `GripVertical`/`GripHorizontal`, `touch-action: none`): `pointerdown` → `setPointerCapture`, 드래그 중 루트에 투명 오버레이(`fixed inset-0 z-50 cursor-col-resize`) 를 띄워 `<video>`·Excalidraw 가 이벤트를 받지 않게 함. `pointermove` 마다 루트 `getBoundingClientRect()` 기준 비율 계산 → 클램프 → `onRatioChange`. `pointerup/cancel` 에서 오버레이 제거.
- 키보드 접근: 손잡이 `role="separator" aria-orientation aria-valuenow`, `←→/↑↓` 로 2% 단위 이동.
- 드래그 종료 후 Excalidraw 는 자체 ResizeObserver 로 캔버스를 재계산한다(추가 처리 없음). 배경 이미지 위치는 유지(스크롤/줌은 학생이 조정).

### 6) 분할 설정 — `lib/splitLayout.js` (신규, Vitest)
```js
loadSplitSettings()  // { ratio: 0.5, videoSide: 'start' } 기본, 클램프
saveSplitSettings(patch)
loadSplitPage(cvId) / saveSplitPage(cvId, pageId)
useOrientation()     // matchMedia('(orientation: portrait)') → 'vertical' | 'horizontal'
```

### 7) StudyViewer 임베드 모드 — `pages/Study/StudyViewer.jsx`
- 시그니처: `StudyViewer({ chapterId: chapterIdProp, pageId: pageIdProp, onNavigatePage, onExit, embedded = false })`
  - `const params = useParams(); const chapterId = chapterIdProp ?? params.chapterId; const pageId = pageIdProp ?? params.pageId;`
  - `goToPage(pid)` 헬퍼: `embedded ? onNavigatePage(pid) : navigate('/student/study/${chapterId}/page/${pid}')` — 이전/다음 버튼·`PageNavOverlay`·사이드바 항목(임베드 시 `<Link>` 대신 `<button>`)이 모두 이 헬퍼를 쓴다.
  - 뒤로가기(←) 버튼: `embedded ? onExit() : navigate('/student/classrooms/...')`.
  - 루트 높이: `embedded ? '100%' : '100vh'`.
- 세션 캐시(`_notesCache` 등)·소켓 구독·자동 저장·교사 코멘트 오버레이·교사 필기 모달·PDF 다운로드는 변경 없음.
- `TeacherNotesModal` 은 `fixed inset-0` 모달이라 분할 화면 위에 전체로 뜬다 — 의도된 동작(닫으면 복귀).

### 8) VideoPlayer 변경 — `components/videos/VideoPlayer.jsx`
- 신규 prop `fullscreenTargetRef`(기본 자기 컨테이너). `toggleFullscreen` 은 이 요소를 대상으로 `requestFullscreen`.
- `requestFullscreen` 이 없는 환경(iPhone Safari)에서 대상이 외부 요소이면 `onPseudoFullscreenChange(bool)` 콜백을 호출해 분할 화면이 `fixed inset-0` 로 흉내 낸다(기존 `webkitEnterFullscreen` 은 영상만 전체가 되어 분할 의미가 없으므로 이 경우 사용하지 않음).
- `fullscreen` 상태 아이콘은 `document.fullscreenElement === target || pseudo` 로 판정.

## 흐름

1. **연결**: 교사 → 학급 [영상] 탭 → 카드 "필기 챕터" 선택 → `PATCH /api/classroom-videos/:id { chapterId }` → 카드에 칩.
2. **진입**: 학생 → 영상 상세 → [2분할로 필기하며 보기] → `/split?page=<마지막 페이지>`.
3. **학습**: 좌측 영상 재생(진도 저장), 우측 필기(1.5초 디바운스 자동 저장, 교사 코멘트 실시간 반영). 페이지 넘김은 쿼리스트링만 바뀌어 영상 유지.
4. **조정**: 분할선 드래그 → 비율 저장. ⇄ → 좌우(위아래) 바꾸기 저장. 기기 회전 → 자동으로 위/아래 분할.
5. **전체화면**: 플레이어 ⤢ 또는 상단 바 ⤢ → 분할 루트 전체화면, 영상은 반쪽을 채우고 필기창 유지. `Esc`/⤢ 로 복귀.
6. **복귀**: ← → 일반 상세 화면(댓글·시청현황·다른 영상).

## 엣지케이스

- 연결 챕터가 삭제됨(`chapter_id` → NULL): 상세의 버튼이 사라지고, 분할 URL 직접 진입은 상세로 replace.
- 챕터에 페이지가 0개: 필기 패널에 기존 "페이지가 없습니다." 표시.
- `?page=` 가 그 챕터의 페이지가 아님(다른 챕터/삭제): 첫 페이지로 교정하고 URL replace.
- 챕터 페이지가 영상(YouTube)/HTML 도구 페이지: StudyViewer 가 기존대로 렌더(영상 2개가 동시에 재생될 수 있음 — 학생 선택에 맡김). HTML 도구 페이지는 별도 origin iframe 이므로 분할선 드래그 중 오버레이가 필수.
- 다른 학급 챕터 id 로 PATCH 시도: 400. 교실 소유 교사가 아니면 기존 가드로 403/404.
- 세로 화면에서 전체화면: 위/아래 분할 그대로 전체화면.
- 매우 좁은 폭(< 480px)에서는 분할선 min/max 클램프로 양쪽 패널 최소 20% 보장. StudyViewer 사이드바(w-44)는 학생이 접을 수 있음(기존 토글).
- 영상 패널에 포인터가 있을 때만 플레이어 단축키 동작. 필기 중 Space 가 영상을 멈추지 않는다.
- 분할 화면 언마운트 시 플레이어의 기존 `onProgress`(일시정지/언마운트 보고) 와 StudyViewer 의 pending 저장이 각각 수행된다.

## 테스트

- Vitest(클라이언트): `lib/splitLayout.test.js` — 설정 로드/저장 클램프(0.2~0.8), `videoSide` 기본값, 페이지 기억 키.
  `components/common/SplitPane` 은 비율 계산 함수(`ratioFromPointer(rect, x, y, orientation, min, max)`)를 순수 함수로 분리해 테스트.
- 서버: `tsc` 타입체크. `PATCH /classroom-videos/:id` 의 `chapterId` 검증(같은 학급 OK / 다른 학급 400 / null 로 해제) 은 curl E2E.
- ESLint(client) 통과. `vite build` 통과.
- 수동 E2E(태블릿 포함): 연결 → 학생 진입 → 페이지 넘김 중 영상 유지 → 분할선 드래그·좌우 바꾸기 저장 확인 → 전체화면(반쪽) → 회전 시 위/아래 → 필기 자동 저장 및 교사 코멘트 실시간 반영 → iPhone Safari 폴백.

## 영향받는 파일 요약

**서버**: `db/schema.ts`(chapter_id), `db/startupMigrate.ts`, `routes/classroomVideos.ts`(PATCH 확장·응답), `services/classroomVideo.service.ts`(left join·검증).
**공유**: `shared/src/types/video.ts`.
**클라이언트**: `App.jsx`(라우트), `pages/Videos/ClassroomVideoSplit.jsx`(신규), `pages/Videos/ClassroomVideoWatch.jsx`(버튼/칩), `components/videos/ClassroomVideoTab.jsx`(챕터 선택/칩), `components/videos/VideoPlayer.jsx`(fullscreenTargetRef), `components/common/SplitPane.jsx`(신규), `lib/splitLayout.js`(+test, 신규), `pages/Study/StudyViewer.jsx`(임베드 props), `.claude/PROJECT_MAP.md`.

## 구현 순서 (제안)

1. 서버: 컬럼·멱등 DDL → 서비스 select/update → PATCH 검증 → 타입. (`tsc`)
2. 교사 UI: 탭에 챕터 선택·칩. (연결만으로도 가치 확인 가능)
3. `lib/splitLayout.js` + 테스트, `SplitPane`.
4. StudyViewer 임베드 props(동작 불변 리팩터링) — 기존 라우트로 회귀 확인.
5. `VideoPlayer.fullscreenTargetRef`.
6. `ClassroomVideoSplit` 화면 + 라우트 + 상세 화면 버튼.
7. 태블릿 수동 검증, PROJECT_MAP 갱신.
