# AI 코칭 횟수 제한 · 누적 표시 · 교사 학생별 검토 — 설계 문서

**날짜:** 2026-06-10
**범위:** 기존 AI 수학 코칭(#3~#5) 위에 ① **문제당 AI 사용 3회 제한 + 횟수 표시**, ② **학생 사이드 패널 누적 코칭 표시**, ③ **교사의 횟수 리셋**, ④ **교사 챕터 필기 페이지에서 학생별 코칭 확인**을 추가.
**선행:** `2026-06-02-ai-coaching-page-design.md`(#3), `2026-06-02-...coaching-history`(#4), `feat/teacher-class-dashboard`(#5) — 모두 main 병합 완료.

---

## 1. 배경 · 목표

AI 코칭은 매 검토(`review`)마다 Gemini를 호출하고 `coaching_attempts` 1건을 불변 누적한다. 현재 **횟수 제한이 없고**, 학생 화면은 **최신 1건만** 표시하며(`CoachingViewer.jsx:115`), 교사가 챕터 필기 경로로 AI 페이지에 들어가면 `viewStudentId`가 없어 **학생 결과가 보이지 않는다**(`CoachingViewer.jsx:111` early-return).

**산출물:**
- 학생: 문제당 **AI 검토 3회**까지. 횟수 배지 표시. 한도 도달 시 수식전환·검토 버튼 모두 비활성. 우측 패널에 누적 코칭(최신 펼침 + 이전 접힌 카드).
- 교사: 챕터 필기 페이지의 AI 문항에서 **시도한 학생 목록** 확인 → 학생별 횟수 + [리셋] + 펼치면 누적 코칭.

**비범위:** 한도 값(3)을 교사가 UI로 조절하는 기능(서버 상수 고정). 학생→교사 리셋 요청 알림/메시징. 과제(#④⑤) 코칭(현재 AI 코칭은 챕터 페이지 한정).

---

## 2. 핵심 결정 (확정)

| 항목 | 결정 |
|---|---|
| "1회"의 정의 | **AI 검토(`review`) 1건 = 1회.** attempt 누적 수가 곧 사용 횟수. 수식전환은 같은 풀이 내 자유 |
| 한도 | **문제(페이지)당 3회.** 서버 상수 `COACHING_ATTEMPT_LIMIT = 3` 단일 출처 |
| 한도 도달 시 | **수식전환·검토 버튼 모두 비활성** + "선생님께 리셋 요청" 안내. 서버도 양쪽 호출을 거부(클라 우회 방지) |
| 카운트 단위 | `(studentId, pageId)`. linked(공유) 챕터는 페이지가 별개이므로 카운트도 별개 |
| 리셋 | **기록 보존, 횟수만 0.** `reset_at` 시각 이후 attempt만 카운트. attempt는 그대로 누적 보존 |
| 리셋 권한 | 교사(해당 클래스 owner + 학생이 member). 교사 챕터 필기 페이지의 학생 카드에서 실행 |
| 학생 누적 표시 | 최신 코칭은 펼친 상태, 이전 시도는 접힌 카드(각 카드: 전달 이미지 + 변환 수식 + 코칭 내용) |
| 교사 화면 학생 | **해당 페이지에 시도 기록이 있는 학생만** 나열 |
| 교사 화면 구현 | `TeacherStudyPageRouter`가 AI 페이지일 때 **신규 `TeacherCoachingReview`** 렌더(CoachingViewer 비확장) |
| 보안 불변식 | 정답·해설은 학생 클라이언트에 계속 미전송. 새 엔드포인트도 표시 필드만 |

---

## 3. 데이터 모델

### 3.1 신규 테이블 `coaching_quota`
```ts
export const coachingQuota = pgTable('coaching_quota', {
  id: uuid('id').defaultRandom().primaryKey(),
  studentId: uuid('student_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  pageId: uuid('page_id').notNull().references(() => pages.id, { onDelete: 'cascade' }),
  resetAt: timestamp('reset_at', { withTimezone: true }).defaultNow().notNull(), // 이 시각 이후 attempt만 카운트
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('uq_coaching_quota_student_page').on(t.studentId, t.pageId),
]);
```

- **사용 횟수** = `count(coaching_attempts WHERE page_id=? AND student_id=? AND created_at > reset_at)`.
- quota 행이 없으면 = **리셋 이력 없음** → `reset_at`을 epoch(혹은 "행 없음"으로 간주)로 보고 전체 attempt를 카운트. 실무적으로는 *첫 리셋 때 행 생성*. 행이 없을 때의 카운트는 `created_at` 전체 기준.
- **리셋** = `INSERT ... ON CONFLICT (student_id, page_id) DO UPDATE SET reset_at = now(), updated_at = now()` (upsert).
- `coaching_attempts`는 **변경 없음**(불변 누적 유지). 마이그레이션: `db:generate` + `startupMigrate.ts`에 `CREATE TABLE IF NOT EXISTS coaching_quota` 멱등 DDL.

---

## 4. 서버 API

### 4.1 한도 가드 (`routes/coaching.ts` + `services/coaching.service.ts`)
신규 헬퍼 `getAttemptUsage(studentId, pageId) → { used, limit, resetAt }`:
- `reset_at` 조회(없으면 null) → 그 이후 attempt `COUNT(*)` → `{ used, limit: COACHING_ATTEMPT_LIMIT, resetAt }`.

`POST /api/coaching/review` — insert **전** `getAttemptUsage` 확인. `used >= limit`이면 `429`(혹은 403) + `{ error: 'AI 검토 횟수(3회)를 모두 사용했습니다. 선생님께 리셋을 요청하세요.' }`. 통과 시 attempt 생성 후 **`{ attempt, used, limit, resetAt }`** 반환(클라 낙관적 갱신용 — 기존엔 attempt 단건만 반환했으므로 형태 변경).

`POST /api/coaching/convert` — **동일 가드 추가**. 한도 도달 학생은 수식전환도 거부(서버 차원에서 비용 차단).

### 4.2 횟수 포함 조회 (응답 형태 확장)
| 메서드 | 경로 | 변경 |
|---|---|---|
| `GET` | `/api/coaching/pages/:pageId/attempts` | 응답을 `{ attempts, used, limit, resetAt }`로 확장(기존 배열 → 래퍼). 본인(`req.user.sub`) |
| `GET` | `/api/coaching/classrooms/:cid/students/:sid/pages/:pid/attempts` | 동일하게 `used/limit/resetAt` 포함. 교사(owner+member 가드, 기존) |

> 응답 형태 변경이므로 `lib/coaching.js`의 `listAttempts`/`getStudentPageAttempts`와 `CoachingViewer`의 사용처를 함께 수정한다.

### 4.3 신규 엔드포인트
| 메서드 | 경로 | 역할 | 권한 |
|---|---|---|---|
| `POST` | `/api/coaching/classrooms/:cid/students/:sid/pages/:pid/reset` | `coaching_quota` upsert(`reset_at=now()`). attempt 보존 | authenticate + requireRole('teacher') + isClassroomOwner + isClassroomMember |
| `GET` | `/api/coaching/classrooms/:cid/pages/:pid/students` | 해당 페이지에 **시도한 학생** 목록 + 각자 `{ studentId, name, used, limit, resetAt, lastAttemptAt }`. 정답·해설 미포함 | 동일(owner 가드) |

- 학생 목록 쿼리: `coaching_attempts`를 `page_id` 기준으로 `student_id` group-by → `profiles` 조인(이름) → `coaching_quota` 조인(reset_at) → reset 이후 카운트. **시도 0인 학생은 제외**(결정 ③).
- 권한 가드·classroom 검증 헬퍼는 기존 history 라우트의 `isClassroomOwner`/`isClassroomMember` 재사용.

---

## 5. 학생 UI (`pages/Study/CoachingViewer.jsx`)

### 5.1 횟수 배지 · 버튼 가드
- 진입 시 `listAttempts`가 `{ attempts, used, limit, resetAt }` 반환 → 상태에 `usage` 보관.
- 헤더에 배지: `AI 코칭 {used} / {limit}`.
- `used >= limit`이면 **[수식전환]·[AI검토요청] 둘 다 `disabled`** + 안내 텍스트 "AI 검토 횟수를 모두 사용했습니다. 선생님께 리셋을 요청하세요."
- 검토 성공 시 서버 review 응답의 `{ used, limit }`로 배지 갱신(재조회 불필요).
- 서버가 429를 주면(우회/경쟁) 친절 메시지로 표시하고 버튼 비활성 동기화.

### 5.2 누적 코칭 표시 (우측 패널 "AI 검토" 섹션)
- 현재 `coaching` 단일 상태 → **`attempts[]` 배열**로 전환(최신순).
- **최신 attempt**: 기존처럼 `CoachingPanel`로 펼쳐 표시.
- **이전 attempts**: 접힌 카드 리스트. 각 카드 헤더 `{n회차 · 정답/오답 · 시각}`, 펼치면 **전달 이미지(`workImageUrl`) + 변환 수식(`solutionLatex`, `ProblemView`) + `CoachingPanel`**.
- 카드/펼침 UI는 `CoachingHistoryView`의 인라인 펼침 패턴을 따른다(동일 룩앤필). 단 여기선 기간 필터/페이지네이션 없이 현재 페이지 attempts 전체.
- `weaknessNotes`는 학생에게 계속 표시(현 동작 유지), `strengthNotes`는 비표시(`showTeacherNotes=false`).

---

## 6. 교사 UI (`TeacherStudyPageRouter` → 신규 `pages/Study/TeacherCoachingReview.jsx`)

### 6.1 분기
- `TeacherStudyPageRouter`: `page.aiProblemId`가 있으면 현재 `CoachingViewer readOnly`(viewStudentId 없음 → 빈 화면) 대신 **`TeacherCoachingReview`** 렌더. 아니면 기존 `TeacherStudyViewer`.
- props: `classroomId, chapterId, pages, currentPage, onNavigate, onExit`.

### 6.2 레이아웃
- **사이드바:** 기존 페이지(문항) 네비 그대로 — 문항만 표시(결정).
- **메인 영역:** 상단에 연결 문항 요약(`ProblemView`로 문제 본문만 — 정답·해설은 미표시, 교사는 필요 시 문제은행에서 확인) + **시도한 학생 카드 리스트**.
  - **카드 닫힘:** `학생명 · {used}/{limit}회 · [리셋]`.
  - **[리셋]:** 확인 후 `POST .../reset` → 該 학생 `used`=0 갱신. attempt는 보존(아래 펼침에서 계속 보임).
  - **카드 펼침:** 그 학생의 누적 코칭. `getStudentPageAttempts`로 `attempts[]` 로드 → 최신 펼침 + 이전 접힘(학생 화면과 동일 컴포넌트), `showTeacherNotes=true`(강점 메모 포함). 전달 이미지·변환 수식·코칭 본문 표시.

### 6.3 재사용
- 학생/교사 누적 카드 렌더를 **공용 컴포넌트로 추출**(예: `components/coaching/AttemptStack.jsx`) — `attempts`, `showTeacherNotes` props. CoachingViewer(5.2)와 TeacherCoachingReview(6.2)가 공유. (중복 3회 미만이나 두 곳에서 동일 UI라 추출 가치 있음.)

---

## 7. 공유 타입 (`shared/src/types/coaching.ts`)

```ts
export interface CoachingAttemptUsage {
  used: number;
  limit: number;
  resetAt: string | null;
}
export interface PageAttemptsResult {        // GET .../pages/:pageId/attempts
  attempts: CoachingAttempt[];
  used: number;
  limit: number;
  resetAt: string | null;
}
export interface ReviewResult {              // POST .../review 응답
  attempt: CoachingAttempt;
  used: number;
  limit: number;
  resetAt: string | null;
}
export interface CoachingStudentSummary {     // GET .../pages/:pid/students 항목
  studentId: string;
  name: string;
  used: number;
  limit: number;
  resetAt: string | null;
  lastAttemptAt: string;
}
```

---

## 8. 신규/변경 파일 요약

**서버**
- `db/schema.ts` — `coaching_quota` 테이블
- `db/startupMigrate.ts` — `CREATE TABLE IF NOT EXISTS coaching_quota` 멱등 DDL
- `services/coaching.service.ts` — `getAttemptUsage`, `resetQuota`, `listPageStudents`; `createAttempt` 호출부에 한도 체크
- `routes/coaching.ts` — convert/review 한도 가드, attempts 응답 확장, `reset`·`students` 엔드포인트, 상수 `COACHING_ATTEMPT_LIMIT`
- 마이그레이션 파일

**클라이언트**
- `pages/Study/CoachingViewer.jsx` — 횟수 배지, 버튼 가드, 누적 표시(attempts[])
- `pages/Study/TeacherStudyPageRouter.jsx` — AI 페이지 → `TeacherCoachingReview` 분기
- `pages/Study/TeacherCoachingReview.jsx` — 신규(학생 리스트 + 리셋 + 누적)
- `components/coaching/AttemptStack.jsx` — 신규(누적 카드 공용; 최신 펼침 + 이전 접힘)
- `lib/coaching.js` — `listAttempts`/`getStudentPageAttempts`/`reviewSolution` 응답 형태 반영, `resetStudentQuota`, `getPageStudents` 추가

**공유**
- `types/coaching.ts` — `CoachingAttemptUsage`, `PageAttemptsResult`, `CoachingStudentSummary`

---

## 9. 위험 · 유의

- **서버 측 한도 강제:** convert/review 둘 다 서버에서 한도를 검사해야 클라 우회(직접 API 호출) 비용 누수를 막는다. 버튼 비활성은 UX, 가드는 서버가 진실.
- **응답 형태 변경(배열 → 래퍼):** `pages/:pageId/attempts`가 배열에서 객체로 바뀌므로 `lib/coaching.js`와 모든 호출처를 동시에 수정. 누락 시 런타임 오류.
- **카운트 기준 시각:** "리셋 이후"는 `created_at > reset_at` 경계. 리셋과 동시 검토의 경쟁은 무시 가능(교사 리셋 직후 학생 검토가 카운트되는 정상 동작).
- **시도 0 학생 제외:** 교사 목록은 시도한 학생만(결정 ③). 반 전체 진도는 기존 #5 대시보드에서 확인.
- **정답 유출 방지(불변식):** 신규 `students`/`reset` 응답에 answer/solution/markschemeImageUrl 미포함. 코드리뷰 최우선 확인.
- **linked 챕터:** 카운트·리셋은 `pageId` 단위라 복제 페이지마다 독립. 의도된 동작(#4·#5의 원본 집계 한계와 별개).
- **`coaching_svg` 캐시:** 누적 표시에서 과거 attempt의 `coachingSvg`도 그대로 렌더(이미 data-URI 방식, XSS 차단됨).
</content>
</invoke>
