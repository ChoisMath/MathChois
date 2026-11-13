# 교사 허용 목록 · 학생 사전 등록 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 교사는 관리자가 등록한 이메일만, 그 외 모든 가입은 학생, 교사가 학급에 미리 올린 학생 이메일은 가입 즉시 구성원.

**Architecture:** `allowed_teachers`(관리자 관리) · `classroom_invites`(교사 관리) 두 테이블. 역할은 사용자가 고르지 않고
서버가 로그인·토큰 갱신마다 `applyAccessRules(profile)` 로 다시 계산한다(규칙은 `@mathchois/shared` `resolveRole`).
학생으로 판정된 계정은 같은 호출에서 사전 등록을 소비해 `classroom_members` 가 된다.

**Tech Stack:** Fastify 5 · Drizzle ORM 0.45 · PostgreSQL 16 · React 19 · React Router 7 · lucide-react · Vitest

**Spec:** `docs/superpowers/specs/2026-10-28-teacher-allowlist-and-student-preregistration-design.md`

## Global Constraints

- 이메일은 **소문자·trim** 으로 저장·비교(`normalizeEmail`). 한 요청 최대 200개(`EMAIL_LIST_MAX`).
- 역할 규칙(`resolveRole`): `isAdmin` → 현재 역할 유지(없으면 `teacher`); 허용 목록 → `teacher`; 그 외 `student`.
- 사전 등록 소비는 **결과 역할이 student 일 때만**.
- 사용자가 역할을 고르는 길(`/choose-role`, `PATCH /api/profiles/role`, `AuthContext.updateRole`)은 없앤다.
- 스키마는 `schema.ts` + `startupMigrate.ts` 멱등 DDL. `allowed_teachers` 백필은 테이블이 이번 기동에서 새로 생겼을 때만.
- 아이콘 버튼은 `IconButton`(label 필수). 아이콘: 삭제 `Trash2`/`X`, 등록 `UserPlus`, 교사 등록 탭 `ShieldCheck`.
- 커밋 메시지는 `feat(auth): …` 한국어 요약 + 세션 attribution 줄. 모델 이름 금지.

## Review Focus

1. 허용 목록에서 교사를 빼면 → 그 계정의 다음 `/api/auth/refresh` 응답 role 이 `student`, 교사 라우트 403.
2. 사전 등록된 이메일로 **이메일 가입** → `verify-email` 응답 직후 `/api/classrooms` 에 학급이 보임, 초대 행은 삭제됨.
3. 교사 이메일을 학생 명단에 넣음 → `skipped(reason: teacher)`, 교사가 구성원이 되지 않음.
4. 관리자 본인 이메일 허용 목록 삭제 → 400.
5. 신규 Google 계정 → `role='student'` 로 생성, `/choose-role` 로 가지 않음.

---

## Tasks

- [x] **Task 1 — shared 순수 함수 (TDD)**: `packages/shared/src/auth/access.ts` (`normalizeEmail`, `parseEmailList`, `resolveRole`, `EMAIL_LIST_MAX`), `index.ts` export, `packages/client/src/lib/accessShared.test.js`.
- [x] **Task 2 — 스키마·기동 마이그레이션**: `schema.ts` 두 테이블, `startupMigrate.ts` DDL + 1회 백필 + 이메일 소문자 정리.
- [x] **Task 3 — 서버 서비스**: `services/access.service.ts`, `services/classroomInvite.service.ts`; `auth.service.ts`(소문자 이메일, 신규 Google 계정 student, `updateProfileRole` 삭제).
- [x] **Task 4 — 서버 라우트**: `routes/auth.ts`(applyAccessRules 4곳, `PATCH /profiles/role` 삭제), `routes/admin.ts`(allowed-teachers 3개, role 의미 변경), `routes/classrooms.ts`(invites 3개). `admin.service.updateUserRole` 가 허용 목록 동기화.
- [x] **Task 5 — 클라이언트 정리**: `ChooseRole.jsx`/`Login.jsx` 삭제, `App.jsx`, `ProtectedRoute.jsx`, `Home.jsx`, `OAuthCallback.jsx`, `AuthContext.jsx`, `api.ts`.
- [x] **Task 6 — 관리자 패널 [교사 등록] 탭**: `components/admin/AllowedTeachersTab.jsx`, `AdminPanel.jsx` 탭 추가·역할 선택 안내.
- [x] **Task 7 — 학급 [학생] 탭 사전 등록 카드**: `components/classrooms/StudentInvitesCard.jsx`, `StudentsTab.jsx`, `ClassroomDetail.jsx`(`onMembersChanged`).
- [x] **Task 8 — 시드·문서**: `scripts/seed-test-accounts.ts`(허용 목록), `CLAUDE.md`, `.claude/PROJECT_MAP.md`.
- [x] **Task 9 — 검증**: `npm run build`, `npm run lint`, `npm test -w @mathchois/client`; 로컬 PostgreSQL 이 되면 API 스모크(Review Focus 1~5).
