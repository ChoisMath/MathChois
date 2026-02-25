# MathChois 마이그레이션 진행 상황

> **이 파일은 모든 세션에서 가장 먼저 읽어야 합니다.**
> 표시: `[x]` 완료, `[~]` 진행중, `[!]` 이슈 발견, `[ ]` 미완료

## 현재 상태

- **현재 Phase**: Phase 2 (서버측 완료) → Phase 3 시작 예정
- **마지막 작업 세션**: 2026-02-25
- **다음 할 일**: Phase 3 파일 저장소 + 게시판/과제 라우트
- **블로커**: 없음
- **참고**: Supabase는 현재 서비스 중이나, 이전할 데이터 없음. 새 백엔드를 처음부터 구축.

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
- [x] `src/db/schema.ts` — profiles (google_id 포함)
- [x] `src/db/schema.ts` — classrooms, classroom_members
- [x] `src/db/schema.ts` — chapters, pages
- [x] `src/db/schema.ts` — student_notes, teacher_notes, teacher_student_comments
- [x] `src/db/schema.ts` — posts, post_files, post_classrooms
- [x] `src/db/schema.ts` — assignments, assignment_pages, assignment_submissions
- [x] `src/db/schema.ts` — assignment_notes, assignment_teacher_comments
- [ ] `src/db/relations.ts` — 관계 정의 (Phase 2에서 필요 시 추가)
- [x] `drizzle.config.ts`
- [x] 인덱스 정의 (9개)

### 0-5. 기존 프론트엔드 이동
- [x] `src/` → `packages/client/src/` 이동
- [x] `public/` → `packages/client/public/` 이동
- [x] `index.html` → `packages/client/` 이동
- [x] `vite.config.js` → `packages/client/vite.config.js` (프록시 추가)
- [x] `tailwind.config.js`, `postcss.config.js` → `packages/client/` 이동
- [x] `packages/client/package.json` 생성 (기존 dependencies 분리)
- [x] `packages/client/tsconfig.json` 생성 (`allowJs: true`)
- [x] Vite 프록시 설정 (`/api` → localhost:3001, `/socket.io` → ws)

### 0-6. 통합 확인
- [ ] DB 연결 확인 (로컬 또는 Railway PostgreSQL) — Railway DB 준비 후
- [ ] `drizzle-kit push` 실행 → 16개 테이블 생성 확인 — Railway DB 준비 후
- [x] `npm run dev` → 서버(3001) + 클라이언트(3000) 동시 실행 (서버 단독 확인 완료)
- [x] `/api/health` 응답 확인 ✅ `{"status":"ok","timestamp":"..."}`
- [x] 프론트엔드 정상 빌드 확인 (`vite build` 성공)
- [x] 서버 TypeScript 타입체크 통과 (`tsc --noEmit`)
- [x] **Phase 0 완료 커밋**

---

## Phase 1: 인증

### 1-1. 서버 인증 엔드포인트
- [x] `middleware/auth.ts` — JWT 검증 미들웨어
- [x] `middleware/roleGuard.ts` — teacher/student 역할 체크
- [x] `services/auth.service.ts` — Google OAuth 토큰 교환, JWT 발급/검증, 프로필 CRUD
- [x] `routes/auth.ts` — GET /api/auth/google (인가 URL 리다이렉트)
- [x] `routes/auth.ts` — GET /api/auth/google/callback (code 교환 → JWT → 프론트 리다이렉트)
- [x] `routes/auth.ts` — POST /api/auth/refresh (쿠키에서 refresh token → 새 access token)
- [x] `routes/auth.ts` — POST /api/auth/logout (쿠키 제거)
- [x] `routes/auth.ts` — GET /api/auth/me (현재 사용자 프로필)
- [x] `routes/auth.ts` — PATCH /api/profiles/role (역할 설정)
- [x] 서버 인증 단독 테스트 (curl) ✅ 401/200 응답 확인

### 1-2. 클라이언트 인증 전환
- [x] `src/lib/api.ts` 생성 — API 클라이언트 (Bearer 토큰, 401 자동 갱신)
- [x] `AuthContext.jsx` 재작성 (JWT 기반, Supabase 제거)
- [ ] `ProtectedRoute.jsx` → `.tsx` 수정 — 변경 불필요 (useAuth 인터페이스 동일)
- [ ] `OAuthCallback.jsx` → `.tsx` 수정 — 변경 불필요 (토큰 추출은 AuthContext에서 처리)
- [ ] `Login.jsx` → `.tsx` 수정 — 변경 불필요 (signInWithGoogle 인터페이스 동일)
- [ ] `ChooseRole.jsx` → `.tsx` 수정 — 변경 불필요 (updateRole 인터페이스 동일)
- [x] `Navbar.jsx` 수정 (avatarUrl camelCase 호환)
- [ ] `Home.jsx` → `.tsx` 수정 — 변경 불필요 (signInWithGoogle 인터페이스 동일)

### 1-3. 검증 (실제 DB 연결 후)
- [ ] Google 로그인 → 첫 로그인 시 프로필 자동 생성
- [ ] 역할 선택 → 대시보드 리다이렉트
- [ ] 로그아웃 → 재로그인
- [ ] 페이지 새로고침 시 세션 유지 (refresh token으로 자동 복원)
- [ ] 15분+ 방치 후 API 호출 시 자동 토큰 갱신
- [x] **Phase 1 코드 완료 커밋**

---

## Phase 2: 핵심 CRUD API

### 2-1. 서버 CRUD 라우트
- [x] `services/classroom.service.ts` + `routes/classrooms.ts`
  - [x] GET /api/classrooms (역할별 필터링)
  - [x] GET /api/classrooms/:id (상세)
  - [x] POST /api/classrooms (교사 전용, class_code 자동 생성)
  - [x] PATCH /api/classrooms/:id (교사 전용)
  - [x] DELETE /api/classrooms/:id (교사 전용, CASCADE)
  - [x] POST /api/classrooms/join (학생: 코드로 참가)
  - [x] GET /api/classrooms/:id/members (멤버 목록 + 프로필)
  - [x] DELETE /api/classrooms/:id/members/:studentId (멤버 제거)
  - [x] GET /api/classrooms/other/:excludeId (다른 교실 목록, import/export용)
- [x] `services/chapter.service.ts` + `routes/chapters.ts`
  - [x] GET /api/classrooms/:cid/chapters (목록, pages 포함)
  - [x] GET /api/chapters/:id (상세)
  - [x] POST /api/classrooms/:cid/chapters
  - [x] PATCH /api/chapters/:id (title, description)
  - [x] DELETE /api/chapters/:id (CASCADE, Storage 정리는 Phase 3)
  - [x] PUT /api/chapters/reorder (bulk position update)
  - [x] POST /api/chapters/:id/import (챕터 복제)
- [x] `services/page.service.ts` + `routes/pages.ts`
  - [x] GET /api/chapters/:chapterId/pages (목록)
  - [x] POST /api/chapters/:chapterId/pages (단일/배치)
  - [x] DELETE /api/pages/:id
  - [x] PUT /api/pages/reorder (bulk position update)

### 2-2. 클라이언트 CRUD 전환
- [ ] `ClassroomList` — supabase.from → api 호출
- [ ] `ClassroomDetail` — supabase.from → api 호출 (챕터 목록, 멤버, 삭제, dnd-kit reorder)
- [ ] `DashboardLayout` — supabase.rpc('join_classroom_by_code') → api.joinClassroom()
- [ ] `DashboardLayout` — 학생 사이드바 클래스 목록 supabase → api

### 2-3. 검증
- [ ] 교사: 교실 생성 → 교실명 수정 → 교실 삭제
- [ ] 교사: 챕터 추가 → 순서 변경 (드래그) → 챕터 삭제
- [ ] 학생: 코드로 교실 참가 → 교실 목록 확인 → 챕터 목록 확인
- [ ] 교사: 학생 멤버 조회 → 멤버 제거
- [ ] **Phase 2 완료 커밋**

---

## Phase 3: 파일 저장소

### 3-1. 서버 파일 저장소
- [ ] `services/storage.service.ts` — Volume 파일 처리
  - [ ] upload(bucket, directory, file) → URL 반환
  - [ ] serve(bucket, path) → 파일 스트림 + Cache-Control
  - [ ] remove(bucket, path) → 파일 삭제
  - [ ] 경로 traversal 방지 로직
- [ ] `routes/storage.ts`
  - [ ] POST /api/files/upload (multipart, 교사 전용)
  - [ ] GET /api/files/:bucket/* (public, 캐시 헤더)
  - [ ] DELETE /api/files/:bucket/* (교사 전용)
- [ ] chapters 라우트에 이미지 업로드 연동: POST /api/chapters/:id/pages (multipart)
- [ ] chapters DELETE에 Storage 파일 정리 추가

### 3-2. 게시판/과제 라우트
- [ ] `services/post.service.ts` + `routes/posts.ts`
  - [ ] GET /api/posts (교사: 전체, 학생: 소속 교실 글만)
  - [ ] POST /api/posts (파일 첨부 + post_classrooms)
  - [ ] PATCH /api/posts/:id
  - [ ] DELETE /api/posts/:id (파일 정리 포함)
- [ ] `services/assignment.service.ts` + `routes/assignments.ts`
  - [ ] GET /api/classrooms/:cid/assignments
  - [ ] POST /api/classrooms/:cid/assignments
  - [ ] PATCH /api/assignments/:id
  - [ ] DELETE /api/assignments/:id (파일 정리)
  - [ ] POST /api/assignments/:id/pages (이미지 업로드)
  - [ ] GET /api/assignments/:id/pages
  - [ ] GET /api/assignments/:id/submissions
  - [ ] PUT /api/submissions/:assignmentId/:studentId

### 3-3. 클라이언트 전환
- [ ] `ChapterEditor` — supabase.storage → api.uploadFiles + api 호출
- [ ] `BoardPostEditor` — supabase.storage → api 호출
- [ ] `TeacherBoard` — supabase → api 호출
- [ ] `BoardTab` — supabase → api 호출
- [ ] `AssignmentEditor` — supabase + storage → api 호출
- [ ] `AssignmentTab` — supabase → api 호출

### 3-4. 검증
- [ ] ChapterEditor: 이미지 업로드 → 페이지 뷰어에서 표시
- [ ] ChapterEditor: 페이지 삭제 → Storage 파일도 삭제
- [ ] BoardPostEditor: 파일 첨부 → 다운로드 → 삭제
- [ ] AssignmentEditor: 이미지 업로드 → 과제 뷰어에서 표시
- [ ] 브라우저 DevTools: Cache-Control 헤더 확인
- [ ] **Phase 3 완료 커밋**

---

## Phase 4: 필기/코멘트 API

### 4-1. 서버 필기/코멘트 라우트
- [ ] `services/note.service.ts` + `routes/notes.ts`
  - [ ] GET /api/notes/student/:pageId (학생 본인 필기)
  - [ ] PUT /api/notes/student/:pageId (upsert — onConflictDoUpdate)
  - [ ] GET /api/notes/teacher/:pageId (교사 필기)
  - [ ] PUT /api/notes/teacher/:pageId (upsert)
  - [ ] GET /api/notes/student-summary/:chapterId (전체 학생 진도)
  - [ ] GET /api/notes/student-bulk?pageIds=... (복수 페이지 필기 일괄)
- [ ] `services/comment.service.ts` + `routes/comments.ts`
  - [ ] GET /api/comments/:pageId/:studentId (교사 코멘트)
  - [ ] PUT /api/comments/:pageId/:studentId (upsert)
  - [ ] GET /api/assignment-comments/:pageId/:studentId
  - [ ] PUT /api/assignment-comments/:pageId/:studentId
  - [ ] GET /api/assignment-notes/:pageId (학생 과제 필기)
  - [ ] PUT /api/assignment-notes/:pageId (upsert)

### 4-2. 클라이언트 전환
- [ ] `dataCache.ts` — supabase → api 호출로 교체
- [ ] `StudyViewer` — supabase 호출 → api (Realtime은 Phase 5에서)
- [ ] `TeacherStudyViewer` — supabase → api
- [ ] `StudentWorkViewer` — supabase → api
- [ ] `ChapterMonitor` — supabase → api (Realtime은 Phase 5에서)
- [ ] `AssignmentStudyViewer` — supabase → api
- [ ] `AssignmentWorkViewer` — supabase → api
- [ ] `AssignmentMonitor` — supabase → api

### 4-3. 검증
- [ ] StudyViewer: 필기 → 페이지 이동 → 복귀 → 저장 확인
- [ ] TeacherStudyViewer: 교사 필기 저장/불러오기
- [ ] StudentWorkViewer: 학생 필기 조회 + 코멘트 저장
- [ ] ChapterMonitor: 학생 진도 요약 표시
- [ ] 과제 뷰어들: 동일 패턴 확인
- [ ] auto-save debounce (1500ms) 동작 확인
- [ ] **Phase 4 완료 커밋**

---

## Phase 5: 실시간 (Socket.IO)

### 5-1. 서버 Socket.IO
- [ ] `socket/index.ts` — Socket.IO 서버 + JWT 인증 미들웨어
- [ ] `socket/handlers/notes.ts` — join/leave room, student-note:updated
- [ ] `socket/handlers/comments.ts` — teacher-comment:updated
- [ ] `socket/handlers/assignments.ts` — submission:updated, asn-comment:updated
- [ ] 각 서비스(.service.ts)에 DB upsert 후 io.to(room).emit() 추가

### 5-2. 클라이언트 Socket.IO
- [ ] `src/lib/socket.ts` 생성 (싱글톤, 재연결, room join/leave, visibilitychange)
- [ ] `ChapterMonitor` — Supabase channel → socket.on('student-note:updated')
- [ ] `StudyViewer` — Supabase channel → socket.on('teacher-comment:updated') + isRemoteUpdate 방지
- [ ] `StudentWorkViewer` — Supabase channel → socket.on('student-note:updated')
- [ ] `AssignmentMonitor` — Supabase channel → socket.on('submission:updated')
- [ ] `AssignmentStudyViewer` — Supabase channel → socket.on('asn-comment:updated')
- [ ] `AssignmentWorkViewer` — Supabase channel → socket.on('asn-comment:updated')

### 5-3. 검증
- [ ] 2개 탭: 학생 필기 → 교사 ChapterMonitor 진도 실시간 갱신
- [ ] 2개 탭: 교사 코멘트 → 학생 StudyViewer 실시간 수신
- [ ] 2개 탭: 학생 필기 → 교사 StudentWorkViewer 실시간 확인
- [ ] 과제: 학생 제출 → AssignmentMonitor 실시간 갱신
- [ ] 모바일: 탭 백그라운드 → 복귀 → 재연결 확인
- [ ] 무한 루프 없음 확인 (isRemoteUpdate)
- [ ] **Phase 5 완료 커밋**

---

## Phase 6: 정리 및 배포

### 6-1. Supabase 제거
- [ ] `@supabase/supabase-js` 의존성 제거
- [ ] `src/lib/supabase.js` 삭제
- [ ] `grep -r "supabase"` → 모든 참조 제거 확인
- [ ] Vite manualChunks에서 vendor-supabase 제거
- [ ] `.env.local`에서 VITE_SUPABASE_* 환경변수 제거

### 6-2. 프로덕션 배포
- [ ] Dockerfile 최종 확인 (client build → server static 서빙)
- [ ] Railway Volume 마운트 설정 (`/data/storage`)
- [ ] Railway 환경변수 설정 (DATABASE_URL, JWT_SECRET, GOOGLE_*, etc.)
- [ ] Google Cloud Console: 프로덕션 OAuth redirect URI 추가
- [ ] Railway PostgreSQL에 `drizzle-kit push` 실행
- [ ] 배포 + 전체 기능 E2E 테스트

### 6-3. 검증
- [ ] 프로덕션에서 전체 로그인 플로우
- [ ] 프로덕션에서 이미지 업로드/다운로드
- [ ] 프로덕션에서 필기 저장/불러오기
- [ ] 프로덕션에서 Socket.IO 실시간 동기화
- [ ] **Phase 6 완료 커밋**

---

## Phase 7: TypeScript 정리 (병행 가능)

- [ ] 나머지 `.jsx` → `.tsx` 전환 (각 컴포넌트)
- [ ] `excalidrawUtils.js` → `.ts`
- [ ] `dataCache.js` → `.ts`
- [ ] `pdfExporter.js` → `.ts`
- [ ] `pdfDownloader.jsx` → `.tsx`
- [ ] `DrawingToolbar.jsx` → `.tsx`
- [ ] `SortablePageItem.jsx` → `.tsx`
- [ ] `tsconfig.json`에서 `allowJs: true` 제거
- [ ] strict mode 활성화
- [ ] Playwright 테스트 업데이트
- [ ] MEMORY.md 업데이트 (새 아키텍처 반영)
- [ ] **Phase 7 완료 커밋**

---

## 이슈 로그

| 날짜 | Phase | 이슈 | 상태 | 해결 |
|---|---|---|---|---|
| - | - | - | - | - |
