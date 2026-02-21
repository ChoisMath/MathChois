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
│   │   └── excalidrawUtils.js      # ★ Phase 4 신규: BG_ELEMENT_ID, GRID_STYLE, fetchAsDataUrl, getImageNaturalSize, createBgElement, DEFAULT_COLORS, TOOLS 등 공유 상수/함수
│   ├── contexts/
│   │   └── AuthContext.jsx         # AuthProvider, useAuth hook
│   ├── components/
│   │   ├── Navbar.jsx              # 상단 네비 (로고, 유저명, 아바타, 로그아웃)
│   │   ├── ProtectedRoute.jsx      # 역할별 라우트 가드
│   │   └── study/
│   │       └── DrawingToolbar.jsx  # ★ Phase 4 신규: StudyViewer에서 분리, S Pen 배럴 버튼 지원
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
│       │   └── ClassroomDetail.jsx # 클래스룸 상세 (dnd-kit 챕터 순서, 챕터 삭제 시 Storage 정리)
│       ├── Chapters/
│       │   ├── ChapterList.jsx     # 챕터 관리 (생성/삭제/편집 링크)
│       │   └── Editor.jsx          # 챕터 편집 (이미지 업로드/삭제/미리보기)
│       ├── Study/
│       │   ├── StudyViewer.jsx     # 학생 필기, 교사 코멘트 오버레이, 100dvh, 툴바 접기
│       │   └── TeacherStudyViewer.jsx  # ★ Phase 4 신규: 교사 class-wide 필기
│       └── Monitor/
│           ├── ChapterMonitor.jsx      # ★ Phase 4 신규: 학생 진도 실시간 모니터링 (DashboardLayout 안)
│           └── StudentWorkViewer.jsx   # ★ Phase 4 신규: 학생 필기 상세 + 코멘트 (전체화면)
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
          /teacher/dashboard                                              → TeacherDashboard
          /teacher/classrooms                                             → ClassroomList
          /teacher/classrooms/:id                                         → ClassroomDetail
          /teacher/classrooms/:classroomId/chapters                       → ChapterList
          /teacher/chapters/:id/edit                                      → Editor (ChapterEditor)
          /teacher/classrooms/:classroomId/chapters/:chapterId/monitor    → ChapterMonitor ★
        /teacher/classrooms/:classroomId/chapters/:chapterId/monitor/:studentId → StudentWorkViewer (전체화면) ★
        /teacher/classrooms/:classroomId/chapters/:chapterId/study/page/:pageId → TeacherStudyViewer (전체화면) ★

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
- 챕터 삭제 시 Storage 파일 정리:
  1. pages 테이블에서 해당 챕터의 image_url 목록 조회
  2. 다른 챕터와 공유된 URL 필터링 (import 기능 대비)
  3. orphan URL만 Storage에서 삭제: `supabase.storage.from('chapter-pages').remove(paths)`
  4. paths = url.split('/storage/v1/object/public/chapter-pages/')[1]
- 챕터 카드: @dnd-kit/sortable로 드래그 순서 변경 → chapters.position bulk update

### ChapterEditor (Editor.jsx)
- `useParams: id` = chapterId
- 이미지 업로드: hidden fileInput → Storage upload → publicUrl → pages insert
- 삭제: URL 파싱으로 Storage 경로 추출 → Storage remove → pages delete
- UI: 좌측 썸네일 사이드바 (w-44) + 우측 미리보기 메인
- 컨테이너 높이: `calc(100vh - 16rem)`

### ChapterMonitor (src/pages/Monitor/ChapterMonitor.jsx)
- DashboardLayout 안, 라우트: `/teacher/classrooms/:classroomId/chapters/:chapterId/monitor`
- 초기 로드: chapter, pages, classroom_members(+profiles), student_notes(.in(pageIds)) 동시 조회
- `notesSummary`: `{ [student_id]: { pagesWithNotes: Set<pageId>, updatedAt } }` 로 빌드
- Realtime: `supabase.channel('monitor_${chapterId}').on('postgres_changes', { table: 'student_notes', filter: 'page_id=in.(...)' }, ...)` 구독
- 헤더: 뒤로가기 + 챕터명 + "교사 필기" 버튼 → TeacherStudyViewer
- 학생 카드: 이름, 진도(pagesWithNotes.size / pages.length), 마지막 저장 시각 표시
  - 0%→gray, 중간→yellow, 100%→green 진도 색상
  - 클릭 → StudentWorkViewer

### StudentWorkViewer (src/pages/Monitor/StudentWorkViewer.jsx)
- 전체화면 (DashboardLayout 밖), 라우트: `/teacher/.../monitor/:studentId`
- 학생 필기(student_notes) + 교사 코멘트(teacher_student_comments) 동시 로드
- Scene 구성: [BG element, ...studentEls(id=`__sn_`+원본id, locked, opacity 60), ...teacherCommentEls]
- `viewModeEnabled={!commentMode}` — 코멘트 모드 토글
- 코멘트 저장: `teacher_student_comments.upsert({ teacher_id, student_id, page_id, ... }, { onConflict: 'teacher_id,student_id,page_id' })`
- `student_notes` Realtime 구독 → 학생 필기 변경 즉시 반영 (교사가 실시간 확인)
- `lastSavedRef` 더티체크로 불필요한 upsert 방지

### TeacherStudyViewer (src/pages/Study/TeacherStudyViewer.jsx)
- 전체화면 (DashboardLayout 밖), 라우트: `/teacher/.../study/page/:pageId`
- class-wide 교사 필기 (`teacher_notes` 테이블, `onConflict: 'teacher_id,page_id'`)
- StudyViewer와 유사하지만 항상 draw 모드, 사이드바 있음
- 뒤로가기 → ChapterMonitor

### StudyViewer Phase 4 추가 기능 (src/pages/Study/StudyViewer.jsx)
- `teacher_student_comments` Realtime 구독: 페이지 로드 시 자동으로 교사 코멘트 오버레이
  - element ID prefix: `__tn_`+ 원본id, locked, opacity 60
- draw 모드에서 필기 저장 시 `__tn_` prefix element 제외 (교사 코멘트는 저장 안 함)
- 레이아웃: `height: 100dvh` + `overflow-hidden` (Chrome 주소창 스와이프 제스처 지원)
- 네비바·툴바 접기/펼치기 버튼 (`toolbarCollapsed` state)

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
| `teacher_notes` vs `teacher_student_comments` 분리 | class-wide 필기(교사→전체)와 개별 학생 코멘트(교사→특정학생) 구분 |
| element ID prefix 네임스페이싱 (`__sn_`, `__tn_`) | 단일 Excalidraw scene에서 출처별 element 구분, locked 처리 가능 |
| `commitToHistory: false` | 프로그래매틱 scene 설정이 undo 스택을 오염시키는 것 방지 |
| Undo/Redo → KeyboardEvent dispatch | Excalidraw v0.18 API에 `history.undo()` 없음; `document.dispatchEvent`가 유일한 방법 |
| `height: 100dvh` (not `h-screen`, not `fixed inset-0`) | `100vh`는 모바일 Chrome에서 레이아웃 불안정; `fixed`는 Chrome 주소창 스와이프 제스처 차단; `100dvh`는 두 문제 모두 해결 |
