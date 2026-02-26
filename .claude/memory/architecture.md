# MathChois 아키텍처 상세

## 전체 파일 구조 (모노레포)

```
E:\Projects\MathChois\
├── packages/
│   ├── server/src/
│   │   ├── index.ts                # Fastify 서버 진입점
│   │   ├── app.ts                  # 플러그인/라우트 등록
│   │   ├── middleware/
│   │   │   ├── auth.ts             # JWT authenticate 미들웨어
│   │   │   └── roleGuard.ts        # requireTeacher, requireStudent, requireAdmin
│   │   ├── services/
│   │   │   ├── auth.service.ts     # findOrCreateProfile, signAccessToken (isAdmin 포함)
│   │   │   ├── admin.service.ts    # ★ 신규: getAllUsers, updateUserRole, setUserAdmin,
│   │   │   │                       #         deleteUser, getUserDetail, getClassroomOverview,
│   │   │   │                       #         getSystemStats, resetAllData, resetUserData
│   │   │   ├── classroom.service.ts
│   │   │   ├── chapter.service.ts
│   │   │   ├── page.service.ts
│   │   │   ├── note.service.ts
│   │   │   ├── post.service.ts
│   │   │   ├── assignment.service.ts
│   │   │   └── storage.service.ts
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── admin.ts            # ★ 신규: 9개 엔드포인트 /api/admin/*
│   │   │   ├── classrooms.ts
│   │   │   ├── chapters.ts
│   │   │   ├── pages.ts
│   │   │   ├── notes.ts
│   │   │   ├── comments.ts
│   │   │   ├── posts.ts
│   │   │   ├── assignments.ts
│   │   │   └── storage.ts
│   │   ├── socket/
│   │   │   ├── index.ts
│   │   │   └── handlers/
│   │   │       ├── notes.ts
│   │   │       ├── comments.ts
│   │   │       └── assignments.ts
│   │   ├── db/schema.ts            # Drizzle 스키마 (profiles.isAdmin 컬럼 포함)
│   │   ├── config/database.ts
│   │   └── drizzle.config.ts
│   │
│   ├── client/src/
│   │   ├── main.jsx
│   │   ├── App.jsx                 # Routes (admin 라우트 포함)
│   │   ├── lib/
│   │   │   ├── api.ts              # Bearer 토큰, 401 singleton refresh
│   │   │   ├── socket.ts           # Socket.IO 싱글톤
│   │   │   ├── dataCache.js
│   │   │   └── excalidrawUtils.js
│   │   ├── contexts/
│   │   │   └── AuthContext.jsx     # JWT 기반 (profile.isAdmin 포함)
│   │   ├── components/
│   │   │   ├── Navbar.jsx          # isAdmin 시 "관리자 패널" 링크 노출
│   │   │   ├── ProtectedRoute.jsx  # allowedRole + requireAdmin prop
│   │   │   └── study/
│   │   │       └── DrawingToolbar.jsx
│   │   ├── layouts/
│   │   │   ├── MainLayout.jsx
│   │   │   └── DashboardLayout.jsx
│   │   └── pages/
│   │       ├── Admin/
│   │       │   └── AdminPanel.jsx  # ★ 신규: 4탭 관리자 패널
│   │       ├── Home.jsx
│   │       ├── Login.jsx
│   │       ├── OAuthCallback.jsx
│   │       ├── ChooseRole.jsx
│   │       ├── Classrooms/
│   │       │   ├── ClassroomList.jsx
│   │       │   └── ClassroomDetail.jsx
│   │       ├── Chapters/
│   │       │   ├── ChapterList.jsx
│   │       │   └── Editor.jsx
│   │       ├── Study/
│   │       │   ├── StudyViewer.jsx
│   │       │   └── TeacherStudyViewer.jsx
│   │       ├── Monitor/
│   │       │   ├── ChapterMonitor.jsx
│   │       │   └── StudentWorkViewer.jsx
│   │       ├── Board/              # 게시판
│   │       └── Assignment/         # 과제
│   │
│   └── shared/src/types/
│       ├── auth.ts                 # TokenPayload, Profile (isAdmin: boolean 포함)
│       ├── models.ts
│       ├── api.ts
│       ├── socket.ts
│       └── excalidraw.ts
│
├── tests/
│   ├── example.spec.ts
│   └── navigation.spec.js          # 재작성 필요 (JWT 기반)
├── .claude/memory/
│   ├── architecture.md             # 이 파일
│   ├── supabase-schema.md          # DB 스키마 (Drizzle 기준으로 업데이트 필요)
│   └── studyviewer-details.md
├── CLAUDE.md
└── MIGRATION_PROGRESS.md           # 마이그레이션 체크리스트
```

---

## 라우트 구조 (App.jsx 전체)

```jsx
ErrorBoundary
  AuthProvider
    BrowserRouter
      /auth/callback        → OAuthCallback (레이아웃 없음)
      /verify-email/:token  → VerifyEmail (레이아웃 없음) ← ★ 신규
      /reset-password/:token → ResetPassword (레이아웃 없음) ← ★ 신규

      MainLayout (Navbar만)
        /            → Home
        /login       → Login
        /choose-role → ChooseRole

      ProtectedRoute (requireAdmin)            ← ★ Admin Routes
        DashboardLayout
          /admin     → AdminPanel

      ProtectedRoute (allowedRole="teacher")
        DashboardLayout (Navbar + 사이드바)
          /teacher/dashboard                                              → TeacherDashboard
          /teacher/classrooms                                             → ClassroomList
          /teacher/classrooms/:id                                         → ClassroomDetail
          /teacher/classrooms/:classroomId/chapters                       → ChapterList
          /teacher/chapters/:id/edit                                      → Editor (ChapterEditor)
          /teacher/classrooms/:classroomId/chapters/:chapterId/monitor    → ChapterMonitor
        /teacher/classrooms/:classroomId/chapters/:chapterId/monitor/:studentId → StudentWorkViewer (전체화면)
        /teacher/classrooms/:classroomId/chapters/:chapterId/study/page/:pageId → TeacherStudyViewer (전체화면)

      ProtectedRoute (allowedRole="student")
        DashboardLayout
          /student/dashboard                         → StudentDashboard
          /student/classrooms                        → ClassroomList
          /student/classrooms/:id                    → ClassroomDetail
        /student/study/:chapterId/page/:pageId       → StudyViewer (DashboardLayout 밖, 전체화면)
```

---

## 이메일 회원가입 2단계 검증 (Email Signup Verification)

### 흐름
1. **SignUp (Home/Login 페이지)**
   - 사용자가 이메일, 비밀번호, 이름 입력 후 "회원가입" 버튼
   - Client: `api.signUpWithEmail(email, password, name)` 호출
   - **반환값**: `{ success: true, message: "가입확인 이메일을 전송했습니다." }` (accounts created 아직 안 함)
   - 페이지에 success message 표시 (auto-login 아님)

2. **Email Verification Link**
   - Server: `POST /api/auth/signup`
     - `signEmailVerificationToken(email, passwordHash, name)` JWT 생성 (유효기간: 24h)
     - `sendVerificationEmail(to, verifyUrl, userName)` 이메일 발송
     - 형식: `${APP_URL}/verify-email/${token}`
   - 사용자가 이메일 확인 후 "가입확인" 버튼 클릭 → `/verify-email/:token` 라우트로 이동

3. **Token Verification & Account Creation**
   - Client: `VerifyEmail.jsx` 컴포넌트
     - URL에서 token 파라미터 추출
     - `api.verifyEmail(token)` 호출
     - Server: `POST /api/auth/verify-email`
       - `verifyEmailVerificationToken(token)` 으로 토큰 검증
       - 토큰 payload: `{ email, passwordHash, name }` 추출
       - 중복 이메일 확인 후 `createEmailProfile(email, passwordHash, name)` 으로 프로필 생성
       - Access JWT + Refresh cookie 반환
       - 클라이언트는 `{ token, profile }` 받음
     - `window.location.href = '/'` 전체 새로고침 → AuthContext가 refresh cookie에서 세션 복원

4. **VerifyEmail 컴포넌트 에러 처리**
   - 토큰 만료/유효하지 않음 → error message + "홈으로 돌아가기" 링크
   - cancellation token으로 race condition 방지 (컴포넌트 언마운트 시)

### 서버 구현

**Token Functions (auth.service.ts)**
- `signEmailVerificationToken(data)`: `{ email, passwordHash, name }` → JWT (24h)
- `verifyEmailVerificationToken(token)`: JWT 검증 + payload 추출

**Endpoints (auth.ts)**
```
POST /api/auth/signup
  Body: { email, password, name }
  Rate limit: 10/minute
  검증:
    - 이메일 형식 확인
    - 비밀번호 길이 4자 이상
    - SMTP 설정 확인
    - 중복 이메일 확인
  응답: { success, message } (account 아직 생성 안 함)

POST /api/auth/verify-email
  Body: { token }
  검증: 토큰 유효성, 이메일 중복
  응답: { token, profile }
  Side effects: refresh_token 쿠키 설정
```

**Mail Function (mail.service.ts)**
```
sendVerificationEmail(to, verifyUrl, userName)
  - 한국어 템플릿
  - "가입확인" 버튼 + 24시간 유효성 안내
  - ChoisClass 브랜딩
```

### 클라이언트 구현

**API Functions (api.ts)**
```
signUpWithEmail(email, password, name): Promise<{ success, message }>
  - Body validation (client side)
  - POST /api/auth/signup
  - 반환: success message (자동 로그인 X)

verifyEmail(token): Promise<void>
  - POST /api/auth/verify-email
  - 성공: AuthContext refresh-token 쿠키 자동 인식
  - 실패: error message throw
```

**VerifyEmail.jsx**
```
- Routes: /verify-email/:token
- URL에서 token 파라미터 추출
- useEffect에서 api.verifyEmail(token) 호출
- 성공: window.location.href = '/'
- 에러: error message + home link
```

**Password Reset (별도 흐름)**
- `/reset-password/:token` 라우트 (ResetPassword.jsx 컴포넌트)
- 메일 링크: `GET /api/auth/reset-password/:token` (서버에서 Fastify redirect)
- 검증: `POST /api/auth/reset-password` (JSON)
- 클라이언트: `verifyResetToken(token)` 호출 후 home으로 리다이렉트

---

## AuthContext 상세 (packages/client/src/contexts/AuthContext.jsx)

### Context value
- `user` — JWT 디코딩된 사용자 정보 (`{ id, email, ... }`)
- `profile` — API에서 가져온 profiles 행 `{ id, name, email, avatarUrl, role, isAdmin }`
- `isAuthenticated` — `!!user`
- `isLoading` — 앱 초기 세션 로드 중 여부
- `signInWithGoogle()` — Google OAuth 리다이렉트
- `signUpWithEmail(email, password, name)` — 검증 이메일 발송 (반환: `{ success, message }`)
- `signInWithEmail(email, password)` — 이메일 로그인 (반환: JWT)
- `signOut()` — 토큰 삭제 + state 초기화 + Socket.IO 연결 해제
- `updateRole(role)` — API로 role 업데이트 + profile state 갱신

### isAdmin 흐름
- 서버: `auth.service.ts`의 `INITIAL_ADMIN_EMAIL = 'complete860127@gmail.com'`
- 첫 로그인 시 `findOrCreateProfile`에서 해당 이메일이면 `isAdmin: true` 자동 설정
- `signAccessToken`이 JWT payload에 `isAdmin` 포함
- 클라이언트: `profile.isAdmin` 으로 관리자 여부 확인
- Navbar에서 `profile?.isAdmin` 조건으로 "관리자 패널" 링크 노출

---

## ProtectedRoute 로직 (packages/client/src/components/ProtectedRoute.jsx)

Props: `allowedRole` (선택), `requireAdmin` (선택)

```
isLoading                           → "로딩 중..." 표시
!isAuthenticated                    → /login 리다이렉트
!profile?.role                      → /choose-role 리다이렉트
requireAdmin && !profile?.isAdmin   → /${profile.role}/classrooms 리다이렉트
allowedRole && role !== allowedRole → /${profile.role}/classrooms 리다이렉트
통과                                → <Outlet />
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

### AdminPanel (packages/client/src/pages/Admin/AdminPanel.jsx)

- 라우트: `/admin` — `ProtectedRoute requireAdmin` + `DashboardLayout` 안
- React.lazy로 지연 로드
- **4개 탭:**
  | 탭 | 기능 |
  |---|---|
  | 사용자 관리 (UsersTab) | 전체 사용자 목록, 검색, 역할 변경, 관리자 토글, 삭제, 데이터 초기화, 상세 패널(DB rows + Storage) |
  | 클래스룸 (ClassroomsTab) | 전체 클래스룸 표 — 담당 교사, 학생 수, 단원 수, 코드, 생성일 |
  | 시스템 현황 (StatsTab) | 요약 카드 (사용자/교사/학생/클래스룸 수), Storage 사용량, DB 테이블 row 수 |
  | 데이터 초기화 (ResetTab) | "RESET" 입력 확인 후 비관리자 전체 삭제 |
- **보안 체크:** 자기 자신 삭제/관리자 해제 방지 (클라이언트 + 서버 양쪽)

### Admin API Endpoints (packages/server/src/routes/admin.ts)

모든 엔드포인트: `preHandler: [authenticate, requireAdmin]`

```
GET    /api/admin/users              전체 사용자 목록 (classroomCount 포함)
GET    /api/admin/users/:id/detail   사용자 상세 (dbRows: teacher/student 구분, storageBytes)
PATCH  /api/admin/users/:id/role     역할 변경 (teacher | student)
PATCH  /api/admin/users/:id/admin    관리자 토글 (isAdmin boolean)
DELETE /api/admin/users/:id          사용자 삭제 (자기 자신 방지)
POST   /api/admin/users/:id/reset    사용자 데이터 초기화 (계정 유지, 데이터만 삭제)
GET    /api/admin/classrooms         전체 클래스룸 개요 (교사명, 학생 수, 단원 수)
GET    /api/admin/stats              시스템 통계 (사용자 수, Storage, DB rows)
POST   /api/admin/reset              전체 데이터 초기화 (관리자 계정 유지)
```

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
