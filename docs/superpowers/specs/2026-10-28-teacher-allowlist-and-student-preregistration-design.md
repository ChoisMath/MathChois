# 교사 허용 목록 · 학생 사전 등록 (가입/로그인 정책) — 설계

작성일: 2026-10-28
상태: 자율 세션에서 작성 — 아래 **"확인이 필요한 가정"** 을 사용자가 검토한다.

## 배경 / 문제

지금 `class.chois.pro` 는

- Google 계정만 있으면 **누구나** 로그인 후 `/choose-role` 에서 스스로 **교사**를 고를 수 있고,
- 학생도 누구나 가입하여 교사에게 받은 **클래스 코드**로 학급에 들어간다.

교사 권한이 사실상 열려 있어 임의의 Google 계정이 학급을 만들고 문제은행·시각화·영상 자료(교사 간 공유 라이브러리)에
접근할 수 있다. 또 학생은 코드를 받아 직접 입력해야만 학급에 들어가며, 교사가 미리 명단을 올려 두는 방법이 없다.

## 목표

1. **교사는 관리자가 등록한 계정만.** 관리자(`isAdmin`)가 관리자 패널에 교사 이메일을 등록한다. 허용 목록에 없는
   Google 계정(또는 이메일 계정)은 교사로 접속할 수 없다.
2. **가입하면 무조건 학생.** Google 로그인·이메일 가입 어느 쪽이든 새 계정은 학생이다. `/choose-role` 은 없앤다.
   학생은 지금처럼 클래스 코드로 학급에 참여한다.
3. **학생 사전 등록.** 교사가 학급에 학생의 (Google) 이메일을 미리 등록해 두면, 그 학생이 가입(첫 로그인)하는 순간
   코드 입력 없이 그 학급의 구성원이 된다.

### 비목표 (Out of scope)

- 초대 **메일 발송**. 사전 등록은 명단일 뿐 알림을 보내지 않는다.
- Google Workspace 도메인 단위 허용(`@school.ac.kr` 전체). 이메일 단위만.
- 교사가 학생 계정을 **대신 만들어 주는** 것(비밀번호 발급 등). 학생은 스스로 가입한다.
- 기존 교사 계정을 비활성화하거나 데이터를 옮기는 작업. 허용 목록에서 빠진 교사는 **학생으로 내려가고** 데이터는 남는다.

## 확인이 필요한 가정

| # | 가정 | 다른 해석 | 바꾸려면 |
|---|---|---|---|
| A1 | **허용 목록에 없는 Google 계정도 로그인은 된다 — 학생으로.** "허용되지 않은 google 계정은 접속되지 않도록" 을 *교사로의 접속* 차단으로 읽었다. 요구 2("가입하면 무조건 학생")·3("학생의 google 계정") 과 함께 읽으면 학생은 Google 로 가입할 수 있어야 하고, 이미 Google 로 가입한 학생들을 막지 않는다. | 교사 허용 목록·학생 사전 등록 **어디에도 없는** Google 계정은 로그인 자체를 거부(이메일 가입만 열어 둠). | `access.service.ts` 의 `applyAccessRules` 에서 Google 신규 계정이면서 두 명단 모두에 없을 때 `AccessDeniedError` 를 던지고 `/?auth_error=not_allowed` 로 보낸다. 한 곳이다. |
| A2 | **이미 가입한 학생**의 이메일을 교사가 사전 등록하면 **즉시** 학급에 넣는다(기다릴 일이 없으므로). | 가입 시점에만 처리하고, 기존 계정은 코드로 들어오게 한다. | `addClassroomInvites` 의 즉시 가입 분기를 뺀다. |
| A3 | **관리자(`isAdmin`) 계정의 역할은 자동으로 바꾸지 않는다.** 관리자는 관리자 패널의 역할 선택으로 자기 역할을 정한다. | 관리자도 허용 목록을 따른다. | `resolveRole` 의 `isAdmin` 분기를 뺀다. |
| A4 | 배포 시 **기존 교사(`role='teacher'`) 전원을 허용 목록에 자동으로 옮긴다**(한 번). 그래야 배포 직후 아무도 잠기지 않는다. | 빈 목록으로 시작해 관리자가 다시 등록한다(기존 교사가 모두 학생으로 내려감). | `startupMigrate.ts` 의 백필을 뺀다. |
| A5 | 사전 등록은 이메일 가입 학생에게도 같은 이메일이면 똑같이 적용한다(Google 로 한정할 이유가 없다). | Google 계정만. | `consumeClassroomInvites` 호출을 Google 콜백에만 둔다. |

## 핵심 설계 결정

| 결정 | 선택 | 비고 |
|---|---|---|
| 교사 판별 기준 | **이메일 허용 목록 `allowed_teachers`** (관리자가 관리) | Google `sub` 대신 이메일 — 교사가 아직 가입 전이라 `sub` 를 알 수 없다. 이메일은 소문자로 저장·비교. |
| 역할을 정하는 시점 | **모든 로그인·토큰 갱신 때 서버가 다시 계산** (`applyAccessRules`) | 허용 목록에서 빼면 늦어도 15분(access token 만료) 안에 반영. 사용자가 역할을 스스로 고르는 길(`PATCH /api/profiles/role`, `/choose-role`)은 없앤다. |
| 역할 규칙 | `isAdmin` → 현재 역할 유지(없으면 teacher) · 허용 목록에 있음 → `teacher` · 그 외 → `student` | 공용 순수 함수 `resolveRole` (`shared/src/auth/access.ts`). |
| 학생 사전 등록 저장 | **`classroom_invites`** (학급 × 이메일, unique) | 가입 시 `classroom_members` 로 옮기고 행을 지운다(소비). 교사가 뒤에 학생을 내보내도 다시 자동 가입되지 않는다. |
| 사전 등록 소비 시점 | `applyAccessRules` 안에서, **결과 역할이 student 일 때만** | 교사 이메일이 실수로 학생 명단에 있어도 교사를 학생 명단으로 넣지 않는다. |
| 관리자 "역할 선택" | 유지 — 의미를 **허용 목록 등록/해제 + 역할 즉시 변경** 으로 바꿈 | 그렇지 않으면 다음 토큰 갱신 때 되돌아간다. |
| 스키마 반영 | `schema.ts` + `startupMigrate.ts` 멱등 DDL + 최초 1회 백필 | 기존 패턴. 백필은 테이블이 **이번 기동에서 새로 만들어진 경우**(`to_regclass` 가 NULL 이었을 때)에만. |
| 기존 화면 | `/choose-role` 삭제(→ `/`), `Login.jsx`(미사용) 삭제 | `ProtectedRoute` 의 "역할 없음 → choose-role" 분기는 `/` 로. |

## 데이터 모델

```ts
// allowed_teachers — 관리자가 등록한 교사 이메일
export const allowedTeachers = pgTable('allowed_teachers', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),          // 소문자
  note: text('note'),                                // 메모(이름 등, 선택)
  createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// classroom_invites — 교사가 학급에 미리 올린 학생 이메일(가입 시 소비)
export const classroomInvites = pgTable('classroom_invites', {
  id: uuid('id').defaultRandom().primaryKey(),
  classroomId: uuid('classroom_id').notNull().references(() => classrooms.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),                    // 소문자
  createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  unique().on(t.classroomId, t.email),
  index('idx_classroom_invites_email').on(t.email),
]);
```

`profiles.role` 은 그대로 두되, 이 변경 뒤에는 로그인한 사용자에게 항상 값이 있다(NULL 은 갱신 때 채워진다).

### 기동 마이그레이션 (`startupMigrate.ts`)

1. `allowed_teachers` 가 **없었다면** 만들고, `profiles` 에서 `role='teacher' AND email IS NOT NULL` 인 이메일을
   소문자로 모두 넣는다(A4). 이미 있던 테이블이면 백필하지 않는다 — 관리자가 지운 교사가 재기동으로 되살아나지 않게.
2. `classroom_invites` 를 만든다.
3. (정리) `profiles.email` 을 소문자로 맞춘다 — `UPDATE profiles SET email = lower(email) WHERE email <> lower(email)`.
   충돌(같은 이메일의 대소문자 다른 두 행)은 사실상 없지만, 있으면 그 행만 건너뛰도록 예외를 잡고 경고 로그.

## 공용 모듈 — `packages/shared/src/auth/access.ts`

순수 함수. 클라이언트 Vitest 로 테스트(`classroomColorShared.test.js` 처럼 shared 를 직접 import).

```ts
export type Role = 'teacher' | 'student';

/** 소문자·trim. 비어 있거나 형식이 아니면 null. */
export function normalizeEmail(raw: string): string | null;

/** 쉼표·공백·줄바꿈으로 나눠 유효/무효 이메일을 가른다. 중복은 하나로. */
export function parseEmailList(text: string, max = 200): { valid: string[]; invalid: string[] };

/**
 * 역할 규칙 (A3): 관리자는 현재 역할 유지(없으면 teacher).
 * 허용 목록에 있으면 teacher, 아니면 student.
 */
export function resolveRole(input: { isAdmin: boolean; currentRole: Role | null; isAllowedTeacher: boolean }): Role;
```

## 서버

### `services/access.service.ts` (신규)

- `isAllowedTeacher(email)`, `listAllowedTeachers()` (가입 여부를 보여 주기 위해 `profiles` left join:
  `{ id, email, note, createdAt, profile: { id, name, avatarUrl, role } | null }`),
  `addAllowedTeachers(emails, byId)` → `ON CONFLICT DO NOTHING`, 이미 가입한 비관리자 계정은 즉시 `role='teacher'`,
  `removeAllowedTeacher(id)` → 해당 이메일의 비관리자 계정은 즉시 `role='student'`.
- `applyAccessRules(profile)` → 갱신된 profile:
  1. `role = resolveRole({ isAdmin, currentRole, isAllowedTeacher: email ? await isAllowedTeacher(email) : false })`
  2. 달라졌으면 `profiles.role` 갱신.
  3. 결과가 `student` 이고 이메일이 있으면 `consumeClassroomInvites(profile.id, email)`.
- 호출 지점: Google 콜백(`findOrCreateProfile` 직후), 이메일 로그인, 이메일 가입 확인(`verify-email`), 토큰 갱신(`/api/auth/refresh`).

### `services/classroomInvite.service.ts` (신규)

- `listClassroomInvites(classroomId)`
- `addClassroomInvites(classroomId, emails, byId)` → `{ joined: string[]; invited: string[]; skipped: { email, reason }[] }`
  - 이메일별로: 이미 구성원 → skipped(`member`), 그 이메일의 계정이 교사/관리자 → skipped(`teacher`),
    학생 계정이 있음 → `classroom_members` 즉시 추가(A2) → joined, 없음 → `classroom_invites` upsert → invited.
- `removeClassroomInvite(classroomId, inviteId)`
- `consumeClassroomInvites(studentId, email)` → 이메일의 모든 초대를 구성원으로 옮기고(이미 구성원이면 건너뜀) 초대 삭제. 트랜잭션.

### `services/auth.service.ts` 변경

- `exchangeGoogleCode` 가 돌려주는 `email` 을 소문자로.
- `findOrCreateProfile` 의 신규 생성 분기: `role: 'student'` 로 생성(허용 목록은 바로 뒤 `applyAccessRules` 가 올린다).
- `updateProfileRole` 삭제(사용자 자가 선택 종료).

### 라우트

| 메서드·경로 | 가드 | 내용 |
|---|---|---|
| `GET /api/admin/allowed-teachers` | admin | 목록 + 가입 상태 |
| `POST /api/admin/allowed-teachers` `{ emails: string[] }` | admin | 추가. 응답 `{ added: string[]; existing: string[]; invalid: string[] }` |
| `DELETE /api/admin/allowed-teachers/:id` | admin | 삭제(+즉시 학생으로). 자기 자신(관리자) 이메일은 400 |
| `PATCH /api/admin/users/:id/role` | admin | **의미 변경**: teacher → 허용 목록 추가, student → 허용 목록 제거, 그리고 역할 즉시 반영 |
| `GET /api/classrooms/:id/invites` | teacher·소유자 | 사전 등록 목록 |
| `POST /api/classrooms/:id/invites` `{ emails: string[] }` | teacher·소유자 | 추가(위 결과 구조) |
| `DELETE /api/classrooms/:id/invites/:inviteId` | teacher·소유자 | 삭제 |
| `PATCH /api/profiles/role` | — | **삭제** |

`POST /api/auth/verify-email`, `POST /api/auth/login`, `GET /api/auth/google/callback`, `POST /api/auth/refresh` 는
프로필을 돌려주기 전에 `applyAccessRules` 를 거친다.

## 클라이언트

- **삭제**: `pages/ChooseRole.jsx`, `pages/Login.jsx`(미사용), `AuthContext.updateRole`, `api.updateRole`,
  `/choose-role` 라우트(→ `<Navigate to="/" />` 로 남겨 즐겨찾기 깨짐 방지).
- `ProtectedRoute`: 역할이 없으면 `/` 로(서버가 늘 채우므로 사실상 안 생김). `Home.jsx`/`OAuthCallback.jsx` 의
  `choose-role` 이동 제거.
- `Home.jsx`: Google 버튼 아래 한 줄 안내 — "교사는 관리자가 등록한 계정으로만 로그인할 수 있습니다. 그 외 계정은 학생으로 시작합니다."
- **관리자 패널** `AdminPanel.jsx`: 새 탭 **[교사 등록]** (`AllowedTeachersTab`) — 이메일 여러 개 입력(textarea,
  `parseEmailList`) + 등록 버튼, 목록(이메일·가입 여부/이름·등록일·삭제 `IconButton`). 사용자 탭의 역할 선택은 그대로
  두되 변경 시 안내 문구 "교사로 바꾸면 교사 허용 목록에 함께 등록됩니다".
- **학급 상세 [학생] 탭** `StudentsTab.jsx`(교사만): 구성원 목록 위에 **"학생 사전 등록"** 카드 — textarea + 등록
  버튼, 결과 요약("2명 바로 참여, 3명 가입 대기, 1명 건너뜀(이미 참여)"), 대기 중 이메일 목록(삭제 버튼).
  `ClassroomDetail` 이 `onMembersChanged` 를 넘겨 즉시 가입된 학생이 목록에 바로 보이게 한다.
  기존 **클래스 코드** 참여는 그대로.

## 오류 처리

- 이메일 형식이 아닌 항목은 서버가 400 으로 막지 않고 `invalid` 로 돌려줘 나머지는 처리한다(명단 붙여넣기 UX).
- 한 요청 최대 200개(`parseEmailList` 의 `max`). 넘으면 400.
- 허용 목록 삭제가 **관리자 본인** 이메일이면 400(관리자가 스스로를 잠그지 않도록 — 어차피 A3 로 역할은 안 바뀌지만 혼란 방지).
- 사전 등록 소비 중 unique 충돌(동시 로그인)은 `ON CONFLICT DO NOTHING`.

## 테스트

- **Vitest(공용 함수)**: `normalizeEmail`, `parseEmailList`(구분자·중복·무효·최대치), `resolveRole`(표 전부).
- **타입 검사·빌드**: `npm run build`(shared → client → server).
- **브라우저 스모크**(로컬 PostgreSQL 이 있을 때): 관리자가 교사 이메일 등록 → 그 이메일로 가입한 계정이 교사 화면에
  도착; 미등록 Google/이메일 계정은 학생 화면; 교사가 학생 이메일 사전 등록 → 그 이메일로 가입 → 코드 없이 학급 보임.
  (Google 로그인은 자동화할 수 없으므로 이메일 계정으로 같은 코드 경로를 확인한다 — `applyAccessRules` 는 공통.)

## 운영 메모

- 배포 직후 관리자 패널 **[교사 등록]** 탭에서 백필된 교사 목록을 확인하고 불필요한 계정을 지운다.
- `scripts/seed-test-accounts.ts` 는 테스트 교사를 허용 목록에도 넣도록 바꾼다(그렇지 않으면 첫 갱신 때 학생으로 내려감).
