# Project Map — MathChois (ChoisClass)

## 개요
- 목적: 교사·학생용 수학 수업 플랫폼. 교재(챕터/페이지) 이미지·영상·HTML 도구 위에 Excalidraw로 필기·코멘트·과제를 주고받는다.
- 스택: **npm workspaces 모노레포** (`mathchois`, root `type: module`, Node >= 22)
  - `packages/server` (`@mathchois/server`) — **Fastify 5** + **Drizzle ORM 0.45** + **PostgreSQL** (`postgres` 드라이버) + **Socket.IO 4** + JWT/Google OAuth + nodemailer + **@google/genai**(Gemini OCR). `tsx`(dev) / `tsc`(build).
  - `packages/client` (`@mathchois/client`) — **React 19** + **Vite 7** + **Tailwind 4** + **React Router 7** + **Excalidraw 0.18** + dnd-kit + jspdf + socket.io-client + **katex/react-markdown/remark-math/rehype-katex**(수식·해설 렌더). PWA(Service Worker + manifest).
  - `packages/shared` (`@mathchois/shared`) — 공용 TS 타입(소스 직접 export, 빌드 산출물 아님).
- 배포: **Railway** (Dockerfile 빌드, `packages/server/Dockerfile`, healthcheck `/api/health`). 프로덕션에서 server가 `client/dist`를 정적 서빙 + SPA fallback.
- 인증: Google OAuth + 이메일/비밀번호(bcrypt). JWT access/refresh, 역할 `teacher` | `student`(+ `isAdmin`).

> 루트 `CLAUDE.md`는 현재 위 모노레포(Fastify/Drizzle) 기준으로 최신화되어 이 맵과 일치한다. (과거엔 "React+Vite+Supabase 단일 앱"으로 적혀 있었으나 갱신됨. Supabase는 미사용 — Storage·RPC·RLS는 자체 구현으로 대체.) 구조 상세는 이 PROJECT_MAP을 기준으로 본다.

## 폴더 구조
```
packages/
├── server/                 # @mathchois/server (Fastify + Drizzle)
│   └── src/
│       ├── index.ts            # 부트스트랩 (startupMigrate → buildApp → Socket.IO → listen)
│       ├── app.ts              # Fastify 인스턴스·플러그인·라우트 등록·정적서빙
│       ├── config/             # env.ts(zod), database.ts(drizzle)
│       ├── db/                 # schema.ts(Drizzle), startupMigrate.ts(기동 시 idempotent DDL)
│       ├── middleware/         # auth.ts(JWT), roleGuard.ts(requireRole)
│       ├── routes/             # auth, classrooms, chapters, pages, storage, posts,
│       │                       #   assignments, notes, comments, admin, problems, coaching, dashboard, visualizations,
│       │                       #   classroomGroups(학급 기본 모둠), whiteboards(화이트보드 — 페이지 뷰/배정/설정/보드/잠금/초기화/복원/템플릿 원자 적용),
│       │                       #   videos(영상자료 라이브러리+스트리밍 업로드), classroomVideos(학급 영상 배정+댓글)
│       ├── services/           # *.service.ts (DB 접근 로직) + ai.service.ts(Gemini), problem.service.ts, coaching.service.ts, dashboard.service.ts, visualization.service.ts, video.service.ts, classroomVideo.service.ts,
│       │                       #   pageAccess.service.ts(페이지↔학급 접근 헬퍼 — socket/routes 공용), classroomGroup.service.ts(기본 모둠), whiteboard.service.ts(보드 지연 생성·설정·배정·장면 저장/직전본·권한)
│       ├── scripts/            # seed-test-accounts.ts, wb-smoke.ts(화이트보드 소켓/REST 스모크), wb-e2e-setup.ts(브라우저 E2E 픽스처)
│       └── socket/             # index.ts + handlers/(notes, comments, assignments, presence, videos, whiteboard(메모리 권위 장면 + 요소 단위 병합))
├── client/                 # @mathchois/client (React SPA)
│   └── src/
│       ├── App.jsx             # 라우팅 정의
│       ├── contexts/AuthContext.jsx
│       ├── components/         # ProtectedRoute, Navbar, assignment/, board/, common/(ProblemView, CoachingPanel, SortablePageItem, SplitPane(2분할 컨테이너 — 손잡이 드래그/키보드로 비율 조정, 드래그 중 투명 오버레이), FileDropZone — 클릭/드래그 앤 드롭 파일 선택 영역, SortOrderSelect — 정렬 순서 선택), problems/(ProblemPickerModal), coaching/(CoachingHistoryView, AttemptStack), dashboard/(ClassroomDashboard), visualizations/(VisualizationForm, VisualizationPickerModal),
│       │                       #   videos/(VideoPlayer, VideoPreviewModal, VideoForm, VideoPickerModal, ClassroomVideoTab, VideoComments)
│       │   ├── study/          # DrawingToolbar, PageNavOverlay, PenDiagnosticsOverlay, HtmlToolOverlay
│       │   └── whiteboard/     # WhiteboardCanvas(Excalidraw 기본 UI + 협업), WhiteboardTopBar, BackgroundColorPicker, TemplatePickerDialog, TemplateThumb(SVG 미리보기),
│       │                       #   WhiteboardTile(격자 정적 썸네일), WhiteboardSettingsDrawer(교사 설정), GroupAssignmentPanel, ClassroomGroupSettings(학급 학생 탭 모둠 설정)
│       ├── layouts/            # MainLayout(public), DashboardLayout(인증 — 데스크톱 ≥1024px 고정 사이드바(햄버거로 접기, `mc_sidebar_collapsed`), 그 아래는 오버레이; 본문 유동 폭 p-4/6/8)
│       ├── pages/              # Home, Login, Classrooms, Chapters, Study, Monitor,
│       │                       #   Assignment, Board, Admin, Problems(문제은행), Visualizations(시각화자료), Videos(영상자료 VideosPage + 학급 시청 ClassroomVideoWatch + 영상 2분할 필기 ClassroomVideoSplit), History(코칭기록),
│       │                       #   Whiteboard(StudentWhiteboardViewer 학생 모둠 보드, TeacherWhiteboardPage 교사 격자/단일 + 설정) 등
│       ├── hooks/              # useMediaQuery(matchMedia 구독), useSortOrder(목록 정렬 순서 — 사용자별 localStorage), useExcalidrawTouch(입력모드 게이트), useExcalidrawUndo(자체 undo/redo),
│       │                       #   useScribbleErase(문지르기 지우개), useFreedrawSmoothing, usePenDiagnostics,
│       │                       #   useWetInk(웻잉크 오버레이 — 펜 라이브 렌더), useOrientation(세로 화면 → 위/아래 분할),
│       │                       #   useWhiteboardCollab(보드 1개 소켓 협업 — 변경 요소 100ms 스로틀 전송/포인터/파일), useWhiteboardGrid(교사 격자 — 소켓 하나로 N 보드 장면 유지)
│       └── lib/                # api.ts, socket.ts, toolUrl.js, excalidrawUtils, pdfDownloader,
│                               #   inputMode.js, penToggles.js, excalidrawHistory.js,
│                               #   wetInkStroke.js(인라인 perfect-freehand + freedraw element 생성),
│                               #   freedrawResample.js, scribbleDetect.js,
│                               #   problemContent.js([FIGURE:n] 파서), problems.js(API),
│                               #   coaching.js(convert/review/attempts/uploadWorkImage/getMyHistory/getStudentHistory/resetStudentQuota/getPageStudents),
│                               #   dashboard.js(getClassroomDashboard),
│                               #   visualizations.js(list/facets/CRUD/upload + buildVisualizationQuery),
│                               #   videos.js(라이브러리/학급배정/댓글 API + XHR 진행률 업로드 + 썸네일 캡처/길이 측정),
│                               #   videoPlayer.js(플레이어 설정 localStorage, SEEK_STEPS/PLAYBACK_RATES, formatTime, 이어보기 위치, 길게 누름 제스처 축/좌우/드래그→값 순수 함수),
│                               #   splitLayout.js(영상 2분할 — 비율/영상 위치 `mc_video_split`, 마지막 페이지 `mc_video_split_page:<cv>`, ratioFromPointer/stepRatio),
│                               #   swUpdate.js(PWA SW 자동 업데이트 — setupSwAutoUpdate),
│                               #   linkify.js(게시판 본문 plain text의 URL → 자동 하이퍼링크 세그먼트),
│                               #   sortOrder.js(학급 상세 [챕터]·[영상] 탭 정렬 — 최신순/등록순/교사 지정순, sortItems + localStorage 저장),
│                               #   layout.js(CARD_GRID 카드 목록 반응형 열 규칙 1/2/3/4/5열 · DESKTOP_MEDIA_QUERY · SIDEBAR_COLLAPSED_KEY),
│                               #   groupAssign.js(모둠 자동 배분/이동), whiteboardTemplates.js(템플릿 34종 skeleton, 3200×1800), whiteboardTemplateBuild.js(convertToExcalidrawElements + groupId),
│                               #   whiteboardExport.js(발표 영역 안내선·범위 계산, 순수), whiteboardExportBrowser.js(썸네일/PNG/PDF — Excalidraw import), whiteboardImage.js(축소 업로드·파일 ref↔dataURL·커서 색) (*.test.js = Vitest)
└── shared/src/
    ├── types/             # api, auth, excalidraw, models(+ Whiteboard* 타입), socket(+ wb:* 페이로드), problem, coaching, dashboard, visualization, video
    ├── whiteboard/        # merge.ts — 요소 단위 병합 순수 함수(서버·클라이언트 공용, version→versionNonce, 작성자 보존, 변경 추출, 삭제 정리)
    └── curriculum/        # math2022.ts — 2022 개정 수학과 교육과정 MAP(과목→대단원→소단원+성취기준) + buildCurriculumPromptBlock()
```
(제외: `node_modules/`, `dist/`, `.next/`, `drizzle/` 마이그레이션 SQL, `legacy_rails/`)

## 핵심 기능: 5개 필기(annotation) 페이지

모두 Excalidraw JSON(`excalidraw_data`)을 저장하며, 1.5초 debounce 자동저장 + Socket.IO로 실시간 동기화한다.

| # | 필기 종류 | 클라이언트 파일 | 서버 라우트 (PUT/GET) | DB 테이블 |
|---|---|---|---|---|
| ① | 학생 필기 (student notes) | `pages/Study/StudyViewer.jsx` | `PUT/GET /api/notes/student/:pageId`, `GET /api/notes/student-bulk` | `student_notes` |
| ② | 교사 필기 (teacher notes) | `pages/Study/TeacherStudyViewer.jsx` | `PUT/GET /api/notes/teacher/:pageId`, `GET /api/notes/teacher-bulk`, `GET /api/notes/teacher-for-page/:pageId` | `teacher_notes` |
| ③ | 학생에 대한 교사 코멘트 필기 | `pages/Monitor/StudentWorkViewer.jsx` (학생 열람은 StudyViewer) | `PUT/GET /api/comments/:pageId/:studentId`, `GET /api/comments/:pageId/for-student` | `teacher_student_comments` |
| ④ | 학생 과제 필기 (assignment notes) | `pages/Assignment/AssignmentStudyViewer.jsx` | `PUT/GET /api/assignment-notes/:assignmentId/:pageId`, `GET /api/assignment-notes/:assignmentId/bulk` | `assignment_notes` |
| ⑤ | 교사 과제 코멘트 필기 | `pages/Assignment/AssignmentWorkViewer.jsx` (학생 열람은 AssignmentStudyViewer) | `PUT/GET /api/assignment-comments/:pageId/:studentId` | `assignment_teacher_comments` |

5개 뷰어 공통 펜/UI 동작(`feat/pen-input-quality`):
- 진입 시 기본 도구는 **freedraw(펜) + 검정(`#000000`)** 으로 강제(마지막 도구/빨강 복원 폐기). `DrawingToolbar`가 `pageId` prop으로 페이지 전환 시 펜+검정 리셋.
- 입력 모드 게이트(`hooks/useExcalidrawTouch.js` + `lib/inputMode.js`)로 손바닥 연결선(phantom line) 차단. 자체 undo/redo(`hooks/useExcalidrawUndo.js` + `lib/excalidrawHistory.js`). 5개 뷰어 모두 사용.
- **웻잉크(wet-ink) 펜 렌더링**(`hooks/useWetInk.js` + `lib/wetInkStroke.js`): 진행 중인 펜 획을 가벼운 `<canvas>`에 펜 전속도로 렌더하고 pointerup에서 Excalidraw freedraw element로 commit(→ 기존 저장/동기화/undo). 기본 ON, `?wetink=0`이 기기별 비상 kill switch. 5개 뷰어 + CoachingViewer(`!readOnly`) + HtmlToolOverlay에 통합. 아래 "주의사항"의 웻잉크 항목 참조.
- 진단 오버레이(`PenDiagnosticsOverlay` + `usePenDiagnostics`)는 `?penlog=1` 진입 시 활성화, 현재 **StudyViewer 에만** 마운트.

부가 매핑:
- 서버 핸들러: 필기/과제필기 → `routes/notes.ts`, 코멘트(③⑤) → `routes/comments.ts`. 실제 DB 로직은 `services/note.service.ts`에 집중.
- Socket emit: `socket/handlers/notes.ts`(①②), `comments.ts`(③), `assignments.ts`(④⑤).
- 교사 모니터링 진입점: `pages/Monitor/ChapterMonitor.jsx`(챕터별 학생 진도 → StudentWorkViewer로), `pages/Assignment/AssignmentMonitor.jsx`(과제별 제출 → AssignmentWorkViewer로).
- 페이지 배경은 이미지/영상/**HTML 도구** 중 하나 (`pages.html_url`). HTML 도구는 iframe으로 렌더되고, 그 위에 **투명 Excalidraw 오버레이**(`components/study/HtmlToolOverlay.jsx` + `lib/htmlOverlay.js`)로 필기를 얹는다(①②③ 뷰어). 자세한 동작은 아래 "주의사항"의 HTML 필기 오버레이 항목 참조.

## 화이트보드 — 모둠 공유 보드 (설계 `docs/superpowers/specs/2026-10-18-whiteboard-design.md`, 계획 `docs/superpowers/plans/2026-10-18-whiteboard.md`)

챕터에 `pages.page_type = 'whiteboard'` 페이지를 추가하면 학급 **모둠(그룹)별**로 보드가 하나씩 생기고 모둠원이 **동시에** 그리고 꾸민다(Canva 화이트보드·Padlet Sandbox 유형). 기존 5개 필기 페이지와 달리 **요소 단위 실시간 병합**이며 저장 단위는 (페이지, 학급, 모둠).
- **모둠**: 학급 상세 > 학생 탭 "모둠 설정"(`classroom_groups`, N개 자동 배분 + 드롭다운). 화이트보드 페이지에 (학급별) 처음 접근할 때 기본 모둠을 **복사**해 `whiteboard_groups` 를 지연 생성(기본 모둠이 없으면 "1모둠"에 전원). 페이지별 배정은 교사 설정 드로어에서 따로 바꾼다(학급 기본 모둠과 무관).
- **권한**: 학생은 자기 모둠 보드만 편집. 페이지별 "다른 모둠 열람 허용"이 켜지면 같은 학급 보드를 읽기 전용으로 전환해 볼 수 있다. 교사는 모든 보드 편집 + 보드별/전체 잠금. 연결(linked) 챕터는 학급별로 보드·배정·잠금이 독립, 기본 템플릿만 원본 페이지 속성(원본 챕터 소유 교사만 변경).
- **실시간**(`socket/handlers/whiteboard.ts`, room `wb:{boardId}`): 서버가 보드별 권위 장면을 메모리에 두고 `shared/whiteboard/merge.ts` 규칙(version 큰 쪽, 같으면 versionNonce 작은 쪽 — Excalidraw `reconcileElements` 와 동일)으로 병합 후 `wb:elements` 브로드캐스트. 저장은 2초 디바운스/첫 변경 후 최대 10초/마지막 퇴장 시 즉시, 저장 직전 현재본을 `prev_excalidraw_data` 로 보관(직전 저장이 30초 이내면 유지). 종료(SIGTERM) 시 `flushAllWhiteboards`. 이벤트: `wb:join/leave/init/elements/pointer/background/files/scene/lock/settings/presence/rejected/removed`. 학생이 보낸 요소의 `customData.authorId/authorName` 은 서버가 본인으로 강제(기존 요소는 원 작성자 보존).
- **클라이언트**: `WhiteboardCanvas` 가 Excalidraw 기본 UI(ko-KR, 이미지 도구 포함)를 그대로 노출하고 원격 요소는 `reconcileElements` + `updateScene({ captureUpdate: CaptureUpdateAction.NEVER })` 로 반영(로컬 undo 에 섞이지 않음). 3200×1800 **발표 영역 안내선**(`__wb_guide__`, 잠금, 로컬 전용 — 전송·저장·내보내기에서 제외) + "화면 맞춤". 바탕색 프리셋 8 + 자유 선택(`wb:background`, 보드별 저장). 이미지는 긴 변 1600px·≤1MB 로 축소해 `whiteboard-files` 버킷에 업로드하고 보드 JSON 에는 `{id,url,mimeType}` 만 둔다. 협업자 커서는 `collaborators` Map(이름표·색).
- **템플릿 34종**(`lib/whiteboardTemplates.js`: 오거나이저 16 / 분석 14 / 활동 4, 흰 바탕 + 검은 구분선 skeleton). 교사가 페이지 기본 템플릿을 정하면 보드가 비어 있을 때 클라이언트가 요소를 만들어 `POST /whiteboards/groups/:gid/apply-template` 로 보내고 **서버가 살아있는 요소 0개일 때만 원자적으로 적용**(동시 진입 중복 방지). 기본 템플릿이 없으면 학생에게 선택 오버레이. 보드 안 "템플릿" 버튼으로 현재 화면 중앙에 추가 삽입(하나의 groupId).
- **교사 화면**(`TeacherWhiteboardPage`): 격자(모든 모둠 타일 — `useWhiteboardGrid` 가 소켓 하나로 N 보드 join, 타일은 `exportToCanvas` 2초 스로틀 정적 렌더, 화면 밖 타일은 미렌더) ↔ 단일(모둠 드롭다운, 편집, 요소 선택 시 작성자 표시). 설정 드로어: 배정·열람 허용·전체/보드 잠금·기본 템플릿(빈 보드에 재적용)·초기화/직전 상태 복원·PNG/PDF(가로 A4) 내보내기. ChapterMonitor 는 화이트보드 페이지를 진도 집계에서 빼고 "보드 열기" 칩으로 연결.
- 테스트: `npm test -w @mathchois/client`(병합·배분·템플릿 범위·내보내기 범위·이미지 유틸), `packages/server/scripts/wb-smoke.ts`(소켓 2클라이언트 + REST 36개), `packages/client/e2e/whiteboard.smoke.mjs`(Chromium 17개 — 교사 격자/학생 동시 편집/작성자/잠금/템플릿 오버레이/타일 렌더).
- 전제: **단일 서버 인스턴스**(메모리 장면). 다중 인스턴스는 Redis 어댑터 등 별도 작업 필요.

## AI 수학 코칭 페이지 (#3, `feat/ai-coaching-page`)

`pages.aiProblemId`(→`problems`, set null)가 설정된 페이지는 이미지/영상/HTML 배경이 없는 **AI 코칭 페이지**다.

- 학생 study 라우트(`/student/study/:chapterId/page/:pageId`)의 element는 **`pages/Study/StudyPageRouter.jsx`**(StudyViewer 대체). 페이지가 `aiProblemId`면 `CoachingViewer`, 아니면 `StudyViewer`를 렌더한다.
- 학생 study 라우트의 AI 페이지는 `StudyPageRouter`가 `CoachingViewer`로, 교사 study 라우트의 AI 페이지는 **`pages/Study/TeacherStudyPageRouter.jsx`**가 **`TeacherCoachingReview`**로 분기한다(아래 "AI 코칭 횟수 제한" 참조).
- **`pages/Study/CoachingViewer.jsx`**(학생) — 좌: Excalidraw 풀이(① `student_notes`로 자동저장), 우: 문제·코칭 패널. 2단계 흐름(① 필기→LaTeX 수식 전환 → ② AI 검토), attempt 누적. 우측 패널은 `AttemptStack`로 누적 표시. (`CoachingViewer`는 학생 `StudyPageRouter`와 ③ `StudentWorkViewer`에서 계속 사용.)
- 패널 UI: **`components/common/CoachingPanel.jsx`**(정답 여부/오류태그/개념태그 + 코멘트 Markdown+KaTeX). 누적 표시는 **`components/coaching/AttemptStack.jsx`**(최신 펼침 + 이전 접힌 카드; 각 카드 = 전달 이미지 + 변환 수식 + CoachingPanel, 학생·교사 공용). 교사 에디터의 문제 선택은 **`components/problems/ProblemPickerModal.jsx`**(문제은행 선택 모달).
- 교사: `Chapters/Editor.jsx`에서 [AI 코칭] 페이지 추가 + 문제 선택/변경 + AI 미리보기. `components/common/SortablePageItem.jsx`가 AI 페이지를 Sparkles 썸네일로 표시.
- **보안 패턴: 정답·해설은 학생 클라이언트에 절대 전송하지 않는다.** 학생은 `GET /api/problems/:id/for-coaching`로 표시 필드만 받고, 정답 대조는 **서버 `reviewSolution`에서만** 수행한다. 코칭 시도는 `coaching_attempts`에 불변 누적된다.
- 서버: 라우트 `routes/coaching.ts`, 서비스 `services/coaching.service.ts`(상수 `COACHING_ATTEMPT_LIMIT = 3`; createAttempt/listAttempts + 한도 `getAttemptUsage(studentId,pageId)`→`{used,limit,resetAt}` / 리셋 `resetQuota(studentId,pageId)`(upsert reset_at=now) / 시도 학생 집계 `listPageStudents(pageId,classroomId)`(classroom 스코프, 정답·해설 미포함) + 기록조회 `listStudentHistory`/`listClassroomStudentHistory`), `services/ai.service.ts`(`convertSolutionToLatex` 필기→LaTeX, `reviewSolution` 정답·해설 대조 코칭), `services/problem.service.ts`(`getProblemForCoaching` 표시 필드만), `services/page.service.ts`(createPage가 `aiProblemId` 허용, `updatePage` 추가). 필기 스냅샷은 `ai-coaching` 버킷에 저장.

### AI 코칭 풀이 기록 조회 (#4, `feat/coaching-history`)

읽기 전용 — 스키마 변경 없음. `coaching_attempts`를 `problems`(표시필드만)+`pages`→`chapters` 조인해 기간(from/to) 필터·페이지네이션으로 조회한다. **정답·해설은 select 제외(보안 불변식 유지).**

- 서버: `coaching.service.ts`의 `listStudentHistory(studentId, q)`(본인), `listClassroomStudentHistory(classroomId, studentId, q)`(교사, 해당 클래스 챕터 범위 한정). 라우트는 위 coaching 그룹 표의 history 2개.
- 클라이언트 공용 뷰: `components/coaching/CoachingHistoryView.jsx` — 기간 필터(프리셋 1주/1개월/전체 + 시작·종료 직접지정, 기본 최근 7일) + 카드 리스트 + 인라인 펼침(`ProblemView` 문제·풀이 + `CoachingPanel` + 필기 이미지) + 페이지네이션. `fetchHistory` prop 주입(ref 안정화).
- 학생: `pages/History/MyCoachingHistory.jsx`(`/student/coaching-history`), StudentSidebar "내 풀이 기록"(History 아이콘). 교사: `pages/Monitor/StudentCoachingHistory.jsx`(`/teacher/classrooms/:classroomId/students/:studentId/coaching-history`), `ClassroomDetail.jsx` '학생' 탭 멤버 카드의 [코칭 기록] 버튼으로 진입.
- `components/common/CoachingPanel.jsx`에 `showTeacherNotes` prop(강점 메모 표시) 추가. `lib/coaching.js`에 `getMyHistory`/`getStudentHistory` 추가.

### AI 코칭 횟수 제한·리셋 (`feat/ai-coaching-limits`)

문제(페이지)당 학생 AI 코칭 시도 횟수를 제한(`COACHING_ATTEMPT_LIMIT = 3`)하고 교사가 리셋할 수 있다. 사용 횟수는 `coaching_quota.resetAt` 이후의 `coaching_attempts`만 카운트 — 기록은 보존되고 카운터만 리셋된다.

- 서버 `routes/coaching.ts`:
  - `POST /coaching/convert` — body에 `pageId` 추가, 사용량 한도(3) 초과 시 429.
  - `POST /coaching/review` — 한도 초과 시 429, 응답이 attempt 단건 → `{attempt, used, limit, resetAt}`.
  - `GET /coaching/pages/:pageId/attempts`(본인) 및 `GET /coaching/classrooms/:classroomId/students/:studentId/pages/:pageId/attempts`(교사) — 응답이 배열 → `{attempts, used, limit, resetAt}`.
  - **신규** `POST /coaching/classrooms/:classroomId/students/:studentId/pages/:pageId/reset`(교사, owner+member 가드 — 횟수 리셋, 기록 보존).
  - **신규** `GET /coaching/classrooms/:classroomId/pages/:pageId/students`(교사, owner 가드 — 해당 페이지 시도 학생 목록 + used/limit).
- 클라이언트:
  - **`pages/Study/TeacherCoachingReview.jsx`**(신규) — 교사 챕터 필기 경로의 AI 코칭 문항 화면. 사이드바=문항 네비, 메인=시도한 학생 카드(이름 + used/limit 배지 + 리셋 버튼, 펼치면 그 학생의 누적 코칭(`AttemptStack`)).
  - `pages/Study/TeacherStudyPageRouter.jsx` — AI 페이지 분기를 readOnly `CoachingViewer` → `TeacherCoachingReview`로 변경.
  - `pages/Study/CoachingViewer.jsx`(학생) — 헤더 `AI 코칭 {used}/{limit}` 배지, 한도 도달 시 [수식전환]·[AI검토요청] 모두 비활성+안내. `coaching` 단건 상태 → `attempts[]`+`usage`.
  - `lib/coaching.js` — `convertSolution(imageUrl, pageId)`로 시그니처 변경, `listAttempts`/`getStudentPageAttempts`/`reviewSolution` 응답 형태 변경, 신규 `resetStudentQuota`/`getPageStudents`.
- 공유 타입: `shared/src/types/coaching.ts`에 `PageAttemptsResult`, `ReviewResult`, `CoachingStudentSummary` 추가.

### #5 교사 대시보드 (`feat/teacher-class-dashboard`)

집계 전용 — 스키마 변경 없음. `coaching_attempts`/`student_notes`/`pages`/`chapters`를 group-by로 집계해 클래스 단위 학습 현황을 한 화면에 보여준다. **정답·해설 미포함(카운트만)** — 보안 불변식 유지.

- 서버: `services/dashboard.service.ts`의 `getClassroomDashboard(classroomId)` — 학생×챕터별 코칭 정답률(attempts/correct) + 필기 진도(notedPages, 챕터 totalPages)를 group-by 집계하고 `getClassroomMembers`와 병합, summary(반평균 정답률/총시도/활동 학생/챕터 수) 산출. 라우트 `routes/dashboard.ts`의 `GET /api/dashboard/classrooms/:classroomId`(authenticate + requireRole('teacher') + isClassroomOwner 403 가드). `app.ts`에 등록.
- 클라이언트: `components/dashboard/ClassroomDashboard.jsx` — 요약 카드 4개 + 학생 카드(종합 정답률 배지) + 챕터 칩(정답률 색 heatmap + 필기 진도 막대), 차트 라이브러리 없이 CSS. 학생 카드 클릭 시 #4 교사 풀이 기록(`/teacher/classrooms/:classroomId/students/:studentId/coaching-history`)으로 이동. `pages/Classrooms/ClassroomDetail.jsx`에 교사 전용 '대시보드' 탭(activeTab `'dashboard'`, isTeacher 게이트). `lib/dashboard.js`에 `getClassroomDashboard`.
- 공유 타입: `shared/src/types/dashboard.ts`(ClassroomDashboard, DashboardStudent, DashboardCell, DashboardChapter).

## 주요 엔드포인트 / 라우트

### 클라이언트 라우트 (App.jsx)
| 경로 | 컴포넌트 | 비고 |
|---|---|---|
| `/auth/callback` | OAuthCallback | 레이아웃 없음 |
| `/`, `/login`(→`/`), `/choose-role`, `/privacy`, `/terms` | Home 등 | MainLayout (public) |
| `/reset-password/:token`, `/verify-email/:token` | ResetPassword, VerifyEmail | public, 레이아웃 없음 |
| `/teacher/classrooms`, `/teacher/classrooms/:id` | ClassroomList, ClassroomDetail | DashboardLayout. 교사 ClassroomDetail에 '대시보드' 탭(별도 라우트 아님 → `ClassroomDashboard` 렌더) |
| `/teacher/chapters/:id/edit` | Chapters/Editor | 이미지/영상/HTML 도구 업로드 |
| `/teacher/.../chapters/:chapterId/monitor` | ChapterMonitor | 학생 진도 요약 |
| `/teacher/.../chapters/:chapterId/monitor/:studentId` | **StudentWorkViewer** (③) | 전체화면 |
| `/teacher/.../chapters/:chapterId/study/page/:pageId` | **TeacherStudyPageRouter** → TeacherStudyViewer(②) 또는 TeacherCoachingReview(AI 코칭) 또는 TeacherWhiteboardPage(화이트보드) | 전체화면 |
| `/teacher/.../chapters/:chapterId/whiteboard/:pageId` | **Whiteboard/TeacherWhiteboardPage** | 화이트보드 교사 화면: 격자(모든 모둠 타일, 클릭 → 단일) / 단일(모둠 드롭다운 편집) + 설정 드로어. 전체화면 |
| `/teacher/board`, `/board/new`, `/board/:postId/edit` | TeacherBoard, BoardPostEditor | 게시판 |
| `/teacher/problems` | Problems/ProblemsPage | 문제은행 (탭: 문항등록/등록된 문항), DashboardLayout |
| `/teacher/visualizations` | Visualizations/VisualizationsPage | 시각화자료 라이브러리 관리(본인 자료 mine=1, 등록/수정/삭제/미리보기), DashboardLayout |
| `/teacher/videos` | Videos/VideosPage | 영상자료 라이브러리(내 자료/전체 교사 자료 토글, 등록/수정/삭제/미리보기 플레이어), DashboardLayout |
| `/teacher/classrooms/:classroomId/videos/:cvId` · `/student/classrooms/:classroomId/videos/:cvId` | Videos/ClassroomVideoWatch | 학급 영상 시청(YouTube 식 플레이어 + 댓글/대댓글 + 같은 학급 다른 영상), DashboardLayout. 학급 상세 '영상' 탭(`ClassroomVideoTab`)에서 진입 |
| `/student/classrooms/:classroomId/videos/:cvId/split?page=<pageId>` | **Videos/ClassroomVideoSplit** | 영상 2분할 필기(학생 전용). 한쪽 영상 플레이어 + 다른 쪽 교사가 연결한 "필기 챕터"의 `StudyViewer`(**임베드 모드** props `chapterId/pageId/onNavigatePage/onExit/embedded`). 페이지 이동은 `?page=` 만 바꿔 영상이 유지됨. 분할선 드래그·좌우 바꾸기·반쪽 전체화면·세로 화면은 위/아래. **DashboardLayout 밖** 전체화면 |
| `/teacher/.../assignments/:assignmentId/edit` · `/monitor` | AssignmentEditor, AssignmentMonitor | 과제 |
| `/teacher/.../assignments/:assignmentId/monitor/:studentId` | **AssignmentWorkViewer** (⑤) | 전체화면 |
| `/teacher/classrooms/:classroomId/students/:studentId/coaching-history` | Monitor/StudentCoachingHistory | DashboardLayout, 교사가 학생 AI 코칭 풀이 기록 조회 |
| `/admin` | AdminPanel | requireAdmin |
| `/student/classrooms`, `/student/classrooms/:id` | ClassroomList, ClassroomDetail | DashboardLayout |
| `/student/study/:chapterId/page/:pageId` | **StudyPageRouter** → StudyViewer(①, ③열람) 또는 CoachingViewer(AI 코칭) 또는 StudentWhiteboardViewer(화이트보드 — 학급 = 챕터의 classroomId) | 전체화면 |
| `/student/assignments/:assignmentId/page/:pageId` | **AssignmentStudyViewer** (④, ⑤열람) | 전체화면 |
| `/student/coaching-history` | History/MyCoachingHistory | DashboardLayout, 본인 AI 코칭 풀이 기록 (StudentSidebar "내 풀이 기록") |

### 서버 API (Fastify, 모두 `/api/*`)
| 그룹 | 파일 | 주요 엔드포인트 |
|---|---|---|
| auth | routes/auth.ts | `GET /auth/google`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`, `GET /profiles/:id` |
| classrooms | routes/classrooms.ts | `GET/POST /classrooms`, `GET /classrooms/:id`, `/:id/members`, 클래스코드 가입 |
| chapters | routes/chapters.ts | `GET /classrooms/:cid/chapters`, `GET/PATCH/DELETE /chapters/:id` |
| pages | routes/pages.ts | `GET /chapters/:chapterId/pages`, `POST` 생성(`htmlUrl`/`aiProblemId`/**`fromVisualizationId`**(시각화자료 복제 삽입) 허용; `videoUrl` 은 YouTube 또는 `/api/files/videos/library/…` 만 — `utils/videoUrl.ts`, 아니면 400), `PATCH /pages/:id`, `DELETE /pages/:id` |
| storage | routes/storage.ts | `POST /files/upload`(+multiple; `whiteboard-files` 버킷은 학생 허용·래스터 이미지만·2MB), `GET /files/*`(**스트리밍 + HTTP Range 206/416 + HEAD** — 영상 탐색/배속용, 전체 Buffer 읽기 없음), `DELETE /files/*` |
| posts | routes/posts.ts | `GET /posts`, `GET /classrooms/:cid/posts`, `GET/DELETE /posts/:id` (+파일) |
| assignments | routes/assignments.ts | `GET /classrooms/:cid/assignments`, `GET/DELETE /assignments/:id`, `/:id/pages`, `/:id/submissions` |
| notes | routes/notes.ts | ①② 및 ④ 필기 (위 표 참조) + `student-summary`, `student-notes-for/:studentId` |
| comments | routes/comments.ts | ③⑤ 코멘트 필기 (위 표 참조) |
| admin | routes/admin.ts | `GET /admin/users`, `/teachers-with-students`, `/stats`, 비번 초기화 등. **`GET /admin/storage-info`**(Volume 진단 — 경로 출처·버킷별 파일 수·DB 참조 누락, `services/storageInfo.service.ts`; AdminPanel '시스템 현황' 탭의 "Volume 진단" 카드) |
| problems | routes/problems.ts | `POST /problems/ocr`, `/problems/markscheme-ocr`, `/problems/generate-solution`(Gemini), `GET /problems`(검색·필터·페이지네이션), `GET /problems/facets`, `GET/POST/PATCH/DELETE /problems/:id`(teacher). `GET /problems/:id/for-coaching`(authenticate, 학생용 — 정답·해설 제외 표시필드만) |
| coaching | routes/coaching.ts | `POST /coaching/convert`(필기→LaTeX, body `pageId`, 한도 초과 429), `POST /coaching/review`(서버에서만 정답 대조 후 attempt 생성, 한도 초과 429 → `{attempt,used,limit,resetAt}`), `GET /coaching/pages/:pageId/attempts`(본인 → `{attempts,used,limit,resetAt}`), `GET /coaching/classrooms/:classroomId/students/:studentId/pages/:pageId/attempts`(교사). 횟수 제한/리셋: `POST /coaching/classrooms/:classroomId/students/:studentId/pages/:pageId/reset`(교사 owner+member — 리셋, 기록 보존), `GET /coaching/classrooms/:classroomId/pages/:pageId/students`(교사 owner — 시도 학생 목록+횟수). 기록 조회: `GET /coaching/history`(본인, authenticate), `GET /coaching/classrooms/:classroomId/students/:studentId/history`(교사 — requireRole+isClassroomOwner+isClassroomMember, 해당 클래스 챕터 범위 한정). 모두 정답·해설 select 제외 |
| dashboard | routes/dashboard.ts | `GET /dashboard/classrooms/:classroomId`(authenticate + requireRole('teacher') + isClassroomOwner 403). 집계 전용 — 학생×챕터 코칭 정답률·필기 진도 + 반 요약. 정답·해설 select 제외(카운트만) |
| visualizations | routes/visualizations.ts | `GET /visualizations`(목록 — 텍스트 q + subject/major/minorUnit 필터 + 페이지네이션, 기본 전체 공유, `mine=1`이면 본인 것만), `GET /visualizations/facets`, `GET/:id`, `POST`(등록), `PATCH/:id`·`DELETE/:id`(소유자 403 가드 — 삭제 시 원본 파일도 제거). 모두 teacher |
| videos | routes/videos.ts | 모두 teacher. `POST /videos/upload?kind=video\|thumbnail`(**스트리밍 업로드** — 디스크 직접 기록, 영상 2GB/썸네일 5MB, mp4/webm/mov, 초과 413), `GET /videos`(목록 q/subject/majorUnit/minorUnit/`mine=1`/페이지네이션 + createdByName), `GET /videos/facets`, `GET /videos/:id`, `GET /videos/:id/usage`(배정 학급), `POST /videos`, `PATCH /videos/:id`(소유자/관리자, 파일 교체 시 이전 파일 정리), `DELETE /videos/:id`(소유자/관리자 — **학급 배정 중이면 409 + usage**, `?force=1` 이면 트랜잭션으로 모든 배정 해제 후 삭제, 파일·썸네일 삭제) |
| classroomVideos | routes/classroomVideos.ts | 시청 기록: `PUT/GET /classroom-videos/:id/progress`(학생), `GET /classroom-videos/:id/progress/summary`(교사), `GET /classrooms/:cid/videos/progress`(학생 본인 맵/교사 통계 맵). 미읽음: `POST /classroom-videos/:id/seen`, `GET /classrooms/:cid/videos/unread`, `GET /videos/unread`(역할별 학급 합계). 교실 소유 교사/소속 학생 가드. `GET /classrooms/:cid/videos`, `POST`(교사 — `{videoId, note}`, 중복 409, 새 배정은 position 0 + 기존 shift → 맨 위), `PATCH /classrooms/:cid/videos/reorder`(`{ids}`), `GET /classroom-videos/:id`(상세 + classroom + siblings), `PATCH`(note·**chapterId**(필기 챕터 — 같은 학급 챕터가 아니면 400, 전달된 키만 갱신), 응답에 `chapter:{id,title}|null` left join)·`DELETE`(교사 — 댓글 cascade). 댓글: `GET /classroom-videos/:id/comments`(학생은 공개 + 본인 비공개 스레드만), `POST`(`content/parentId/isPrivate/timestampSec` — 대댓글은 루트 공개범위 상속, 깊이 1, 타인 비공개 스레드 403), `PATCH /video-comments/:id`(작성자), `DELETE /video-comments/:id`(작성자 또는 교실 소유 교사). 쓰기 후 socket `video:{cvId}` 에 `video-comment:changed` |
| classroomGroups | routes/classroomGroups.ts | 학급 기본 모둠. `GET /classrooms/:id/groups`(소유 교사/소속 학생), `PUT`(교사 — `{groups:[{id?,name,position,studentIds[]}]}` 전체 교체, 누락 id 삭제, 학생당 한 모둠), `POST /classrooms/:id/groups/auto`(`{count}` 가입순 셔플 균등 배분) |
| whiteboards | routes/whiteboards.ts | 모두 `?classroomId=` 로 (페이지, 학급) 접근 검증(교사 = 학급 소유 && 페이지 관련, 학생 = 소속 && 관련). `GET /whiteboards/page/:pageId`(보드 지연 생성 + 뷰: settings/groups(구성원·elementCount·hasPrevious)/myGroupId(학생)/unassigned(교사)/templateKey/isSourceChapter), `PUT /whiteboards/page/:pageId/groups`(교사 — 페이지별 배정 교체, 삭제된 모둠 보드는 메모리 폐기 + `wb:removed`), `PATCH /whiteboards/page/:pageId/settings`(`allowCrossGroupView`/`lockedAll` → `wb:settings`/`wb:lock`), `GET /whiteboards/groups/:gid`(장면 — 메모리 우선), `PATCH /whiteboards/groups/:gid`(`name`/`locked` → `wb:lock`), `POST /whiteboards/groups/:gid/reset`·`/restore-previous`(교사 — `wb:scene`), `POST /whiteboards/groups/:gid/apply-template`(쓰기 권한자 — 살아있는 요소 0개일 때만 `{applied:true}`) |
| health | app.ts | `GET /api/health` (DB ping) |

## 데이터 모델 (Drizzle 스키마: `packages/server/src/db/schema.ts`)
| 테이블 | 관계 | 비고 |
|---|---|---|
| `profiles` | — | googleId/email unique, role, isAdmin, authMethod(google\|email), passwordHash |
| `classrooms` | teacherId→profiles | classCode unique |
| `classroom_members` | classroomId, studentId | (classroom, student) unique |
| `chapters` | classroomId, sourceChapterId(self) | position, sourceChapterId(복제 출처), createdAt(최신순/등록순 정렬용 — startupMigrate 가 보강). 새 챕터는 position 0 에 삽입되고 기존 챕터는 +1 shift(새 항목이 맨 위) |
| `pages` | chapterId, aiProblemId→problems(set null) | imageUrl / videoUrl / **htmlUrl**(HTML 도구) / position / **pageType**('whiteboard' \| null) / **whiteboardTemplate**(기본 템플릿 key). `aiProblemId` 설정 시 배경 없는 AI 코칭 페이지 |
| `student_notes` ① | studentId, pageId | (student, page) unique, excalidrawData |
| `classroom_groups` / `classroom_group_members` | classroomId→classrooms(cascade) / groupId(cascade), studentId(cascade) | 학급 기본 모둠. name/position. (classroom, student) unique — 학생은 학급당 한 모둠 |
| `whiteboard_page_settings` | pageId→pages(cascade), classroomId→classrooms(cascade) | 화이트보드 페이지×학급 설정: allowCrossGroupView(다른 모둠 읽기 전용 열람), lockedAll. (page, classroom) unique |
| `whiteboard_groups` / `whiteboard_group_members` | pageId(cascade), classroomId(cascade) / groupId(cascade), studentId(cascade) | 페이지×학급×모둠 = 보드 1개. name/position/locked/backgroundColor/excalidrawData(`{elements, files:{id:{id,url,mimeType}}}` — dataURL 없음)/prevExcalidrawData(직전본)/sceneVersion/updatedAt. (group, student) unique |
| `teacher_notes` ② | teacherId, pageId | (teacher, page) unique |
| `teacher_student_comments` ③ | teacherId, studentId, pageId | (teacher, student, page) unique |
| `posts` / `post_files` / `post_classrooms` | teacherId / postId / (post,classroom) | 게시판 |
| `assignments` | classroomId, teacherId | deadline, maxScore, position |
| `assignment_pages` | assignmentId | imageUrl/videoUrl/position |
| `assignment_submissions` | assignmentId, studentId | status(draft/submitted/late_submitted/rejected/graded), score |
| `assignment_submission_files` | submissionId | 제출 첨부파일 |
| `assignment_notes` ④ | assignmentId, pageId(→assignment_pages), studentId | (assignment, page, student) unique |
| `assignment_teacher_comments` ⑤ | teacherId, studentId, pageId(→assignment_pages) | (teacher, student, page) unique |
| `problems` | createdBy→profiles | 문제은행. title, problemLatex, figureNotes/figures/keywords(jsonb), originalImageUrl, subject/majorUnit/minorUnit/difficulty/problemType/detailType, answer, solution, solutionSource(teacher-markscheme\|ai\|ai-regenerated\|teacher-verified), markschemeImageUrl, aiModel, status, createdAt/updatedAt. 인덱스 5개 |
| `coaching_attempts` | pageId→pages(cascade), problemId→problems(set null), studentId→profiles(cascade) | AI 코칭 시도 **불변 누적**(변경 없음). workImageUrl, solutionLatex, isCorrect, errorTags/conceptTags(jsonb), strengthNotes, weaknessNotes, commentMarkdown, aiModel, createdAt. 인덱스 (studentId,createdAt)/(pageId,studentId)/(problemId) |
| `coaching_quota` | studentId, pageId | 문제(페이지)당 학생 AI 코칭 횟수 제한/리셋 기준. (student, page) unique, resetAt(이 시각 이후의 `coaching_attempts`만 사용 횟수로 카운트), updatedAt. 시도 기록 자체는 `coaching_attempts`에 그대로 보존 |
| `visualizations` | createdBy→profiles(cascade) | 시각화자료 라이브러리(교사 간 공유). title(필수)/subject/majorUnit/minorUnit/description/htmlUrl(원본, `visualizations` 버킷). 인덱스 (createdBy)/(subject,majorUnit,minorUnit). 페이지 삽입 시 chapter-tools로 **복제**(독립 복사본) |
| `videos` | createdBy→profiles(cascade) | 영상자료 라이브러리(교사 간 공유). title/subject/majorUnit/minorUnit/description/videoUrl(`videos` 버킷 `library/`)/thumbnailUrl(`thumbnails/`)/mimeType/fileSize(bigint)/durationSec. 인덱스 (createdBy)/(subject,majorUnit,minorUnit) |
| `classroom_videos` | classroomId→classrooms(cascade), videoId→videos(**restrict**), addedBy→profiles(set null), **chapterId→chapters(set null)** | 학급에 배정된 영상 — 라이브러리를 **참조**(복사 아님). note(학급 안내 메모)/position. (classroom, video) unique. 배정 중인 라이브러리 영상은 삭제 차단 |
| `video_comments` | classroomVideoId→classroom_videos(cascade), authorId→profiles(cascade), parentId→video_comments(cascade, 루트만 가리킴 — 깊이 1) | 학급 영상 댓글. content/isPrivate("교사만 확인" — 루트에만 의미, 대댓글은 상속)/timestampSec(영상 시각 첨부). 인덱스 (classroomVideoId, createdAt)/(parentId) |
| `video_progress` | classroomVideoId→classroom_videos(cascade), studentId→profiles(cascade) | 학생 시청 기록. positionSec(이어보기)/maxPositionSec(진도율)/completed(**80%** 도달 — `PROGRESS_COMPLETE_RATIO`, sticky). (cv, student) unique |
| `video_comment_reads` | classroomVideoId→classroom_videos(cascade), userId→profiles(cascade) | 댓글 읽음 시각 lastSeenAt. 미읽음 = 본인이 쓰지 않은·열람 가능한·lastSeenAt 이후 댓글 수. (cv, user) unique |

> 마이그레이션은 Drizzle Kit(`db:push`/`db:generate`). 추가로 `db/startupMigrate.ts`가 기동 시 멱등 DDL을 실행(예: `pages.html_url`·`pages.ai_problem_id` 컬럼, `problems`·`coaching_attempts`·`coaching_quota`(+(student,page) unique index)·`visualizations`·`videos`·`classroom_videos`·`video_comments`·`classroom_groups`·`whiteboard_*` 테이블, `pages.page_type`/`whiteboard_template` 컬럼 보장).

## 외부 의존성
- **PostgreSQL** (Railway) — `DATABASE_URL`.
- **Google OAuth** — `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
- **JWT** — `JWT_SECRET`, `JWT_REFRESH_SECRET`.
- **파일 스토리지(Volume)** — `VOLUME_PATH` → 없으면 Railway 가 자동 주입하는 `RAILWAY_VOLUME_MOUNT_PATH` → 둘 다 없으면 `./local-storage`(프로덕션에서는 경고 로그 — 컨테이너 내부라 재배포 시 파일 소실). `env.VOLUME_PATH_SOURCE` 가 어느 것이 쓰였는지 알려주고 `/api/admin/storage-info` 에 노출된다. 버킷: `chapter-pages`, `chapter-tools`(HTML 전용), `visualizations`(시각화자료 원본 HTML, HTML 전용), `videos`(영상자료 — 교사 전용, `POST /api/videos/upload` 스트리밍 라우트로만 업로드, `library/` 영상 + `thumbnails/` JPEG), `submission-files`, `problem-bank`(문제은행 이미지), `ai-coaching`(코칭 필기 스냅샷, 학생 업로드 허용), post 첨부 등. `/api/files/*`로 서빙(스트리밍 + Range). HTML 전용 버킷(`chapter-tools`/`visualizations`)은 `text/html`만 허용.
- **앱 도메인** — 프로덕션 `https://class.chois.pro`(구 `class.chois.ai.kr` 에서 이전). HTML 도구 iframe 의 `frame-ancestors` 는 `routes/storage.ts`의 `buildFrameAncestors()`가 **이 도메인 + `APP_URL` + `FRAME_ANCESTORS`(공백 구분, 선택) + localhost:3000** 으로 조립한다. 도메인이 또 바뀌면 `APP_ORIGIN` 상수 또는 Railway 환경변수 `FRAME_ANCESTORS`/`APP_URL`을 갱신할 것(안 하면 시각화자료 iframe 이 CSP 에 막혀 빈 화면이 된다).
- **Google Gemini(선택)** — `GEMINI_API_KEY`(@google/genai), `GEMINI_MODEL`(기본 `gemini-2.5-flash`). `services/ai.service.ts`의 OCR(문제/마크스킴)·해설 생성·필기→LaTeX 전환·풀이 검토. 429 처리는 spend-cap / rate-limit / 기타로 세분화하고 서버 로그에 실제 원인 기록. 구조화 출력은 `responseJsonSchema`. 문항 OCR meta(과목·대단원·소단원)는 **2022 개정 교육과정 MAP**(`@mathchois/shared`의 `buildCurriculumPromptBlock`)을 프롬프트에 주입해 **MAP 항목에서만 강제 선택**(subject는 enum). 본문 줄바꿈은 `<br>` 태그 + 함수식만 있는 줄은 `\qquad` 들여쓰기(`MD_LINEBREAK_RULE`). 기준 문서: `docs/curriculum/2022-math-curriculum.md`.
- **SMTP(선택)** — `SMTP_HOST/PORT/USER/PASS/FROM`(비밀번호 초기화 메일). `APP_URL`(메일 링크).
- **PORT**(기본 3001), **NODE_ENV**.
- **클라이언트 env** — `VITE_TOOLS_ORIGIN`(HTML 도구를 서빙할 별도 origin), Vite `VITE_*` 빌드타임 주입.
- **클라이언트 테스트** — Vitest(jsdom 환경), `vitest.config.js`, scripts `test`(vitest run)/`test:watch`. 단위 테스트는 `src/lib/*.test.js`(inputMode, excalidrawHistory, freedrawResample 등). E2E는 Playwright.

## 주의사항 / 특이 패턴
- **루트 `CLAUDE.md`는 현재 스택 기준으로 최신**(모노레포/Fastify/Drizzle). 구조 상세는 이 PROJECT_MAP 참조.
- **HTML 도구 위 펜 필기 오버레이**(`feat/html-page-annotation`): iframe 위에 투명 Excalidraw를 겹쳐 그 위에 필기한다. 공통 컴포넌트 `components/study/HtmlToolOverlay.jsx`(+ `lib/htmlOverlay.js`: pointer-events 라우팅 + `HTML_OVERLAY_LOCK_BASE`). `drawing` 플래그로 **도구 조작↔필기** 전환(OFF=오버레이 click-through로 iframe 조작, ON=오버레이가 입력 장악·iframe 정지·`viewModeEnabled=false`). iframe은 DOM 고정이라 캔버스 pan/zoom 시 필기만 어긋나므로 **뷰포트를 zoom1/scroll0로 상시 고정**(각 뷰어가 `lockActiveRef = screenLocked || htmlUrl`를 `useExcalidrawTouch`의 `screenLockedRef` 자리로 전달 + onChange 복원). 배경 element 없음(`bgPosition` 미사용). 저장·실시간·교사코멘트는 기존 notes/comments 그대로. 적용 뷰어: ① StudyViewer(`drawMode`), ② TeacherStudyViewer(HTML 전용 `htmlDrawMode` 토글 신설), ③ StudentWorkViewer(`commentMode` 재사용). **PDF 내보내기는 HTML에서 비활성**(live iframe 래스터화 불가). ④⑤(과제)는 `assignment_pages`에 `html_url`이 없어 미지원. `DrawingToolbar`는 `htmlMode` prop로 이미지 전용(이미지 이동) 버튼을 숨김. `HtmlToolOverlay`는 선택적 `wetInkOverlayRef` prop으로 HTML 도구 Excalidraw 위에 웻잉크 프리뷰 캔버스를 렌더한다(위 웻잉크 항목). `DrawingToolbar`는 선택적 `onActiveToolChange(tool)` 콜백으로 논리적 펜 도구를 뷰어에 알린다(삼각형 모드도 Excalidraw 'freedraw'를 쓰므로 구분 필요).
- **HTML 도구 페이지는 앱과 다른 origin에서 서빙**해야 함:
  - iframe에 `sandbox`+same-origin이면 opaque origin(`'null'`)이 되어 도구 내부 postMessage / blob worker(수식 입력 등)가 깨진다. 그래서 same-origin sandbox 대신 **별도 origin**(`VITE_TOOLS_ORIGIN`, `lib/toolUrl.js`)으로 띄운다.
  - 서버는 `text/html` 응답에 `Content-Security-Policy: frame-ancestors`(앱 origin만 허용)를 설정하고, helmet이 raw 응답에 직접 박은 `X-Frame-Options`/`Origin-Agent-Cluster`를 `reply.raw.removeHeader`로 제거한다(일반 `reply.removeHeader`로는 안 지워짐). 단 이 iframe 프레이밍 특수처리는 **HTML 도구 버킷(`chapter-tools`/`visualizations`)에만** 적용한다(학생 제출 `.html`이 도구처럼 프레임되지 않도록). `storage.ts` `GET /api/files/*` 참조.
- **과제 제출 첨부(`submission-files`)는 모든 파일 형식 허용**: 학생 업로드 MIME 화이트리스트(`STUDENT_ALLOWED_MIMES`, 이미지+PDF)는 `submission-files` 버킷에만 우회(`ai-coaching`은 여전히 이미지/PDF만). 대신 임의 형식을 앱 origin에서 인라인 렌더하면 HTML/SVG 등이 XSS가 될 수 있어, **서빙 시 `submission-files`의 비(非)래스터이미지 파일은 강제 다운로드**(`Content-Disposition: attachment`) + 항상 `X-Content-Type-Options: nosniff`. 안전한 래스터 이미지(png/jpeg/gif/webp)만 인라인 유지(첨부 썸네일용). 클라이언트는 `FileAttachmentPanel`의 input `accept` 제거로 모든 파일 선택 가능, 교사는 기존 `?download=true` 링크로 다운로드. `storage.ts` 참조.
- **전체화면 뷰어**(StudyViewer/TeacherStudyViewer/StudentWorkViewer/Assignment* )는 의도적으로 `DashboardLayout` 밖에 둔다(필기 몰입 + S Pen).
- **펜/지우개 입력** 커스텀 처리: `hooks/useExcalidrawTouch.js`(입력 모드 게이트 + 핀치줌/팬 + **1손가락 팬**), `hooks/useScribbleErase.js`(문지르기 지우개), S Pen 배럴버튼 지우개. 아래 입력 모드/리스너 항목 참조.
- **입력 모드(스타일러스 ↔ 손가락)** 로 손바닥 연결선(phantom line)을 원천 차단(`lib/inputMode.js`). 기존 휴리스틱 팜 리젝션(크기 임계값·pen-session-lock·warmup)은 전부 제거됨. 비자명한 설계 결정:
  - 입력 모드는 **전역 localStorage(`mc_input_mode`, 기본 `'stylus'`)로 모든 뷰어가 공유**한다. 한 뷰어에서 토글하면 다른 뷰어에도 즉시 반영. `DrawingToolbar`의 손가락 토글(lucide `Pointer`)이 이 스토어를 구독.
  - 차단 리스너는 **`window` 캡처**에 부착한다. React 19가 이벤트를 앱 루트(`#root`)에 위임하는데, `#root`가 container 상위라 container 캡처는 React가 Excalidraw 핸들러를 디스패치한 뒤에 실행되어 `stopPropagation`이 늦다. `window` 캡처는 `#root`보다 먼저 실행되어 실제로 차단된다.
  - `useExcalidrawTouch`의 `window` 리스너는 container 마운트와 무관하게 **즉시** 부착하고, container 의존 설정(`touchAction`/gesture/contextmenu)만 **`requestAnimationFrame`으로 container 마운트까지 대기**한다. 뷰어가 로딩 스피너를 먼저 렌더하는 동안 마운트되면 `containerRef.current`가 null이라, 과거처럼 container 기준으로 부착하면 영영 등록되지 않던 버그를 피한다.
  - 스타일러스 모드에서 새어든 획은 pointerup 후 **~80ms 지연 백스톱**으로 히스토리 오염 없이 제거(`commitToHistory: false`).
  - **1손가락 팬**: 스타일러스 모드에서 그리기가 차단되는 1손가락 터치를 죽이지 않고 캔버스 좌우/상하 팬으로 쓴다(잠금/HTML 오버레이는 제외 — 뷰포트 고정). 이미지·AI코칭 페이지에 적용. **펜 우선**: 일부 기기(S Pen)는 펜 입력이 pointer(그리기) + touch 를 동시에 발생시키므로, `penDownRef`(`pointerType==='pen'`)가 켜진 동안엔 손가락 팬/줌을 전부 무시한다(펜=그리기, 손가락=이동). 팜 리젝션도 펜이 닿은 동안 유지.
  - **줌/팬 성능**: 핀치줌·1손가락 팬의 `updateScene` 는 `requestAnimationFrame` 으로 코얼레싱(프레임당 1회). 누적 뷰포트는 훅 내부 `viewportRef` 가 단일 출처. 훅이 노출하는 `isGesturingRef` 가 제스처 중임을 알려, 6개 뷰어 onChange 가 penMode 가드 직후 early-return 해 무거운 저장/지우개/히스토리/직렬화 파이프라인을 건너뛴다. (과거: touchmove 마다 updateScene 2회 + 전체 element `JSON.stringify` → 메인 스레드 포화로 줌이 끊기고 Socket.IO 하트비트가 굶어 접속 끊김.)
- **자체 undo/redo**(`hooks/useExcalidrawUndo.js` + `lib/excalidrawHistory.js`): Excalidraw 0.18이 undo/redo API/키보드를 노출하지 않아 씬 스냅샷 스택으로 구현. onChange 끝에서 350ms debounce 후 확정 상태 기록, Ctrl+Z / Ctrl+Shift+Z(또는 Ctrl+Y) 키바인딩. DrawingToolbar의 `onUndo/onRedo/canUndo/canRedo` prop.
- **웻잉크(wet-ink) 펜 렌더링**(`feat`, `hooks/useWetInk.js` + `lib/wetInkStroke.js`): 펜 자유그리기의 라이브 획을 Excalidraw 대신 직접 렌더해 지연을 없앤다.
  - `useWetInk`는 펜 자유그리기를 **window 캡처**에서 가로채(`stopPropagation`으로 Excalidraw가 끊기는 라이브 획을 안 그리게 함; `useExcalidrawTouch`와 공존), 진행 중인 획을 가벼운 `<canvas>`에 펜 전속도로 렌더하고, pointerup에서 freedraw element를 commit한다(`updateScene` → 기존 저장/동기화/undo 경로). 기본 ON. `?wetink=0`이 **기기별 비상 kill switch**(`?wetink=1` 재활성, localStorage `mc_wetink_off`).
  - `lib/wetInkStroke.js` — **인라인 perfect-freehand 1.2.0**(Excalidraw가 번들하는 동일 버전) + `buildStrokePath`(프리뷰 외곽선) + `makeFreedrawElement`(수동 freedraw element 생성 — `convertToExcalidrawElements`는 freedraw 미지원). `PF_BASE` 옵션은 **Vite transform 값과 반드시 일치**해야 한다.
  - **Vite 빌드타임 transform**(`vite.config.js`의 `excalidrawPenTweak` 플러그인): Excalidraw 0.18의 `getFreeDrawSvgPath` 안에 **하드코딩된 freedraw 옵션**을 빌드 시 치환한다(API 미노출). `packages/server/Dockerfile`이 `npm ci --ignore-scripts`(postinstall 미실행)라 **patch-package 대신** 이 방식을 쓴다. 현재 값: simulatePressure false, thinning .2, smoothing .5, streamline .62, linear easing, taper 0 + rounded cap.
  - **⚠️ GOTCHA**: transform 정규식이 Excalidraw 원본 하드코딩 옵션에 앵커되어 있어 **Excalidraw 업그레이드 시 override가 조용히 무력화될 수 있다**(빌드는 경고만 출력). `vite.config.js`와 `wetInkStroke.js`의 `PF_BASE`를 항상 동기 유지할 것.
  - 파라미터 튜닝: `tools/pen-playground.html`(태블릿에서 펜 감을 잡는 standalone perfect-freehand 튜너).
- **실험 펜 토글**(`lib/penToggles.js`, localStorage `mc_pen_toggles`): freedraw 리샘플링/스무딩(`useFreedrawSmoothing`, `lib/freedrawResample.js`)·진단 등을 토글 게이트로 켠다(기본 off). 진단 오버레이는 `?penlog=1`로도 활성화.
- **DrawingToolbar 에서 영역 삭제(가위, `eraser_area`, `Scissors`) 및 `handleDeleteSelected` 제거됨.** 지우개는 획 단위(`eraser`)와 전체 지우기(`Trash2`)만 남음.
- **문제은행 & AI OCR**(`feat/problem-bank-ocr`): 교사가 문제 이미지를 업로드하면 Gemini OCR로 `problemLatex`/그림 슬롯(`[FIGURE:n]`)을 추출하고, 마크스킴 OCR·AI 해설 생성을 거쳐 `problems` 테이블에 저장한다.
  - 클라 흐름: `ProblemsPage`(탭) → `ProblemRegister`(업로드→OCR→그림슬롯→정답·해설→저장, 편집에도 재사용) / `RegisteredProblems`(필터·표·상세·수정/삭제). 검색·페이지네이션·facet은 **서버사이드**(`problem.service.ts`의 `listProblems`/`getFacets`).
  - 렌더: `components/common/ProblemView.jsx`(Markdown+KaTeX+그림). `[FIGURE:n]` 파싱은 `lib/problemContent.js`(+test). #3~#5 뷰어 재사용 예정.
  - 공유 타입: `shared/src/types/problem.ts`(Problem, ProblemFigure, OcrProblemResult, SolutionResult, ProblemListResult, ProblemFacets, SolutionSource).
- **AI 수학 코칭(`feat/ai-coaching-page`)**: 위 "AI 수학 코칭 페이지" 섹션 참조. **정답·해설을 학생 클라이언트로 절대 보내지 않는 것**이 핵심 불변식 — 학생은 `GET /api/problems/:id/for-coaching`(표시필드만)만 받고, 정답 대조는 서버 `reviewSolution`에서만 수행한다. 코칭 시도는 `coaching_attempts`에 불변 누적.
  - 공유 타입: `shared/src/types/coaching.ts`(CoachingAttempt, CoachingResult, ConvertResult, CoachingProblemView, ErrorTag, + 기록조회 CoachingAttemptView/CoachingHistoryResult/CoachingHistoryFilters, + 횟수제한 PageAttemptsResult/ReviewResult/CoachingStudentSummary), `models.ts`에 `Page.aiProblemId`.
- **영상자료 라이브러리 + 학급 영상 탭(`feat/video-library`, 설계 `docs/superpowers/specs/2026-10-17-video-library-design.md`)**: 교사가 mp4/webm/mov 영상을 Volume(`videos` 버킷)에 올리고 메타(제목/과목/대단원/소단원/설명)와 함께 **교사 간 공유**한다. 학급 상세 '영상' 탭에서 라이브러리 영상을 **참조로 배정**(`classroom_videos`), 학생은 YouTube 식 시청 화면에서 댓글/대댓글로 질문한다. 비자명한 결정:
  - **업로드는 전용 스트리밍 라우트**(`POST /api/videos/upload`) — 기존 `/api/files/upload`는 파일 전체를 메모리 Buffer 로 모으므로 수 GB 영상에 쓰지 않는다. busboy 한도 초과 시 `file.truncated` 로 감지해 부분 파일을 지우고 413. 서빙(`GET /api/files/*`)은 **스트리밍 + Range(206)** 로 바꿨다(없으면 `<video>` 탐색·배속 불가). Fastify 자동 HEAD 는 payload 가 undefined 면 Content-Length 를 0 으로 덮어쓰므로 **빈 Readable** 을 보낸다.
  - **삭제 차단**: 학급에 배정된 라이브러리 영상은 `DELETE /api/videos/:id` 가 409(+usage)를 반환(FK `restrict`). 배정 해제 후 삭제. drizzle 0.44+ 는 DB 오류를 `DrizzleQueryError` 로 감싸므로 unique 위반 판정은 `err.cause?.code === '23505'` 도 본다.
  - **"교사만 확인"(isPrivate)** 은 루트 댓글에만, 학생만 설정. 대댓글은 루트의 공개 범위를 **상속**(요청 값 무시), 타인의 비공개 스레드에 답글 403, 대댓글의 대댓글 400. 학생 조회는 공개 + 본인 비공개 스레드만 — 필터링은 **서버 조회에서만** 하므로 socket 이벤트(`video-comment:changed`)에는 본문을 싣지 않고 클라이언트가 재조회한다. 댓글 권한: 본인 수정/삭제 + 교실 소유 교사는 모두 삭제.
  - **v2 후속(2026-10-17, subagent 병렬 구현)**: 학생 시청 기록(`video_progress`, `VideoPlayer` `onProgress` 10초 스로틀 + `initialPosition` 이 localStorage 이어보기보다 우선) + 교사 시청 현황 패널/카드 통계; `DELETE /videos/:id?force=1` 배정 해제 후 삭제(`ApiError.body` 로 409 usage 전달); **챕터/과제 페이지에 라이브러리 영상 삽입** — `components/videos/PageVideo.jsx` 의 `PageVideoEmbed`/`PageVideoThumb` 가 YouTube iframe 또는 `VideoPlayer`(뷰어에서는 `hotkeys=false` — 필기 도구 키와 충돌 방지)를 렌더, 편집기 영상 버튼은 "YouTube 링크 / 영상자료에서 선택" 모달(`VideoPickerModal` `selectLabel`), `lib/pageVideoUrl.js` `isLibraryVideoUrl`; 댓글 미읽음 배지(`video_comment_reads`, 시청 화면 `VideoComments.fetchThreads` 가 읽음 처리 후 `refreshSidebar()`, 사이드바/학급 탭/카드 배지). zod 실패는 `app.ts` 에서 400.
  - **플레이어(`components/videos/VideoPlayer.jsx`)**: native `<video>` + 커스텀 컨트롤. ←/→ 설정된 초(10/20/30/60) 이동, ↑/↓ 볼륨, Space/K, M, F, `,`/`.` 배속(0.7~2.5×, 11단계), 0~9 % 이동. 포인터 제스처: 한 번 탭 재생·정지, **더블탭은 오른쪽 절반 앞으로/왼쪽 절반 뒤로**(전체화면 토글 아님 — 태블릿에서 전체화면이 풀리던 문제), **400ms 길게 누른 뒤 드래그 — 첫 이동 방향으로 종류 결정**(`decideGestureAxis`): **좌우 = 스크럽**(`delta = sign·(|dx|/폭)^1.6·길이` 비선형 — 짧게 끌면 미세, 끝까지 끌면 영상 끝; 드래그 중 일시정지·오버레이, 떼면 복귀), **상하 = 누른 위치가 왼쪽 절반이면 밝기 / 오른쪽 절반이면 볼륨**(`verticalGestureKind`, `dragToLevel`: 위로 끌면 증가, 화면 높이 = 전체 범위; 볼륨은 설정에 저장, 밝기는 `<video>` CSS `filter: brightness(0.2~1.5)` 로 플레이어 마운트 동안만 유지). `touch-action: pan-y` 로 평소 세로 스크롤은 유지하되, 제스처 모드 중 touchmove 만 non-passive 리스너로 `preventDefault`. 다운로드 가드: `controlsList=nodownload`, PiP 비활성, contextmenu 차단, `-webkit-touch-callout: none`. 긴 설명·시청 현황은 `CollapsibleSection`(가로선 ▼ 토글, 기본 접힘). 설정은 `localStorage['mc_video_player']`(기기별), 이어보기 위치는 `mc_video_pos:<key>`(v1 은 로컬만 — DB 시청기록은 후속). 키 리스너는 window 에 붙되 input/textarea 포커스 중엔 무시(`isTypingTarget`). `ref` 로 `getCurrentTime/seekTo` 노출(댓글 시각 첨부·이동). 썸네일은 **클라이언트가 캡처**(`captureVideoThumbnail`, 1초 지점 프레임 → JPEG; File 또는 같은 origin 영상 URL 입력) — 서버 ffmpeg 없음. `VideoForm` 의 썸네일은 자동 캡처(등록된 파일 아님으로 표시) / 직접 등록한 이미지(JPEG·PNG·WebP 5MB, `kind=thumbnail`) / 수정 시 기존 유지 중 하나이며, 수정 화면에서는 [썸네일 교체]·[다른 장면으로](기존 영상 URL 재캡처)로 바꾼다. 영상·HTML·썸네일 파일 선택은 공통 `common/FileDropZone`(클릭 → OS 파일창, 드래그 오버 강조, accept/용량 검사).
  - **시청 기록 보고 시점**: 재생 중 10초마다 + 일시정지/종료 + **언마운트(스냅샷 — React 가 ref 를 먼저 떼므로 마지막 관측값으로 보고)** + **`pagehide`/`visibilitychange(hidden)` 에 `keepalive: true`**(앱 전환·창 닫기에도 전송). `PUT /classroom-videos/:id/progress` 는 `videos.durationSec` 이 null 이면 플레이어가 읽은 길이로 **보강**(등록 시 길이 측정 실패한 mov 등 → 시청률 % 가능). 교사 시청 현황 패널은 30초 주기 + 탭 복귀 시 재조회 + 새로고침 버튼, 학급 [영상] 탭은 탭 복귀 시 재조회(학생 시청에는 소켓 이벤트가 없음).
  - **영상 2분할 필기(`feat/video-split-note`, 설계 `docs/superpowers/specs/2026-10-17-video-split-note-design.md`)**: 교사가 학급 [영상] 탭 카드에서 "필기 챕터"(같은 학급 챕터 1개)를 연결하면 학생 영상 상세에 [2분할로 필기하며 보기] 버튼이 생긴다. `ClassroomVideoSplit` 은 `SplitPane` 안에 `VideoPlayer`(`fill`, `fullscreenTargetRef`=분할 루트, `hotkeys`=마지막으로 포인터가 닿은 패널이 영상일 때만) + 임베드 `StudyViewer` 를 둔다. 좌우 바꾸기는 `SplitPane reverse`(CSS `order`) 로 시각 순서만 바꿔 `<video>` 가 리마운트되지 않는다. 비율은 **영상 패널 기준**으로 저장해 좌우를 바꿔도 영상 크기가 유지된다. Fullscreen API 가 없는 iPhone Safari 는 `onPseudoFullscreenChange` 로 CSS(`fixed inset-0`) 폴백. AI 코칭 페이지는 분할 안에서 풀지 않고 안내+전체 화면 링크만 표시(v1 비목표).
- **시각화자료 라이브러리(`feat/visualization-library`)**: 교사가 등록한 standalone HTML을 메타(제목/과목/대단원/소단원/설명)와 함께 저장·검색·**교사 간 공유**. 챕터 편집기 HTML 버튼(`FileCode2`)이 `VisualizationPickerModal`(검색 리스트 + 우상단 [새html등록])을 연다. **삽입은 복사본(독립)** — 서버 `copyHtmlToChapterTools`가 원본을 `chapter-tools`로 복제해 페이지가 자체 복사본을 참조하므로, 원본 교체/삭제가 이미 삽입된 페이지에 영향 없음(새로 삽입하는 페이지부터 교체본 적용). 관리(`/teacher/visualizations`)는 본인 자료만(`mine=1`) — 수정은 **파일 통째 교체 / 단원 / 제목·설명**만(HTML 내부 편집 없음), 삭제는 레코드+원본 파일 제거. 등록+즉시 삽입 흐름은 모달 `onSaved→onSelect`로 처리.
  - 공유 타입: `shared/src/types/visualization.ts`(Visualization, VisualizationListResult, VisualizationFacets, VisualizationFilters). 서버: `routes/visualizations.ts`, `services/visualization.service.ts`, `services/page.service.ts`(`createPage`의 `fromVisualizationId`), `services/storage.service.ts`(`copyHtmlToChapterTools`). 클라: `lib/visualizations.js`(+test).
- **Markdown 렌더(`components/common/Markdown.jsx`)**: `rehypeRaw`로 교사 작성 HTML(`<br>`,`<center>`)을 허용하되 `rehypeSanitize`로 XSS 차단(플러그인 순서: raw→sanitize→katex). `neutralizeIndentedCode`가 **줄 앞 4칸 이상 들여쓰기를 nbsp로 치환**해 Markdown이 코드 블록으로 오인해 수식이 깨지는 문제를 막는다(펜스 ``` 블록은 보존).
- **PWA + SW 자동 업데이트**: `public/manifest.webmanifest` + 최소 Service Worker(`public/sw.js`, **fetch 핸들러 없음** — 네트워크 무간섭 유지), 프로덕션 빌드에서만 등록. 자동 업데이트 구조:
  - `lib/swUpdate.js`의 `setupSwAutoUpdate()`(main.jsx가 PROD에서 호출) — SW 등록(`updateViaCache:'none'`) + **15분 주기 및 visibilitychange(화면 복귀) 시 `registration.update()`** 체크. `controllerchange` 시 자동 리로드하되, 화면이 보이는 동안엔 보류하고 백그라운드 전환 시 적용(필기 중 끊김 방지). 최초 설치는 리로드 제외. `swUpdate.test.js`(Vitest).
  - 배포 감지: `sw.js`에 `__BUILD_VERSION__` 플레이스홀더 → `vite.config.js`의 **`swBuildVersion()` 플러그인**이 closeBundle에서 `dist/sw.js`를 빌드 시각으로 치환 → 배포마다 sw.js 바이트가 바뀌어 브라우저가 SW 업데이트(=새 배포)를 감지.
  - 서버(`app.ts`) 정적 서빙 `setHeaders`: `/assets/` 외 파일(index.html·sw.js·manifest 등)에 `Cache-Control: no-cache` 명시(해시 없는 파일의 stale 캐시 방지).
- **화이트보드 실시간 병합**(`feat/whiteboard`): 다른 필기 페이지의 "알림 → 전체 재조회·통째 저장" 방식을 쓰면 동시 편집에서 서로 덮어쓰므로 **요소 단위**로만 동기화한다. 원격 변경을 `updateScene` 할 때 반드시 `captureUpdate: CaptureUpdateAction.NEVER`(0.18: `commitToHistory` 는 deprecated). 발표 영역 안내선 `__wb_guide__` 는 로컬 전용이라 `withoutGuide()` 로 걸러 보내고, 템플릿 적용은 클라이언트가 요소를 만들어도 **서버 `applyTemplateAtomic` 이 빈 보드일 때만** 넣는다(서버는 Excalidraw 를 import 하지 않는다). `WhiteboardCanvas` 는 `key={boardId}` 리마운트로 보드 전환 시 파일/버전 기록/협업자 상태를 초기화한다. Excalidraw 도형 도구를 고르면 좌측에 속성 패널(x<250px)이 뜨므로 E2E 드래그는 그 오른쪽에서 시작한다.
- **legacy_rails/** — 구버전 Ruby on Rails 앱. **사용하지 않음. 탐색·수정 금지.**
- 프로덕션에서 server가 `client/dist` 정적 서빙 + SPA fallback(`/api/*` 외 → index.html, 민감 경로 차단).

## Claude Code 개발 환경 (로컬 + 클라우드 세션)
- **`.mcp.json`** — 프로젝트 MCP 서버(`playwright`, `chrome-devtools`). `command: node` + `.claude/mcp/launch.mjs <server>`로 띄움 → Windows(`cmd /c` 불필요)·Linux·클라우드 공용. 버전은 launch.mjs에 고정(업그레이드 시 함께 수정).
  클라우드(`CLAUDE_CODE_REMOTE=true`)에서는 headless + `/opt/pw-browsers/chromium` + `--no-sandbox` + `--isolated`를 자동 추가.
- **`.claude/hooks/session-start.sh`** — SessionStart 훅(클라우드 세션 전용): `npm install` → `PW_CHROMIUM_EXECUTABLE` 내보내기(`playwright.config.ts`의 `launchOptions.executablePath`가 사용) → MCP 패키지 npx 캐시 예열.
- **`.claude/skills/`** — 저장소에 커밋된 프로젝트 스킬(클라우드 세션에서도 로드): `using-superpowers`(obra/superpowers), `ui-ux-pro-max`(nextlevelbuilder, `uipro init --ai claude` 산출물, Python 3 검색 스크립트), `web-design-guidelines`(vercel-labs/agent-skills), `frontend-design`(anthropics/skills). 각 폴더에 원본 LICENSE 포함.

## 문서 / 상세 참조
- **`docs/superpowers/e2e-checklist.md`** — 라이브 E2E 점검 가이드(#1 문항등록·#2 문제은행·#3 페이지 코칭·#4 기록 조회·#5 대시보드). 실제 DB + Gemini 환경에서의 수동 검증 절차(사전 env 포함).
- **`.gitignore`** — `*.tsbuildinfo`·`.superpowers/`·`.plans/`·`review.md` 무시(빌드 산출물·작업 노트는 읽지 않음).

---
마지막 업데이트: 2026-10-18 (화이트보드 — 모둠 공유 보드: classroom_groups·whiteboard_* 테이블, pages.page_type, 요소 단위 실시간 병합(socket wb:*), 템플릿 34종, 교사 격자/단일 화면 / 직전: 영상 2분할 필기: classroom_videos.chapter_id·ClassroomVideoSplit·SplitPane·StudyViewer 임베드 모드 / 직전: 영상자료 v2 후속: 시청 기록·force 삭제·챕터 페이지 영상 삽입·미읽음 배지 / 직전: 영상자료 라이브러리 + 학급 영상 탭/댓글, 파일 서빙 스트리밍+Range, 도메인 class.chois.pro 이전)
