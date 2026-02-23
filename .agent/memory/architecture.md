# MathChois 아키텍처 상세

## 전체 파일 구조

```
E:\Projects\MathChois\
├── src/
│   ├── main.jsx                    # ReactDOM.createRoot → App
│   ├── App.jsx                     # ErrorBoundary + AuthProvider + BrowserRouter + Routes (React.lazy 분할)
│   ├── index.css                   # 글로벌 스타일 (Tailwind) — 터치 가속/스크롤 방지
│   ├── lib/
│   │   ├── supabase.js             # createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
│   │   ├── excalidrawUtils.js      # BG_ELEMENT_ID, GRID_STYLE 등 공유 상수/함수
│   │   └── pdfDownloader.js        # exportToCanvas 기반 PDF 변환 로직
│   ├── contexts/
│   │   └── AuthContext.jsx         # AuthProvider, useAuth hook (Race condition 방지 로직 적용됨)
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
│       └── studyviewer-details.md  # Excalidraw 통합 상세 (터치 로직, PDF 포함)
├── GEMINI.md                       # Gemini 인공지능 에이전트 정적 아키텍처 가이드
└── ...
```

---

## 라우트 및 최적화 구조 (App.jsx)

MathChois의 성능 최적화를 위해 **로그인 후 최초 접근하는 대시보드 화면 이외의 무거운 컴포넌트 전체(Excalidraw 등)는 `React.lazy()` 및 `Suspense`를 통해 비동기 청크(Chunk)로 분할 로드**됩니다. TTI(Time-to-Interactive)를 단축시키는 아키텍처가 적용되어 있습니다.

```jsx
ErrorBoundary
  AuthProvider
    BrowserRouter
      <Suspense fallback={<PageLoader />}>
        /auth/callback → OAuthCallback

        MainLayout (Navbar만)
          /            → Home
          /login       → Login
          /choose-role → ChooseRole (Lazy)

        ProtectedRoute (allowedRole="teacher")
          DashboardLayout (Navbar + 사이드바)
            /teacher/classrooms                                             → ClassroomList (Lazy)
            ... [게시판 / 과제 Monitor 라우트 구성] ...

          /* Fullscreen Views (No Dashboard Layout) */
          /teacher/classrooms/:classroomId/chapters/:chapterId/monitor/:studentId → StudentWorkViewer (Lazy)
          /teacher/classrooms/:classroomId/chapters/:chapterId/study/page/:pageId → TeacherStudyViewer (Lazy)
          /teacher/classrooms/:classroomId/assignments/:assignmentId/monitor/:studentId → AssignmentWorkViewer (Lazy)

        ProtectedRoute (allowedRole="student")
          DashboardLayout
            /student/classrooms                        → ClassroomList (Lazy)
          /student/study/:chapterId/page/:pageId       → StudyViewer (Lazy)
          /student/assignments/:assignmentId/page/:pageId → AssignmentStudyViewer (Lazy)
```

---

## 전역 상태 관리 및 버그 완화 (AuthContext)

**OAuth 무한 루프 차단 로직 적용:**

- 브라우저 쿠키/해시에 도착한 Supabase Session 정보가 `AuthContext`의 `initializeAuth()` 실행보다 늦게 파싱되는 경쟁 상태(Race Condition)를 고려하여, `onAuthStateChange('SIGNED_IN')` 이벤트 내부에서 `fetchProfile` Promise가 완전히 해결(`await`)될 때까지 `<AuthProvider>`의 전역 `isLoading` 변수를 `true`로 붙잡아둡니다.
- 이렇게 함으로써 `OAuthCallback` 파일이 "사용자 세션은 존재하는데 DB상 Profile(역할) 데이터가 비어 있어서, 아직 선택하지 않은 줄 착각해 `/choose-role` 경로로 불필요하게 사용자를 튕겨버리는 현상"을 영구적으로 방지합니다.

---

## 컴포넌트 디자인 가이드

1. **아이콘 기반 네비게이션**:
   - 기존의 모든 '저장', '제출', '뒤로가기' 텍스트 폰트 버튼들은 통일된 `lucide-react` 아이콘으로 전환되었습니다.
   - 뷰어 썸네일들은 `object-contain max-h-64` 프로퍼티를 적용받아 기이하게 찌그러지거나 잘리는 현상이 완전히 소멸했습니다.
2. **반응형 제약 & 가로 스크롤**:
   - 전반적인 컨테이너에는 `word-break` 및 모바일 기기를 배려한 Text wrapping 방지용 가로 스크롤(overflow-x-auto)이 삽입되어 있습니다.
