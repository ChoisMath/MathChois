# AI 코칭 횟수 제한 · 누적 표시 · 교사 학생별 검토 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI 코칭에 문제(페이지)당 3회 제한 + 횟수 표시, 학생 누적 코칭 표시, 교사의 횟수 리셋, 교사 챕터 필기 페이지에서 학생별 코칭 확인을 추가한다.

**Architecture:** 신규 `coaching_quota(studentId, pageId, resetAt)` 테이블로 "리셋 시점 이후 attempt 수 = 사용 횟수"를 계산한다. `coaching_attempts`는 불변 누적을 유지한다. 서버가 convert·review 양쪽에서 한도를 강제하고, 학생/교사 attempts 응답에 `{used, limit, resetAt}`를 동봉한다. 누적 표시는 공용 `AttemptStack` 컴포넌트(최신 펼침 + 이전 접힘)로 학생·교사가 공유한다. 교사 화면은 `TeacherStudyPageRouter`가 AI 페이지일 때 신규 `TeacherCoachingReview`를 렌더한다.

**Tech Stack:** Fastify 5, Drizzle ORM, PostgreSQL, React 19 + Vite, Tailwind 4. 스펙: `docs/superpowers/specs/2026-06-10-ai-coaching-limits-and-teacher-review-design.md`.

**테스트 전략:** 이 코드베이스는 서버/컴포넌트 자동 테스트 인프라가 없다(클라 `src/lib/*.test.js`만 Vitest). 각 태스크는 **타입체크(`tsc --noEmit`)·빌드·린트**로 검증하고, 기능 동작은 **Task 11의 e2e 체크리스트 항목**으로 수동 검증한다. TDD failing-test 단계는 이 프로젝트 패턴상 생략한다(글로벌 규칙: 기존 프로젝트 패턴 준수).

**검증 명령 (반복 사용):**
- 서버 타입체크: `cd packages/server && npx tsc --noEmit`
- shared/클라 빌드: `npm run build -w @mathchois/client` (shared 타입 포함 검증)
- 린트: `npm run lint`
- 전체 빌드: `npm run build`

---

## Task 1: `coaching_quota` 스키마 + 기동 DDL

**Files:**
- Modify: `packages/server/src/db/schema.ts:1-3` (import), `:295` 뒤 (테이블 추가)
- Modify: `packages/server/src/db/startupMigrate.ts:61` 뒤 (멱등 DDL)

- [ ] **Step 1: schema.ts import에 `uniqueIndex` 추가**

`packages/server/src/db/schema.ts:1-3`을 다음으로 교체:

```ts
import {
  pgTable, uuid, text, timestamp, integer, jsonb, unique, boolean, index, primaryKey, uniqueIndex,
} from 'drizzle-orm/pg-core';
```

- [ ] **Step 2: `coachingQuota` 테이블 정의 추가**

`packages/server/src/db/schema.ts`의 `coachingAttempts` 정의 끝(`:295`, `]);` 다음 줄)에 추가:

```ts

// ─── coaching_quota (문제별 AI 사용 횟수 리셋 기준) ────
// 사용 횟수 = reset_at 이후 생성된 coaching_attempts 수. 행이 없으면 전체를 카운트.

export const coachingQuota = pgTable('coaching_quota', {
  id: uuid('id').defaultRandom().primaryKey(),
  studentId: uuid('student_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  pageId: uuid('page_id').notNull().references(() => pages.id, { onDelete: 'cascade' }),
  resetAt: timestamp('reset_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('uq_coaching_quota_student_page').on(t.studentId, t.pageId),
]);
```

- [ ] **Step 3: startupMigrate.ts에 멱등 DDL 추가**

`packages/server/src/db/startupMigrate.ts:61`의 `log.info('startup migration: pages.ai_problem_id + coaching_attempts ensured');` 다음에 추가:

```ts
  await pgClient`
    CREATE TABLE IF NOT EXISTS coaching_quota (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      page_id uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
      reset_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;
  await pgClient`CREATE UNIQUE INDEX IF NOT EXISTS uq_coaching_quota_student_page ON coaching_quota (student_id, page_id)`;
  log.info('startup migration: coaching_quota ensured');
```

- [ ] **Step 4: 타입체크**

Run: `cd packages/server && npx tsc --noEmit`
Expected: exit 0 (오류 없음)

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/db/schema.ts packages/server/src/db/startupMigrate.ts
git commit -m "feat(coaching): add coaching_quota table + startup DDL"
```

---

## Task 2: 서비스 — 사용량 계산 · 리셋 · 페이지 학생 집계

**Files:**
- Modify: `packages/server/src/services/coaching.service.ts:1-3` (import), `:10` 뒤 (신규 함수)

- [ ] **Step 1: import 확장**

`packages/server/src/services/coaching.service.ts:1-3`을 다음으로 교체:

```ts
import { eq, and, desc, gte, gt, lt, sql, type SQL } from 'drizzle-orm';
import { db } from '../config/database.js';
import { coachingAttempts, coachingQuota, problems, pages, chapters, profiles } from '../db/schema.js';

export const COACHING_ATTEMPT_LIMIT = 3;
```

(기존 `import { eq, and, desc, gte, lt, sql, type SQL }`에 `gt` 추가, `coachingQuota`·`profiles` 추가, 상수 export 추가.)

- [ ] **Step 2: 사용량/리셋/학생집계 함수 추가**

`createAttempt` 정의(`:10`의 `}` 다음)에 추가:

```ts

/** (학생, 페이지)의 현재 사용 횟수. reset_at 이후 attempt만 카운트(행 없으면 전체). */
export async function getAttemptUsage(studentId: string, pageId: string) {
  const [q] = await db
    .select({ resetAt: coachingQuota.resetAt })
    .from(coachingQuota)
    .where(and(eq(coachingQuota.studentId, studentId), eq(coachingQuota.pageId, pageId)))
    .limit(1);
  const resetAt = q?.resetAt ?? null;
  const conds: SQL[] = [eq(coachingAttempts.pageId, pageId), eq(coachingAttempts.studentId, studentId)];
  if (resetAt) conds.push(gt(coachingAttempts.createdAt, resetAt));
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(coachingAttempts)
    .where(and(...conds));
  return { used: count, limit: COACHING_ATTEMPT_LIMIT, resetAt: resetAt ? resetAt.toISOString() : null };
}

/** 교사 리셋: reset_at 을 now() 로 upsert. attempt 는 보존(카운트 기준만 이동). */
export async function resetQuota(studentId: string, pageId: string) {
  await db
    .insert(coachingQuota)
    .values({ studentId, pageId })
    .onConflictDoUpdate({
      target: [coachingQuota.studentId, coachingQuota.pageId],
      set: { resetAt: sql`now()`, updatedAt: sql`now()` },
    });
}

/** 해당 페이지에 시도한 학생별 요약(used = reset_at 이후 카운트). 시도 0 학생은 제외. */
export async function listPageStudents(pageId: string) {
  const usedExpr = sql<number>`count(*) filter (where ${coachingQuota.resetAt} is null or ${coachingAttempts.createdAt} > ${coachingQuota.resetAt})::int`;
  const rows = await db
    .select({
      studentId: coachingAttempts.studentId,
      name: profiles.name,
      used: usedExpr,
      resetAt: coachingQuota.resetAt,
      lastAttemptAt: sql<string>`max(${coachingAttempts.createdAt})`,
    })
    .from(coachingAttempts)
    .innerJoin(profiles, eq(coachingAttempts.studentId, profiles.id))
    .leftJoin(
      coachingQuota,
      and(eq(coachingQuota.studentId, coachingAttempts.studentId), eq(coachingQuota.pageId, coachingAttempts.pageId)),
    )
    .where(eq(coachingAttempts.pageId, pageId))
    .groupBy(coachingAttempts.studentId, profiles.name, coachingQuota.resetAt)
    .orderBy(profiles.name);

  return rows.map((r) => ({
    studentId: r.studentId,
    name: r.name,
    used: r.used,
    limit: COACHING_ATTEMPT_LIMIT,
    resetAt: r.resetAt ? new Date(r.resetAt).toISOString() : null,
    lastAttemptAt: r.lastAttemptAt,
  }));
}
```

- [ ] **Step 3: 타입체크**

Run: `cd packages/server && npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/services/coaching.service.ts
git commit -m "feat(coaching): usage count, reset, per-page student summary services"
```

---

## Task 3: 라우트 — 한도 가드 · 응답 확장 · reset/students 엔드포인트

**Files:**
- Modify: `packages/server/src/routes/coaching.ts:7` (import), `:40-44` (convert), `:46-92` (review), `:94-96` (attempts), `:99-112` (교사 attempts), `:142` 앞 (신규 2개)

- [ ] **Step 1: import에 신규 서비스 추가**

`packages/server/src/routes/coaching.ts:7`을 다음으로 교체:

```ts
import { createAttempt, listAttempts, listStudentHistory, listClassroomStudentHistory, getAttemptUsage, resetQuota, listPageStudents, COACHING_ATTEMPT_LIMIT } from '../services/coaching.service.js';
```

- [ ] **Step 2: convert에 pageId + 한도 가드**

`packages/server/src/routes/coaching.ts:40-44`의 convert 핸들러를 다음으로 교체:

```ts
  app.post<{ Body: { imageUrl: string; pageId: string } }>('/api/coaching/convert', auth, async (req, reply) => {
    const { imageUrl, pageId } = z.object({ imageUrl: z.string(), pageId: z.string() }).parse(req.body);
    const usage = await getAttemptUsage(req.user.sub, pageId);
    if (usage.used >= usage.limit) {
      return reply.status(429).send({ error: `AI 검토 횟수(${usage.limit}회)를 모두 사용했습니다. 선생님께 리셋을 요청하세요.` });
    }
    const { base64, mimeType } = await loadWorkImage(imageUrl);
    return convertSolutionToLatex(mimeType, base64);
  });
```

- [ ] **Step 3: review에 한도 가드 + 응답 형태 변경**

`packages/server/src/routes/coaching.ts:50` 직후(`}).parse(req.body);` 다음 줄, `const page = await getPageById(pageId);` 앞)에 가드 삽입:

```ts
    const usage = await getAttemptUsage(req.user.sub, pageId);
    if (usage.used >= usage.limit) {
      return reply.status(429).send({ error: `AI 검토 횟수(${usage.limit}회)를 모두 사용했습니다. 선생님께 리셋을 요청하세요.` });
    }
```

그리고 같은 핸들러 끝의 `return createAttempt({ ... });`(`:77-91`)를 다음으로 교체:

```ts
    const attempt = await createAttempt({
      pageId,
      problemId: page.aiProblemId,
      studentId: req.user.sub,
      workImageUrl,
      solutionLatex,
      isCorrect: analysis.isCorrect,
      errorTags: analysis.errorTags ?? [],
      conceptTags: analysis.conceptTags ?? [],
      strengthNotes: analysis.strengthNotes,
      weaknessNotes: analysis.weaknessNotes,
      commentMarkdown: analysis.commentMarkdown,
      coachingSvg: newSvg,
      aiModel: AI_MODEL_NAME,
    });
    const after = await getAttemptUsage(req.user.sub, pageId);
    return { attempt, used: after.used, limit: after.limit, resetAt: after.resetAt };
```

- [ ] **Step 4: 학생 attempts 응답 확장**

`packages/server/src/routes/coaching.ts:94-96`의 핸들러를 다음으로 교체:

```ts
  app.get<{ Params: { pageId: string } }>('/api/coaching/pages/:pageId/attempts', auth, async (req) => {
    const attempts = await listAttempts(req.params.pageId, req.user.sub);
    const usage = await getAttemptUsage(req.user.sub, req.params.pageId);
    return { attempts, used: usage.used, limit: usage.limit, resetAt: usage.resetAt };
  });
```

- [ ] **Step 5: 교사 attempts 응답 확장**

`packages/server/src/routes/coaching.ts:110`의 `return listAttempts(pageId, studentId);`를 다음으로 교체:

```ts
      const attempts = await listAttempts(pageId, studentId);
      const usage = await getAttemptUsage(studentId, pageId);
      return { attempts, used: usage.used, limit: usage.limit, resetAt: usage.resetAt };
```

- [ ] **Step 6: reset · students 엔드포인트 추가**

`packages/server/src/routes/coaching.ts:141`의 마지막 라우트 닫는 `);` 다음, 함수 끝 `}`(`:142`) 앞에 추가:

```ts

  // 교사: 학생의 페이지 횟수 리셋(reset_at = now). attempt 기록은 보존.
  app.post<{ Params: { classroomId: string; studentId: string; pageId: string } }>(
    '/api/coaching/classrooms/:classroomId/students/:studentId/pages/:pageId/reset',
    { preHandler: [authenticate, requireRole('teacher')] },
    async (req, reply) => {
      const { classroomId, studentId, pageId } = req.params;
      if (!(await isClassroomOwner(classroomId, req.user.sub))) {
        return reply.status(403).send({ error: '이 클래스의 담당 교사가 아닙니다' });
      }
      if (!(await isClassroomMember(classroomId, studentId))) {
        return reply.status(403).send({ error: '이 클래스의 학생이 아닙니다' });
      }
      await resetQuota(studentId, pageId);
      const usage = await getAttemptUsage(studentId, pageId);
      return { used: usage.used, limit: usage.limit, resetAt: usage.resetAt };
    },
  );

  // 교사: 해당 페이지에 시도한 학생 목록 + 각자 사용 횟수.
  app.get<{ Params: { classroomId: string; pageId: string } }>(
    '/api/coaching/classrooms/:classroomId/pages/:pageId/students',
    { preHandler: [authenticate, requireRole('teacher')] },
    async (req, reply) => {
      const { classroomId, pageId } = req.params;
      if (!(await isClassroomOwner(classroomId, req.user.sub))) {
        return reply.status(403).send({ error: '이 클래스의 담당 교사가 아닙니다' });
      }
      return listPageStudents(pageId);
    },
  );
```

- [ ] **Step 7: 타입체크**

Run: `cd packages/server && npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 8: Commit**

```bash
git add packages/server/src/routes/coaching.ts
git commit -m "feat(coaching): enforce attempt limit on convert/review, add reset & students routes"
```

---

## Task 4: 공유 타입

**Files:**
- Modify: `packages/shared/src/types/coaching.ts:93` 뒤 (파일 끝)

- [ ] **Step 1: 타입 추가**

`packages/shared/src/types/coaching.ts` 파일 끝(`:93`, 마지막 `}` 다음)에 추가:

```ts

export interface PageAttemptsResult {        // GET /api/coaching/.../pages/:pageId/attempts
  attempts: CoachingAttempt[];
  used: number;
  limit: number;
  resetAt: string | null;
}

export interface ReviewResult {              // POST /api/coaching/review 응답
  attempt: CoachingAttempt;
  used: number;
  limit: number;
  resetAt: string | null;
}

export interface CoachingStudentSummary {    // GET /api/coaching/.../pages/:pageId/students 항목
  studentId: string;
  name: string | null;
  used: number;
  limit: number;
  resetAt: string | null;
  lastAttemptAt: string;
}
```

- [ ] **Step 2: shared 타입 검증 (클라 빌드로 확인)**

Run: `npm run build -w @mathchois/client`
Expected: 빌드 성공(타입 오류 없음)

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types/coaching.ts
git commit -m "feat(coaching): shared types for attempt usage, review result, student summary"
```

---

## Task 5: 클라 API 래퍼

**Files:**
- Modify: `packages/client/src/lib/coaching.js:3-10`, `:33` 뒤

- [ ] **Step 1: convert에 pageId, 신규 함수 추가**

`packages/client/src/lib/coaching.js:3-10`을 다음으로 교체:

```js
export const convertSolution = (imageUrl, pageId) => api.post('/api/coaching/convert', { imageUrl, pageId });
export const reviewSolution = (pageId, workImageUrl, solutionLatex) =>
  api.post('/api/coaching/review', { pageId, workImageUrl, solutionLatex }); // → { attempt, used, limit, resetAt }
export const listAttempts = (pageId) => api.get(`/api/coaching/pages/${pageId}/attempts`); // → { attempts, used, limit, resetAt }

/** 교사가 특정 학생의 페이지 코칭 시도 조회 (읽기 전용) → { attempts, used, limit, resetAt } */
export const getStudentPageAttempts = (classroomId, studentId, pageId) =>
  api.get(`/api/coaching/classrooms/${classroomId}/students/${studentId}/pages/${pageId}/attempts`);

/** 교사: 학생 페이지 횟수 리셋 → { used, limit, resetAt } */
export const resetStudentQuota = (classroomId, studentId, pageId) =>
  api.post(`/api/coaching/classrooms/${classroomId}/students/${studentId}/pages/${pageId}/reset`, {});

/** 교사: 해당 페이지에 시도한 학생 목록 → CoachingStudentSummary[] */
export const getPageStudents = (classroomId, pageId) =>
  api.get(`/api/coaching/classrooms/${classroomId}/pages/${pageId}/students`);
```

- [ ] **Step 2: 린트**

Run: `npm run lint`
Expected: 오류 없음(coaching.js 관련)

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/lib/coaching.js
git commit -m "feat(coaching): client api for usage-wrapped attempts, quota reset, page students"
```

---

## Task 6: 공용 `AttemptStack` 컴포넌트 (최신 펼침 + 이전 접힘)

**Files:**
- Create: `packages/client/src/components/coaching/AttemptStack.jsx`

- [ ] **Step 1: 컴포넌트 작성**

`packages/client/src/components/coaching/AttemptStack.jsx` 생성:

```jsx
import { useState } from 'react';
import ProblemView from '../common/ProblemView';
import CoachingPanel from './../common/CoachingPanel';

/**
 * 코칭 시도 누적 표시. 최신(attempts[0])은 항상 펼침, 이전 시도는 접힌 카드(클릭 토글).
 * 각 카드: 전달 이미지 + 변환 수식 + 코칭 내용.
 * @param {{ attempts: object[], showTeacherNotes?: boolean }} props  attempts는 최신순(createdAt desc)
 */
export default function AttemptStack({ attempts, showTeacherNotes = false }) {
  const [openIds, setOpenIds] = useState(() => new Set());
  if (!attempts?.length) return null;
  const total = attempts.length;

  const toggle = (id) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="flex flex-col gap-2">
      {attempts.map((a, i) => {
        const isLatest = i === 0;
        const open = isLatest || openIds.has(a.id);
        const round = total - i; // 회차: 가장 오래된 게 1, 최신이 total
        return (
          <div key={a.id} className="rounded-xl border bg-white">
            <button
              onClick={() => !isLatest && toggle(a.id)}
              className={`flex w-full flex-wrap items-center gap-2 p-2 text-left ${isLatest ? 'cursor-default' : ''}`}
            >
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600 whitespace-nowrap">
                {round}회차
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${
                a.isCorrect === true ? 'bg-emerald-100 text-emerald-700'
                  : a.isCorrect === false ? 'bg-rose-100 text-rose-700'
                  : 'bg-gray-100 text-gray-500'}`}>
                {a.isCorrect === true ? '정답' : a.isCorrect === false ? '오답' : '미채점'}
              </span>
              <span className="text-xs text-gray-400 whitespace-nowrap">{(a.createdAt || '').slice(0, 10)}</span>
              {isLatest && (
                <span className="ml-auto rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-600 whitespace-nowrap">최신</span>
              )}
            </button>

            {open && (
              <div className="flex flex-col gap-2 border-t p-2">
                {a.workImageUrl && (
                  <img src={a.workImageUrl} alt="전달 이미지" className="w-full rounded-lg border" />
                )}
                {a.solutionLatex && (
                  <div>
                    <p className="mb-1 text-xs text-gray-400">변환된 풀이</p>
                    <div className="rounded-lg border p-2"><ProblemView latex={a.solutionLatex} figures={[]} /></div>
                  </div>
                )}
                <CoachingPanel attempt={a} showTeacherNotes={showTeacherNotes} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: import 경로 정리**

위 Step 1의 `import CoachingPanel from './../common/CoachingPanel';`를 다음으로 교체(상대경로 단순화):

```jsx
import CoachingPanel from '../common/CoachingPanel';
```

- [ ] **Step 3: 린트**

Run: `npm run lint`
Expected: 오류 없음

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/components/coaching/AttemptStack.jsx
git commit -m "feat(coaching): AttemptStack — latest open + earlier collapsed cards"
```

---

## Task 7: 학생 CoachingViewer — 횟수 배지 · 버튼 가드 · 누적 표시

**Files:**
- Modify: `packages/client/src/pages/Study/CoachingViewer.jsx` — import, 상태, 로드 effect, handleConvert/handleReview, 우측 패널, 헤더

- [ ] **Step 1: import에 AttemptStack 추가**

`packages/client/src/pages/Study/CoachingViewer.jsx:10`(`import CoachingPanel ...` 다음 줄)에 추가:

```jsx
import AttemptStack from '../../components/coaching/AttemptStack';
```

- [ ] **Step 2: 상태 변경 — coaching → attempts + usage**

`CoachingViewer.jsx:71`의 `const [coaching, setCoaching] = useState(null);`를 다음으로 교체:

```jsx
  const [attempts, setAttempts] = useState([]);
  const [usage, setUsage] = useState({ used: 0, limit: 3, resetAt: null });
```

- [ ] **Step 3: 로드 effect — 응답 래퍼 반영**

`CoachingViewer.jsx:105`의 `setProblem(null); setSolutionLatex(''); setWorkImageUrl(null); setCoaching(null); setError('');`를 다음으로 교체:

```jsx
    setProblem(null); setSolutionLatex(''); setWorkImageUrl(null); setAttempts([]); setUsage({ used: 0, limit: 3, resetAt: null }); setError('');
```

그리고 `CoachingViewer.jsx:112-119`의 attempts 로드 블록을 다음으로 교체:

```jsx
        const data = readOnly
          ? await getStudentPageAttempts(classroomId, viewStudentId, pageId)
          : await listAttempts(pageId);
        if (alive && data) {
          setAttempts(data.attempts || []);
          setUsage({ used: data.used ?? 0, limit: data.limit ?? 3, resetAt: data.resetAt ?? null });
          const latest = (data.attempts || [])[0];
          if (latest) {
            setSolutionLatex(latest.solutionLatex || '');
            if (latest.workImageUrl) setWorkImageUrl(latest.workImageUrl);
          }
        }
```

- [ ] **Step 4: readOnly 폴링 — attempts/usage 반영**

`CoachingViewer.jsx:270-279`의 코칭 시도 폴링 블록(`try { const attempts = await getStudentPageAttempts(...) ... } catch { }`)을 다음으로 교체:

```jsx
    /* 코칭 시도(새 attempt) */
    try {
      const data = await getStudentPageAttempts(classroomId, viewStudentId, pageId);
      const latest = data?.attempts?.[0];
      if (latest && latest.id !== lastRoAttemptIdRef.current) {
        lastRoAttemptIdRef.current = latest.id;
        setAttempts(data.attempts || []);
        setUsage({ used: data.used ?? 0, limit: data.limit ?? 3, resetAt: data.resetAt ?? null });
        setSolutionLatex(latest.solutionLatex || '');
        if (latest.workImageUrl) setWorkImageUrl(latest.workImageUrl);
      }
    } catch { /* 무시 */ }
```

- [ ] **Step 5: handleConvert — pageId 전달 + 한도 메시지**

`CoachingViewer.jsx:321-332`의 `handleConvert`를 다음으로 교체:

```jsx
  async function handleConvert() {
    if (usage.used >= usage.limit) { setError('AI 검토 횟수를 모두 사용했습니다. 선생님께 리셋을 요청하세요.'); return; }
    setBusy('convert'); setError('');
    try {
      const blob = await exportWorkBlob();
      if (!blob) { setError('먼저 풀이를 작성하세요.'); setBusy(''); return; }
      const url = await uploadWorkImage(blob, `${user.id}/${pageId}`);
      setWorkImageUrl(url);
      const { latex } = await convertSolution(url, pageId);
      setSolutionLatex(latex);
    } catch (err) { setError(err.message); }
    setBusy('');
  }
```

- [ ] **Step 6: handleReview — attempts prepend + usage 갱신**

`CoachingViewer.jsx:334-349`의 `handleReview`를 다음으로 교체:

```jsx
  async function handleReview() {
    if (usage.used >= usage.limit) { setError('AI 검토 횟수를 모두 사용했습니다. 선생님께 리셋을 요청하세요.'); return; }
    if (!solutionLatex) { setError('먼저 수식 전환을 완료하세요.'); return; }
    setBusy('review'); setError('');
    try {
      let url = workImageUrl;
      if (!url) {
        const blob = await exportWorkBlob();
        if (!blob) { setError('먼저 풀이를 작성하세요.'); setBusy(''); return; }
        url = await uploadWorkImage(blob, `${user.id}/${pageId}`);
        setWorkImageUrl(url);
      }
      const res = await reviewSolution(pageId, url, solutionLatex);
      setAttempts((prev) => [res.attempt, ...prev]);
      setUsage({ used: res.used, limit: res.limit, resetAt: res.resetAt });
    } catch (err) { setError(err.message); }
    setBusy('');
  }
```

- [ ] **Step 7: 우측 패널 — readOnly 단일 이미지 섹션 제거, AI 검토 → AttemptStack**

`CoachingViewer.jsx:373-378`의 readOnly 학생 제출 풀이 섹션을 **삭제**:

```jsx
      {readOnly && workImageUrl && (
        <section>
          <h3 className="mb-2 font-bold whitespace-nowrap">학생 제출 풀이</h3>
          <img src={workImageUrl} alt="학생 제출 풀이" className="w-full rounded-lg border" />
        </section>
      )}
```

(전달 이미지는 이제 AttemptStack 각 카드에서 표시되므로 단일 섹션은 불필요.)

그리고 `CoachingViewer.jsx:397-402`의 "AI 검토" 섹션을 다음으로 교체:

```jsx
      <section>
        <h3 className="mb-2 font-bold whitespace-nowrap">AI 검토 기록 {attempts.length > 0 && `(${attempts.length})`}</h3>
        {attempts.length > 0
          ? <AttemptStack attempts={attempts} showTeacherNotes={readOnly} />
          : <p className="text-sm text-gray-400">{readOnly ? '아직 학생이 AI 검토를 받지 않았습니다.' : '[AI검토요청]을 누르면 코칭이 표시됩니다.'}</p>}
      </section>
```

- [ ] **Step 8: 헤더 — 횟수 배지 + 한도 도달 시 버튼 비활성**

`CoachingViewer.jsx:419-431`의 `{!readOnly && ( ... )}` 블록을 다음으로 교체:

```jsx
        {!readOnly && (
          <>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${
              usage.used >= usage.limit ? 'bg-rose-100 text-rose-700' : 'bg-indigo-50 text-indigo-600'}`}>
              AI 코칭 {usage.used} / {usage.limit}
            </span>
            <span className="text-xs text-gray-400 whitespace-nowrap">{saveStatus === 'saving' ? '저장 중…' : '저장됨'}</span>
            <button onClick={handleConvert} disabled={!!busy || usage.used >= usage.limit}
              className="flex items-center gap-1 px-3 min-h-11 border rounded-md disabled:opacity-50 whitespace-nowrap">
              {busy === 'convert' ? <Loader size={16} className="animate-spin" /> : <Wand2 size={16} />} 수식전환
            </button>
            <button onClick={handleReview} disabled={!!busy || usage.used >= usage.limit}
              className="flex items-center gap-1 px-3 min-h-11 bg-blue-600 text-white rounded-md disabled:opacity-50 whitespace-nowrap">
              {busy === 'review' ? <Loader size={16} className="animate-spin" /> : <Sparkles size={16} />} AI검토요청
            </button>
          </>
        )}
```

- [ ] **Step 9: 한도 도달 안내 (작업 영역)**

`CoachingViewer.jsx`의 "변환된 풀이 (수정 가능)" 섹션 — `!readOnly`의 `<textarea ...>` 위에 안내를 추가. `:386-394`의 `<>` ... `</>` 내부 textarea 앞에 삽입:

```jsx
            {usage.used >= usage.limit && (
              <p className="mb-2 rounded-md bg-rose-50 p-2 text-sm text-rose-600">
                AI 검토 횟수({usage.limit}회)를 모두 사용했습니다. 선생님께 리셋을 요청하세요.
              </p>
            )}
```

- [ ] **Step 10: 린트 + 클라 빌드**

Run: `npm run lint && npm run build -w @mathchois/client`
Expected: 오류 없음, 빌드 성공

- [ ] **Step 11: Commit**

```bash
git add packages/client/src/pages/Study/CoachingViewer.jsx
git commit -m "feat(coaching): student attempt badge, limit-gated buttons, cumulative AttemptStack"
```

---

## Task 8: 교사 `TeacherCoachingReview` 컴포넌트

**Files:**
- Create: `packages/client/src/pages/Study/TeacherCoachingReview.jsx`

- [ ] **Step 1: 컴포넌트 작성**

`packages/client/src/pages/Study/TeacherCoachingReview.jsx` 생성:

```jsx
import { useEffect, useState, useCallback } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Sparkles, Menu, RotateCcw, Loader } from 'lucide-react';
import { extractYouTubeId, getYouTubeThumbnail } from '../../lib/youtubeUtils';
import ProblemView from '../../components/common/ProblemView';
import AttemptStack from '../../components/coaching/AttemptStack';
import { getProblemForCoaching } from '../../lib/problems';
import { getPageStudents, getStudentPageAttempts, resetStudentQuota } from '../../lib/coaching';

/**
 * 교사 챕터 필기 경로의 AI 코칭 문항 화면.
 * 사이드바: 문항(페이지) 네비. 메인: 시도한 학생 카드(횟수 + 리셋 + 펼치면 누적 코칭).
 */
export default function TeacherCoachingReview({ classroomId, chapterId, pages, currentPage, onNavigate, onExit }) {
  const pageId = currentPage.id;
  const [problem, setProblem] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const [attemptsById, setAttemptsById] = useState({});
  const [resettingId, setResettingId] = useState(null);
  const [error, setError] = useState('');

  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches);

  const idx = pages.findIndex((p) => p.id === pageId);
  const prevPage = idx > 0 ? pages[idx - 1] : null;
  const nextPage = idx >= 0 && idx < pages.length - 1 ? pages[idx + 1] : null;
  const go = (p) => p && onNavigate(p);

  const loadStudents = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [prob, list] = await Promise.all([
        getProblemForCoaching(currentPage.aiProblemId),
        getPageStudents(classroomId, pageId),
      ]);
      setProblem(prob);
      setStudents(list || []);
    } catch (err) { setError(err.message); }
    setLoading(false);
  }, [classroomId, pageId, currentPage.aiProblemId]);

  useEffect(() => {
    setProblem(null); setStudents([]); setOpenId(null); setAttemptsById({});
    loadStudents();
  }, [loadStudents]);

  const toggleStudent = async (studentId) => {
    if (openId === studentId) { setOpenId(null); return; }
    setOpenId(studentId);
    if (!attemptsById[studentId]) {
      try {
        const data = await getStudentPageAttempts(classroomId, studentId, pageId);
        setAttemptsById((prev) => ({ ...prev, [studentId]: data.attempts || [] }));
      } catch (err) { setError(err.message); }
    }
  };

  const handleReset = async (studentId) => {
    if (!window.confirm('이 학생의 AI 코칭 횟수를 리셋할까요? (기록은 보존됩니다)')) return;
    setResettingId(studentId);
    try {
      const res = await resetStudentQuota(classroomId, studentId, pageId);
      setStudents((prev) => prev.map((s) => (s.studentId === studentId ? { ...s, used: res.used, resetAt: res.resetAt } : s)));
    } catch (err) { setError(err.message); }
    setResettingId(null);
  };

  const header = (
    <header className="flex shrink-0 items-center gap-2 overflow-x-auto border-b bg-white px-2 py-2">
      <button onClick={onExit} aria-label="나가기" className="min-h-11 min-w-11 flex items-center justify-center border rounded-md"><ArrowLeft size={18} /></button>
      <Sparkles size={16} className="text-indigo-500 shrink-0" />
      <h2 className="font-bold whitespace-nowrap">AI 코칭 · 학생별{problem ? ` · ${problem.subject ?? ''} ${problem.difficulty ?? ''}` : ''}</h2>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {error && <span className="text-sm text-rose-600 whitespace-nowrap">{error}</span>}
        <button onClick={() => go(prevPage)} disabled={!prevPage} aria-label="이전 페이지" className="min-h-11 min-w-11 flex items-center justify-center border rounded-md disabled:opacity-40"><ChevronLeft size={18} /></button>
        {pages.length > 0 && <span className="text-sm text-gray-400 min-w-[3rem] text-center whitespace-nowrap">{idx + 1} / {pages.length}</span>}
        <button onClick={() => go(nextPage)} disabled={!nextPage} aria-label="다음 페이지" className="min-h-11 min-w-11 flex items-center justify-center border rounded-md disabled:opacity-40"><ChevronRight size={18} /></button>
        <button onClick={() => setSidebarOpen((v) => !v)} title={sidebarOpen ? '페이지 목록 숨기기' : '페이지 목록 펼치기'} className="min-h-11 min-w-11 flex items-center justify-center border rounded-md"><Menu size={18} /></button>
      </div>
    </header>
  );

  const pageListSidebar = sidebarOpen && (
    <div className="w-44 shrink-0 overflow-y-auto border-r bg-white">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">페이지</span>
        <button onClick={() => setSidebarOpen(false)} title="목록 숨기기" className="cursor-pointer text-gray-400 hover:text-gray-600"><ChevronRight className="h-4 w-4" /></button>
      </div>
      <div className="space-y-2 p-2">
        {pages.map((pg, i) => (
          <button key={pg.id} onClick={() => pg.id !== pageId && go(pg)}
            className={`relative block w-full overflow-hidden rounded-md text-left transition-colors ${
              pg.id === pageId ? 'border-4 border-indigo-500' : 'border-4 border-transparent hover:border-gray-300'}`}>
            {pg.aiProblemId ? (
              <div className="flex aspect-video w-full items-center justify-center bg-indigo-50 text-xs font-medium text-indigo-600">AI 코칭</div>
            ) : pg.htmlUrl ? (
              <div className="flex aspect-video w-full items-center justify-center bg-emerald-50 text-xs font-medium text-emerald-600">HTML</div>
            ) : pg.videoUrl ? (
              <img src={getYouTubeThumbnail(extractYouTubeId(pg.videoUrl))} alt={`영상 ${i + 1}`} className="h-auto w-full bg-gray-900 object-cover" loading="lazy" />
            ) : (
              <img src={pg.imageUrl} alt={`페이지 ${i + 1}`} className="h-auto w-full bg-white object-contain" loading="lazy" />
            )}
            <div className="absolute bottom-0 inset-x-0 bg-black/50 py-0.5 text-center text-xs text-white">{i + 1}</div>
          </button>
        ))}
      </div>
    </div>
  );

  const main = (
    <div className="min-w-0 flex-1 overflow-y-auto p-3">
      {problem && (
        <section className="mb-4">
          <p className="mb-1 text-xs text-gray-500 whitespace-nowrap truncate">
            {[problem.subject, problem.majorUnit, problem.difficulty, problem.problemType].filter(Boolean).join(' · ')}
          </p>
          <ProblemView latex={problem.problemLatex} figures={problem.figures} />
        </section>
      )}

      <h3 className="mb-2 font-bold whitespace-nowrap">학생별 AI 코칭 {students.length > 0 && `(${students.length}명)`}</h3>
      {loading ? (
        <p className="text-sm text-gray-400">불러오는 중…</p>
      ) : students.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-xl border-2 border-dashed border-gray-200 text-sm text-gray-400">
          아직 이 문항에 AI 코칭을 시도한 학생이 없습니다.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {students.map((s) => {
            const open = openId === s.studentId;
            return (
              <div key={s.studentId} className="rounded-xl border bg-white">
                <div className="flex flex-wrap items-center gap-2 p-3">
                  <button onClick={() => toggleStudent(s.studentId)} className="flex flex-1 items-center gap-2 text-left">
                    <ChevronRight size={16} className={`shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
                    <span className="font-medium whitespace-nowrap">{s.name || '(이름 없음)'}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${
                      s.used >= s.limit ? 'bg-rose-100 text-rose-700' : 'bg-indigo-50 text-indigo-600'}`}>
                      {s.used} / {s.limit}회
                    </span>
                  </button>
                  <button onClick={() => handleReset(s.studentId)} disabled={resettingId === s.studentId}
                    className="flex min-h-11 items-center gap-1 rounded-md border px-3 text-sm text-gray-600 disabled:opacity-50 whitespace-nowrap">
                    {resettingId === s.studentId ? <Loader size={14} className="animate-spin" /> : <RotateCcw size={14} />} 리셋
                  </button>
                </div>
                {open && (
                  <div className="border-t p-2">
                    {attemptsById[s.studentId]
                      ? <AttemptStack attempts={attemptsById[s.studentId]} showTeacherNotes />
                      : <p className="p-2 text-sm text-gray-400">불러오는 중…</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-gray-50" style={{ height: '100dvh' }}>
      {header}
      <div className="flex min-h-0 flex-1">
        {pageListSidebar}
        {main}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 린트**

Run: `npm run lint`
Expected: 오류 없음

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/pages/Study/TeacherCoachingReview.jsx
git commit -m "feat(coaching): TeacherCoachingReview — per-student attempts + reset"
```

---

## Task 9: 교사 라우터 분기 변경

**Files:**
- Modify: `packages/client/src/pages/Study/TeacherStudyPageRouter.jsx:3-4`, `:29-41`

- [ ] **Step 1: import 교체**

`packages/client/src/pages/Study/TeacherStudyPageRouter.jsx:3-4`를 다음으로 교체:

```jsx
import TeacherStudyViewer from './TeacherStudyViewer';
import TeacherCoachingReview from './TeacherCoachingReview';
```

(`import CoachingViewer from './CoachingViewer';` 제거 — 교사 챕터 경로에서는 더 이상 사용 안 함. CoachingViewer는 StudentWorkViewer의 ③ 경로에서 계속 사용되므로 파일은 유지.)

- [ ] **Step 2: 분기 렌더 교체**

`packages/client/src/pages/Study/TeacherStudyPageRouter.jsx:29-41`의 `if (state.page?.aiProblemId) { ... }` 블록을 다음으로 교체:

```jsx
  if (state.page?.aiProblemId) {
    const base = `/teacher/classrooms/${classroomId}/chapters/${chapterId}/study/page`;
    return (
      <TeacherCoachingReview
        classroomId={classroomId}
        chapterId={chapterId}
        pages={state.pages}
        currentPage={state.page}
        onNavigate={(p) => navigate(`${base}/${p.id}`)}
        onExit={() => navigate(`/teacher/classrooms/${classroomId}/chapters/${chapterId}/monitor`)}
      />
    );
  }
```

- [ ] **Step 3: 린트 + 클라 빌드**

Run: `npm run lint && npm run build -w @mathchois/client`
Expected: 오류 없음, 빌드 성공

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/pages/Study/TeacherStudyPageRouter.jsx
git commit -m "feat(coaching): route teacher AI page to TeacherCoachingReview"
```

---

## Task 10: 전체 빌드 검증 + 로컬 DB 마이그레이션

**Files:** 없음(검증)

- [ ] **Step 1: 전체 빌드**

Run: `npm run build`
Expected: shared → client → server 모두 성공

- [ ] **Step 2: 서버 재기동으로 coaching_quota 생성 확인**

Run: `npm run dev:server` (별도 터미널)
Expected: 로그에 `startup migration: coaching_quota ensured` 출력. `startupMigrate.ts`가 멱등 DDL로 테이블을 생성하므로 별도 `db:push` 불필요. (로컬 DB가 비어 있으면 다른 startup 마이그레이션과 함께 생성됨.)

- [ ] **Step 3: Commit (변경 없으면 생략)**

빌드만 했다면 커밋할 변경 없음. 진행.

---

## Task 11: E2E 체크리스트 항목 추가

**Files:**
- Modify: `docs/superpowers/e2e-checklist.md` (파일 끝에 섹션 추가)

- [ ] **Step 1: 체크리스트 섹션 추가**

`docs/superpowers/e2e-checklist.md` 파일 끝에 추가:

```markdown

## #6 AI 코칭 횟수 제한 · 누적 · 교사 검토 (2026-06-10)

사전: AI 코칭 페이지(문항 연결됨) 1개, 학생 계정, 교사 계정(해당 클래스 owner).

### 학생
- [ ] AI 코칭 페이지 진입 시 헤더에 `AI 코칭 0 / 3` 배지가 보인다.
- [ ] [수식전환]→[AI검토요청]을 1회 완료하면 배지가 `1 / 3`으로 증가하고, "AI 검토 기록 (1)"에 최신 코칭이 펼쳐져 보인다.
- [ ] 3회까지 검토하면 배지가 `3 / 3`(붉은색)이 되고 [수식전환]·[AI검토요청] 버튼이 모두 비활성, "리셋 요청" 안내가 뜬다.
- [ ] 검토를 여러 번 했을 때 "AI 검토 기록"에 최신은 펼쳐지고 이전 회차는 접힌 카드로 보인다. 접힌 카드를 열면 전달 이미지 + 변환 수식 + 코칭이 나온다.
- [ ] 4번째 검토를 강제로 시도(개발자도구 등)하면 서버가 429로 거부한다.

### 교사
- [ ] 교사가 챕터 필기 경로로 AI 코칭 문항에 진입하면 메인 영역에 "학생별 AI 코칭" 리스트가 보인다(사이드바엔 문항만).
- [ ] 시도한 학생만 표시되고, 각 카드에 `used / limit회` 배지가 보인다.
- [ ] 학생 카드를 펼치면 그 학생의 누적 코칭(최신 펼침 + 이전 접힘, 강점 메모 포함)이 보인다.
- [ ] [리셋]을 누르면 확인 후 해당 학생 배지가 `0 / 3`이 되고, 학생이 다시 검토할 수 있다. 펼친 누적 기록은 그대로 보존된다.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/e2e-checklist.md
git commit -m "docs: e2e checklist for AI coaching limits & teacher review"
```

---

## Self-Review 결과 (작성자 점검 완료)

**Spec coverage:**
- 요구사항 ① 3회 제한 + 횟수 표시 → Task 1·2·3(서버 가드/카운트), Task 7(배지·버튼 가드) ✅
- 요구사항 ② 학생 누적 표시(수식전환·이미지·코칭) → Task 6(AttemptStack), Task 7(렌더 교체) ✅
- 요구사항 ③ 교사 리셋(기록 보존) → Task 2(resetQuota), Task 3(reset 라우트), Task 8(리셋 버튼) ✅
- 요구사항 ④ 교사 챕터 페이지 학생별 확인(사이드바 문항만/메인 코칭) → Task 8(TeacherCoachingReview), Task 9(라우터 분기) ✅
- 수식전환도 한도 도달 시 비활성 → Task 3(convert 가드), Task 7(버튼 disabled) ✅

**Type consistency:** `getAttemptUsage`/`resetQuota`/`listPageStudents`(Task 2) ↔ 라우트 사용(Task 3) ↔ 클라 함수명 `resetStudentQuota`/`getPageStudents`(Task 5) ↔ 컴포넌트 호출(Task 7·8) 일치. review 응답 `{attempt,used,limit,resetAt}`(Task 3) ↔ handleReview 소비(Task 7) 일치. attempts 응답 `{attempts,used,limit,resetAt}`(Task 3) ↔ 로드 effect(Task 7) 일치.

**Placeholder scan:** TBD/TODO 없음. 모든 코드 단계에 실제 코드 포함.

**주의(구현 시 확인):**
- `convert` 응답 형태는 변경 없음(`{latex}`). `convertSolution(url, pageId)` 인자 순서만 추가.
- CoachingViewer의 `coaching`(단일)을 쓰던 다른 참조가 없는지 grep으로 확인 후 Task 7 진행(현재 `coaching` 참조는 로드 effect·handleReview·우측 패널뿐 — 모두 교체 대상).
</content>
