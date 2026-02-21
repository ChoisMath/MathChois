# MathChois 아키텍처 상세

## 전체 파일 구조

```
E:\Projects\MathChois\
├── src/
│   ├── main.jsx                    # ReactDOM.createRoot → App
│   ├── App.jsx                     # ErrorBoundary + AuthProvider + BrowserRouter + Routes
│   ├── index.css                   # 글로벌 스타일 (Tailwind)
│   ├── lib/
│   │   └── supabase.js             # createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
│   ├── contexts/
│   │   └── AuthContext.jsx         # AuthProvider, useAuth hook
│   ├── components/
│   │   ├── Navbar.jsx              # 상단 네비 (로고, 유저명, 아바타, 로그아웃)
│   │   └── ProtectedRoute.jsx      # 역할별 라우트 가드
│   ├── layouts/
│   │   ├── MainLayout.jsx          # 공개 페이지 (Navbar + Outlet)
│   │   └── DashboardLayout.jsx     # 인증된 페이지 (Navbar + 사이드바 + Outlet)
│   └── pages/
│       ├── Home.jsx                # 랜딩 페이지 (Google OAuth 버튼)
│       ├── Login.jsx               # 로그인 페이지
│       ├── OAuthCallback.jsx       # /auth/callback 처리
│       ├── ChooseRole.jsx          # 역할 선택 (teacher/student)
│       ├── TeacherDashboard.jsx    # 교사 대시보드
│       ├── StudentDashboard.jsx    # 학생 대시보드 (참여 클래스룸 + 코드 입력)
│       ├── Classrooms/
│       │   ├── ClassroomList.jsx   # 클래스룸 목록 (교사: 생성, 학생: 코드 참여)
│       │   └── ClassroomDetail.jsx # 클래스룸 상세 (멤버, 챕터, 코드 복사)
│       ├── Chapters/
│       │   ├── ChapterList.jsx     # 챕터 관리 (생성/삭제/편집 링크)
│       │   └── Editor.jsx          # 챕터 편집 (이미지 업로드/삭제/미리보기)
│       └── Study/
│           └── StudyViewer.jsx     # 학생 학습 뷰어 (전체화면 + Excalidraw 필기)
├── tests/
│   ├── example.spec.ts             # Playwright 예제
│   └── navigation.spec.js          # MathChois 네비게이션 테스트 (구 mock 기반, 재작성 필요)
├── .claude/
│   └── memory/                     # 프로젝트 로컬 상세 문서
│       ├── architecture.md         # 이 파일
│       ├── supabase-schema.md      # DB 스키마, RLS, RPC, Storage
│       └── studyviewer-details.md  # Excalidraw 통합 상세
├── CLAUDE.md                       # Claude Code 정적 아키텍처 가이드
├── package.json                    # 패키지명: temp-app
├── vite.config.js                  # port 3000, @excalidraw/excalidraw optimizeDeps 필요
├── playwright.config.ts            # Chromium only, testDir: ./tests, baseURL: localhost:5173
├── eslint.config.js
└── index.html                      # title: "MathChois", referrerPolicy: no-referrer-when-downgrade
```

---

## 라우트 구조 (App.jsx 전체)

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
          /teacher/dashboard                         → TeacherDashboard
          /teacher/classrooms                        → ClassroomList
          /teacher/classrooms/:id                    → ClassroomDetail
          /teacher/classrooms/:classroomId/chapters  → ChapterList
          /teacher/chapters/:id/edit                 → Editor (ChapterEditor)

      ProtectedRoute (allowedRole="student")
        DashboardLayout
          /student/dashboard                         → StudentDashboard
          /student/classrooms                        → ClassroomList
          /student/classrooms/:id                    → ClassroomDetail
        /student/study/:chapterId/page/:pageId       → StudyViewer (DashboardLayout 밖, 전체화면)
```

---

## AuthContext 상세 (src/contexts/AuthContext.jsx)

### Context value
- `user` — Supabase Auth user 객체
- `profile` — profiles 테이블 row `{ id, name, email, avatar_url, role }`
- `isAuthenticated` — `!!user`
- `isLoading` — 앱 초기 세션 로드 중 여부
- `signInWithGoogle()` — Supabase OAuth, redirectTo: `${origin}/auth/callback`
- `signOut()` — Supabase signOut + state 초기화
- `updateRole(role)` — profiles 테이블 update + profile state 갱신

### 초기화 로직
1. `initializeAuth()`: `supabase.auth.getSession()` 호출 (5초 타임아웃과 경쟁)
2. profile 없으면 3회 retry (500ms 간격) — DB trigger가 늦게 실행될 수 있어서
3. `onAuthStateChange` 구독: SIGNED_IN / SIGNED_OUT / TOKEN_REFRESHED 처리

---

## ProtectedRoute 로직 (src/components/ProtectedRoute.jsx)

```
isLoading            → "로딩 중..." 표시
!isAuthenticated     → /login 리다이렉트
!profile?.role       → /choose-role 리다이렉트
role !== allowedRole → /${profile.role}/dashboard 리다이렉트
통과                 → <Outlet />
```

---

## DashboardLayout 사이드바 링크

### 교사
- 개요 → `/teacher/dashboard` (LayoutDashboard 아이콘)
- 클래스룸 → `/teacher/classrooms` (Users 아이콘, `startsWith` 매칭)

### 학생
- 내 학습 → `/student/dashboard` (BookOpen 아이콘)
- 클래스룸 → `/student/classrooms` (Users 아이콘, `startsWith` 매칭)

---

## 주요 페이지 비즈니스 로직

### ClassroomList
- **교사:** `classrooms` where `teacher_id = user.id` + 각 classroom 멤버 수 별도 조회
- **학생:** `classroom_members` where `student_id = user.id` + classroom join
- **클래스코드 생성:** `'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'` 중 6자리 랜덤 (I, O, 0, 1 제외)

### ClassroomDetail
- classroom + members(profile 포함) + chapters(pages 수 + firstPage) 동시 조회
- **교사:** 클래스코드 표시/복사, 챕터 삭제 (모달 확인)
- **학생:** 나가기 버튼, "학습하기" → `/student/study/{chapterId}/page/{firstPage.id}`
- 챕터 삭제 시 cascade로 pages 포함 삭제 (DB RLS에서 처리)

### ChapterEditor (Editor.jsx)
- `useParams: id` = chapterId
- 이미지 업로드: hidden fileInput → Storage upload → publicUrl → pages insert
- 삭제: URL 파싱으로 Storage 경로 추출 → Storage remove → pages delete
- UI: 좌측 썸네일 사이드바 (w-44) + 우측 미리보기 메인
- 컨테이너 높이: `calc(100vh - 16rem)`

---

## 아키텍처 결정 사항

| 결정 | 이유 |
|------|------|
| sessionStorage 인증 → Supabase Auth 전환 | 영속적 세션, OAuth 지원 필요 |
| profiles 테이블로 역할 관리 | Supabase Auth에는 커스텀 역할 컬럼 없음 |
| join_classroom_by_code RPC 사용 | atomic 처리 + 보안 (직접 insert 대신 함수) |
| StudyViewer를 DashboardLayout 밖에 배치 | 전체화면 학습 경험, 사이드바/네비 불필요 |
| Excalidraw 배경이미지를 element로 삽입 | CSS background는 저장/불러오기 불가, element 방식은 bgPosition 저장 가능 |
| debounce 1500ms 자동 저장 | 필기 중 잦은 저장 요청 방지 |
