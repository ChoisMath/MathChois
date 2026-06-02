# Project Map — MathChois (ChoisClass)

## 개요
- 목적: 교사·학생용 수학 수업 플랫폼. 교재(챕터/페이지) 이미지·영상·HTML 도구 위에 Excalidraw로 필기·코멘트·과제를 주고받는다.
- 스택: **npm workspaces 모노레포** (`mathchois`, root `type: module`, Node >= 22)
  - `packages/server` (`@mathchois/server`) — **Fastify 5** + **Drizzle ORM 0.44** + **PostgreSQL** (`postgres` 드라이버) + **Socket.IO 4** + JWT/Google OAuth + nodemailer. `tsx`(dev) / `tsc`(build).
  - `packages/client` (`@mathchois/client`) — **React 19** + **Vite 7** + **Tailwind 4** + **React Router 7** + **Excalidraw 0.18** + dnd-kit + jspdf + socket.io-client. PWA(Service Worker + manifest).
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
│       │                       #   assignments, notes, comments, admin
│       ├── services/           # *.service.ts (DB 접근 로직)
│       └── socket/             # index.ts + handlers/(notes, comments, assignments, presence)
├── client/                 # @mathchois/client (React SPA)
│   └── src/
│       ├── App.jsx             # 라우팅 정의
│       ├── contexts/AuthContext.jsx
│       ├── components/         # ProtectedRoute, Navbar, study/, assignment/, board/, common/
│       ├── layouts/            # MainLayout(public), DashboardLayout(인증)
│       ├── pages/              # Home, Login, Classrooms, Chapters, Study, Monitor,
│       │                       #   Assignment, Board, Admin 등
│       ├── hooks/              # useExcalidrawTouch, useScribbleErase (S Pen/문지르기 지우개)
│       └── lib/                # api.ts, socket.ts, toolUrl.js, excalidrawUtils, pdfDownloader 등
└── shared/src/types/       # api, auth, excalidraw, models, socket
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

부가 매핑:
- 서버 핸들러: 필기/과제필기 → `routes/notes.ts`, 코멘트(③⑤) → `routes/comments.ts`. 실제 DB 로직은 `services/note.service.ts`에 집중.
- Socket emit: `socket/handlers/notes.ts`(①②), `comments.ts`(③), `assignments.ts`(④⑤).
- 교사 모니터링 진입점: `pages/Monitor/ChapterMonitor.jsx`(챕터별 학생 진도 → StudentWorkViewer로), `pages/Assignment/AssignmentMonitor.jsx`(과제별 제출 → AssignmentWorkViewer로).
- 페이지 배경은 이미지/영상/**HTML 도구** 중 하나 (`pages.html_url`). HTML 도구는 iframe으로 렌더되고 그 위에 필기가 얹힌다.

## 주요 엔드포인트 / 라우트

### 클라이언트 라우트 (App.jsx)
| 경로 | 컴포넌트 | 비고 |
|---|---|---|
| `/auth/callback` | OAuthCallback | 레이아웃 없음 |
| `/`, `/login`(→`/`), `/choose-role`, `/privacy`, `/terms` | Home 등 | MainLayout (public) |
| `/reset-password/:token`, `/verify-email/:token` | ResetPassword, VerifyEmail | public, 레이아웃 없음 |
| `/teacher/classrooms`, `/teacher/classrooms/:id` | ClassroomList, ClassroomDetail | DashboardLayout |
| `/teacher/chapters/:id/edit` | Chapters/Editor | 이미지/영상/HTML 도구 업로드 |
| `/teacher/.../chapters/:chapterId/monitor` | ChapterMonitor | 학생 진도 요약 |
| `/teacher/.../chapters/:chapterId/monitor/:studentId` | **StudentWorkViewer** (③) | 전체화면 |
| `/teacher/.../chapters/:chapterId/study/page/:pageId` | **TeacherStudyViewer** (②) | 전체화면 |
| `/teacher/board`, `/board/new`, `/board/:postId/edit` | TeacherBoard, BoardPostEditor | 게시판 |
| `/teacher/.../assignments/:assignmentId/edit` · `/monitor` | AssignmentEditor, AssignmentMonitor | 과제 |
| `/teacher/.../assignments/:assignmentId/monitor/:studentId` | **AssignmentWorkViewer** (⑤) | 전체화면 |
| `/admin` | AdminPanel | requireAdmin |
| `/student/classrooms`, `/student/classrooms/:id` | ClassroomList, ClassroomDetail | DashboardLayout |
| `/student/study/:chapterId/page/:pageId` | **StudyViewer** (①, ③열람) | 전체화면 |
| `/student/assignments/:assignmentId/page/:pageId` | **AssignmentStudyViewer** (④, ⑤열람) | 전체화면 |

### 서버 API (Fastify, 모두 `/api/*`)
| 그룹 | 파일 | 주요 엔드포인트 |
|---|---|---|
| auth | routes/auth.ts | `GET /auth/google`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`, `GET /profiles/:id` |
| classrooms | routes/classrooms.ts | `GET/POST /classrooms`, `GET /classrooms/:id`, `/:id/members`, 클래스코드 가입 |
| chapters | routes/chapters.ts | `GET /classrooms/:cid/chapters`, `GET/PATCH/DELETE /chapters/:id` |
| pages | routes/pages.ts | `GET /chapters/:chapterId/pages`, `POST` 생성(`htmlUrl` 허용), `DELETE /pages/:id` |
| storage | routes/storage.ts | `POST /files/upload`(+multiple), `GET /files/*`, `DELETE /files/*` |
| posts | routes/posts.ts | `GET /posts`, `GET /classrooms/:cid/posts`, `GET/DELETE /posts/:id` (+파일) |
| assignments | routes/assignments.ts | `GET /classrooms/:cid/assignments`, `GET/DELETE /assignments/:id`, `/:id/pages`, `/:id/submissions` |
| notes | routes/notes.ts | ①② 및 ④ 필기 (위 표 참조) + `student-summary`, `student-notes-for/:studentId` |
| comments | routes/comments.ts | ③⑤ 코멘트 필기 (위 표 참조) |
| admin | routes/admin.ts | `GET /admin/users`, `/teachers-with-students`, `/stats`, 비번 초기화 등 |
| health | app.ts | `GET /api/health` (DB ping) |

## 데이터 모델 (Drizzle 스키마: `packages/server/src/db/schema.ts`)
| 테이블 | 관계 | 비고 |
|---|---|---|
| `profiles` | — | googleId/email unique, role, isAdmin, authMethod(google\|email), passwordHash |
| `classrooms` | teacherId→profiles | classCode unique |
| `classroom_members` | classroomId, studentId | (classroom, student) unique |
| `chapters` | classroomId, sourceChapterId(self) | position, sourceChapterId(복제 출처) |
| `pages` | chapterId | imageUrl / videoUrl / **htmlUrl**(HTML 도구) / position |
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

> 마이그레이션은 Drizzle Kit(`db:push`/`db:generate`). 추가로 `db/startupMigrate.ts`가 기동 시 멱등 DDL을 실행(예: `pages.html_url` 컬럼 보장).

## 외부 의존성
- **PostgreSQL** (Railway) — `DATABASE_URL`.
- **Google OAuth** — `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
- **JWT** — `JWT_SECRET`, `JWT_REFRESH_SECRET`.
- **파일 스토리지(Volume)** — `VOLUME_PATH`(기본 `./local-storage`). 버킷: `chapter-pages`, `chapter-tools`(HTML 전용), `submission-files`, post 첨부 등. `/api/files/*`로 서빙.
- **SMTP(선택)** — `SMTP_HOST/PORT/USER/PASS/FROM`(비밀번호 초기화 메일). `APP_URL`(메일 링크).
- **PORT**(기본 3001), **NODE_ENV**.
- **클라이언트 env** — `VITE_TOOLS_ORIGIN`(HTML 도구를 서빙할 별도 origin), Vite `VITE_*` 빌드타임 주입.

## 주의사항 / 특이 패턴
- **루트 `CLAUDE.md`는 신뢰 금지(outdated/Supabase 기준).** 현 스택은 이 문서 기준.
- **HTML 도구 페이지는 앱과 다른 origin에서 서빙**해야 함:
  - iframe에 `sandbox`+same-origin이면 opaque origin(`'null'`)이 되어 도구 내부 postMessage / blob worker(수식 입력 등)가 깨진다. 그래서 same-origin sandbox 대신 **별도 origin**(`VITE_TOOLS_ORIGIN`, `lib/toolUrl.js`)으로 띄운다.
  - 서버는 `text/html` 응답에 `Content-Security-Policy: frame-ancestors`(앱 origin만 허용)를 설정하고, helmet이 raw 응답에 직접 박은 `X-Frame-Options`/`Origin-Agent-Cluster`를 `reply.raw.removeHeader`로 제거한다(일반 `reply.removeHeader`로는 안 지워짐). `storage.ts` `GET /api/files/*` 참조.
- **전체화면 뷰어**(StudyViewer/TeacherStudyViewer/StudentWorkViewer/Assignment* )는 의도적으로 `DashboardLayout` 밖에 둔다(필기 몰입 + S Pen).
- **펜/지우개 입력** 커스텀 처리: `hooks/useExcalidrawTouch.js`, `hooks/useScribbleErase.js` (S Pen 배럴 버튼, 문지르기 지우개, 팜 리젝션). 민감도 변경 시 이 두 파일.
- **PWA**: `public/manifest.webmanifest` + 최소 Service Worker(fetch 핸들러 없음), 프로덕션 빌드에서만 등록.
- **legacy_rails/** — 구버전 Ruby on Rails 앱. **사용하지 않음. 탐색·수정 금지.**
- 프로덕션에서 server가 `client/dist` 정적 서빙 + SPA fallback(`/api/*` 외 → index.html, 민감 경로 차단).

---
마지막 업데이트: 2026-06-02
