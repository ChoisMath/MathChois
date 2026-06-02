# AI 코칭 풀이 기록 조회 구현 계획 (#4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 학생 본인과 교사(학생별)가 `coaching_attempts` 기록을 기간 필터(기본 최근 7일, 프리셋·날짜 직접지정)로 조회한다. 교사는 해당 클래스의 챕터 범위로 한정.

**Architecture:** 스키마 변경 없음 — `coaching.service`에 조인 읽기 쿼리 2개(본인/교사) 추가, `routes/coaching.ts`에 엔드포인트 2개(교사용은 owner+member 검증). 클라는 공용 `CoachingHistoryView`(카드 리스트 + 인라인 펼침 + 기간 필터)를 학생/교사 페이지가 fetch 함수만 바꿔 재사용. 정답·해설은 problem 조인에서 표시필드만 select.

**Tech Stack:** Fastify · Drizzle/PostgreSQL · React 19 · React Router 7 · Tailwind 4 · KaTeX. 날짜 라이브러리 없음 → 네이티브 `<input type="date">`.

**참조 spec:** `docs/superpowers/specs/2026-06-02-coaching-history-design.md`
**선행 완료:** #3 (`coaching_attempts`, `CoachingPanel`, `ProblemView`, `lib/coaching.js`).

---

## 검증 전략
- 서버: 테스트 러너 없음 → `npm run build -w @mathchois/server`(tsc) 게이트 + 선택 스모크.
- 클라: `npm run build -w @mathchois/client` + 기존 vitest(`npm run test -w @mathchois/client`) 유지(31 통과). 신규 파일 lint 무에러.
- 라이브 e2e는 DB 필요 → 수동 수용.

**확정된 사실(코드 확인):**
- `coaching_attempts` 컬럼: id,pageId,problemId,studentId,workImageUrl,solutionLatex,isCorrect,errorTags,conceptTags,strengthNotes,weaknessNotes,commentMarkdown,aiModel,createdAt.
- `problems` 표시필드: title,subject,majorUnit,difficulty,problemLatex,figures,figureNotes (answer/solution 제외 대상).
- `pages.chapterId → chapters.id`, `chapters.classroomId`, `chapters.title`.
- `services/classroom.service.ts` exports `isClassroomOwner(classroomId, teacherId)`, `isClassroomMember(classroomId, studentId)`.
- `services/coaching.service.ts` 현재: `createAttempt`, `listAttempts(pageId, studentId)` (이 파일에 추가).
- `routes/coaching.ts` 현재: `const auth = { preHandler: [authenticate] }`, convert/review/attempts. `import * ...`. (이 파일에 추가). `requireRole` from `../middleware/roleGuard.js`.
- `TokenPayload.sub`/`.isAdmin`. `req.user.sub`.
- `GET /api/classrooms/:id/members` 반환: `[{ id, classroomId, studentId, joinedAt, student: { id, name, email, avatarUrl } }]`.
- ClassroomDetail.jsx: `useParams()` → `id`; `members` state 이미 fetch·렌더(students 탭 line 624–652, 각 멤버 카드 `m.student?.name`/`m.studentId`); `useNavigate` 사용; 교사/학생 공용 컴포넌트(역할 게이트 필요).
- `lib/api.ts`: `api.get`. 클라 진입점 `main.jsx`(KaTeX CSS 로드됨).
- `CoachingPanel` props 현재 `{ attempt }`; `weaknessNotes`만 렌더.

---

## File Structure
**서버**
- `services/coaching.service.ts` — history 쿼리 2개 + 조인 빌더 (수정)
- `routes/coaching.ts` — history 라우트 2개 (수정)

**클라이언트**
- `lib/coaching.js` — getMyHistory/getStudentHistory + qs (수정)
- `components/common/CoachingPanel.jsx` — showTeacherNotes prop (수정)
- `components/coaching/CoachingHistoryView.jsx` — 공용 (신규)
- `pages/History/MyCoachingHistory.jsx` — 학생 (신규)
- `pages/Monitor/StudentCoachingHistory.jsx` — 교사 (신규)
- `pages/Classrooms/ClassroomDetail.jsx` — 멤버 카드 [코칭 기록] 버튼 (수정)
- `layouts/DashboardLayout.jsx` — StudentSidebar 메뉴 (수정)
- `App.jsx` — 라우트 2개 (수정)

**공유**
- `types/coaching.ts` — view/result/filters 타입 (수정)

---

## Task 1: 공유 타입

**Files:** Modify `packages/shared/src/types/coaching.ts`

- [ ] **Step 1: 타입 추가**

`packages/shared/src/types/coaching.ts` 끝에 추가:
```ts
export interface CoachingAttemptView {
  id: string;
  pageId: string;
  problemId: string | null;
  studentId: string;
  workImageUrl: string | null;
  solutionLatex: string | null;
  isCorrect: boolean | null;
  errorTags: string[];
  conceptTags: string[];
  strengthNotes: string | null;
  weaknessNotes: string | null;
  commentMarkdown: string | null;
  aiModel: string | null;
  createdAt: string;
  problemTitle: string | null;
  subject: string | null;
  majorUnit: string | null;
  difficulty: string | null;
  problemLatex: string | null;
  figures: ProblemFigure[];
  figureNotes: string[];
  chapterTitle: string | null;
}

export interface CoachingHistoryResult {
  items: CoachingAttemptView[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CoachingHistoryFilters {
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}
```
> `ProblemFigure`는 같은 파일(coaching.ts)에 이미 정의돼 있으면 그대로 사용; 없으면 `import type { ProblemFigure } from './problem.js';` 추가. (coaching.ts는 #3에서 `ProblemFigure`를 자체 정의하지 않았으므로 problem.ts에서 import — 확인 후 맞출 것.)

- [ ] **Step 2: 타입체크**

Run: `npm run typecheck -w @mathchois/shared`
Expected: 성공. (`ProblemFigure` 미해결 시 import 추가.)

- [ ] **Step 3: Commit**
```bash
git add packages/shared/src/types/coaching.ts
git commit -m "feat(shared): coaching history view/result/filter types"
```

---

## Task 2: coaching.service — history 쿼리

**Files:** Modify `packages/server/src/services/coaching.service.ts`

- [ ] **Step 1: 조인 빌더 + 쿼리 2개 추가**

`packages/server/src/services/coaching.service.ts` — 상단 import를 확장하고(기존 `import { eq, and, desc } from 'drizzle-orm';` → 아래로), 파일 끝에 함수 추가:
```ts
import { eq, and, desc, gte, lt, sql, type SQL } from 'drizzle-orm';
import { db } from '../config/database.js';
import { coachingAttempts, problems, pages, chapters } from '../db/schema.js';
```
(기존 `createAttempt`/`listAttempts`는 그대로 둔다.)

파일 끝에 추가:
```ts
export interface HistoryQuery { from?: string; to?: string; page?: number; pageSize?: number; }

// problem 표시필드만 select (answer/solution 제외) — 보안 불변식
const VIEW_COLUMNS = {
  id: coachingAttempts.id,
  pageId: coachingAttempts.pageId,
  problemId: coachingAttempts.problemId,
  studentId: coachingAttempts.studentId,
  workImageUrl: coachingAttempts.workImageUrl,
  solutionLatex: coachingAttempts.solutionLatex,
  isCorrect: coachingAttempts.isCorrect,
  errorTags: coachingAttempts.errorTags,
  conceptTags: coachingAttempts.conceptTags,
  strengthNotes: coachingAttempts.strengthNotes,
  weaknessNotes: coachingAttempts.weaknessNotes,
  commentMarkdown: coachingAttempts.commentMarkdown,
  aiModel: coachingAttempts.aiModel,
  createdAt: coachingAttempts.createdAt,
  problemTitle: problems.title,
  subject: problems.subject,
  majorUnit: problems.majorUnit,
  difficulty: problems.difficulty,
  problemLatex: problems.problemLatex,
  figures: problems.figures,
  figureNotes: problems.figureNotes,
  chapterTitle: chapters.title,
};

function dateConds(from?: string, to?: string): SQL[] {
  const conds: SQL[] = [];
  if (from && !Number.isNaN(Date.parse(from))) {
    conds.push(gte(coachingAttempts.createdAt, new Date(from)));
  }
  if (to && !Number.isNaN(Date.parse(to))) {
    const end = new Date(to);
    end.setDate(end.getDate() + 1); // 종료일 포함
    conds.push(lt(coachingAttempts.createdAt, end));
  }
  return conds;
}

async function runHistory(where: SQL, q: HistoryQuery) {
  const page = Math.max(1, Number.isFinite(q.page) ? Number(q.page) : 1);
  const pageSize = Math.min(100, Math.max(1, Number.isFinite(q.pageSize) ? Number(q.pageSize) : 20));

  const items = await db
    .select(VIEW_COLUMNS)
    .from(coachingAttempts)
    .leftJoin(problems, eq(coachingAttempts.problemId, problems.id))
    .leftJoin(pages, eq(coachingAttempts.pageId, pages.id))
    .leftJoin(chapters, eq(pages.chapterId, chapters.id))
    .where(where)
    .orderBy(desc(coachingAttempts.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(coachingAttempts)
    .leftJoin(pages, eq(coachingAttempts.pageId, pages.id))
    .leftJoin(chapters, eq(pages.chapterId, chapters.id))
    .where(where);

  return { items, total: count, page, pageSize };
}

/** 학생 본인 전체 기록 */
export async function listStudentHistory(studentId: string, q: HistoryQuery) {
  const where = and(eq(coachingAttempts.studentId, studentId), ...dateConds(q.from, q.to)) as SQL;
  return runHistory(where, q);
}

/** 교사용: 특정 클래스의 챕터 범위로 한정 */
export async function listClassroomStudentHistory(classroomId: string, studentId: string, q: HistoryQuery) {
  const where = and(
    eq(coachingAttempts.studentId, studentId),
    eq(chapters.classroomId, classroomId),
    ...dateConds(q.from, q.to),
  ) as SQL;
  return runHistory(where, q);
}
```

- [ ] **Step 2: 빌드**

Run: `npm run build -w @mathchois/shared && npm run build -w @mathchois/server`
Expected: 성공. (drizzle 타입 이슈 시 최소 수정하되 select 필드/조인 유지.)

- [ ] **Step 3: Commit**
```bash
git add packages/server/src/services/coaching.service.ts
git commit -m "feat(server): coaching history queries (student + classroom-scoped)"
```

---

## Task 3: coaching 라우트 — history 엔드포인트

**Files:** Modify `packages/server/src/routes/coaching.ts`

- [ ] **Step 1: import 확장 + 라우트 2개 추가**

`packages/server/src/routes/coaching.ts`:
- import 추가:
```ts
import { requireRole } from '../middleware/roleGuard.js';
import { isClassroomOwner, isClassroomMember } from '../services/classroom.service.js';
import { listStudentHistory, listClassroomStudentHistory } from '../services/coaching.service.js';
```
- `coachingRoutes` 함수 안(기존 attempts GET 근처)에 추가:
```ts
  app.get('/api/coaching/history', auth, async (req) => {
    const q = req.query as Record<string, string>;
    return listStudentHistory(req.user.sub, {
      from: q.from, to: q.to,
      page: q.page ? parseInt(q.page, 10) : undefined,
      pageSize: q.pageSize ? parseInt(q.pageSize, 10) : undefined,
    });
  });

  app.get<{ Params: { classroomId: string; studentId: string } }>(
    '/api/coaching/classrooms/:classroomId/students/:studentId/history',
    { preHandler: [authenticate, requireRole('teacher')] },
    async (req, reply) => {
      const { classroomId, studentId } = req.params;
      if (!(await isClassroomOwner(classroomId, req.user.sub))) {
        return reply.status(403).send({ error: '이 클래스의 담당 교사가 아닙니다' });
      }
      if (!(await isClassroomMember(classroomId, studentId))) {
        return reply.status(403).send({ error: '이 클래스의 학생이 아닙니다' });
      }
      const q = req.query as Record<string, string>;
      return listClassroomStudentHistory(classroomId, studentId, {
        from: q.from, to: q.to,
        page: q.page ? parseInt(q.page, 10) : undefined,
        pageSize: q.pageSize ? parseInt(q.pageSize, 10) : undefined,
      });
    },
  );
```
> `authenticate`는 파일 상단에서 이미 import됨(기존 라우트가 사용). `auth` 상수도 기존 정의 재사용.

- [ ] **Step 2: 빌드**

Run: `npm run build -w @mathchois/server`
Expected: 성공.

- [ ] **Step 3: (선택) 스모크 — 본인 기록 (DB 연결 시)**
```bash
curl -s -H "Authorization: Bearer <JWT>" "http://localhost:3001/api/coaching/history?from=2026-05-01&to=2026-06-02" | head
```
Expected: `{"items":[...],"total":N,"page":1,"pageSize":20}`.

- [ ] **Step 4: Commit**
```bash
git add packages/server/src/routes/coaching.ts
git commit -m "feat(server): coaching history routes (self + teacher per-student)"
```

---

## Task 4: 클라 API 래퍼 + CoachingPanel 교사 메모

**Files:** Modify `packages/client/src/lib/coaching.js`, `packages/client/src/components/common/CoachingPanel.jsx`

- [ ] **Step 1: lib/coaching.js 추가**

`packages/client/src/lib/coaching.js` 끝에 추가:
```js
function qs(params = {}) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const getMyHistory = (params) => api.get(`/api/coaching/history${qs(params)}`);
export const getStudentHistory = (classroomId, studentId, params) =>
  api.get(`/api/coaching/classrooms/${classroomId}/students/${studentId}/history${qs(params)}`);
```
(`api`는 파일 상단에서 이미 import됨.)

- [ ] **Step 2: CoachingPanel에 showTeacherNotes 추가**

`packages/client/src/components/common/CoachingPanel.jsx` — 시그니처와 강점 메모 표시 추가:
```jsx
export default function CoachingPanel({ attempt, showTeacherNotes = false }) {
  if (!attempt) return null;
  return (
    <div className="rounded-xl border bg-white p-3 shadow-sm">
      {/* ...기존 배지/마크다운 그대로... */}
      <div className="prose prose-sm max-w-none leading-7">
        <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
          {attempt.commentMarkdown || ''}
        </ReactMarkdown>
      </div>
      {showTeacherNotes && attempt.strengthNotes && (
        <p className="mt-2 text-sm text-emerald-700">강점: {attempt.strengthNotes}</p>
      )}
      {attempt.weaknessNotes && (
        <p className="mt-2 text-sm text-gray-500">보완: {attempt.weaknessNotes}</p>
      )}
    </div>
  );
}
```
(배지 블록은 기존 그대로 유지 — 시그니처와 강점 메모 줄만 추가.)

- [ ] **Step 3: 빌드**

Run: `npm run build -w @mathchois/client`
Expected: 성공.

- [ ] **Step 4: Commit**
```bash
git add packages/client/src/lib/coaching.js packages/client/src/components/common/CoachingPanel.jsx
git commit -m "feat(client): history api wrappers + CoachingPanel teacher notes"
```

---

## Task 5: 공용 CoachingHistoryView

**Files:** Create `packages/client/src/components/coaching/CoachingHistoryView.jsx`

- [ ] **Step 1: 작성**

`packages/client/src/components/coaching/CoachingHistoryView.jsx`:
```jsx
import { useEffect, useState, useCallback } from 'react';
import ProblemView from '../common/ProblemView';
import CoachingPanel from '../common/CoachingPanel';

const fmt = (d) => d.toISOString().slice(0, 10);
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return fmt(d);
}

/**
 * 코칭 기록 카드 리스트 + 기간 필터 + 인라인 펼침.
 * @param {{ fetchHistory: (params:object)=>Promise<{items,total,page,pageSize}>, showTeacherNotes?: boolean }} props
 */
export default function CoachingHistoryView({ fetchHistory, showTeacherNotes = false }) {
  const [from, setFrom] = useState(() => daysAgo(7));
  const [to, setTo] = useState(() => fmt(new Date()));
  const [result, setResult] = useState({ items: [], total: 0, page: 1, pageSize: 20 });
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [showImageId, setShowImageId] = useState(null);

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    try { setResult(await fetchHistory({ from, to, page })); }
    finally { setLoading(false); }
  }, [fetchHistory, from, to]);

  useEffect(() => { load(1); }, [load]);

  const preset = (kind) => {
    if (kind === 'week') { setFrom(daysAgo(7)); setTo(fmt(new Date())); }
    else if (kind === 'month') { setFrom(daysAgo(30)); setTo(fmt(new Date())); }
    else { setFrom(''); setTo(''); } // 전체
  };

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <div className="flex flex-col gap-3">
      {/* 기간 필터 */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => preset('week')} className="px-3 min-h-11 border rounded-md text-sm whitespace-nowrap">최근 1주</button>
        <button onClick={() => preset('month')} className="px-3 min-h-11 border rounded-md text-sm whitespace-nowrap">최근 1개월</button>
        <button onClick={() => preset('all')} className="px-3 min-h-11 border rounded-md text-sm whitespace-nowrap">전체</button>
        <span className="text-gray-300">|</span>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
          className="border rounded px-2 min-h-11 text-sm" />
        <span className="text-gray-400">~</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
          className="border rounded px-2 min-h-11 text-sm" />
        <button onClick={() => load(1)} className="px-3 min-h-11 bg-blue-600 text-white rounded-md text-sm whitespace-nowrap">조회</button>
      </div>

      <p className="text-xs text-gray-500">{loading ? '불러오는 중…' : `총 ${result.total}건`}</p>

      {/* 카드 리스트 */}
      {!loading && result.items.length === 0 ? (
        <div className="border-2 border-dashed border-gray-200 rounded-xl h-32 flex items-center justify-center text-gray-400 text-sm">
          기록이 없습니다.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {result.items.map((a) => {
            const open = openId === a.id;
            return (
              <div key={a.id} className="border rounded-xl bg-white">
                {/* 헤더 */}
                <button onClick={() => setOpenId(open ? null : a.id)}
                  className="w-full flex flex-wrap items-center gap-2 p-3 text-left">
                  <span className="text-xs text-gray-500 whitespace-nowrap">{(a.createdAt || '').slice(0, 10)}</span>
                  <span className="font-medium whitespace-nowrap truncate max-w-60">{a.problemTitle || '(제목 없음)'}</span>
                  {a.subject && <span className="text-xs text-gray-500 whitespace-nowrap">{a.subject}{a.difficulty ? ` · ${a.difficulty}` : ''}</span>}
                  {a.chapterTitle && <span className="text-xs text-gray-400 whitespace-nowrap truncate max-w-40">{a.chapterTitle}</span>}
                  <span className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${
                    a.isCorrect ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                    {a.isCorrect ? '정답' : '오답'}
                  </span>
                </button>

                {/* 펼침 */}
                {open && (
                  <div className="border-t p-3 flex flex-col gap-3">
                    {a.problemLatex && (
                      <div>
                        <p className="text-xs text-gray-400 mb-1">문제</p>
                        <ProblemView latex={a.problemLatex} figures={a.figures} />
                      </div>
                    )}
                    {a.solutionLatex && (
                      <div>
                        <p className="text-xs text-gray-400 mb-1">변환된 풀이</p>
                        <div className="border rounded-lg p-2"><ProblemView latex={a.solutionLatex} figures={[]} /></div>
                      </div>
                    )}
                    <CoachingPanel attempt={a} showTeacherNotes={showTeacherNotes} />
                    {a.workImageUrl && (
                      <div>
                        <button onClick={() => setShowImageId(showImageId === a.id ? null : a.id)}
                          className="text-xs text-gray-500 underline">
                          {showImageId === a.id ? '필기 이미지 숨기기' : '필기 이미지 보기'}
                        </button>
                        {showImageId === a.id && <img src={a.workImageUrl} alt="필기" className="mt-2 max-w-full rounded border" />}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 페이지네이션 */}
      {result.total > result.pageSize && (
        <div className="flex gap-2 justify-center">
          <button disabled={result.page <= 1} onClick={() => load(result.page - 1)}
            className="px-3 min-h-11 border rounded disabled:opacity-40 whitespace-nowrap">이전</button>
          <span className="px-2 text-sm flex items-center">{result.page} / {totalPages}</span>
          <button disabled={result.page >= totalPages} onClick={() => load(result.page + 1)}
            className="px-3 min-h-11 border rounded disabled:opacity-40 whitespace-nowrap">다음</button>
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
git add packages/client/src/components/coaching/CoachingHistoryView.jsx
git commit -m "feat(client): shared CoachingHistoryView (filter + card list + expand)"
```

---

## Task 6: 학생 페이지 + 사이드바 + 라우트

**Files:** Create `packages/client/src/pages/History/MyCoachingHistory.jsx`; Modify `packages/client/src/layouts/DashboardLayout.jsx`, `packages/client/src/App.jsx`

- [ ] **Step 1: 학생 페이지**

`packages/client/src/pages/History/MyCoachingHistory.jsx`:
```jsx
import CoachingHistoryView from '../../components/coaching/CoachingHistoryView';
import { getMyHistory } from '../../lib/coaching';

export default function MyCoachingHistory() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold whitespace-nowrap">내 풀이 기록</h1>
      <CoachingHistoryView fetchHistory={getMyHistory} />
    </div>
  );
}
```

- [ ] **Step 2: StudentSidebar 메뉴**

`packages/client/src/layouts/DashboardLayout.jsx`:
- lucide import에 `History` 추가(예: `import { Users, LogIn, LayoutList, Loader, BookMarked, History } from 'lucide-react';` — 실제 기존 import 줄에 `History` 병합).
- `StudentSidebar`의 "내 클래스룸" `<Link>` 아래(또는 클래스 목록 위)에 추가:
```jsx
        <Link
          to="/student/coaching-history"
          className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors mb-2 ${
            location.pathname.startsWith('/student/coaching-history')
              ? 'bg-blue-50 text-blue-700'
              : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          <History className={`mr-2 h-4 w-4 ${location.pathname.startsWith('/student/coaching-history') ? 'text-blue-500' : 'text-gray-400'}`} />
          내 풀이 기록
        </Link>
```
(`StudentSidebar`는 이미 `location`(useLocation) 사용 중.)

- [ ] **Step 3: App.jsx 라우트**

`packages/client/src/App.jsx`:
- lazy import: `const MyCoachingHistory = lazy(() => import('./pages/History/MyCoachingHistory'));`
- 학생 DashboardLayout 블록(`/student/classrooms` 라우트들 옆)에 추가:
```jsx
              <Route path="/student/coaching-history" element={<MyCoachingHistory />} />
```

- [ ] **Step 4: 빌드**

Run: `npm run build -w @mathchois/client`
Expected: 성공.

- [ ] **Step 5: Commit**
```bash
git add packages/client/src/pages/History/MyCoachingHistory.jsx packages/client/src/layouts/DashboardLayout.jsx packages/client/src/App.jsx
git commit -m "feat(client): student coaching-history page + sidebar + route"
```

---

## Task 7: 교사 페이지 + 라우트 + ClassroomDetail 버튼

**Files:** Create `packages/client/src/pages/Monitor/StudentCoachingHistory.jsx`; Modify `packages/client/src/App.jsx`, `packages/client/src/pages/Classrooms/ClassroomDetail.jsx`

- [ ] **Step 1: 교사 페이지**

`packages/client/src/pages/Monitor/StudentCoachingHistory.jsx`:
```jsx
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import CoachingHistoryView from '../../components/coaching/CoachingHistoryView';
import { getStudentHistory } from '../../lib/coaching';

export default function StudentCoachingHistory() {
  const { classroomId, studentId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const studentName = location.state?.studentName;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate(-1)} aria-label="뒤로"
          className="min-h-11 min-w-11 flex items-center justify-center border rounded-md"><ArrowLeft size={18} /></button>
        <h1 className="text-xl font-bold whitespace-nowrap">{studentName ? `${studentName}님의 코칭 기록` : '학생 코칭 기록'}</h1>
      </div>
      <CoachingHistoryView
        fetchHistory={(p) => getStudentHistory(classroomId, studentId, p)}
        showTeacherNotes
      />
    </div>
  );
}
```

- [ ] **Step 2: App.jsx 라우트 (교사 DashboardLayout 블록)**

`packages/client/src/App.jsx`:
- lazy import: `const StudentCoachingHistory = lazy(() => import('./pages/Monitor/StudentCoachingHistory'));`
- 교사 `<Route element={<DashboardLayout />}>` 블록(`/teacher/classrooms/:id` 등 옆)에 추가:
```jsx
              <Route path="/teacher/classrooms/:classroomId/students/:studentId/coaching-history" element={<StudentCoachingHistory />} />
```

- [ ] **Step 3: ClassroomDetail 멤버 카드에 [코칭 기록] 버튼 (교사만)**

`packages/client/src/pages/Classrooms/ClassroomDetail.jsx` — students 탭 멤버 카드(line ~634)에서, 학생 정보 div 다음에 버튼 추가. 교사일 때만 표시(파일의 기존 역할 변수 사용 — `profile?.role === 'teacher'` 또는 기존 `isTeacher`/`isOwner` 변수 확인해 사용). `useNavigate`는 이미 import됨; 없으면 추가:
```jsx
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{m.student?.name}</p>
                      <p className="text-xs text-gray-400 truncate">{m.student?.email}</p>
                    </div>
                    {profile?.role === 'teacher' && (
                      <button
                        onClick={() => navigate(
                          `/teacher/classrooms/${id}/students/${m.studentId}/coaching-history`,
                          { state: { studentName: m.student?.name } },
                        )}
                        className="px-3 min-h-11 border rounded-md text-sm whitespace-nowrap shrink-0"
                      >
                        코칭 기록
                      </button>
                    )}
```
> 파일에서 `profile`(useAuth) 또는 역할 판별 변수의 실제 이름을 확인해 맞출 것. `navigate`/`useNavigate`와 `id`(useParams) 존재 확인(코드상 이미 사용 중).

- [ ] **Step 4: 빌드**

Run: `npm run build -w @mathchois/client`
Expected: 성공.

- [ ] **Step 5: Commit**
```bash
git add packages/client/src/pages/Monitor/StudentCoachingHistory.jsx packages/client/src/App.jsx packages/client/src/pages/Classrooms/ClassroomDetail.jsx
git commit -m "feat(client): teacher per-student coaching history + classroom entry"
```

---

## Task 8: 통합 검증 · 반응형 · 맵

**Files:** 없음(검증)

- [ ] **Step 1: 전체 빌드**

Run: `npm run build`
Expected: shared→client→server 모두 성공.

- [ ] **Step 2: 클라 테스트**

Run: `npm run test -w @mathchois/client`
Expected: 기존 31 테스트 통과.

- [ ] **Step 3: 라이브 e2e 스모크 (DB 설정 시)**
1. 학생: 사이드바 "내 풀이 기록" → 기본 최근 7일 목록. 프리셋/날짜 변경 → 재조회. 카드 펼침 → 문제·풀이·코칭·필기 이미지 확인.
2. 교사: 클래스 상세 '학생' 탭 → 멤버 [코칭 기록] → 해당 학생 페이지. **해당 클래스 챕터 기록만** 보이는지 확인. 강점/보완 메모 표시.
3. **정답 유출 점검:** 네트워크 탭에서 `/api/coaching/history` 및 교사 경로 응답에 answer/solution 필드 **없음** 확인.
4. **권한 점검:** 교사가 자기 클래스 아닌 classroomId로 호출 시 403.

- [ ] **Step 4: 반응형 리뷰**

`responsive-ui-reviewer`로 `CoachingHistoryView.jsx`, `MyCoachingHistory.jsx`, `StudentCoachingHistory.jsx`, ClassroomDetail 버튼 점검(필터 바 flex-wrap, 카드 nowrap·터치타깃, dvh, 날짜 input 높이). 지적 수정.

- [ ] **Step 5: PROJECT_MAP 갱신**

`project-map-updater`로 coaching history 라우트(클라 2 + 서버 2)·CoachingHistoryView·학생/교사 페이지 반영.

- [ ] **Step 6: 최종 Commit**
```bash
git add -A
git commit -m "chore: coaching history verification + responsive/map review"
```

---

## Self-Review 결과

**Spec 커버리지:**
- §3.1 타입 → Task 1 ✅
- §3.2 서비스 쿼리(본인/교사, 조인, 날짜경계, 페이지네이션) → Task 2 ✅
- §3.3 API(2개, owner+member 권한, 표시필드만) → Task 3 ✅
- §4.1 CoachingHistoryView(필터 프리셋+날짜, 카드+펼침, 페이지네이션) → Task 5 ✅
- §4.2 학생 페이지+사이드바+라우트 → Task 6 ✅
- §4.3 lib 래퍼 → Task 4 ✅
- §5.1 ClassroomDetail 버튼 → Task 7 ✅
- §5.2 교사 페이지+라우트 → Task 7 ✅
- §5.3 CoachingPanel showTeacherNotes → Task 4 ✅

**타입 일관성:** `CoachingAttemptView`(shared) ↔ `VIEW_COLUMNS`(service select) ↔ 카드/CoachingPanel 사용 일치(problemTitle/subject/difficulty/chapterTitle/problemLatex/figures/solutionLatex/isCorrect/errorTags/conceptTags/commentMarkdown/strengthNotes/weaknessNotes/workImageUrl). `CoachingHistoryResult` shape 일치.

**미해결 가정(구현 시 확인):**
1. `coaching.ts`의 `ProblemFigure` import 필요 여부 — 파일 확인(Task 1).
2. ClassroomDetail의 역할 판별 변수명(`profile?.role`/`isTeacher`) + `navigate`/`id` 존재 — 파일 확인(Task 7).
3. drizzle `and(...).as SQL` 캐스팅이 타입체크 통과하는지 — 빌드로 확인, 실패 시 `and(...)!` 또는 조건 배열 처리(Task 2).
4. DashboardLayout StudentSidebar의 lucide import 줄에 `History` 병합(Task 6).
