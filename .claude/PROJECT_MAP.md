# Project Map — MathChois (ChoisClass)

## 개요
- 목적: 교사·학생용 수학 수업 플랫폼. 교재(챕터/페이지) 이미지·영상·HTML 도구 위에 Excalidraw로 필기·코멘트·과제를 주고받는다.
- 스택: **npm workspaces 모노레포** (`mathchois`, root `type: module`, Node >= 22)
  - `packages/server` (`@mathchois/server`) — **Fastify 5** + **Drizzle ORM 0.44** + **PostgreSQL** (`postgres` 드라이버) + **Socket.IO 4** + JWT/Google OAuth + nodemailer + **@google/genai**(Gemini OCR). `tsx`(dev) / `tsc`(build).
  - `packages/client` (`@mathchois/client`) — **React 19** + **Vite 7** + **Tailwind 4** + **React Router 7** + **Excalidraw 0.18** + dnd-kit + jspdf + socket.io-client + **katex/react-markdown/remark-math/rehype-katex**(수식·해설 렌더). PWA(Service Worker + manifest).
  - `packages/shared` (`@mathchois/shared`) — 공용 TS 타입(소스 직접 export, 빌드 산출물 아님).
- 배포: **Railway** (Dockerfile 빌드, `packages/server/Dockerfile`, healthcheck `/api/health`). 프로덕션에서 server가 `client/dist`를 정적 서빙 + SPA fallback.
- 인증: Google OAuth + 이메일/비밀번호(bcrypt). JWT access/refresh, 역할 `teacher` | `student`(+ `isAdmin`).

> 루트 `CLAUDE.md`는 **outdated**. "React+Vite+Supabase 단일 앱"이라고 적혀 있으나 실제는 위 모노레포 + 자체 Fastify/Drizzle 백엔드다. Supabase는 더 이상 사용하지 않는다(Storage·RPC·RLS 개념은 자체 구현으로 대체됨). 아래 내용을 신뢰할 것.

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
│       │                       #   assignments, notes, comments, admin, problems, coaching, dashboard
│       ├── services/           # *.service.ts (DB 접근 로직) + ai.service.ts(Gemini), problem.service.ts, coaching.service.ts, dashboard.service.ts
│       └── socket/             # index.ts + handlers/(notes, comments, assignments, presence)
├── client/                 # @mathchois/client (React SPA)
│   └── src/
│       ├── App.jsx             # 라우팅 정의
│       ├── contexts/AuthContext.jsx
│       ├── components/         # ProtectedRoute, Navbar, assignment/, board/, common/(ProblemView, CoachingPanel, SortablePageItem), problems/(ProblemPickerModal), coaching/(CoachingHistoryView), dashboard/(ClassroomDashboard)
│       │   └── study/          # DrawingToolbar, PageNavOverlay, PenDiagnosticsOverlay
│       ├── layouts/            # MainLayout(public), DashboardLayout(인증)
│       ├── pages/              # Home, Login, Classrooms, Chapters, Study, Monitor,
│       │                       #   Assignment, Board, Admin, Problems(문제은행), History(코칭기록) 등
│       ├── hooks/              # useExcalidrawTouch(입력모드 게이트), useExcalidrawUndo(자체 undo/redo),
│       │                       #   useScribbleErase(문지르기 지우개), useFreedrawSmoothing, usePenDiagnostics
│       └── lib/                # api.ts, socket.ts, toolUrl.js, excalidrawUtils, pdfDownloader,
│                               #   inputMode.js, penToggles.js, excalidrawHistory.js,
│                               #   freedrawResample.js, scribbleDetect.js,
│                               #   problemContent.js([FIGURE:n] 파서), problems.js(API),
│                               #   coaching.js(convert/review/attempts/uploadWorkImage/getMyHistory/getStudentHistory),
│                               #   dashboard.js(getClassroomDashboard) (*.test.js = Vitest)
└── shared/src/types/       # api, auth, excalidraw, models, socket, problem, coaching, dashboard
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
- 진단 오버레이(`PenDiagnosticsOverlay` + `usePenDiagnostics`)는 `?penlog=1` 진입 시 활성화, 현재 **StudyViewer 에만** 마운트.

부가 매핑:
- 서버 핸들러: 필기/과제필기 → `routes/notes.ts`, 코멘트(③⑤) → `routes/comments.ts`. 실제 DB 로직은 `services/note.service.ts`에 집중.
- Socket emit: `socket/handlers/notes.ts`(①②), `comments.ts`(③), `assignments.ts`(④⑤).
- 교사 모니터링 진입점: `pages/Monitor/ChapterMonitor.jsx`(챕터별 학생 진도 → StudentWorkViewer로), `pages/Assignment/AssignmentMonitor.jsx`(과제별 제출 → AssignmentWorkViewer로).
- 페이지 배경은 이미지/영상/**HTML 도구** 중 하나 (`pages.html_url`). HTML 도구는 iframe으로 렌더되고 그 위에 필기가 얹힌다.

## AI 수학 코칭 페이지 (#3, `feat/ai-coaching-page`)

`pages.aiProblemId`(→`problems`, set null)가 설정된 페이지는 이미지/영상/HTML 배경이 없는 **AI 코칭 페이지**다.

- 학생 study 라우트(`/student/study/:chapterId/page/:pageId`)의 element는 **`pages/Study/StudyPageRouter.jsx`**(StudyViewer 대체). 페이지가 `aiProblemId`면 `CoachingViewer`, 아니면 `StudyViewer`를 렌더한다.
- **`pages/Study/CoachingViewer.jsx`** — 좌: Excalidraw 풀이(① `student_notes`로 자동저장), 우: 문제·코칭 패널. 2단계 흐름(① 필기→LaTeX 수식 전환 → ② AI 검토), attempt 누적.
- 패널 UI: **`components/common/CoachingPanel.jsx`**(정답 여부/오류태그/개념태그 + 코멘트 Markdown+KaTeX). 교사 에디터의 문제 선택은 **`components/problems/ProblemPickerModal.jsx`**(문제은행 선택 모달).
- 교사: `Chapters/Editor.jsx`에서 [AI 코칭] 페이지 추가 + 문제 선택/변경 + AI 미리보기. `components/common/SortablePageItem.jsx`가 AI 페이지를 Sparkles 썸네일로 표시.
- **보안 패턴: 정답·해설은 학생 클라이언트에 절대 전송하지 않는다.** 학생은 `GET /api/problems/:id/for-coaching`로 표시 필드만 받고, 정답 대조는 **서버 `reviewSolution`에서만** 수행한다. 코칭 시도는 `coaching_attempts`에 불변 누적된다.
- 서버: 라우트 `routes/coaching.ts`, 서비스 `services/coaching.service.ts`(createAttempt/listAttempts + 기록조회 `listStudentHistory`/`listClassroomStudentHistory`), `services/ai.service.ts`(`convertSolutionToLatex` 필기→LaTeX, `reviewSolution` 정답·해설 대조 코칭), `services/problem.service.ts`(`getProblemForCoaching` 표시 필드만), `services/page.service.ts`(createPage가 `aiProblemId` 허용, `updatePage` 추가). 필기 스냅샷은 `ai-coaching` 버킷에 저장.

### AI 코칭 풀이 기록 조회 (#4, `feat/coaching-history`)

읽기 전용 — 스키마 변경 없음. `coaching_attempts`를 `problems`(표시필드만)+`pages`→`chapters` 조인해 기간(from/to) 필터·페이지네이션으로 조회한다. **정답·해설은 select 제외(보안 불변식 유지).**

- 서버: `coaching.service.ts`의 `listStudentHistory(studentId, q)`(본인), `listClassroomStudentHistory(classroomId, studentId, q)`(교사, 해당 클래스 챕터 범위 한정). 라우트는 위 coaching 그룹 표의 history 2개.
- 클라이언트 공용 뷰: `components/coaching/CoachingHistoryView.jsx` — 기간 필터(프리셋 1주/1개월/전체 + 시작·종료 직접지정, 기본 최근 7일) + 카드 리스트 + 인라인 펼침(`ProblemView` 문제·풀이 + `CoachingPanel` + 필기 이미지) + 페이지네이션. `fetchHistory` prop 주입(ref 안정화).
- 학생: `pages/History/MyCoachingHistory.jsx`(`/student/coaching-history`), StudentSidebar "내 풀이 기록"(History 아이콘). 교사: `pages/Monitor/StudentCoachingHistory.jsx`(`/teacher/classrooms/:classroomId/students/:studentId/coaching-history`), `ClassroomDetail.jsx` '학생' 탭 멤버 카드의 [코칭 기록] 버튼으로 진입.
- `components/common/CoachingPanel.jsx`에 `showTeacherNotes` prop(강점 메모 표시) 추가. `lib/coaching.js`에 `getMyHistory`/`getStudentHistory` 추가.

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
| `/teacher/.../chapters/:chapterId/study/page/:pageId` | **TeacherStudyViewer** (②) | 전체화면 |
| `/teacher/board`, `/board/new`, `/board/:postId/edit` | TeacherBoard, BoardPostEditor | 게시판 |
| `/teacher/problems` | Problems/ProblemsPage | 문제은행 (탭: 문항등록/등록된 문항), DashboardLayout |
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
| pages | routes/pages.ts | `GET /chapters/:chapterId/pages`, `POST` 생성(`htmlUrl`/`aiProblemId` 허용), `PATCH /pages/:id`, `DELETE /pages/:id` |
| storage | routes/storage.ts | `POST /files/upload`(+multiple), `GET /files/*`, `DELETE /files/*` |
| posts | routes/posts.ts | `GET /posts`, `GET /classrooms/:cid/posts`, `GET/DELETE /posts/:id` (+파일) |
| assignments | routes/assignments.ts | `GET /classrooms/:cid/assignments`, `GET/DELETE /assignments/:id`, `/:id/pages`, `/:id/submissions` |
| notes | routes/notes.ts | ①② 및 ④ 필기 (위 표 참조) + `student-summary`, `student-notes-for/:studentId` |
| comments | routes/comments.ts | ③⑤ 코멘트 필기 (위 표 참조) |
| admin | routes/admin.ts | `GET /admin/users`, `/teachers-with-students`, `/stats`, 비번 초기화 등 |
| problems | routes/problems.ts | `POST /problems/ocr`, `/problems/markscheme-ocr`, `/problems/generate-solution`(Gemini), `GET /problems`(검색·필터·페이지네이션), `GET /problems/facets`, `GET/POST/PATCH/DELETE /problems/:id`(teacher). `GET /problems/:id/for-coaching`(authenticate, 학생용 — 정답·해설 제외 표시필드만) |
| coaching | routes/coaching.ts | `POST /coaching/convert`(필기→LaTeX), `POST /coaching/review`(서버에서만 정답 대조 후 attempt 생성), `GET /coaching/pages/:pageId/attempts`(authenticate, studentId=req.user.sub). 기록 조회: `GET /coaching/history`(본인, authenticate), `GET /coaching/classrooms/:classroomId/students/:studentId/history`(교사 — requireRole+isClassroomOwner+isClassroomMember, 해당 클래스 챕터 범위 한정). 모두 정답·해설 select 제외 |
| dashboard | routes/dashboard.ts | `GET /dashboard/classrooms/:classroomId`(authenticate + requireRole('teacher') + isClassroomOwner 403). 집계 전용 — 학생×챕터 코칭 정답률·필기 진도 + 반 요약. 정답·해설 select 제외(카운트만) |
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
| `coaching_attempts` | pageId→pages(cascade), problemId→problems(set null), studentId→profiles(cascade) | AI 코칭 시도 **불변 누적**. workImageUrl, solutionLatex, isCorrect, errorTags/conceptTags(jsonb), strengthNotes, weaknessNotes, commentMarkdown, aiModel, createdAt. 인덱스 (studentId,createdAt)/(pageId,studentId)/(problemId) |

> 마이그레이션은 Drizzle Kit(`db:push`/`db:generate`). 추가로 `db/startupMigrate.ts`가 기동 시 멱등 DDL을 실행(예: `pages.html_url`·`pages.ai_problem_id` 컬럼, `problems`·`coaching_attempts` 테이블 보장).

## 외부 의존성
- **PostgreSQL** (Railway) — `DATABASE_URL`.
- **Google OAuth** — `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
- **JWT** — `JWT_SECRET`, `JWT_REFRESH_SECRET`.
- **파일 스토리지(Volume)** — `VOLUME_PATH`(기본 `./local-storage`). 버킷: `chapter-pages`, `chapter-tools`(HTML 전용), `submission-files`, `problem-bank`(문제은행 이미지), `ai-coaching`(코칭 필기 스냅샷, 학생 업로드 허용), post 첨부 등. `/api/files/*`로 서빙.
- **Google Gemini(선택)** — `GEMINI_API_KEY`(@google/genai), `GEMINI_MODEL`(기본 `gemini-2.0-flash`). `services/ai.service.ts`의 OCR(문제/마크스킴)·해설 생성. 구조화 출력은 `responseJsonSchema`.
- **SMTP(선택)** — `SMTP_HOST/PORT/USER/PASS/FROM`(비밀번호 초기화 메일). `APP_URL`(메일 링크).
- **PORT**(기본 3001), **NODE_ENV**.
- **클라이언트 env** — `VITE_TOOLS_ORIGIN`(HTML 도구를 서빙할 별도 origin), Vite `VITE_*` 빌드타임 주입.
- **클라이언트 테스트** — Vitest(jsdom 환경), `vitest.config.js`, scripts `test`(vitest run)/`test:watch`. 단위 테스트는 `src/lib/*.test.js`(inputMode, excalidrawHistory, freedrawResample 등). E2E는 Playwright.

## 주의사항 / 특이 패턴
- **루트 `CLAUDE.md`는 신뢰 금지(outdated/Supabase 기준).** 현 스택은 이 문서 기준.
- **HTML 도구 페이지는 앱과 다른 origin에서 서빙**해야 함:
  - iframe에 `sandbox`+same-origin이면 opaque origin(`'null'`)이 되어 도구 내부 postMessage / blob worker(수식 입력 등)가 깨진다. 그래서 same-origin sandbox 대신 **별도 origin**(`VITE_TOOLS_ORIGIN`, `lib/toolUrl.js`)으로 띄운다.
  - 서버는 `text/html` 응답에 `Content-Security-Policy: frame-ancestors`(앱 origin만 허용)를 설정하고, helmet이 raw 응답에 직접 박은 `X-Frame-Options`/`Origin-Agent-Cluster`를 `reply.raw.removeHeader`로 제거한다(일반 `reply.removeHeader`로는 안 지워짐). `storage.ts` `GET /api/files/*` 참조.
- **전체화면 뷰어**(StudyViewer/TeacherStudyViewer/StudentWorkViewer/Assignment* )는 의도적으로 `DashboardLayout` 밖에 둔다(필기 몰입 + S Pen).
- **펜/지우개 입력** 커스텀 처리: `hooks/useExcalidrawTouch.js`(입력 모드 게이트 + 핀치줌/팬), `hooks/useScribbleErase.js`(문지르기 지우개), S Pen 배럴버튼 지우개. 아래 입력 모드/리스너 항목 참조.
- **입력 모드(스타일러스 ↔ 손가락)** 로 손바닥 연결선(phantom line)을 원천 차단(`lib/inputMode.js`). 기존 휴리스틱 팜 리젝션(크기 임계값·pen-session-lock·warmup)은 전부 제거됨. 비자명한 설계 결정:
  - 입력 모드는 **전역 localStorage(`mc_input_mode`, 기본 `'stylus'`)로 모든 뷰어가 공유**한다. 한 뷰어에서 토글하면 다른 뷰어에도 즉시 반영. `DrawingToolbar`의 손가락 토글(lucide `Pointer`)이 이 스토어를 구독.
  - 차단 리스너는 **`window` 캡처**에 부착한다. React 19가 이벤트를 앱 루트(`#root`)에 위임하는데, `#root`가 container 상위라 container 캡처는 React가 Excalidraw 핸들러를 디스패치한 뒤에 실행되어 `stopPropagation`이 늦다. `window` 캡처는 `#root`보다 먼저 실행되어 실제로 차단된다.
  - `useExcalidrawTouch`의 `window` 리스너는 container 마운트와 무관하게 **즉시** 부착하고, container 의존 설정(`touchAction`/gesture/contextmenu)만 **`requestAnimationFrame`으로 container 마운트까지 대기**한다. 뷰어가 로딩 스피너를 먼저 렌더하는 동안 마운트되면 `containerRef.current`가 null이라, 과거처럼 container 기준으로 부착하면 영영 등록되지 않던 버그를 피한다.
  - 스타일러스 모드에서 새어든 획은 pointerup 후 **~80ms 지연 백스톱**으로 히스토리 오염 없이 제거(`commitToHistory: false`).
- **자체 undo/redo**(`hooks/useExcalidrawUndo.js` + `lib/excalidrawHistory.js`): Excalidraw 0.18이 undo/redo API/키보드를 노출하지 않아 씬 스냅샷 스택으로 구현. onChange 끝에서 350ms debounce 후 확정 상태 기록, Ctrl+Z / Ctrl+Shift+Z(또는 Ctrl+Y) 키바인딩. DrawingToolbar의 `onUndo/onRedo/canUndo/canRedo` prop.
- **실험 펜 토글**(`lib/penToggles.js`, localStorage `mc_pen_toggles`): freedraw 리샘플링/스무딩(`useFreedrawSmoothing`, `lib/freedrawResample.js`)·진단 등을 토글 게이트로 켠다(기본 off). 진단 오버레이는 `?penlog=1`로도 활성화.
- **DrawingToolbar 에서 영역 삭제(가위, `eraser_area`, `Scissors`) 및 `handleDeleteSelected` 제거됨.** 지우개는 획 단위(`eraser`)와 전체 지우기(`Trash2`)만 남음.
- **문제은행 & AI OCR**(`feat/problem-bank-ocr`): 교사가 문제 이미지를 업로드하면 Gemini OCR로 `problemLatex`/그림 슬롯(`[FIGURE:n]`)을 추출하고, 마크스킴 OCR·AI 해설 생성을 거쳐 `problems` 테이블에 저장한다.
  - 클라 흐름: `ProblemsPage`(탭) → `ProblemRegister`(업로드→OCR→그림슬롯→정답·해설→저장, 편집에도 재사용) / `RegisteredProblems`(필터·표·상세·수정/삭제). 검색·페이지네이션·facet은 **서버사이드**(`problem.service.ts`의 `listProblems`/`getFacets`).
  - 렌더: `components/common/ProblemView.jsx`(Markdown+KaTeX+그림). `[FIGURE:n]` 파싱은 `lib/problemContent.js`(+test). #3~#5 뷰어 재사용 예정.
  - 공유 타입: `shared/src/types/problem.ts`(Problem, ProblemFigure, OcrProblemResult, SolutionResult, ProblemListResult, ProblemFacets, SolutionSource).
- **AI 수학 코칭(`feat/ai-coaching-page`)**: 위 "AI 수학 코칭 페이지" 섹션 참조. **정답·해설을 학생 클라이언트로 절대 보내지 않는 것**이 핵심 불변식 — 학생은 `GET /api/problems/:id/for-coaching`(표시필드만)만 받고, 정답 대조는 서버 `reviewSolution`에서만 수행한다. 코칭 시도는 `coaching_attempts`에 불변 누적.
  - 공유 타입: `shared/src/types/coaching.ts`(CoachingAttempt, CoachingResult, ConvertResult, CoachingProblemView, ErrorTag, + 기록조회 CoachingAttemptView/CoachingHistoryResult/CoachingHistoryFilters), `models.ts`에 `Page.aiProblemId`.
- **PWA**: `public/manifest.webmanifest` + 최소 Service Worker(fetch 핸들러 없음), 프로덕션 빌드에서만 등록.
- **legacy_rails/** — 구버전 Ruby on Rails 앱. **사용하지 않음. 탐색·수정 금지.**
- 프로덕션에서 server가 `client/dist` 정적 서빙 + SPA fallback(`/api/*` 외 → index.html, 민감 경로 차단).

---
마지막 업데이트: 2026-06-02
