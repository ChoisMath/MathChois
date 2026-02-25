# MathChois 아키텍처 마이그레이션 계획

## Context

현재 MathChois는 React + Supabase(BaaS)로 구성되어 있으며, Railway에서 프론트엔드만 배포하고 백엔드는 Supabase에 의존하고 있습니다. Railway Pro 계정의 자체 PostgreSQL과 Volume을 활용하여 Supabase 의존성을 완전히 제거하고, Node.js 기반 백엔드를 구축하여 비용 절감과 DB 용량 문제를 해결하고자 합니다.

**중요**: Supabase 대시보드 설정이 한 번도 완료된 적이 없으므로 (코드만 완성) **기존 데이터 마이그레이션은 불필요**합니다. 새 백엔드를 처음부터 구축합니다.

**변경 범위**: Supabase Auth → 자체 Google OAuth, Supabase DB → 자체 PostgreSQL, Supabase Storage → Railway Volume, Supabase Realtime → Socket.IO, JavaScript → TypeScript

---

## 0. 진행 상황 추적 시스템

**모든 세션에서 반드시 먼저 확인할 파일**: `MIGRATION_PROGRESS.md` (프로젝트 루트)

이 파일은 Phase별 체크리스트로 구성되며, 각 작업 완료 시 `[x]`로 표시합니다.
세션이 중단되더라도 이 파일을 읽으면 현재 위치와 다음 작업을 즉시 파악할 수 있습니다.

**세션 시작 시 규칙**:
1. `MIGRATION_PROGRESS.md` 읽기
2. 마지막으로 완료된 체크포인트 확인
3. 다음 미완료 항목부터 작업 재개
4. 각 작업 완료 시 체크리스트 업데이트

**세션 종료 시 규칙**:
1. 현재까지 완료된 항목 `[x]` 표시
2. 진행 중이던 작업에 `[~]` 표시 + 간단한 상태 메모
3. 발견된 이슈가 있으면 `[!]` 표시

---

## 1. 핵심 설계 결정 (확정)

### 1-1. 배포 방식: 단일 서비스 (확정)

프론트엔드와 백엔드를 **하나의 Railway 서비스**로 배포합니다.
- Fastify가 `/api/*` 요청은 API로 처리
- 나머지 요청은 Vite 빌드 결과물(`packages/client/dist/`)을 static으로 서빙
- SPA 폴백: 모든 non-API, non-file 요청 → `index.html` 반환

**이유**: CORS 문제 완전 해결, 쿠키 SameSite=Strict 사용 가능, Railway 서비스 1개로 비용 절감, 환경변수 관리 단순화

**결과**:
- 프론트 `VITE_API_URL` 불필요 → 동일 도메인이므로 `/api/...` 상대경로 사용
- Refresh Token 쿠키의 `SameSite=Strict` 안전하게 사용 가능
- Socket.IO도 동일 origin → CORS 설정 불필요

### 1-2. 기술 스택 (확정)

| 영역 | 선택 | 이유 |
|---|---|---|
| **서버 프레임워크** | **Fastify** | 네이티브 TS 지원, Express 대비 2-3x 빠름 (Excalidraw JSON 최대 2MB), 스키마 기반 검증 내장 |
| **ORM** | **Drizzle** (Prisma 아님) | JSONB에 `.$type<ExcalidrawData>()` 타입 지정 (Prisma는 `JsonValue` → 매번 캐스팅), `onConflictDoUpdate()`가 PostgreSQL `ON CONFLICT`에 1:1 매핑, 바이너리 엔진 없음 (Prisma +15-50MB), SQL-like 문법 |
| **API 스타일** | **REST** | 기존 Supabase CRUD 패턴과 1:1 매핑, 구현 단순 |
| **인증** | **JWT (access + refresh cookie)** | Supabase의 자동 토큰 갱신 재현, HTTP-only cookie로 XSS 방어 |
| **실시간** | **Socket.IO** | 자동 재연결 내장(모바일 필수), room 모델이 현재 channel 패턴에 적합 |
| **파일 저장** | **Railway Volume** | 로컬 SSD(네트워크 지연 없음), 교실 규모(10-40 동시접속)에 충분 |

---

## 2. 프로젝트 구조: npm Workspaces 모노레포

### 2-1. 목표 폴더 구조

```
mathchois/                     # 프로젝트 루트 (기존 E:\Projects\MathChois)
  package.json                 # workspace root (workspaces: ["packages/*"])
  tsconfig.base.json           # 공유 TS 설정
  MIGRATION_PLAN.md            # 이 파일
  MIGRATION_PROGRESS.md        # 진행 상황 체크리스트
  packages/
    shared/                    # 공유 TypeScript 타입
      src/types/
        auth.ts                # User, Profile, Session, TokenPayload 타입
        models.ts              # Classroom, Chapter, Page 등 16개 테이블 모델
        api.ts                 # API Request/Response 타입
        socket.ts              # Socket.IO 이벤트 타입 (room명, payload)
        excalidraw.ts          # ExcalidrawData, BgPosition 등 Excalidraw 관련 타입
      src/index.ts
      package.json             # name: "@mathchois/shared"
      tsconfig.json
    server/                    # Node.js 백엔드
      src/
        index.ts               # 진입점 (Fastify + Socket.IO + static 서빙)
        app.ts                 # Fastify 플러그인 등록
        config/
          env.ts               # 환경변수 검증 (zod)
          database.ts          # Drizzle + postgres.js
        middleware/
          auth.ts              # JWT 검증 미들웨어
          roleGuard.ts         # teacher/student 역할 체크
        routes/                # 라우트 정의 (요청 파싱, 응답 형식)
          auth.ts
          classrooms.ts
          chapters.ts
          pages.ts
          notes.ts
          comments.ts
          posts.ts
          assignments.ts
          storage.ts
        services/              # 비즈니스 로직 (DB 쿼리, 권한 검증, Socket 브로드캐스트)
          auth.service.ts
          classroom.service.ts
          chapter.service.ts
          page.service.ts
          note.service.ts
          comment.service.ts
          post.service.ts
          assignment.service.ts
          storage.service.ts
        db/
          schema.ts            # Drizzle 스키마 (16개 테이블)
          relations.ts         # Drizzle 관계 정의 (nested select용)
          migrations/          # Drizzle Kit 생성
        socket/
          index.ts             # Socket.IO 설정 + JWT 인증
          handlers/
            notes.ts
            comments.ts
            assignments.ts
      drizzle.config.ts
      package.json             # name: "@mathchois/server"
      tsconfig.json
      Dockerfile
    client/                    # 기존 src/ 이동 (점진적 TS 전환)
      src/
        main.jsx → main.tsx    # 최초 진입점
        App.jsx → App.tsx
        lib/
          api.ts               # 신규: REST API 클라이언트 (supabase.js 대체)
          socket.ts            # 신규: Socket.IO 클라이언트
          excalidrawUtils.js   # → .ts (Phase 7에서)
          dataCache.js         # → .ts (Phase 7에서)
        contexts/
          AuthContext.jsx      # → .tsx (Phase 1에서 재작성)
        ... (기존 구조 유지)
      public/
      index.html
      vite.config.js → .ts
      tailwind.config.js
      package.json             # name: "@mathchois/client"
      tsconfig.json
```

### 2-2. 기존 코드 이동 절차 (Phase 0에서 실행)

```bash
# 1. 루트 package.json을 workspace root로 변환
# 2. packages/ 디렉토리 생성
mkdir -p packages/shared/src/types packages/server/src packages/client

# 3. 기존 프론트엔드 파일을 packages/client/로 이동
mv src/ packages/client/src/
mv public/ packages/client/public/
mv index.html packages/client/
mv vite.config.js packages/client/
mv tailwind.config.js packages/client/
mv postcss.config.js packages/client/

# 4. 기존 루트 package.json의 dependencies를 client/package.json으로 분리
# 5. .env.local은 루트에 유지 (또는 .env로 통합)
```

---

## 3. 핵심 변환 설계

### 3-1. 인증 시스템 (Supabase Auth → 자체 Google OAuth + JWT)

**현재**: `supabase.auth.signInWithOAuth({ provider: 'google' })` → Supabase가 토큰 교환/세션 관리 전부 처리
**변경 후**: 직접 Google OAuth 2.0 구현

**흐름**:
1. 프론트: `window.location.href = '/api/auth/google'`
2. 서버: Google 인가 URL 생성 → 리다이렉트
3. Google → `GET /api/auth/google/callback?code=...`
4. 서버: code로 Google 토큰 교환 → 프로필 정보 추출
5. 서버: `profiles` 테이블에서 `google_id`로 사용자 찾거나 생성
6. 서버: Access Token (15분) + Refresh Token (7일, HTTP-only Secure cookie) 발급
7. 서버: `/auth/callback#token=xxx`로 리다이렉트 (동일 도메인이므로 상대 경로)

**토큰 전략**:
- Access Token: 짧은 수명(15분), AuthContext state(메모리)에 저장 → XSS 방어
- Refresh Token: HTTP-only, Secure, SameSite=Strict, `Path=/api/auth/refresh` 쿠키
- 401 응답 시 자동 갱신 → Supabase의 `TOKEN_REFRESHED` 이벤트 대체
- Refresh Token 사용 시마다 로테이션 (한번 사용된 토큰 무효화)

**DB 스키마 변경**: `profiles` 테이블에 `google_id TEXT UNIQUE NOT NULL` 컬럼 추가

**프론트엔드 AuthContext 변경점**:
- `supabase.auth.getSession()` → 앱 시작 시 `POST /api/auth/refresh`로 access token 획득
- `supabase.auth.onAuthStateChange()` → 불필요 (API 클라이언트의 자동 갱신으로 대체)
- Profile retry 로직(3x 500ms) → 불필요 (서버에서 동기적으로 profile 생성)

**의존 라이브러리**: `google-auth-library`, `jsonwebtoken`, `@fastify/cookie`, `@fastify/static`

### 3-2. 데이터베이스 (Supabase PostgreSQL → Railway PostgreSQL + Drizzle)

**스키마**: 기존 16개 테이블 구조 유지, 주요 변경사항:
- `auth.users` 참조 제거 → `profiles.id`가 최상위 PK (UUID, defaultRandom)
- `profiles`에 `google_id TEXT UNIQUE NOT NULL` 컬럼 추가
- 모든 `REFERENCES auth.users` → `REFERENCES profiles(id)`
- RLS 정책 → 서버 미들웨어(`roleGuard`) + 서비스 레이어로 대체
- DB 트리거(`handle_new_user`) → 서버 로직으로 대체 (OAuth callback에서 직접 INSERT)

**인덱스**:
```sql
CREATE INDEX idx_student_notes_page ON student_notes(page_id);
CREATE INDEX idx_student_notes_student_page ON student_notes(student_id, page_id);
CREATE INDEX idx_tsc_page_student ON teacher_student_comments(page_id, student_id);
CREATE INDEX idx_classroom_members_classroom ON classroom_members(classroom_id);
CREATE INDEX idx_classroom_members_student ON classroom_members(student_id);
CREATE INDEX idx_chapters_classroom ON chapters(classroom_id);
CREATE INDEX idx_pages_chapter ON pages(chapter_id);
CREATE INDEX idx_assignment_notes_page_student ON assignment_notes(page_id, student_id);
CREATE INDEX idx_assignment_submissions_assignment ON assignment_submissions(assignment_id);
```

**커넥션**: `postgres.js` (postgres 패키지) — Drizzle 공식 권장 드라이버, `pg` Pool보다 경량

### 3-3. API 라우트 매핑 (Supabase 직접 호출 → REST API)

| 현재 Supabase 호출 | 새 REST 엔드포인트 | 사용 컴포넌트 |
|---|---|---|
| `supabase.auth.signInWithOAuth` | `GET /api/auth/google` | Login |
| `supabase.auth.getSession` | `POST /api/auth/refresh` | AuthContext |
| `supabase.auth.signOut` | `POST /api/auth/logout` | AuthContext |
| `supabase.from('profiles').select` | `GET /api/auth/me` | AuthContext |
| `supabase.from('profiles').update({role})` | `PATCH /api/profiles/role` | ChooseRole |
| `supabase.from('classrooms').select` | `GET /api/classrooms` | ClassroomList |
| `supabase.from('classrooms').insert` | `POST /api/classrooms` | ClassroomList |
| `supabase.from('classrooms').update` | `PATCH /api/classrooms/:id` | ClassroomDetail |
| `supabase.from('classrooms').delete` | `DELETE /api/classrooms/:id` | ClassroomDetail |
| `supabase.rpc('join_classroom_by_code')` | `POST /api/classrooms/join` | DashboardLayout |
| `supabase.from('classroom_members').select` | `GET /api/classrooms/:id/members` | ClassroomDetail |
| `supabase.from('classroom_members').delete` | `DELETE /api/classrooms/:id/members/:studentId` | ClassroomDetail |
| `supabase.from('chapters').*` | `GET/POST/PATCH/DELETE /api/chapters` | ClassroomDetail, ChapterEditor |
| `supabase.from('chapters').update (reorder)` | `PUT /api/chapters/reorder` | ClassroomDetail |
| `supabase.from('pages').*` | `GET/POST/DELETE /api/pages` | ChapterEditor |
| `supabase.from('pages').upsert (reorder)` | `PUT /api/pages/reorder` | ChapterEditor |
| `supabase.from('student_notes').*` | `GET/PUT /api/notes/student/:pageId` | StudyViewer |
| `supabase.from('student_notes').select (bulk)` | `GET /api/notes/student-summary/:chapterId` | ChapterMonitor |
| `supabase.from('teacher_notes').*` | `GET/PUT /api/notes/teacher/:pageId` | TeacherStudyViewer |
| `supabase.from('teacher_student_comments').*` | `GET/PUT /api/comments/:pageId/:studentId` | StudentWorkViewer |
| `supabase.from('posts').*` | `GET/POST/PATCH/DELETE /api/posts` | TeacherBoard, BoardPostEditor |
| `supabase.from('post_files').*` | (posts 엔드포인트에 포함) | BoardPostEditor |
| `supabase.from('post_classrooms').*` | (posts 엔드포인트에 포함) | BoardPostEditor, BoardTab |
| `supabase.from('assignments').*` | `GET/POST/PATCH/DELETE /api/assignments` | AssignmentEditor |
| `supabase.from('assignment_pages').*` | `GET/POST/DELETE /api/assignment-pages` | AssignmentEditor |
| `supabase.from('assignment_submissions').*` | `GET/PUT /api/submissions` | AssignmentMonitor |
| `supabase.from('assignment_notes').*` | `GET/PUT /api/assignment-notes/:pageId` | AssignmentStudyViewer |
| `supabase.from('assignment_teacher_comments').*` | `GET/PUT /api/assignment-comments/:pageId/:studentId` | AssignmentWorkViewer |
| `supabase.storage.from().upload` | `POST /api/files/upload` | ChapterEditor, BoardPostEditor, AssignmentEditor |
| `supabase.storage.from().getPublicUrl` | URL 패턴: `/api/files/{bucket}/{path}` | 전체 |
| `supabase.storage.from().remove` | `DELETE /api/files/{bucket}/{path}` | ChapterEditor, BoardPostEditor |

**RLS → 서버 미들웨어 + 서비스 레이어 전환**:
- Routes: 요청 파싱, 입력 검증 (Fastify 스키마), 응답 형식 지정만 담당
- Services: DB 쿼리, 권한 검증 (`request.user.id`로 소유권 체크), Socket.IO 브로드캐스트 호출
- 기존 RLS의 JOIN 기반 권한 체크 (예: "교사가 자기 classroom의 student_notes만 조회") → 서비스 레이어에서 구현
- 이 분리로 테스트 용이성 확보 (서비스 단위 테스트 가능)

### 3-4. 실시간 (Supabase Realtime → Socket.IO)

**현재 Supabase 채널 → Socket.IO Room 매핑**:

| 현재 채널 | Socket.IO Room | 이벤트 | 데이터 |
|---|---|---|---|
| `monitor_{chapterId}` | `chapter:{chapterId}` | `student-note:updated` | `{ studentId, pageId, updatedAt }` |
| `sn_{pageId}_{studentId}` | `work:{pageId}:{studentId}` | `student-note:updated` | `{ excalidrawData }` |
| `tsc_{pageId}_{userId}` | `comments:{pageId}:{studentId}` | `teacher-comment:updated` | `{ excalidrawData }` |
| `asn_monitor_{assignmentId}` | `assignment:{assignmentId}` | `submission:updated` | `{ studentId, status, score }` |
| 과제 코멘트 채널 | `asn-comments:{pageId}:{studentId}` | `asn-comment:updated` | `{ excalidrawData }` |

**서버 브로드캐스트 패턴**: 서비스 레이어에서 DB upsert 성공 후 해당 room으로 emit
```typescript
// note.service.ts에서 upsert 후:
io.to(`chapter:${chapterId}`).emit('student-note:updated', { studentId, pageId, updatedAt });
io.to(`work:${pageId}:${studentId}`).emit('student-note:updated', { excalidrawData });
```

**무한 루프 방지 (중요)**:
Socket.IO로 데이터 수신 → `updateScene()` 호출 → Excalidraw `onChange` 트리거 → 다시 emit하는 무한 루프 방지 필수
```typescript
// 프론트엔드 뷰어에서:
const isRemoteUpdateRef = useRef(false);

// 수신 시
socket.on('teacher-comment:updated', (data) => {
  isRemoteUpdateRef.current = true;
  excalidrawAPI.updateScene({ elements: mergedElements });
  setTimeout(() => { isRemoteUpdateRef.current = false; }, 100);
});

// onChange 핸들러에서
const handleChange = (elements) => {
  if (isRemoteUpdateRef.current) return; // 원격 업데이트면 무시
  debouncedSave(elements); // 1500ms 디바운스 저장
};
```

**모바일 안정성**:
- `reconnectionAttempts: Infinity` (모바일 네트워크 끊김 대응)
- `pingInterval: 25000ms`, `pingTimeout: 60000ms`
- `visibilitychange` 이벤트 리스너로 탭 복귀 시 강제 재연결
- 재연결 시 room 자동 재참가 (Socket.IO room은 disconnect 시 해제됨)

### 3-5. 파일 저장소 (Supabase Storage → Railway Volume)

**Volume 마운트**: `/data/storage` (Railway Volume 설정)
**로컬 개발**: `./local-storage/` 디렉토리 사용 (`.gitignore`에 추가)

**디렉토리 구조**:
```
/data/storage/
  chapter-pages/
    chapters/{chapterId}/{timestamp}_{index}.{ext}
    assignments/{assignmentId}/{timestamp}_{index}.{ext}
  post-files/
    posts/{postId}/{timestamp}_{filename}.{ext}
```

**URL 변환** (동일 도메인이므로):
- 기존: `https://<project>.supabase.co/storage/v1/object/public/chapter-pages/chapters/...`
- 변경: `/api/files/chapter-pages/chapters/...` (상대 경로)

**캐싱**: 파일명에 타임스탬프 포함 → `Cache-Control: public, max-age=31536000, immutable`
**보안**: 경로 traversal 방지 (`path.resolve` 후 Volume 루트 밖 접근 차단)
**업로드 제한**: 이미지 10MB, Excalidraw JSON body 5MB (`Fastify bodyLimit`)

---

## 4. 프론트엔드 마이그레이션

### 4-1. 신규 API 클라이언트 (`src/lib/api.ts`)

`supabase.from(...)` 직접 호출을 대체하는 타입 안전한 API 클라이언트:
- Access Token을 메모리에 저장, 모든 요청에 `Authorization: Bearer` 헤더 추가
- 401 응답 시 자동으로 `POST /api/auth/refresh` 호출 후 재시도 (1회만)
- `uploadFiles()`: FormData 기반 multipart 업로드
- 동일 도메인이므로 base URL 없이 `/api/...` 상대경로 사용

### 4-2. Socket.IO 클라이언트 (`src/lib/socket.ts`)

- 싱글톤 패턴으로 연결 관리
- AuthContext에서 access token 변경 시 재연결
- room join/leave 헬퍼 함수 제공
- `visibilitychange` 리스너로 백그라운드 복귀 시 재연결
- 동일 도메인이므로 URL 지정 불필요 (`io()` 매개변수 없이 연결)

### 4-3. TypeScript 전환 순서 (의존성 역순)

1. `packages/shared/` — 공유 타입 정의
2. `src/lib/api.ts`, `src/lib/socket.ts` — 신규 파일 (처음부터 TS)
3. `src/contexts/AuthContext.jsx` → `.tsx` (Phase 1에서 완전 재작성)
4. `src/components/ProtectedRoute.jsx` → `.tsx` (Phase 1에서)
5. 단순 페이지: `Home`, `Login`, `ChooseRole`, `OAuthCallback` (Phase 1에서)
6. CRUD 페이지: `ClassroomList`, `ClassroomDetail`, `DashboardLayout` (Phase 2에서)
7. `src/lib/excalidrawUtils.js` → `.ts`, `src/lib/dataCache.js` → `.ts` (Phase 4에서)
8. 복잡한 뷰어: `StudyViewer`, `TeacherStudyViewer`, `StudentWorkViewer` (Phase 4에서)
9. 나머지 전체 정리 (Phase 7에서)

**공존 전략**: `tsconfig.json`에 `allowJs: true` 설정, `.jsx`와 `.tsx` 혼용 허용

### 4-4. 기존 코드 변경 최소화

- `excalidrawUtils.ts`의 `fetchAsDataUrl()` — URL만 변경되므로 코드 변경 불필요
- `dataCache.ts` — API 클라이언트로 fetch 부분만 교체
- Excalidraw 관련 로직 (touch, S Pen, bgPosition, element namespacing) — 변경 없음
- DrawingToolbar, PdfDownloadButton, SortablePageItem 등 UI 컴포넌트 — 변경 없음

---

## 5. 로컬 개발 환경

### 5-1. 개발 모드 실행 방법

```bash
# 터미널 1: 백엔드 (Fastify, port 3001)
npm run dev:server    # → packages/server의 tsx watch src/index.ts

# 터미널 2: 프론트엔드 (Vite dev server, port 3000)
npm run dev:client    # → packages/client의 vite dev

# 또는 동시 실행
npm run dev           # → concurrently로 둘 다 실행
```

### 5-2. Vite 프록시 설정 (개발 전용)

```typescript
// packages/client/vite.config.ts
export default defineConfig({
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:3001',      // REST API → 백엔드
      '/socket.io': {                        // Socket.IO → 백엔드
        target: 'http://localhost:3001',
        ws: true,
      },
    },
  },
});
```

### 5-3. 환경변수

**루트 `.env` (개발용)**:
```
DATABASE_URL=postgresql://postgres:password@localhost:5432/mathchois
JWT_SECRET=dev-secret-change-in-production
JWT_REFRESH_SECRET=dev-refresh-secret-change-in-production
GOOGLE_CLIENT_ID=<Google Cloud Console에서 발급>
GOOGLE_CLIENT_SECRET=<Google Cloud Console에서 발급>
VOLUME_PATH=./local-storage
PORT=3001
NODE_ENV=development
```

**Railway 환경변수 (프로덕션)**:
```
DATABASE_URL=<Railway PostgreSQL 내부 URL>
JWT_SECRET=<random-256-bit>
JWT_REFRESH_SECRET=<random-256-bit>
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
VOLUME_PATH=/data/storage
PORT=3001
NODE_ENV=production
```

**Google Cloud Console**: OAuth redirect URI에 개발용 `http://localhost:3001/api/auth/google/callback` + 프로덕션 URL 모두 등록

---

## 6. 구현 단계 (Phase별 상세 체크리스트)

### Phase 0: 인프라 셋업
- [ ] 기존 코드 git 브랜치 분리 (`git checkout -b migration/v2`)
- [ ] 루트 `package.json`을 workspace root로 변환 (`workspaces: ["packages/*"]`)
- [ ] `packages/shared/` 생성: `package.json`, `tsconfig.json`, 타입 파일들
  - [ ] `src/types/auth.ts` — User, Profile, TokenPayload
  - [ ] `src/types/models.ts` — 16개 테이블 모델 인터페이스
  - [ ] `src/types/api.ts` — API 요청/응답 타입
  - [ ] `src/types/socket.ts` — Socket.IO 이벤트 타입
  - [ ] `src/types/excalidraw.ts` — ExcalidrawData, BgPosition
  - [ ] `src/index.ts` — re-export
- [ ] `packages/server/` 생성: `package.json`, `tsconfig.json`
  - [ ] Fastify 보일러플레이트 (`src/index.ts`, `src/app.ts`)
  - [ ] 환경변수 설정 (`src/config/env.ts` — zod 검증)
  - [ ] DB 연결 (`src/config/database.ts` — Drizzle + postgres.js)
  - [ ] Drizzle 스키마 작성 (`src/db/schema.ts` — 16개 테이블)
  - [ ] Drizzle 관계 정의 (`src/db/relations.ts`)
  - [ ] `drizzle.config.ts`
  - [ ] Health check 엔드포인트 (`GET /api/health`)
  - [ ] Dockerfile 작성
- [ ] 기존 프론트엔드를 `packages/client/`로 이동
  - [ ] `src/`, `public/`, `index.html`, `vite.config.js` 등 이동
  - [ ] `packages/client/package.json` 생성 (기존 dependencies 분리)
  - [ ] `packages/client/tsconfig.json` 생성 (`allowJs: true`)
  - [ ] Vite 프록시 설정 추가
- [ ] 로컬 PostgreSQL 또는 Railway PostgreSQL 연결 확인
- [ ] `drizzle-kit push`로 테이블 생성 확인
- [ ] `npm run dev` (server + client 동시 실행) 동작 확인
- [ ] **검증**: health check 응답 + 프론트엔드 정상 렌더링

### Phase 1: 인증
- [ ] **서버**: `routes/auth.ts` + `services/auth.service.ts`
  - [ ] `GET /api/auth/google` — Google OAuth 인가 URL 리다이렉트
  - [ ] `GET /api/auth/google/callback` — code 교환, JWT 발급, 리다이렉트
  - [ ] `POST /api/auth/refresh` — refresh token으로 새 access token 발급
  - [ ] `POST /api/auth/logout` — refresh token 쿠키 제거
  - [ ] `GET /api/auth/me` — 현재 사용자 프로필 반환
  - [ ] `PATCH /api/profiles/role` — 역할 설정 (teacher/student)
- [ ] **서버**: `middleware/auth.ts` — JWT 검증 미들웨어
- [ ] **서버**: `middleware/roleGuard.ts` — 역할 체크 미들웨어
- [ ] **클라이언트**: `src/lib/api.ts` — API 클라이언트 (토큰 관리, 401 자동 갱신)
- [ ] **클라이언트**: `AuthContext.tsx` 재작성 (JWT 기반)
- [ ] **클라이언트**: `ProtectedRoute.tsx` 수정
- [ ] **클라이언트**: `OAuthCallback.tsx` 수정 (URL hash에서 토큰 추출)
- [ ] **클라이언트**: `Login.tsx` 수정 (signInWithGoogle → window.location.href)
- [ ] **클라이언트**: `ChooseRole.tsx` 수정 (API 호출로 변경)
- [ ] **클라이언트**: `Navbar.tsx` 수정 (signOut → API 호출)
- [ ] **검증**: Google 로그인 → 역할 선택 → 대시보드 진입 → 로그아웃 → 재로그인 (토큰 갱신)

### Phase 2: 핵심 CRUD API
- [ ] **서버**: `routes/classrooms.ts` + `services/classroom.service.ts`
  - [ ] GET (목록, 상세), POST (생성), PATCH (수정), DELETE (삭제)
  - [ ] `POST /api/classrooms/join` — 코드로 참가
  - [ ] `GET /api/classrooms/:id/members` — 멤버 목록
  - [ ] `DELETE /api/classrooms/:id/members/:studentId` — 멤버 제거
- [ ] **서버**: `routes/chapters.ts` + `services/chapter.service.ts`
  - [ ] GET (목록 with page count), POST, PATCH (title), DELETE
  - [ ] `PUT /api/chapters/reorder` — 순서 변경
- [ ] **서버**: `routes/pages.ts` + `services/page.service.ts`
  - [ ] GET (목록), DELETE
  - [ ] `PUT /api/pages/reorder` — 순서 변경
  - [ ] (이미지 업로드는 Phase 3에서)
- [ ] **클라이언트**: `ClassroomList.tsx` — Supabase → API
- [ ] **클라이언트**: `ClassroomDetail.tsx` — Supabase → API
- [ ] **클라이언트**: `DashboardLayout.tsx` — Supabase RPC → API (join + 사이드바 클래스 목록)
- [ ] **검증**: 교사 교실 생성 → 챕터 추가 → 학생 코드 참가 → 콘텐츠 조회

### Phase 3: 파일 저장소
- [ ] **서버**: `routes/storage.ts` + `services/storage.service.ts`
  - [ ] `POST /api/files/upload` — multipart 업로드 (bucket, directory 지정)
  - [ ] `GET /api/files/:bucket/*` — 파일 서빙 (Cache-Control 헤더)
  - [ ] `DELETE /api/files/:bucket/*` — 파일 삭제
  - [ ] 경로 traversal 방지 로직
- [ ] **서버**: pages 라우트에 이미지 업로드 연동 (`POST /api/chapters/:id/pages`)
- [ ] **클라이언트**: `ChapterEditor` — Storage 호출 → API
- [ ] **서버**: posts 라우트 구현 (`routes/posts.ts` + `services/post.service.ts`)
  - [ ] GET, POST (파일 첨부 포함), PATCH, DELETE
  - [ ] post_files, post_classrooms junction 처리
- [ ] **클라이언트**: `BoardPostEditor` — Storage 호출 → API
- [ ] **클라이언트**: `TeacherBoard` — Supabase → API
- [ ] **클라이언트**: `BoardTab` — Supabase → API
- [ ] **서버**: assignments 라우트 구현 (`routes/assignments.ts` + `services/assignment.service.ts`)
  - [ ] CRUD + assignment_pages 업로드
  - [ ] assignment_submissions CRUD
- [ ] **클라이언트**: `AssignmentEditor` — Supabase + Storage → API
- [ ] **클라이언트**: `AssignmentTab` — Supabase → API
- [ ] **검증**: 이미지 업로드 → 뷰어에서 표시 → 삭제 → Cache-Control 헤더 확인

### Phase 4: 필기/코멘트 API
- [ ] **서버**: `routes/notes.ts` + `services/note.service.ts`
  - [ ] `GET /api/notes/student/:pageId` — 학생 필기 조회
  - [ ] `PUT /api/notes/student/:pageId` — 학생 필기 upsert
  - [ ] `GET /api/notes/teacher/:pageId` — 교사 필기 조회
  - [ ] `PUT /api/notes/teacher/:pageId` — 교사 필기 upsert
  - [ ] `GET /api/notes/student-summary/:chapterId` — 챕터 전체 학생 진도 요약
  - [ ] `GET /api/notes/student-bulk?pageIds=...` — 복수 페이지 학생 필기 일괄 조회
- [ ] **서버**: `routes/comments.ts` + `services/comment.service.ts`
  - [ ] `GET /api/comments/:pageId/:studentId` — 교사 코멘트 조회
  - [ ] `PUT /api/comments/:pageId/:studentId` — 교사 코멘트 upsert
  - [ ] assignment_teacher_comments 동일 패턴
- [ ] **클라이언트**: `StudyViewer` — Supabase 호출 → API (Realtime은 Phase 5)
- [ ] **클라이언트**: `TeacherStudyViewer` — Supabase 호출 → API
- [ ] **클라이언트**: `StudentWorkViewer` — Supabase 호출 → API
- [ ] **클라이언트**: `ChapterMonitor` — Supabase 호출 → API (Realtime은 Phase 5)
- [ ] **클라이언트**: `AssignmentStudyViewer` — Supabase 호출 → API
- [ ] **클라이언트**: `AssignmentWorkViewer` — Supabase 호출 → API
- [ ] **클라이언트**: `AssignmentMonitor` — Supabase 호출 → API
- [ ] **클라이언트**: `dataCache.ts` — Supabase 호출 → API
- [ ] **검증**: Excalidraw 필기 저장 → 페이지 이동 → 복귀 시 불러오기 확인

### Phase 5: 실시간 (Socket.IO)
- [ ] **서버**: `socket/index.ts` — Socket.IO 서버 설정 + JWT 인증 미들웨어
- [ ] **서버**: `socket/handlers/notes.ts` — room join/leave, student-note:updated 핸들러
- [ ] **서버**: `socket/handlers/comments.ts` — teacher-comment:updated 핸들러
- [ ] **서버**: `socket/handlers/assignments.ts` — submission:updated, asn-comment:updated 핸들러
- [ ] **서버**: 각 서비스에서 DB upsert 후 `io.to(room).emit()` 호출 추가
- [ ] **클라이언트**: `src/lib/socket.ts` — Socket.IO 클라이언트 (싱글톤, 재연결, room 관리)
- [ ] **클라이언트**: `ChapterMonitor` — Supabase Realtime → Socket.IO
- [ ] **클라이언트**: `StudyViewer` — Supabase Realtime → Socket.IO (+ isRemoteUpdate 무한루프 방지)
- [ ] **클라이언트**: `StudentWorkViewer` — Supabase Realtime → Socket.IO
- [ ] **클라이언트**: `AssignmentMonitor` — Supabase Realtime → Socket.IO
- [ ] **클라이언트**: `AssignmentStudyViewer` — Supabase Realtime → Socket.IO
- [ ] **클라이언트**: `AssignmentWorkViewer` — Supabase Realtime → Socket.IO
- [ ] **검증**: 두 브라우저 탭에서 실시간 동기화 확인

### Phase 6: 정리 및 배포
- [ ] `@supabase/supabase-js` 의존성 제거
- [ ] `src/lib/supabase.js` 삭제
- [ ] 모든 supabase import 참조 제거 확인 (`grep -r "supabase"`)
- [ ] Vite 설정에서 Supabase vendor chunk 제거
- [ ] Railway 배포 설정 (Dockerfile, Volume 마운트, 환경변수)
- [ ] Google Cloud Console: 프로덕션 OAuth redirect URI 추가
- [ ] Railway PostgreSQL에 `drizzle-kit push` 실행
- [ ] 프로덕션 배포 + 전체 기능 검증
- [ ] **검증**: 프로덕션에서 전체 플로우 E2E 테스트

### Phase 7: TypeScript 정리 (병행 가능)
- [ ] 나머지 `.jsx` → `.tsx` 전환 (UI 컴포넌트)
- [ ] `excalidrawUtils.js` → `.ts`
- [ ] `dataCache.js` → `.ts`
- [ ] `pdfExporter.js` → `.ts`
- [ ] `allowJs: true` 제거
- [ ] strict mode 활성화
- [ ] Playwright 테스트 업데이트
- [ ] MEMORY.md 업데이트 (새 아키텍처 반영)

---

## 7. 예상 문제점 및 해결방안

### Fastify + SPA 폴백
**문제**: Fastify가 React Router의 클라이언트 라우팅을 이해하지 못함
**해결**: `@fastify/static` + 커스텀 404 핸들러로 non-API 요청을 `index.html`로 폴백
```typescript
// 모든 /api/* 라우트 등록 후:
app.setNotFoundHandler((req, reply) => {
  if (req.url.startsWith('/api/')) {
    reply.code(404).send({ error: 'Not found' });
  } else {
    reply.sendFile('index.html'); // SPA fallback
  }
});
```

### Excalidraw 대용량 JSON 페이로드
**문제**: excalidraw_data가 2MB+ 가능 (DataURL 이미지 포함)
**해결**:
- Fastify `bodyLimit: 5MB` 설정
- 향후 필요시 이미지를 별도 Storage로 분리하고 excalidraw_data에는 URL만 저장
- PostgreSQL JSONB는 최대 1GB — 문제없음

### 모바일 WebSocket 안정성
**문제**: 모바일에서 네트워크 전환/앱 백그라운드 시 연결 끊김
**해결**:
- Socket.IO 내장 exponential backoff 재연결
- `visibilitychange` 리스너로 탭 복귀 시 강제 재연결
- 재연결 시 room 자동 재참가 로직 필수

### Refresh Token 보안
**문제**: 토큰 탈취 위험
**해결**:
- HTTP-only Secure 쿠키, `SameSite=Strict` (단일 도메인이므로 가능)
- `Path=/api/auth/refresh`로 제한
- 사용 시마다 토큰 로테이션 (한번 사용된 refresh token 무효화)

### Railway Volume 백업
**문제**: Railway Volume은 자동 백업 없음
**해결**: 주기적 백업 스크립트 또는 중요 파일 외부 저장 고려

### DB 커넥션
**문제**: Railway PostgreSQL 커넥션 수 제한
**해결**: `postgres.js`의 기본 풀링 (max 10, 조정 가능)

---

## 8. 검증 계획

| Phase | 검증 방법 |
|---|---|
| Phase 0 | `npm run dev` → health check 응답 + 프론트 렌더링 |
| Phase 1 | Google 로그인 → JWT 발급 → 역할 선택 → 대시보드 → 로그아웃 → 15분 후 자동 갱신 |
| Phase 2 | 교사: 교실 생성 → 챕터 추가 → 순서변경, 학생: 코드 참가 → 콘텐츠 조회 |
| Phase 3 | 이미지 업로드 → 뷰어 표시 → 삭제 → Cache-Control 확인 → 게시글 첨부파일 |
| Phase 4 | Excalidraw 필기 → 페이지 이동 → 복귀 시 저장 확인 → 교사 코멘트 저장/조회 |
| Phase 5 | 2개 탭: 학생 필기 → 교사 모니터 실시간, 교사 코멘트 → 학생 실시간 수신 |
| Phase 6 | 프로덕션 배포 → 전체 E2E 플로우 |

---

## 9. 핵심 수정 대상 파일 (20개 → 삭제/재작성/수정)

| 파일 | 변경 내용 | Phase |
|---|---|---|
| `src/lib/supabase.js` | **삭제** → `api.ts` + `socket.ts`로 대체 | 6 |
| `src/contexts/AuthContext.jsx` | **완전 재작성** → JWT 기반 `.tsx` | 1 |
| `src/components/ProtectedRoute.jsx` | AuthContext 인터페이스 변경 | 1 |
| `src/pages/Home.jsx` | 로그인 버튼 수정 | 1 |
| `src/pages/Login.jsx` | signInWithGoogle → location.href | 1 |
| `src/pages/OAuthCallback.jsx` | hash에서 토큰 추출 | 1 |
| `src/pages/ChooseRole.jsx` | API 호출로 변경 | 1 |
| `src/components/Navbar.jsx` | signOut → API | 1 |
| `src/pages/Classrooms/ClassroomList.jsx` | Supabase → API | 2 |
| `src/pages/Classrooms/ClassroomDetail.jsx` | Supabase → API | 2 |
| `src/layouts/DashboardLayout.jsx` | Supabase RPC → API | 2 |
| `src/pages/Chapters/Editor.jsx` | Supabase + Storage → API | 3 |
| `src/pages/Board/TeacherBoard.jsx` | Supabase → API | 3 |
| `src/pages/Board/BoardPostEditor.jsx` | Supabase + Storage → API | 3 |
| `src/components/board/BoardTab.jsx` | Supabase → API | 3 |
| `src/pages/Assignment/AssignmentEditor.jsx` | Supabase + Storage → API | 3 |
| `src/components/assignment/AssignmentTab.jsx` | Supabase → API | 3 |
| `src/pages/Study/StudyViewer.jsx` | Supabase → API + Socket.IO | 4+5 |
| `src/pages/Study/TeacherStudyViewer.jsx` | Supabase → API | 4 |
| `src/pages/Monitor/ChapterMonitor.jsx` | Supabase → API + Socket.IO | 4+5 |
| `src/pages/Monitor/StudentWorkViewer.jsx` | Supabase → API + Socket.IO | 4+5 |
| `src/pages/Assignment/AssignmentMonitor.jsx` | Supabase → API + Socket.IO | 4+5 |
| `src/pages/Assignment/AssignmentStudyViewer.jsx` | Supabase → API + Socket.IO | 4+5 |
| `src/pages/Assignment/AssignmentWorkViewer.jsx` | Supabase → API + Socket.IO | 4+5 |
| `src/lib/dataCache.js` | Supabase → API | 4 |

---

## 10. 추가 고려사항

1. **Excalidraw의 files 객체**: DataURL을 JSONB에 직접 저장하므로 DB 용량 주의. 향후 이미지를 Volume으로 분리하는 최적화 고려
2. **Railway Volume 백업**: 자동 백업 없음 → 백업 스크립트 필요
3. **Socket.IO sticky session**: 단일 인스턴스이면 문제없으나 스케일업 시 Redis adapter 필요
4. **기존 localStorage 키 호환**: `mc_lastPage_${chapterId}` 등 유지 → 영향 없음
5. **Playwright 테스트**: API mock 또는 테스트용 DB seed 스크립트 필요
6. **Google Cloud Console 설정 변경**: OAuth redirect URI를 자체 백엔드로 변경 필수
7. **Vite dev proxy vs Production static**: 개발은 Vite proxy, 프로덕션은 Fastify static. 동작 차이 없도록 API 경로 통일 (`/api/...`)
