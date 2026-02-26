# MathChois 마이그레이션 진행 상황

> **이 파일은 모든 세션에서 가장 먼저 읽어야 합니다.**
> 표시: `[x]` 완료, `[~]` 진행중, `[!]` 이슈 발견, `[ ]` 미완료

## 현재 상태

- **현재 Phase**: Phase 0-6 전체 완료, Phase 7 미착수
- **마지막 작업 세션**: 2026-02-27
- **프로덕션**: `class.chois.ai.kr` 배포 완료, 정상 운영 중
- **DB 상태**: 스키마 코드(`schema.ts`)와 프로덕션 DB 100% 일치 확인 (2026-02-27)
- **다음 할 일**: Phase 7 (TypeScript 정리) 또는 추가 기능 개발

---

## Phase 0: 인프라 셋업

### 0-1. Git 브랜치 및 모노레포 구조
- [x] `git checkout -b migration/v2` 브랜치 생성
- [x] 루트 `package.json`을 workspace root로 변환
- [x] `tsconfig.base.json` 생성 (공유 TS 설정)
- [x] `.gitignore`에 `local-storage/` 추가

### 0-2. packages/shared (공유 타입)
- [x] `packages/shared/package.json` 생성 (`@mathchois/shared`)
- [x] `packages/shared/tsconfig.json` 생성
- [x] `src/types/auth.ts` — User, Profile, TokenPayload, Session 타입
- [x] `src/types/models.ts` — 16개 테이블 모델 인터페이스
- [x] `src/types/api.ts` — API 요청/응답 타입
- [x] `src/types/socket.ts` — Socket.IO 이벤트/Room 타입
- [x] `src/types/excalidraw.ts` — ExcalidrawData, BgPosition 타입
- [x] `src/index.ts` — re-export

### 0-3. packages/server (백엔드 보일러플레이트)
- [x] `packages/server/package.json` 생성 (`@mathchois/server`)
- [x] `packages/server/tsconfig.json` 생성
- [x] 의존성 설치: fastify, drizzle-orm, postgres, zod, jsonwebtoken, etc.
- [x] `src/index.ts` — Fastify 서버 시작 (port: 3001)
- [x] `src/app.ts` — 플러그인 등록 (cors, cookie, multipart, static)
- [x] `src/config/env.ts` — 환경변수 zod 검증
- [x] `src/config/database.ts` — Drizzle + postgres.js 연결
- [x] `GET /api/health` 엔드포인트
- [x] Dockerfile 작성

### 0-4. Drizzle 스키마 (16개 테이블)
- [x] `src/db/schema.ts` — 전체 16개 테이블 완료
- [ ] `src/db/relations.ts` — 관계 정의 (필요 시 추가)
- [x] `drizzle.config.ts`
- [x] 인덱스 정의 (9개)

### 0-5. 기존 프론트엔드 이동
- [x] 모노레포 구조 이동 완료
- [x] Vite 프록시 설정 (`/api` → localhost:3001, `/socket.io` → ws)

### 0-6. 통합 확인
- [x] DB 연결 확인
- [x] `drizzle-kit push` 실행 완료 (프로덕션 DB 스키마 동기화 확인)
- [x] 서버 단독 실행 확인
- [x] 프론트엔드 빌드 확인
- [x] **Phase 0 완료 커밋**

---

## Phase 1: 인증

### 1-1. 서버 인증 엔드포인트
- [x] 전체 완료 (auth.ts, auth.service.ts, middleware)

### 1-2. 클라이언트 인증 전환
- [x] `api.ts` 생성 — API 클라이언트 (Bearer 토큰, 401 singleton refresh)
- [x] `AuthContext.jsx` 재작성 (JWT 기반 + Socket.IO 연결)
- [x] `Navbar.jsx` 수정 (avatarUrl camelCase)
- [x] **Phase 1 코드 완료 커밋**

---

## Phase 2: 핵심 CRUD API

### 2-1. 서버 CRUD 라우트
- [x] classrooms (9 endpoints), chapters (7 endpoints), pages (4 endpoints)
- [x] Route ordering 버그 수정 (/join, /other 을 /:id 보다 앞에)

### 2-2. 클라이언트 CRUD 전환
- [x] `ClassroomList` — api.get/post 전환 완료
- [x] `ClassroomDetail` — api 전환 완료 (챕터 CRUD, 멤버, dnd-kit, import)
- [x] `DashboardLayout` — api 전환 완료 (join, sidebar classrooms)
- [x] `ChapterList` — api 전환 완료

---

## Phase 3: 파일 저장소 + 게시판/과제

### 3-1. 서버 파일 저장소
- [x] storage.service.ts + routes/storage.ts 완료
- [x] chapters DELETE Storage 정리 완료 (orphan 이미지만 삭제)

### 3-2. 게시판/과제 라우트
- [x] posts (5 endpoints) + assignments (10+ endpoints) 완료
- [x] GET /api/classrooms/:cid/posts 추가
- [x] GET /api/submissions/counts 추가
- [x] GET /api/posts/:id 추가 (편집용)
- [x] GET /api/profiles/:id 추가

### 3-3. 클라이언트 전환
- [x] `ChapterEditor (Editor.jsx)` — api 전환 + snake_case 제거
- [x] `BoardPostEditor` — api 전환 + snake_case 제거
- [x] `TeacherBoard` — api 전환 완료
- [x] `BoardTab` — api 전환 완료
- [x] `AssignmentEditor` — api 전환 + snake_case 제거
- [x] `AssignmentTab` — api 전환 완료

---

## Phase 4: 필기/코멘트 API

### 4-1. 서버 필기/코멘트 라우트
- [x] 전체 완료 (notes.ts, comments.ts)
- [x] GET /api/comments/:pageId/for-student 추가 (학생이 본인 코멘트 읽기)
- [x] GET /api/notes/teacher-for-page/:pageId 추가
- [x] GET /api/notes/teacher-bulk?pageIds 추가
- [x] GET /api/notes/student-notes-for/:studentId?pageIds 추가
- [x] GET /api/notes/teacher-comments-for/:studentId?pageIds 추가
- [x] GET /api/assignment-notes/:assignmentId/bulk 추가

### 4-2. 클라이언트 전환
- [x] `dataCache.js` — api 전환 완료 (supabase 파라미터 제거)
- [x] `StudyViewer` — api + Socket.IO 전환 완료
- [x] `TeacherStudyViewer` — api 전환 완료
- [x] `StudentWorkViewer` — api + Socket.IO 전환 완료
- [x] `ChapterMonitor` — api + Socket.IO 전환 완료
- [x] `AssignmentStudyViewer` — api + Socket.IO 전환 완료
- [x] `AssignmentWorkViewer` — api 전환 완료
- [x] `AssignmentMonitor` — api + Socket.IO 전환 완료

---

## Phase 5: 실시간 (Socket.IO)

### 5-1. 서버 Socket.IO
- [x] 전체 완료 (index.ts, handlers: notes, comments, assignments, presence)

### 5-2. 클라이언트 Socket.IO
- [x] `src/lib/socket.ts` 생성 (싱글톤, 재연결, room 관리, visibilitychange)
- [x] `AuthContext.jsx` — connectSocket/disconnectSocket/reconnectWithToken 연동
- [x] `ChapterMonitor` — subscribeToRoom('chapter:...', 'student-note:updated')
- [x] `StudyViewer` — subscribeToRoom('comments:...', 'teacher-comment:updated')
- [x] `StudentWorkViewer` — subscribeToRoom('work:...', 'student-note:updated')
- [x] `AssignmentMonitor` — subscribeToRoom('assignment:...', 'submission:updated')
- [x] `AssignmentStudyViewer` — subscribeToRoom('asn-comments:...', 'asn-comment:updated')
- [x] `SortablePageItem.jsx` — imageUrl camelCase 수정
- [x] 학생 접속 상태(Presence) 실시간 추적 (2026-02-27)
  - 서버: `handlers/presence.ts` — 인메모리 presence 관리, 권한 검증
  - 클라이언트: `StudyViewer` — presence:enter/leave + 재연결 처리
  - 클라이언트: `ChapterMonitor` — 접속 상태 표시 (초록 점 + "N페이지 학습 중")

---

## Phase 6: 정리 및 배포

### 6-1. Supabase 제거
- [x] `@supabase/supabase-js` 의존성 제거 (package.json)
- [x] `src/lib/supabase.js` 비움 (삭제는 수동: `rm packages/client/src/lib/supabase.js`)
- [x] `grep -r "supabase"` → 모든 import 제거 확인 (0 matches in .jsx/.js)
- [x] Vite manualChunks에서 vendor-supabase 제거
- [x] `.env.local`에서 VITE_SUPABASE_* 환경변수 불필요

### 6-2. 프로덕션 배포
- [x] `npm install` 실행 (lockfile에서 supabase 제거, bcrypt 추가)
- [x] 커밋 + 푸시
- [x] Railway Volume 마운트 설정 (`/data/storage`)
- [x] Railway 환경변수 설정 (DATABASE_URL, JWT_SECRET, GOOGLE_*, SMTP_*, VOLUME_PATH)
- [x] Google Cloud Console: 프로덕션 OAuth redirect URI 추가
- [x] Google OAuth 브랜딩 검증 완료 (2026-02-26)
  - packages/client/index.html: 정적 HTML fallback + og:url, canonical meta 추가
  - packages/client/public/privacy.html: 정적 개인정보처리방침 페이지 신규
  - packages/client/public/robots.txt: 크롤러 허용 정책
  - DNS: Cloudflare proxy 비활성화 → Railway IP 직접 연결 (class.chois.ai.kr → 66.33.22.1)
- [x] Railway PostgreSQL `drizzle-kit push` 완료 (DB 스키마 동기화 확인)
- [x] 배포 완료 — Railway ChoisClass 서비스 SUCCESS (2026-02-27)

### 6-3. 검증
- [x] 프로덕션에서 전체 로그인 플로우 (Google OAuth + 이메일/비밀번호)
- [x] 프로덕션에서 이미지 업로드/다운로드
- [x] 프로덕션에서 필기 저장/불러오기
- [x] 프로덕션에서 Socket.IO 실시간 동기화
- [x] **Phase 6 완료**

---

## Phase 7: TypeScript 정리 (병행 가능)

- [ ] 나머지 `.jsx` → `.tsx` 전환
- [ ] `.js` → `.ts` 전환
- [ ] strict mode 활성화
- [ ] Playwright 테스트 업데이트
- [ ] **Phase 7 완료 커밋**

---

## 이슈 로그

| 날짜 | Phase | 이슈 | 상태 | 해결 |
|---|---|---|---|---|
| 02-25 | 2 | Route ordering: /join, /other가 /:id 이후 등록 | ✅ | classrooms.ts 순서 변경 |
| 02-25 | 1 | api.ts 401 race condition (동시 다중 refresh) | ✅ | singleton promise 패턴 |
| 02-25 | 4 | 학생이 본인 코멘트 읽기 불가 (GET /api/comments 서버 버그) | ✅ | GET /api/comments/:pageId/for-student 추가 |
| 02-25 | 5 | AssignmentWorkViewer에 assignment notes Realtime 없음 | ⚠️ | TODO — 서버 Socket.IO 이벤트 미구현 |
| 02-27 | 6 | drizzle-kit push가 pg_stat_statements 뷰 삭제 시도 | ✅ | Railway 내부 확장 충돌 — 수동 SQL 대신 직접 스키마 비교로 확인 |
