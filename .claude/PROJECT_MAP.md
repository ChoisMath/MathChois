# Project Map — MathChois (ChoisClass)

## 개요
- 목적: 교사·학생용 수학 수업 플랫폼. 교재(챕터/페이지) 이미지·영상·HTML 도구 위에 Excalidraw로 필기·코멘트·과제를 주고받는다.
- 스택: **npm workspaces 모노레포** (`mathchois`, root `type: module`, Node >= 22)
  - `packages/server` (`@mathchois/server`) — **Fastify 5** + **Drizzle ORM 0.44** + **PostgreSQL** (`postgres` 드라이버) + **Socket.IO 4** + JWT/Google OAuth + nodemailer + **@google/genai**(Gemini OCR). `tsx`(dev) / `tsc`(build).
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
│       │                       #   assignments, notes, comments, admin, problems, coaching, dashboard, visualizations
│       ├── services/           # *.service.ts (DB 접근 로직) + ai.service.ts(Gemini), problem.service.ts, coaching.service.ts, dashboard.service.ts, visualization.service.ts
│       └── socket/             # index.ts + handlers/(notes, comments, assignments, presence)
├── client/                 # @mathchois/client (React SPA)
│   └── src/
│       ├── App.jsx             # 라우팅 정의
│       ├── contexts/AuthContext.jsx
│       ├── components/         # ProtectedRoute, Navbar, assignment/, board/, common/(ProblemView, CoachingPanel, SortablePageItem), problems/(ProblemPickerModal), coaching/(CoachingHistoryView, AttemptStack), dashboard/(ClassroomDashboard), visualizations/(VisualizationForm, VisualizationPickerModal)
│       │   └── study/          # DrawingToolbar, PageNavOverlay, PenDiagnosticsOverlay, HtmlToolOverlay
│       ├── layouts/            # MainLayout(public), DashboardLayout(인증)
│       ├── pages/              # Home, Login, Classrooms, Chapters, Study, Monitor,
│       │                       #   Assignment, Board, Admin, Problems(문제은행), Visualizations(시각화자료), History(코칭기록) 등
│       ├── hooks/              # useExcalidrawTouch(입력모드 게이트), useExcalidrawUndo(자체 undo/redo),
│       │                       #   useScribbleErase(문지르기 지우개), useFreedrawSmoothing, usePenDiagnostics,
│       │                       #   useWetInk(웻잉크 오버레이 — 펜 라이브 렌더)
│       └── lib/                # api.ts, socket.ts, toolUrl.js, excalidrawUtils, pdfDownloader,
│                               #   inputMode.js, penToggles.js, excalidrawHistory.js,
│                               #   wetInkStroke.js(인라인 perfect-freehand + freedraw element 생성),
│                               #   freedrawResample.js, scribbleDetect.js,
│                               #   problemContent.js([FIGURE:n] 파서), problems.js(API),
│                               #   coaching.js(convert/review/attempts/uploadWorkImage/getMyHistory/getStudentHistory/resetStudentQuota/getPageStudents),
│                               #   dashboard.js(getClassroomDashboard),
│                               #   visualizations.js(list/facets/CRUD/upload + buildVisualizationQuery),
│                               #   swUpdate.js(PWA SW 자동 업데이트 — setupSwAutoUpdate),
│                               #   linkify.js(게시판 본문 plain text의 URL → 자동 하이퍼링크 세그먼트) (*.test.js = Vitest)
└── shared/src/
    ├── types/             # api, auth, excalidraw, models, socket, problem, coaching, dashboard, visualization
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
| `/teacher/.../chapters/:chapterId/study/page/:pageId` | **TeacherStudyPageRouter** → TeacherStudyViewer(②) 또는 TeacherCoachingReview(AI 코칭) | 전체화면 |
| `/teacher/board`, `/board/new`, `/board/:postId/edit` | TeacherBoard, BoardPostEditor | 게시판 |
| `/teacher/problems` | Problems/ProblemsPage | 문제은행 (탭: 문항등록/등록된 문항), DashboardLayout |
| `/teacher/visualizations` | Visualizations/VisualizationsPage | 시각화자료 라이브러리 관리(본인 자료 mine=1, 등록/수정/삭제/미리보기), DashboardLayout |
| `/teacher/.../assignments/:assignmentId/edit` · `/monitor` | AssignmentEditor, AssignmentMonitor | 과제 |
| `/teacher/.../assignments/:assignmentId/monitor/:studentId` | **AssignmentWorkViewer** (⑤) | 전체화면 |
| `/teacher/classrooms/:classroomId/students/:studentId/coaching-history` | Monitor/StudentCoachingHistory | DashboardLayout, 교사가 학생 AI 코칭 풀이 기록 조회 |
| `/admin` | AdminPanel | requireAdmin |
| `/student/classrooms`, `/student/classrooms/:id` | ClassroomList, ClassroomDetail | DashboardLayout |
| `/student/study/:chapterId/page/:pageId` | **StudyPageRouter** → StudyViewer(①, ③열람) 또는 CoachingViewer(AI 코칭) | 전체화면 |
| `/student/assignments/:assignmentId/page/:pageId` | **AssignmentStudyViewer** (④, ⑤열람) | 전체화면 |
| `/student/coaching-history` | History/MyCoachingHistory | DashboardLayout, 본인 AI 코칭 풀이 기록 (StudentSidebar "내 풀이 기록") |

### 서버 API (Fastify, 모두 `/api/*`)
| 그룹 | 파일 | 주요 엔드포인트 |
|---|---|---|
| auth | routes/auth.ts | `GET /auth/google`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`, `GET /profiles/:id` |
| classrooms | routes/classrooms.ts | `GET/POST /classrooms`, `GET /classrooms/:id`, `/:id/members`, 클래스코드 가입 |
| chapters | routes/chapters.ts | `GET /classrooms/:cid/chapters`, `GET/PATCH/DELETE /chapters/:id` |
| pages | routes/pages.ts | `GET /chapters/:chapterId/pages`, `POST` 생성(`htmlUrl`/`aiProblemId`/**`fromVisualizationId`**(시각화자료 복제 삽입) 허용), `PATCH /pages/:id`, `DELETE /pages/:id` |
| storage | routes/storage.ts | `POST /files/upload`(+multiple), `GET /files/*`, `DELETE /files/*` |
| posts | routes/posts.ts | `GET /posts`, `GET /classrooms/:cid/posts`, `GET/DELETE /posts/:id` (+파일) |
| assignments | routes/assignments.ts | `GET /classrooms/:cid/assignments`, `GET/DELETE /assignments/:id`, `/:id/pages`, `/:id/submissions` |
| notes | routes/notes.ts | ①② 및 ④ 필기 (위 표 참조) + `student-summary`, `student-notes-for/:studentId` |
| comments | routes/comments.ts | ③⑤ 코멘트 필기 (위 표 참조) |
| admin | routes/admin.ts | `GET /admin/users`, `/teachers-with-students`, `/stats`, 비번 초기화 등 |
| problems | routes/problems.ts | `POST /problems/ocr`, `/problems/markscheme-ocr`, `/problems/generate-solution`(Gemini), `GET /problems`(검색·필터·페이지네이션), `GET /problems/facets`, `GET/POST/PATCH/DELETE /problems/:id`(teacher). `GET /problems/:id/for-coaching`(authenticate, 학생용 — 정답·해설 제외 표시필드만) |
| coaching | routes/coaching.ts | `POST /coaching/convert`(필기→LaTeX, body `pageId`, 한도 초과 429), `POST /coaching/review`(서버에서만 정답 대조 후 attempt 생성, 한도 초과 429 → `{attempt,used,limit,resetAt}`), `GET /coaching/pages/:pageId/attempts`(본인 → `{attempts,used,limit,resetAt}`), `GET /coaching/classrooms/:classroomId/students/:studentId/pages/:pageId/attempts`(교사). 횟수 제한/리셋: `POST /coaching/classrooms/:classroomId/students/:studentId/pages/:pageId/reset`(교사 owner+member — 리셋, 기록 보존), `GET /coaching/classrooms/:classroomId/pages/:pageId/students`(교사 owner — 시도 학생 목록+횟수). 기록 조회: `GET /coaching/history`(본인, authenticate), `GET /coaching/classrooms/:classroomId/students/:studentId/history`(교사 — requireRole+isClassroomOwner+isClassroomMember, 해당 클래스 챕터 범위 한정). 모두 정답·해설 select 제외 |
| dashboard | routes/dashboard.ts | `GET /dashboard/classrooms/:classroomId`(authenticate + requireRole('teacher') + isClassroomOwner 403). 집계 전용 — 학생×챕터 코칭 정답률·필기 진도 + 반 요약. 정답·해설 select 제외(카운트만) |
| visualizations | routes/visualizations.ts | `GET /visualizations`(목록 — 텍스트 q + subject/major/minorUnit 필터 + 페이지네이션, 기본 전체 공유, `mine=1`이면 본인 것만), `GET /visualizations/facets`, `GET/:id`, `POST`(등록), `PATCH/:id`·`DELETE/:id`(소유자 403 가드 — 삭제 시 원본 파일도 제거). 모두 teacher |
| health | app.ts | `GET /api/health` (DB ping) |

## 데이터 모델 (Drizzle 스키마: `packages/server/src/db/schema.ts`)
| 테이블 | 관계 | 비고 |
|---|---|---|
| `profiles` | — | googleId/email unique, role, isAdmin, authMethod(google\|email), passwordHash |
| `classrooms` | teacherId→profiles | classCode unique |
| `classroom_members` | classroomId, studentId | (classroom, student) unique |
| `chapters` | classroomId, sourceChapterId(self) | position, sourceChapterId(복제 출처) |
| `pages` | chapterId, aiProblemId→problems(set null) | imageUrl / videoUrl / **htmlUrl**(HTML 도구) / position. `aiProblemId` 설정 시 배경 없는 AI 코칭 페이지 |
| `student_notes` ① | studentId, pageId | (student, page) unique, excalidrawData |
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

> 마이그레이션은 Drizzle Kit(`db:push`/`db:generate`). 추가로 `db/startupMigrate.ts`가 기동 시 멱등 DDL을 실행(예: `pages.html_url`·`pages.ai_problem_id` 컬럼, `problems`·`coaching_attempts`·`coaching_quota`(+(student,page) unique index) 테이블 보장).

## 외부 의존성
- **PostgreSQL** (Railway) — `DATABASE_URL`.
- **Google OAuth** — `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
- **JWT** — `JWT_SECRET`, `JWT_REFRESH_SECRET`.
- **파일 스토리지(Volume)** — `VOLUME_PATH`(기본 `./local-storage`). 버킷: `chapter-pages`, `chapter-tools`(HTML 전용), `visualizations`(시각화자료 원본 HTML, HTML 전용), `submission-files`, `problem-bank`(문제은행 이미지), `ai-coaching`(코칭 필기 스냅샷, 학생 업로드 허용), post 첨부 등. `/api/files/*`로 서빙. HTML 전용 버킷(`chapter-tools`/`visualizations`)은 `text/html`만 허용.
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
  - 서버는 `text/html` 응답에 `Content-Security-Policy: frame-ancestors`(앱 origin만 허용)를 설정하고, helmet이 raw 응답에 직접 박은 `X-Frame-Options`/`Origin-Agent-Cluster`를 `reply.raw.removeHeader`로 제거한다(일반 `reply.removeHeader`로는 안 지워짐). `storage.ts` `GET /api/files/*` 참조.
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
- **시각화자료 라이브러리(`feat/visualization-library`)**: 교사가 등록한 standalone HTML을 메타(제목/과목/대단원/소단원/설명)와 함께 저장·검색·**교사 간 공유**. 챕터 편집기 HTML 버튼(`FileCode2`)이 `VisualizationPickerModal`(검색 리스트 + 우상단 [새html등록])을 연다. **삽입은 복사본(독립)** — 서버 `copyHtmlToChapterTools`가 원본을 `chapter-tools`로 복제해 페이지가 자체 복사본을 참조하므로, 원본 교체/삭제가 이미 삽입된 페이지에 영향 없음(새로 삽입하는 페이지부터 교체본 적용). 관리(`/teacher/visualizations`)는 본인 자료만(`mine=1`) — 수정은 **파일 통째 교체 / 단원 / 제목·설명**만(HTML 내부 편집 없음), 삭제는 레코드+원본 파일 제거. 등록+즉시 삽입 흐름은 모달 `onSaved→onSelect`로 처리.
  - 공유 타입: `shared/src/types/visualization.ts`(Visualization, VisualizationListResult, VisualizationFacets, VisualizationFilters). 서버: `routes/visualizations.ts`, `services/visualization.service.ts`, `services/page.service.ts`(`createPage`의 `fromVisualizationId`), `services/storage.service.ts`(`copyHtmlToChapterTools`). 클라: `lib/visualizations.js`(+test).
- **Markdown 렌더(`components/common/Markdown.jsx`)**: `rehypeRaw`로 교사 작성 HTML(`<br>`,`<center>`)을 허용하되 `rehypeSanitize`로 XSS 차단(플러그인 순서: raw→sanitize→katex). `neutralizeIndentedCode`가 **줄 앞 4칸 이상 들여쓰기를 nbsp로 치환**해 Markdown이 코드 블록으로 오인해 수식이 깨지는 문제를 막는다(펜스 ``` 블록은 보존).
- **PWA + SW 자동 업데이트**: `public/manifest.webmanifest` + 최소 Service Worker(`public/sw.js`, **fetch 핸들러 없음** — 네트워크 무간섭 유지), 프로덕션 빌드에서만 등록. 자동 업데이트 구조:
  - `lib/swUpdate.js`의 `setupSwAutoUpdate()`(main.jsx가 PROD에서 호출) — SW 등록(`updateViaCache:'none'`) + **15분 주기 및 visibilitychange(화면 복귀) 시 `registration.update()`** 체크. `controllerchange` 시 자동 리로드하되, 화면이 보이는 동안엔 보류하고 백그라운드 전환 시 적용(필기 중 끊김 방지). 최초 설치는 리로드 제외. `swUpdate.test.js`(Vitest).
  - 배포 감지: `sw.js`에 `__BUILD_VERSION__` 플레이스홀더 → `vite.config.js`의 **`swBuildVersion()` 플러그인**이 closeBundle에서 `dist/sw.js`를 빌드 시각으로 치환 → 배포마다 sw.js 바이트가 바뀌어 브라우저가 SW 업데이트(=새 배포)를 감지.
  - 서버(`app.ts`) 정적 서빙 `setHeaders`: `/assets/` 외 파일(index.html·sw.js·manifest 등)에 `Cache-Control: no-cache` 명시(해시 없는 파일의 stale 캐시 방지).
- **legacy_rails/** — 구버전 Ruby on Rails 앱. **사용하지 않음. 탐색·수정 금지.**
- 프로덕션에서 server가 `client/dist` 정적 서빙 + SPA fallback(`/api/*` 외 → index.html, 민감 경로 차단).

## 문서 / 상세 참조
- **`docs/superpowers/e2e-checklist.md`** — 라이브 E2E 점검 가이드(#1 문항등록·#2 문제은행·#3 페이지 코칭·#4 기록 조회·#5 대시보드). 실제 DB + Gemini 환경에서의 수동 검증 절차(사전 env 포함).
- **`.gitignore`** — `*.tsbuildinfo`·`.superpowers/`·`.plans/`·`review.md` 무시(빌드 산출물·작업 노트는 읽지 않음).

---
마지막 업데이트: 2026-06-11 (PWA 자동 업데이트 — swUpdate.js + vite swBuildVersion 플러그인 + 정적 서빙 no-cache 헤더 / 직전: 웻잉크 펜 렌더링 useWetInk/wetInkStroke + excalidrawPenTweak)
