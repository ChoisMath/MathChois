# 교사용 클래스 대시보드 구현 계획 (#5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 교사가 ClassroomDetail '대시보드' 탭에서 학생 카드 + 챕터 칩으로 학생별·챕터별 AI 코칭 정답률(색)과 필기 진도(막대)를 한눈에 본다.

**Architecture:** 스키마 변경 없음 — `dashboard.service`가 `coaching_attempts`/`student_notes`/`pages`/`chapters`를 group-by 집계해 매트릭스 JSON 반환, `routes/dashboard.ts`(teacher+owner) 노출. 클라는 `ClassroomDashboard` 컴포넌트(CSS 칩·막대, 차트 라이브러리 없음)를 ClassroomDetail 교사 전용 탭에서 렌더. 카드 클릭 → #4 교사 풀이기록.

**Tech Stack:** Fastify · Drizzle/PostgreSQL · React 19 · Tailwind 4.

**참조 spec:** `docs/superpowers/specs/2026-06-02-teacher-class-dashboard-design.md`
**선행 완료:** #1~#4 (problems, coaching_attempts, student_notes, #4 교사 history 라우트 `/teacher/classrooms/:classroomId/students/:studentId/coaching-history`).

---

## 검증 전략
- 서버: 테스트 러너 없음 → `npm run build -w @mathchois/server`(tsc) 게이트 + 선택 스모크.
- 클라: `npm run build -w @mathchois/client` + 기존 vitest(`npm run test -w @mathchois/client`, 31 통과) 유지. 신규 파일 lint 무에러.
- 라이브 e2e는 DB 필요 → 수동 수용.

**확정된 사실(코드 확인):**
- 스키마: `coachingAttempts`(studentId, pageId, isCorrect), `studentNotes`(studentId, pageId), `pages`(id, chapterId), `chapters`(id, title, position, classroomId), `profiles`(name).
- `services/classroom.service.ts` exports `isClassroomOwner(classroomId, teacherId)`, `getClassroomMembers(classroomId)` → `[{ id, classroomId, studentId, joinedAt, student: { id, name, email, avatarUrl } }]`.
- `routes/*` 패턴: `export async function xRoutes(app)`, `app.register` in `app.ts`. `authenticate`(middleware/auth.js), `requireRole`(middleware/roleGuard.js). `req.user.sub`.
- `lib/api.ts`: `api.get`. `db` from `config/database.js`.
- ClassroomDetail.jsx: `useParams()`→`id`; `useNavigate`→`navigate`; `useAuth()`→`profile`; `isTeacher`(= `profile?.role === 'teacher'`) in scope; tab nav is a static array `[{key,label,Icon}]` at ~line 520 (icons from lucide: BookOpen/Newspaper/ClipboardList/Users); body renders `{activeTab === '<key>' && (...)}` blocks; `activeTab` union currently `'chapters'|'board'|'assignments'|'students'`.
- Postgres: use `cast(count(*) filter (where ...) as int)` for conditional counts (avoid bigint→string).

---

## File Structure
**서버**
- `services/dashboard.service.ts` — 집계 (신규)
- `routes/dashboard.ts` — GET 라우트 (신규)
- `app.ts` — 등록 (수정)

**클라이언트**
- `lib/dashboard.js` — API 래퍼 (신규)
- `components/dashboard/ClassroomDashboard.jsx` — 대시보드 UI (신규)
- `pages/Classrooms/ClassroomDetail.jsx` — '대시보드' 탭 (수정)

**공유**
- `types/dashboard.ts` — 응답 타입 (신규) + `index.ts` export (수정)

---

## Task 1: 공유 타입

**Files:** Create `packages/shared/src/types/dashboard.ts`; Modify `packages/shared/src/index.ts`

- [ ] **Step 1: 타입 파일**

`packages/shared/src/types/dashboard.ts`:
```ts
export interface DashboardChapter {
  id: string;
  title: string;
  totalPages: number;
}

export interface DashboardCell {
  attempts: number;
  correct: number;
  notedPages: number;
}

export interface DashboardStudent {
  studentId: string;
  name: string | null;
  overall: { attempts: number; correct: number };
  cells: Record<string, DashboardCell>; // key = chapterId
}

export interface ClassroomDashboard {
  chapters: DashboardChapter[];
  students: DashboardStudent[];
  summary: {
    avgAccuracy: number;     // 정수 % (0..100)
    totalAttempts: number;
    activeStudents: number;
    chapterCount: number;
  };
}
```

- [ ] **Step 2: 배럴 export**

Append to `packages/shared/src/index.ts`:
```ts
export * from './types/dashboard.js';
```

- [ ] **Step 3: 타입체크**

Run: `npm run typecheck -w @mathchois/shared`
Expected: 성공.

- [ ] **Step 4: Commit**
```bash
git add packages/shared/src/types/dashboard.ts packages/shared/src/index.ts
git commit -m "feat(shared): teacher class dashboard types"
```

---

## Task 2: dashboard.service — 집계

**Files:** Create `packages/server/src/services/dashboard.service.ts`

- [ ] **Step 1: 작성**

`packages/server/src/services/dashboard.service.ts`:
```ts
import { eq, sql } from 'drizzle-orm';
import { db } from '../config/database.js';
import { chapters, pages, coachingAttempts, studentNotes } from '../db/schema.js';
import { getClassroomMembers } from './classroom.service.js';
import type { ClassroomDashboard, DashboardStudent } from '@mathchois/shared';

export async function getClassroomDashboard(classroomId: string): Promise<ClassroomDashboard> {
  // 1) 챕터 + 페이지 수 (position 순)
  const chapterRows = await db
    .select({
      id: chapters.id,
      title: chapters.title,
      totalPages: sql<number>`cast(count(${pages.id}) as int)`,
    })
    .from(chapters)
    .leftJoin(pages, eq(pages.chapterId, chapters.id))
    .where(eq(chapters.classroomId, classroomId))
    .groupBy(chapters.id, chapters.title, chapters.position)
    .orderBy(chapters.position);

  // 2) 코칭 집계 (student, chapter)
  const coachRows = await db
    .select({
      studentId: coachingAttempts.studentId,
      chapterId: chapters.id,
      attempts: sql<number>`cast(count(*) as int)`,
      correct: sql<number>`cast(count(*) filter (where ${coachingAttempts.isCorrect} is true) as int)`,
    })
    .from(coachingAttempts)
    .innerJoin(pages, eq(coachingAttempts.pageId, pages.id))
    .innerJoin(chapters, eq(pages.chapterId, chapters.id))
    .where(eq(chapters.classroomId, classroomId))
    .groupBy(coachingAttempts.studentId, chapters.id);

  // 3) 필기 집계 (student, chapter) — distinct page
  const noteRows = await db
    .select({
      studentId: studentNotes.studentId,
      chapterId: chapters.id,
      notedPages: sql<number>`cast(count(distinct ${studentNotes.pageId}) as int)`,
    })
    .from(studentNotes)
    .innerJoin(pages, eq(studentNotes.pageId, pages.id))
    .innerJoin(chapters, eq(pages.chapterId, chapters.id))
    .where(eq(chapters.classroomId, classroomId))
    .groupBy(studentNotes.studentId, chapters.id);

  // 4) 멤버
  const members = await getClassroomMembers(classroomId);

  // 5) 조립
  const studentMap = new Map<string, DashboardStudent>();
  for (const m of members) {
    studentMap.set(m.studentId, {
      studentId: m.studentId,
      name: m.student?.name ?? null,
      overall: { attempts: 0, correct: 0 },
      cells: {},
    });
  }
  const ensure = (studentId: string): DashboardStudent => {
    let s = studentMap.get(studentId);
    if (!s) {
      s = { studentId, name: null, overall: { attempts: 0, correct: 0 }, cells: {} };
      studentMap.set(studentId, s);
    }
    return s;
  };
  const cell = (s: DashboardStudent, chapterId: string) => {
    if (!s.cells[chapterId]) s.cells[chapterId] = { attempts: 0, correct: 0, notedPages: 0 };
    return s.cells[chapterId];
  };

  for (const r of coachRows) {
    const s = ensure(r.studentId);
    const c = cell(s, r.chapterId);
    c.attempts += r.attempts;
    c.correct += r.correct;
    s.overall.attempts += r.attempts;
    s.overall.correct += r.correct;
  }
  for (const r of noteRows) {
    const s = ensure(r.studentId);
    cell(s, r.chapterId).notedPages += r.notedPages;
  }

  const students = Array.from(studentMap.values());
  const totalAttempts = students.reduce((a, s) => a + s.overall.attempts, 0);
  const totalCorrect = students.reduce((a, s) => a + s.overall.correct, 0);
  const activeStudents = students.filter((s) => s.overall.attempts > 0).length;

  return {
    chapters: chapterRows,
    students,
    summary: {
      avgAccuracy: totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0,
      totalAttempts,
      activeStudents,
      chapterCount: chapterRows.length,
    },
  };
}
```

- [ ] **Step 2: 빌드**

Run: `npm run build -w @mathchois/shared && npm run build -w @mathchois/server`
Expected: 성공. (group-by/filter SQL 타입 이슈 시 `sql` 표현은 유지하고 최소 조정.)

- [ ] **Step 3: Commit**
```bash
git add packages/server/src/services/dashboard.service.ts
git commit -m "feat(server): dashboard.service classroom aggregation"
```

---

## Task 3: 라우트 + 등록

**Files:** Create `packages/server/src/routes/dashboard.ts`; Modify `packages/server/src/app.ts`

- [ ] **Step 1: 라우트**

`packages/server/src/routes/dashboard.ts`:
```ts
import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleGuard.js';
import { isClassroomOwner } from '../services/classroom.service.js';
import { getClassroomDashboard } from '../services/dashboard.service.js';

export async function dashboardRoutes(app: FastifyInstance) {
  app.get<{ Params: { classroomId: string } }>(
    '/api/dashboard/classrooms/:classroomId',
    { preHandler: [authenticate, requireRole('teacher')] },
    async (req, reply) => {
      const { classroomId } = req.params;
      if (!(await isClassroomOwner(classroomId, req.user.sub))) {
        return reply.status(403).send({ error: '이 클래스의 담당 교사가 아닙니다' });
      }
      return getClassroomDashboard(classroomId);
    },
  );
}
```

- [ ] **Step 2: app.ts 등록**

`packages/server/src/app.ts`:
- import: `import { dashboardRoutes } from './routes/dashboard.js';`
- 등록: `app.register(dashboardRoutes);`

- [ ] **Step 3: 빌드**

Run: `npm run build -w @mathchois/server`
Expected: 성공.

- [ ] **Step 4: (선택) 스모크 (DB + 교사 JWT)**
```bash
curl -s -H "Authorization: Bearer <TEACHER_JWT>" "http://localhost:3001/api/dashboard/classrooms/<CLASSROOM_ID>" | head
```
Expected: `{"chapters":[...],"students":[...],"summary":{...}}`. 비소유 클래스 → 403.

- [ ] **Step 5: Commit**
```bash
git add packages/server/src/routes/dashboard.ts packages/server/src/app.ts
git commit -m "feat(server): dashboard route (teacher + owner guarded)"
```

---

## Task 4: 클라 API 래퍼

**Files:** Create `packages/client/src/lib/dashboard.js`

- [ ] **Step 1: 작성**

`packages/client/src/lib/dashboard.js`:
```js
import { api } from './api';

export const getClassroomDashboard = (classroomId) =>
  api.get(`/api/dashboard/classrooms/${classroomId}`);
```

- [ ] **Step 2: 빌드**

Run: `npm run build -w @mathchois/client`
Expected: 성공.

- [ ] **Step 3: Commit**
```bash
git add packages/client/src/lib/dashboard.js
git commit -m "feat(client): dashboard api wrapper"
```

---

## Task 5: ClassroomDashboard 컴포넌트

**Files:** Create `packages/client/src/components/dashboard/ClassroomDashboard.jsx`

- [ ] **Step 1: 작성**

`packages/client/src/components/dashboard/ClassroomDashboard.jsx`:
```jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getClassroomDashboard } from '../../lib/dashboard';

/** 정답률 → 색 클래스 (null = 시도 없음 회색) */
function accColor(pct) {
  if (pct == null) return 'bg-gray-300 text-gray-600';
  if (pct >= 70) return 'bg-emerald-600 text-white';
  if (pct >= 40) return 'bg-amber-600 text-white';
  return 'bg-rose-600 text-white';
}
const acc = (correct, attempts) => (attempts > 0 ? Math.round((correct / attempts) * 100) : null);

export default function ClassroomDashboard({ classroomId }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true); setError('');
    getClassroomDashboard(classroomId)
      .then((d) => { if (alive) setData(d); })
      .catch((err) => { if (alive) setError(err.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [classroomId]);

  if (loading) return <p className="text-gray-500 text-sm">불러오는 중…</p>;
  if (error) return <p className="text-rose-600 text-sm">{error}</p>;
  if (!data) return null;

  const { chapters, students, summary } = data;
  const chapterById = new Map(chapters.map((c) => [c.id, c]));

  const goStudent = (s) =>
    navigate(`/teacher/classrooms/${classroomId}/students/${s.studentId}/coaching-history`,
      { state: { studentName: s.name } });

  return (
    <div className="flex flex-col gap-4">
      {/* 요약 카드 */}
      <div className="flex flex-wrap gap-2">
        {[
          ['반 평균 정답률', `${summary.avgAccuracy}%`],
          ['총 코칭 시도', summary.totalAttempts],
          ['활동 학생', summary.activeStudents],
          ['챕터 수', summary.chapterCount],
        ].map(([label, val]) => (
          <div key={label} className="flex-1 min-w-24 border rounded-xl p-3 bg-white">
            <div className="text-xl font-extrabold text-gray-900">{val}</div>
            <div className="text-xs text-gray-500 whitespace-nowrap">{label}</div>
          </div>
        ))}
      </div>

      {/* 학생 카드 */}
      {students.length === 0 ? (
        <div className="border-2 border-dashed border-gray-200 rounded-xl h-32 flex items-center justify-center text-gray-400 text-sm">
          학생이 없습니다.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {students.map((s) => {
            const overallPct = acc(s.overall.correct, s.overall.attempts);
            return (
              <button key={s.studentId} onClick={() => goStudent(s)}
                className="w-full text-left border rounded-xl bg-white p-3 hover:bg-blue-50 transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium whitespace-nowrap truncate">{s.name || '(이름 없음)'}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap ${accColor(overallPct)}`}>
                    종합 {overallPct == null ? '–' : `${overallPct}%`}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {chapters.map((ch) => {
                    const c = s.cells[ch.id];
                    const pct = c ? acc(c.correct, c.attempts) : null;
                    const noted = c?.notedPages ?? 0;
                    const progPct = ch.totalPages > 0 ? Math.round((noted / ch.totalPages) * 100) : 0;
                    return (
                      <div key={ch.id} className="rounded-lg overflow-hidden w-16 text-center">
                        <div className={`px-1 py-1 text-xs font-bold whitespace-nowrap ${accColor(pct)}`}>
                          {pct == null ? '–' : `${pct}%`}
                        </div>
                        <div className="text-[10px] text-gray-500 whitespace-nowrap truncate px-0.5" title={chapterById.get(ch.id)?.title || ''}>
                          {ch.title}
                        </div>
                        <div className="h-1 bg-gray-200">
                          <div className="h-full bg-blue-500" style={{ width: `${progPct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 빌드**

Run: `npm run build -w @mathchois/client`
Expected: 성공.

- [ ] **Step 3: Commit**
```bash
git add packages/client/src/components/dashboard/ClassroomDashboard.jsx
git commit -m "feat(client): ClassroomDashboard (student cards + chapter chips)"
```

---

## Task 6: ClassroomDetail '대시보드' 탭

**Files:** Modify `packages/client/src/pages/Classrooms/ClassroomDetail.jsx`

- [ ] **Step 1: import + 탭 + 렌더**

`packages/client/src/pages/Classrooms/ClassroomDetail.jsx`:
- lucide import에 `BarChart3` 추가(기존 lucide import 줄에 병합).
- import 추가: `import ClassroomDashboard from '../../components/dashboard/ClassroomDashboard';`
- 탭 네비 배열(`{ key: 'students', ... }` 다음)에 교사 전용 항목 추가. 배열 리터럴을 다음처럼 교체:
```jsx
          {[
            { key: 'chapters',    label: '챕터',  Icon: BookOpen },
            { key: 'board',       label: '게시판', Icon: Newspaper },
            { key: 'assignments', label: '과제',  Icon: ClipboardList },
            { key: 'students',    label: '학생',  Icon: Users },
            ...(isTeacher ? [{ key: 'dashboard', label: '대시보드', Icon: BarChart3 }] : []),
          ].map((item) => {
```
- 탭 본문에 블록 추가('학생 탭' 블록 근처):
```jsx
        {/* ── 대시보드 탭 (교사 전용) ── */}
        {activeTab === 'dashboard' && isTeacher && (
          <ClassroomDashboard classroomId={id} />
        )}
```

- [ ] **Step 2: 빌드**

Run: `npm run build -w @mathchois/client`
Expected: 성공.

- [ ] **Step 3: Commit**
```bash
git add packages/client/src/pages/Classrooms/ClassroomDetail.jsx
git commit -m "feat(client): ClassroomDetail dashboard tab (teacher only)"
```

---

## Task 7: 통합 검증 · 반응형 · 맵

**Files:** 없음(검증)

- [ ] **Step 1: 전체 빌드**

Run: `npm run build`
Expected: shared→client→server 모두 성공.

- [ ] **Step 2: 클라 테스트**

Run: `npm run test -w @mathchois/client`
Expected: 기존 31 테스트 통과.

- [ ] **Step 3: 라이브 e2e 스모크 (DB 설정 시)**
1. 교사: 클래스 상세 → '대시보드' 탭 → 요약 카드 4개 + 학생 카드(챕터 칩) 렌더 확인. 정답률 색·진도 막대 표시.
2. 학생 계정으로 같은 ClassroomDetail 접근 시 '대시보드' 탭 **미노출** 확인.
3. 학생 카드 클릭 → 해당 학생 #4 코칭 기록 페이지로 이동 확인.
4. 코칭 기록 없는 클래스 → 칩 회색 `–`, 요약 0 처리 확인.
5. 비소유 클래스 classroomId로 API 직접 호출 → 403.

- [ ] **Step 4: 반응형 리뷰**

`responsive-ui-reviewer`로 `ClassroomDashboard.jsx` + ClassroomDetail 탭 변경분 점검(요약카드 flex-wrap, 칩 flex-wrap·whitespace-nowrap, 카드 터치타깃, 진도막대). 지적 수정.

- [ ] **Step 5: PROJECT_MAP 갱신**

`project-map-updater`로 dashboard 라우트(`/api/dashboard/classrooms/:classroomId`)·`dashboard.service`·`ClassroomDashboard`·ClassroomDetail '대시보드' 탭 반영.

- [ ] **Step 6: 최종 Commit**
```bash
git add -A
git commit -m "chore: class dashboard verification + responsive/map review"
```

---

## Self-Review 결과

**Spec 커버리지:**
- §3 지표(정답률/진도/종합/요약4) → Task 2(집계) + Task 5(클라 계산·표시) ✅
- §4.1 서비스 집계(3 group-by + 멤버 + 조립) → Task 2 ✅
- §4.2 라우트(GET, teacher+owner, 응답형) → Task 3 ✅
- §4.3 공유 타입 → Task 1 ✅
- §5.1 ClassroomDetail 대시보드 탭(교사전용) → Task 6 ✅
- §5.2 ClassroomDashboard(요약카드+학생카드+챕터칩+드릴다운) → Task 5 ✅
- §5.4 lib/dashboard.js → Task 4 ✅
- §5.5 반응형 → Task 5(구현) + Task 7(리뷰) ✅

**타입 일관성:** `ClassroomDashboard`/`DashboardStudent`/`DashboardCell`/`DashboardChapter`(shared) ↔ service 반환(chapters/students.cells/summary) ↔ 컴포넌트 사용(`s.cells[ch.id]`, `s.overall`, `ch.totalPages`, `summary.*`) 일치.

**미해결 가정(구현 시 확인):**
1. drizzle `count(*) filter (where ...)` / `count(distinct ...)`의 `sql<number>` + `cast(... as int)` 타입체크 통과 — 빌드로 확인, 실패 시 `sql` 표현 최소 조정(의미 유지).
2. ClassroomDetail의 lucide import 줄에 `BarChart3` 병합, `isTeacher`·`id`·`navigate` 스코프(코드상 존재 확인됨).
3. `getClassroomMembers` 반환의 `m.studentId`/`m.student.name` 필드명(확인됨).
