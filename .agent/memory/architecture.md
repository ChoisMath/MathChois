# MathChois 아키텍처 상세

## 전체 파일 구조

```
E:\Projects\MathChois\
├── src/
│   ├── main.jsx                    # ReactDOM.createRoot → App
│   ├── App.jsx                     # ErrorBoundary + AuthProvider + BrowserRouter + Routes
│   ├── index.css                   # 글로벌 스타일 (Tailwind)
│   ├── lib/
│   │   ├── supabase.js             # createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
│   │   └── excalidrawUtils.js      # BG_ELEMENT_ID, GRID_STYLE 등 공유 상수/함수
│   ├── contexts/
│   │   └── AuthContext.jsx         # AuthProvider, useAuth hook
│   ├── components/
│   │   ├── Navbar.jsx              # 상단 네비 (로고, 유저명, 아바타, 로그아웃)
│   │   ├── ProtectedRoute.jsx      # 역할별 라우트 가드
│   │   └── study/
│   │       └── DrawingToolbar.jsx  # StudyViewer/AssignmentViewer 공용 필기구 툴바 UI
│   ├── layouts/
│   │   ├── MainLayout.jsx          # 공개 페이지 (Navbar + Outlet)
│   │   └── DashboardLayout.jsx     # 인증된 페이지 (Navbar + 사이드바 + Outlet)
│   └── pages/
│       ├── Home.jsx                # 랜딩 페이지 (Google OAuth 버튼)
│       ├── Login.jsx               # 로그인 페이지
│       ├── ChooseRole.jsx          # 역할 선택 (teacher/student)
│       ├── TeacherDashboard.jsx    # 교사 대시보드
│       ├── StudentDashboard.jsx    # 학생 대시보드 (참여 클래스룸 + 코드 입력)
│       ├── Classrooms/             # 클래스룸 목록 및 상세
│       ├── Chapters/               # 챕터 관리 및 에디터
│       ├── Study/                  # 일반 학습(StudyViewer) 관련
│       ├── Monitor/                # 교사 현황 모니터링
│       ├── Board/                  # ★ Phase 5 신규: 교사 게시판 (TeacherBoard, BoardPostEditor)
│       └── Assignment/             # ★ Phase 5 신규: 과제 시스템 (AssignmentEditor, AssignmentMonitor, AssignmentStudyViewer 등)
├── tests/
│   ├── example.spec.ts             # Playwright 예제
│   └── navigation.spec.js          # MathChois 네비게이션 테스트
├── .agent/
│   └── memory/                     # ★ 새롭게 정의된 프로젝트 로컬 상세 문서 폴더
│       ├── architecture.md         # 이 파일
│       ├── supabase-schema.md      # DB 스키마, RLS, RPC, Storage
│       └── studyviewer-details.md  # Excalidraw 통합 상세
├── GEMINI.md                       # Gemini 인공지능 에이전트 정적 아키텍처 가이드
└── ...
```

---

## 라우트 구조 (App.jsx)

```jsx
ErrorBoundary
  AuthProvider
    BrowserRouter
      /auth/callback → OAuthCallback (레이아웃 없음)

      MainLayout (Navbar만)
        /            → Home
        /login       → Login
        /choose-role → ChooseRole

      ProtectedRoute (allowedRole="teacher")
        DashboardLayout (Navbar + 사이드바)
          /teacher/classrooms                                             → ClassroomList
          /teacher/classrooms/:id                                         → ClassroomDetail
          /teacher/chapters/:id/edit                                      → Editor (ChapterEditor)
          /teacher/classrooms/:classroomId/chapters/:chapterId/monitor    → ChapterMonitor
          /teacher/board                                                  → TeacherBoard ★
          /teacher/board/new                                              → BoardPostEditor ★
          /teacher/board/:postId/edit                                     → BoardPostEditor ★
          /teacher/classrooms/:classroomId/assignments/:assignmentId/edit       → AssignmentEditor ★
          /teacher/classrooms/:classroomId/assignments/:assignmentId/monitor    → AssignmentMonitor ★

        /teacher/classrooms/:classroomId/chapters/:chapterId/monitor/:studentId → StudentWorkViewer (전체화면)
        /teacher/classrooms/:classroomId/chapters/:chapterId/study/page/:pageId → TeacherStudyViewer (전체화면)
        /teacher/classrooms/:classroomId/assignments/:assignmentId/monitor/:studentId → AssignmentWorkViewer (전체화면) ★

      ProtectedRoute (allowedRole="student")
        DashboardLayout
          /student/classrooms                        → ClassroomList
          /student/classrooms/:id                    → ClassroomDetail
        /student/study/:chapterId/page/:pageId       → StudyViewer (전체화면)
        /student/assignments/:assignmentId/page/:pageId → AssignmentStudyViewer (전체화면) ★
```

---

## 주요 도메인 로직 업데이트 (Phase 5: 게시판 & 과제)

### 게시판 (Board)

- **교사만 글 작성 가능**. 교사가 소속된 클래스룸(선택지) 대상으로 공지를 남기고 첨부파일 공유.
- 첨부파일은 `post-files` Storage 버킷에 저장되며, 업로드 권한은 교사에게 한정되지만 다운로드는 Public.
- 학생들은 자신의 속한 클래스룸이 연결된(`post_classrooms` 테이블) 게시물만 읽을 수 있도록 RLS가 구성되어 있음.

### 과제 (Assignment)

- **교사**: 클래스룸 내에서 새로운 테스트성/숙제성 컨텐츠(Assignment) 구성 (`assignments`, `assignment_pages` 테이블). 기존 챕터와 유사하게 이미지를 업로드하지만 학생들의 제출 및 채점 상태(`status`, `score`, `deadline` 등) 관리가 포함됨.
- **AssignmentEditor**: 교사가 이미지를 추가하고 과제를 생성/수정하는 화면.
- **AssignmentMonitor**: 학생들의 실시간 문제풀이 진척도 및 상태(예: 미제출, 늦은 제출 등)를 열람하고 개별 학생 채점 뷰어로 진입 가능한 현황판.
- **AssignmentStudyViewer**: 학생 전용 UI. 일반 StudyViewer와 거의 구조가 흡사하나 `assignment_notes` 테이블을 사용해 필기를 저장하고 우상단에 `제출하기` 버튼 등의 상태 전환 로직이 추가되었을 것으로 예상.
- **AssignmentWorkViewer**: 교사가 제출된 학생의 과제 풀이 필기를(`assignment_notes`와 `assignment_teacher_comments` 통해) 조회하면서 점수를 주고 코멘트(첨삭)할 수 있는 전체화면.

### 기존 StudyViewer와의 차이점

- 기존 StudyViewer 흐름은 `student_notes` 테이블을 이용한 학습 기록 추적이었으나, Phase 5의 과제 기능은 상태(status) 변화와 점수(score), 피드백 등의 Workflow를 추가로 감당하는 별도의 테이블 계층(`assignment_submissions`, `assignment_notes`)으로 격리됨.

## 아키텍처 결정 사항

- 기존 `.claude/memory` 문서를 승계하여 **`.agent/memory`**로 전환하고, 이를 통해 AI 페어 프로그래밍 연속성 확보.
- 모바일 대응 `100dvh` 나 Excalidraw Element 삽입 등의 기법은 그대로 과제 뷰어에도 적용되었음.
