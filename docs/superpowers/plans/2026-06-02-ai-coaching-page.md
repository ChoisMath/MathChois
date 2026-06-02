# 챕터 페이지 AI 수학 코칭 구현 계획 (#3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 교사가 챕터 페이지에 문제은행 문항을 연결하면, 학생이 그 페이지의 Excalidraw 캔버스에 풀이를 쓰고 2단계(수식전환→AI검토)로 스캐폴딩 코칭을 받으며, 각 검토가 불변 `coaching_attempts`로 누적 저장된다.

**Architecture:** `pages.aiProblemId`로 AI 페이지를 식별. 학생 study 라우트에 얇은 `StudyPageRouter` 래퍼를 두어 AI 페이지면 신규 `CoachingViewer`(좌 Excalidraw / 우 문제·코칭 패널, MathCoach SolveWorkspace 이식), 아니면 기존 `StudyViewer`를 렌더. AI 코칭은 서버에서만 정답·해설을 대조(`ai.service.reviewSolution`)하고 학생에겐 표시용 문제 필드만 보낸다.

**Tech Stack:** Fastify · Drizzle/PostgreSQL · `@google/genai`(Gemini) · React 19 · React Router 7 · Excalidraw 0.18(`exportToBlob`) · Tailwind 4 · KaTeX.

**참조 spec:** `docs/superpowers/specs/2026-06-02-ai-coaching-page-design.md`
**선행 완료:** #1+#2 (problems 테이블, ProblemView, ai.service Gemini 래퍼, lib/problems.js).

---

## 검증 전략

- 서버: 단위 테스트 러너 없음 → 각 서버 태스크는 `npm run build -w @mathchois/server`(tsc) 게이트. 필요시 dev 스모크.
- 클라: 빌드(`npm run build -w @mathchois/client`) + 기존 vitest(`npm run test -w @mathchois/client`) 유지. 신규 파일 lint 무에러(`npm run lint`은 레포에 기존 에러 존재 → 신규 파일만 확인).
- AI/라이브 e2e는 실 GEMINI_API_KEY+DB 필요 → 수동 수용 단계.
- `@google/genai`/`exportToBlob` 시그니처는 #1+#2에서 검증된 패턴 재사용.

**확정된 사실(코드 확인):**
- `TokenPayload.sub`(=profile.id), `.isAdmin`. 라우트에서 `request.user.sub`.
- 클라 진입점 `packages/client/src/main.jsx`(KaTeX CSS 이미 import됨).
- `api`(`lib/api.ts`): `get/post/patch/delete/upload`.
- `exportToBlob`는 `@excalidraw/excalidraw`에서 import(`lib/pdfDownloader.jsx` 사용 예).
- 페이지 GET은 전체 row 반환 → 새 컬럼 `ai_problem_id` 자동 포함.
- `storage.ts` 학생 허용 버킷 = `STUDENT_ALLOWED_BUCKETS`(현재 `submission-files`만), 이미지 MIME 화이트리스트 `STUDENT_ALLOWED_MIMES` 존재.

---

## File Structure

**서버**
- `db/schema.ts` — `pages.aiProblemId`, `coachingAttempts` 테이블 (수정)
- `db/startupMigrate.ts` — 멱등 DDL (수정)
- `services/ai.service.ts` — `convertSolutionToLatex`, `reviewSolution` (수정)
- `services/coaching.service.ts` — attempt 생성/목록 (신규)
- `services/problem.service.ts` — `getProblemForCoaching` (수정)
- `services/page.service.ts` — `aiProblemId` create/patch (수정)
- `routes/coaching.ts` — convert/review/attempts (신규)
- `routes/problems.ts` — `/api/problems/:id/for-coaching` (수정)
- `routes/pages.ts` — POST body `aiProblemId`, `PATCH /api/pages/:id` (수정)
- `routes/storage.ts` — `ai-coaching` 학생 버킷 (수정)
- `app.ts` — coaching 라우트 등록 (수정)

**클라이언트**
- `lib/coaching.js` — API 래퍼 (신규)
- `lib/problems.js` — `getProblemForCoaching` (수정)
- `components/common/CoachingPanel.jsx` — (신규)
- `components/problems/ProblemPickerModal.jsx` — (신규)
- `pages/Study/CoachingViewer.jsx` — 워크스페이스 (신규)
- `pages/Study/StudyPageRouter.jsx` — 라우트 분기 래퍼 (신규)
- `pages/Chapters/Editor.jsx` — [AI 코칭] 추가/표시/변경 (수정)
- `App.jsx` — study 라우트 element 교체 (수정)

**공유**
- `types/models.ts` — `Page.aiProblemId` (수정)
- `types/coaching.ts` — 코칭 타입 (신규) + `index.ts` export (수정)

---

## Task 1: 공유 타입

**Files:**
- Modify: `packages/shared/src/types/models.ts`
- Create: `packages/shared/src/types/coaching.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Page에 aiProblemId 추가**

`packages/shared/src/types/models.ts` — `Page` 인터페이스에 한 줄 추가:
```ts
export interface Page {
  id: string;
  chapterId: string;
  imageUrl: string | null;
  videoUrl: string | null;
  htmlUrl: string | null;
  position: number;
  aiProblemId: string | null;
}
```

- [ ] **Step 2: 코칭 타입 파일 생성**

`packages/shared/src/types/coaching.ts`:
```ts
export type ErrorTag =
  | 'conceptual' | 'computational' | 'logical'
  | 'notational' | 'strategic' | 'condition';

/** 필기 → LaTeX 변환 결과 */
export interface ConvertResult {
  latex: string;
}

/** AI 코칭 분석 결과 (reviewSolution 반환 = attempt에 저장되는 분석부) */
export interface CoachingResult {
  commentMarkdown: string;
  isCorrect: boolean;
  errorTags: ErrorTag[];
  conceptTags: string[];
  strengthNotes: string;
  weaknessNotes: string;
}

/** 저장된 코칭 시도 1건 */
export interface CoachingAttempt {
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
}

/** 학생에게 노출되는 표시용 문제(정답·해설 제외) */
export interface CoachingProblemView {
  id: string;
  title: string | null;
  problemLatex: string;
  figureNotes: string[];
  figures: { idx: number; alt: string; imageUrl: string }[];
  originalImageUrl: string | null;
  subject: string | null;
  majorUnit: string | null;
  minorUnit: string | null;
  difficulty: string | null;
  problemType: string | null;
  detailType: string | null;
  keywords: string[];
}
```

- [ ] **Step 3: 배럴 export**

`packages/shared/src/index.ts` 끝에 추가:
```ts
export * from './types/coaching.js';
```

- [ ] **Step 4: 타입체크**

Run: `npm run typecheck -w @mathchois/shared`
Expected: 성공.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/types/models.ts packages/shared/src/types/coaching.ts packages/shared/src/index.ts
git commit -m "feat(shared): Page.aiProblemId + coaching types"
```

---

## Task 2: DB 스키마 — pages.aiProblemId + coaching_attempts

**Files:**
- Modify: `packages/server/src/db/schema.ts`
- Modify: `packages/server/src/db/startupMigrate.ts`

- [ ] **Step 1: pages 테이블에 컬럼 추가**

`packages/server/src/db/schema.ts` — `pages` 테이블 정의의 컬럼 목록에 `position` 다음 줄로 추가(이미 `problems` 테이블이 파일에 존재하므로 참조 가능):
```ts
  position: integer('position').notNull().default(0),
  aiProblemId: uuid('ai_problem_id').references(() => problems.id, { onDelete: 'set null' }),
```
> `pages`가 `problems`보다 위에 정의돼 있어 `() => problems.id` 지연참조로 순서 문제 없음(Drizzle 콜백 참조).

- [ ] **Step 2: coaching_attempts 테이블 추가**

`packages/server/src/db/schema.ts` 맨 아래에 추가:
```ts
// ─── coaching_attempts (AI 코칭 기록) ────────────────

export const coachingAttempts = pgTable('coaching_attempts', {
  id: uuid('id').defaultRandom().primaryKey(),
  pageId: uuid('page_id').notNull().references(() => pages.id, { onDelete: 'cascade' }),
  problemId: uuid('problem_id').references(() => problems.id, { onDelete: 'set null' }),
  studentId: uuid('student_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),

  workImageUrl: text('work_image_url'),
  solutionLatex: text('solution_latex'),
  isCorrect: boolean('is_correct'),
  errorTags: jsonb('error_tags').$type<string[]>().default([]).notNull(),
  conceptTags: jsonb('concept_tags').$type<string[]>().default([]).notNull(),
  strengthNotes: text('strength_notes'),
  weaknessNotes: text('weakness_notes'),
  commentMarkdown: text('comment_markdown'),
  aiModel: text('ai_model'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('idx_coaching_attempts_student').on(t.studentId, t.createdAt),
  index('idx_coaching_attempts_page_student').on(t.pageId, t.studentId),
  index('idx_coaching_attempts_problem').on(t.problemId),
]);
```

- [ ] **Step 3: 멱등 startup DDL**

`packages/server/src/db/startupMigrate.ts` — `runStartupMigrations` 본문 끝에 추가:
```ts
  await pgClient`ALTER TABLE pages ADD COLUMN IF NOT EXISTS ai_problem_id uuid REFERENCES problems(id) ON DELETE SET NULL`;
  await pgClient`
    CREATE TABLE IF NOT EXISTS coaching_attempts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      page_id uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
      problem_id uuid REFERENCES problems(id) ON DELETE SET NULL,
      student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      work_image_url text,
      solution_latex text,
      is_correct boolean,
      error_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
      concept_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
      strength_notes text,
      weakness_notes text,
      comment_markdown text,
      ai_model text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
  await pgClient`CREATE INDEX IF NOT EXISTS idx_coaching_attempts_student ON coaching_attempts (student_id, created_at)`;
  await pgClient`CREATE INDEX IF NOT EXISTS idx_coaching_attempts_page_student ON coaching_attempts (page_id, student_id)`;
  await pgClient`CREATE INDEX IF NOT EXISTS idx_coaching_attempts_problem ON coaching_attempts (problem_id)`;
  log.info('startup migration: pages.ai_problem_id + coaching_attempts ensured');
```
> `problems` 테이블은 #1+#2의 startupMigrate에서 먼저 보장되므로, 이 DDL이 그 뒤에 와야 FK가 유효하다. 기존 `problems` DDL 다음에 배치할 것.

- [ ] **Step 4: 빌드**

Run: `npm run build -w @mathchois/shared && npm run build -w @mathchois/server`
Expected: 성공.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/db/schema.ts packages/server/src/db/startupMigrate.ts
git commit -m "feat(server): pages.ai_problem_id + coaching_attempts table"
```

---

## Task 3: AI 서비스 — convertSolutionToLatex + reviewSolution

**Files:**
- Modify: `packages/server/src/services/ai.service.ts`

- [ ] **Step 1: 프롬프트 상수 추가**

`packages/server/src/services/ai.service.ts` — 기존 프롬프트 상수들 근처에 추가:
```ts
const SOLUTION_OCR_RULE = `다음 규칙으로 학생이 손으로 쓴 수학 풀이 이미지를 변환하라.
- 풀이 전체를 Markdown + LaTeX 로 변환한다. 인라인 수식은 $...$, 디스플레이 수식은 $$...$$.
- 손글씨를 최대한 충실히 옮긴다(맞춤·교정하지 말 것). 한국어가 아닌 텍스트는 한국어로.
- 학생이 그린 그래프·도형·표는 본문에 자연어 설명으로 보존한다.`;

const REVIEW_RULE = `너는 고등 수학 첨삭 선생님이다. 학생 풀이를 검토해 코칭하라.
이미지에는 손글씨 수식뿐 아니라 학생이 직접 그린 그래프·도형·표 등 시각 요소가 포함될 수 있다. 이를 변환된 LaTeX 풀이와 함께 판독·평가하라.
코칭 원칙(스캐폴딩): 오답이거나 막혔으면 정답·전체 풀이를 통째로 제시하지 말고, 학생이 스스로 해결하도록 '다음 한 걸음'에 해당하는 디딤돌 힌트만 짚어라. 정답이면 맞혔음을 알리고 칭찬한 뒤 다른 접근법을 짧게 소개하라.
스타일: 잘한 점 → 오류 위치/이유 → 다음 한 걸음 힌트 → 학습 조언. 존댓말, 이모지 적절히.
commentMarkdown은 학생용 첨삭(Markdown+LaTeX). errorTags는 [conceptual, computational, logical, notational, strategic, condition] 중에서. conceptTags는 다룬 개념명. strengthNotes/weaknessNotes는 교사용 짧은 메모.`;
```

- [ ] **Step 2: convertSolutionToLatex 구현**

같은 파일에 추가(기존 `Type`, `generateJson`, `imagePart` 재사용):
```ts
export async function convertSolutionToLatex(mimeType: string, base64: string): Promise<{ latex: string }> {
  return generateJson<{ latex: string }>(
    [imagePart(mimeType, base64), { text: `${SOLUTION_OCR_RULE}\n위 풀이 이미지를 변환하라.` }],
    { type: Type.OBJECT, properties: { latex: { type: Type.STRING } } },
  );
}
```

- [ ] **Step 3: reviewSolution 구현**

같은 파일에 추가:
```ts
export async function reviewSolution(args: {
  problemLatex: string;
  answer: string | null;
  solution: string | null;
  studentLatex: string;
  workMimeType: string;
  workBase64: string;
}): Promise<{
  commentMarkdown: string;
  isCorrect: boolean;
  errorTags: string[];
  conceptTags: string[];
  strengthNotes: string;
  weaknessNotes: string;
}> {
  const text =
    `${REVIEW_RULE}\n\n` +
    `문제(LaTeX): ${args.problemLatex}\n` +
    `정답: ${args.answer ?? '(없음)'}\n` +
    `해설: ${args.solution ?? '(없음)'}\n` +
    `학생 풀이(LaTeX): ${args.studentLatex}\n` +
    `위 캔버스 이미지는 학생의 원본 손글씨 풀이(수식·그래프·도형 포함)다.`;
  return generateJson(
    [imagePart(args.workMimeType, args.workBase64), { text }],
    {
      type: Type.OBJECT,
      properties: {
        commentMarkdown: { type: Type.STRING },
        isCorrect: { type: Type.BOOLEAN },
        errorTags: { type: Type.ARRAY, items: { type: Type.STRING } },
        conceptTags: { type: Type.ARRAY, items: { type: Type.STRING } },
        strengthNotes: { type: Type.STRING },
        weaknessNotes: { type: Type.STRING },
      },
    },
  );
}
```
> `generateJson`/`imagePart`/`Type`/`client()` 가드는 #1+#2에서 추가된 기존 구현. `Type.BOOLEAN`이 SDK에 없으면 `Type.STRING` 대신 boolean은 `{ type: 'BOOLEAN' }` 리터럴로 — 빌드 에러 시 context7로 `@google/genai`의 `Type` enum 멤버 확인 후 맞출 것.

- [ ] **Step 4: 빌드**

Run: `npm run build -w @mathchois/server`
Expected: 성공.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/services/ai.service.ts
git commit -m "feat(server): ai.service convertSolutionToLatex + reviewSolution"
```

---

## Task 4: coaching.service.ts

**Files:**
- Create: `packages/server/src/services/coaching.service.ts`

- [ ] **Step 1: 구현**

`packages/server/src/services/coaching.service.ts`:
```ts
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../config/database.js';
import { coachingAttempts } from '../db/schema.js';

export type CoachingAttemptInsert = typeof coachingAttempts.$inferInsert;

export async function createAttempt(values: CoachingAttemptInsert) {
  const [row] = await db.insert(coachingAttempts).values(values).returning();
  return row;
}

export async function listAttempts(pageId: string, studentId: string) {
  return db
    .select()
    .from(coachingAttempts)
    .where(and(eq(coachingAttempts.pageId, pageId), eq(coachingAttempts.studentId, studentId)))
    .orderBy(desc(coachingAttempts.createdAt));
}
```

- [ ] **Step 2: 빌드**

Run: `npm run build -w @mathchois/server`
Expected: 성공.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/services/coaching.service.ts
git commit -m "feat(server): coaching.service (create/list attempts)"
```

---

## Task 5: 학생용 문제 조회 (정답 유출 방지)

**Files:**
- Modify: `packages/server/src/services/problem.service.ts`
- Modify: `packages/server/src/routes/problems.ts`

- [ ] **Step 1: service에 표시용 조회 추가**

`packages/server/src/services/problem.service.ts` 끝에 추가:
```ts
/** 학생용: 표시 필드만 (answer/solution/markscheme 제외) */
export async function getProblemForCoaching(id: string) {
  const rows = await db
    .select({
      id: problems.id,
      title: problems.title,
      problemLatex: problems.problemLatex,
      figureNotes: problems.figureNotes,
      figures: problems.figures,
      originalImageUrl: problems.originalImageUrl,
      subject: problems.subject,
      majorUnit: problems.majorUnit,
      minorUnit: problems.minorUnit,
      difficulty: problems.difficulty,
      problemType: problems.problemType,
      detailType: problems.detailType,
      keywords: problems.keywords,
    })
    .from(problems)
    .where(eq(problems.id, id))
    .limit(1);
  return rows[0] ?? null;
}
```

- [ ] **Step 2: route 추가**

`packages/server/src/routes/problems.ts` — `problemRoutes` 안에, `GET /api/problems/:id` 정의 근처에 추가(이 라우트는 **teacher 전용이 아님** — authenticate만):
```ts
  app.get<{ Params: { id: string } }>('/api/problems/:id/for-coaching', {
    preHandler: [authenticate],
  }, async (req, reply) => {
    const row = await svc.getProblemForCoaching(req.params.id);
    if (!row) return reply.status(404).send({ error: '문항을 찾을 수 없습니다' });
    return row;
  });
```
> 기존 problems 라우트는 `teacher` preHandler 객체를 공용으로 쓴다. 이 엔드포인트만 `[authenticate]`로 학생 접근을 허용한다. `/:id/for-coaching`가 `/:id`보다 먼저(또는 Fastify 라우팅상 더 구체적이므로 순서 무관) 등록되게 둘 것.

- [ ] **Step 3: 빌드**

Run: `npm run build -w @mathchois/server`
Expected: 성공.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/services/problem.service.ts packages/server/src/routes/problems.ts
git commit -m "feat(server): student-safe GET /api/problems/:id/for-coaching"
```

---

## Task 6: 페이지 API — aiProblemId 생성 + PATCH

**Files:**
- Modify: `packages/server/src/services/page.service.ts`
- Modify: `packages/server/src/routes/pages.ts`

- [ ] **Step 1: createPage에 aiProblemId 지원 + updatePage 추가**

`packages/server/src/services/page.service.ts` — `createPage`의 `data` 타입과 insert에 `aiProblemId` 추가:
```ts
export async function createPage(data: {
  chapterId: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  htmlUrl?: string | null;
  aiProblemId?: string | null;
  position?: number;
}) {
  let position = data.position;
  if (position === undefined) {
    const maxRows = await db
      .select({ maxPos: sql<number>`COALESCE(MAX(${pages.position}), -1)` })
      .from(pages)
      .where(eq(pages.chapterId, data.chapterId));
    position = (maxRows[0]?.maxPos ?? -1) + 1;
  }

  const [created] = await db
    .insert(pages)
    .values({
      chapterId: data.chapterId,
      imageUrl: data.imageUrl ?? null,
      videoUrl: data.videoUrl ?? null,
      htmlUrl: data.htmlUrl ?? null,
      aiProblemId: data.aiProblemId ?? null,
      position,
    })
    .returning();
  return created;
}
```
같은 파일 끝에 추가:
```ts
/** 페이지 부분 수정 (현재는 aiProblemId 변경용) */
export async function updatePage(id: string, patch: { aiProblemId?: string | null }) {
  const [row] = await db.update(pages).set(patch).where(eq(pages.id, id)).returning();
  return row ?? null;
}
```

- [ ] **Step 2: POST body에 aiProblemId + PATCH 라우트**

`packages/server/src/routes/pages.ts`:
- import에 `updatePage` 추가:
```ts
import {
  getResolvedPagesByChapter,
  getPageById,
  createPage,
  createPages,
  deletePage,
  reorderPages,
  updatePage,
} from '../services/page.service.js';
```
- 단일 삽입 분기를 AI 페이지도 허용하도록 교체(기존 `const { imageUrl, videoUrl, htmlUrl, position } = ...` 블록 전체를 아래로):
```ts
    // 단일 삽입
    const { imageUrl, videoUrl, htmlUrl, aiProblemId, position } = body as {
      imageUrl?: string; videoUrl?: string; htmlUrl?: string; aiProblemId?: string; position?: number;
    };
    if (!imageUrl && !videoUrl && !htmlUrl && !aiProblemId) {
      return reply.status(400).send({ error: 'imageUrl, videoUrl, htmlUrl, or aiProblemId is required' });
    }
    const page = await createPage({ chapterId, imageUrl, videoUrl, htmlUrl, aiProblemId, position });
    return reply.status(201).send(page);
```
- DELETE 라우트 아래에 PATCH 추가:
```ts
  // ─── PATCH /api/pages/:id — 페이지 수정 (AI 문항 연결 변경) ──
  app.patch<{ Params: { id: string }; Body: { aiProblemId?: string | null } }>('/api/pages/:id', {
    preHandler: [authenticate, requireRole('teacher')],
  }, async (request, reply) => {
    const updated = await updatePage(request.params.id, { aiProblemId: request.body.aiProblemId ?? null });
    if (!updated) return reply.status(404).send({ error: 'Page not found' });
    return updated;
  });
```

- [ ] **Step 3: 빌드**

Run: `npm run build -w @mathchois/server`
Expected: 성공.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/services/page.service.ts packages/server/src/routes/pages.ts
git commit -m "feat(server): pages accept aiProblemId + PATCH /api/pages/:id"
```

---

## Task 7: coaching 라우트 + app 등록 + 스토리지 버킷

**Files:**
- Create: `packages/server/src/routes/coaching.ts`
- Modify: `packages/server/src/app.ts`
- Modify: `packages/server/src/routes/storage.ts`

- [ ] **Step 1: 학생 업로드 버킷 허용**

`packages/server/src/routes/storage.ts` — `STUDENT_ALLOWED_BUCKETS` 에 `ai-coaching` 추가:
```ts
const STUDENT_ALLOWED_BUCKETS = new Set(['submission-files', 'ai-coaching']);
```

- [ ] **Step 2: coaching 라우트 작성**

`packages/server/src/routes/coaching.ts`:
```ts
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { readFile, urlToStoragePath } from '../services/storage.service.js';
import { convertSolutionToLatex, reviewSolution, AI_MODEL_NAME } from '../services/ai.service.js';
import { createAttempt, listAttempts } from '../services/coaching.service.js';
import { getPageById } from '../services/page.service.js';
import { getProblem } from '../services/problem.service.js';

function imageMime(filePath: string): string {
  const ext = filePath.toLowerCase().split('.').pop() ?? '';
  return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' } as Record<string, string>)[ext] ?? 'image/png';
}

/** ai-coaching 버킷 이미지만 로드 */
async function loadWorkImage(imageUrl: string) {
  const parsed = urlToStoragePath(imageUrl);
  if (!parsed) throw Object.assign(new Error('잘못된 이미지 URL'), { statusCode: 400 });
  if (parsed.bucket !== 'ai-coaching') throw Object.assign(new Error('허용되지 않은 버킷'), { statusCode: 403 });
  const file = await readFile(parsed.bucket, parsed.path);
  if (!file) throw Object.assign(new Error('이미지를 찾을 수 없습니다'), { statusCode: 404 });
  return { base64: file.data.toString('base64'), mimeType: imageMime(parsed.path) };
}

export async function coachingRoutes(app: FastifyInstance) {
  const auth = { preHandler: [authenticate] };

  app.post<{ Body: { imageUrl: string } }>('/api/coaching/convert', auth, async (req) => {
    const { imageUrl } = z.object({ imageUrl: z.string() }).parse(req.body);
    const { base64, mimeType } = await loadWorkImage(imageUrl);
    return convertSolutionToLatex(mimeType, base64);
  });

  app.post<{ Body: { pageId: string; workImageUrl: string; solutionLatex: string } }>(
    '/api/coaching/review', auth, async (req, reply) => {
    const { pageId, workImageUrl, solutionLatex } = z.object({
      pageId: z.string(), workImageUrl: z.string(), solutionLatex: z.string().min(1),
    }).parse(req.body);

    const page = await getPageById(pageId);
    if (!page?.aiProblemId) return reply.status(400).send({ error: 'AI 코칭 페이지가 아닙니다' });
    const problem = await getProblem(page.aiProblemId);
    if (!problem) return reply.status(404).send({ error: '연결된 문항을 찾을 수 없습니다' });

    const { base64, mimeType } = await loadWorkImage(workImageUrl);
    const analysis = await reviewSolution({
      problemLatex: problem.problemLatex,
      answer: problem.answer,
      solution: problem.solution,
      studentLatex: solutionLatex,
      workMimeType: mimeType,
      workBase64: base64,
    });

    return createAttempt({
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
      aiModel: AI_MODEL_NAME,
    });
  });

  app.get<{ Params: { pageId: string } }>('/api/coaching/pages/:pageId/attempts', auth, async (req) => {
    return listAttempts(req.params.pageId, req.user.sub);
  });
}
```

- [ ] **Step 3: app.ts 등록**

`packages/server/src/app.ts`:
- import: `import { coachingRoutes } from './routes/coaching.js';`
- 등록부: `app.register(coachingRoutes);`

- [ ] **Step 4: 빌드**

Run: `npm run build -w @mathchois/server`
Expected: 성공.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/routes/coaching.ts packages/server/src/app.ts packages/server/src/routes/storage.ts
git commit -m "feat(server): coaching routes (convert/review/attempts) + ai-coaching bucket"
```

---

## Task 8: 클라 API 래퍼

**Files:**
- Create: `packages/client/src/lib/coaching.js`
- Modify: `packages/client/src/lib/problems.js`

- [ ] **Step 1: coaching.js**

`packages/client/src/lib/coaching.js`:
```js
import { api } from './api';

export const convertSolution = (imageUrl) => api.post('/api/coaching/convert', { imageUrl });
export const reviewSolution = (pageId, workImageUrl, solutionLatex) =>
  api.post('/api/coaching/review', { pageId, workImageUrl, solutionLatex });
export const listAttempts = (pageId) => api.get(`/api/coaching/pages/${pageId}/attempts`);

/** Excalidraw 필기 blob을 ai-coaching 버킷에 업로드 → URL */
export async function uploadWorkImage(blob, directory) {
  const fd = new FormData();
  fd.append('file', blob, 'work.png');
  const res = await api.upload(
    `/api/files/upload?bucket=ai-coaching&directory=${encodeURIComponent(directory)}`,
    fd,
  );
  return res.url;
}
```

- [ ] **Step 2: problems.js에 학생용 조회 추가**

`packages/client/src/lib/problems.js` 끝에 추가:
```js
export const getProblemForCoaching = (id) => api.get(`/api/problems/${id}/for-coaching`);
```

- [ ] **Step 3: 빌드**

Run: `npm run build -w @mathchois/client`
Expected: 성공.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/lib/coaching.js packages/client/src/lib/problems.js
git commit -m "feat(client): coaching api wrappers"
```

---

## Task 9: CoachingPanel + ProblemPickerModal

**Files:**
- Create: `packages/client/src/components/common/CoachingPanel.jsx`
- Create: `packages/client/src/components/problems/ProblemPickerModal.jsx`

- [ ] **Step 1: CoachingPanel**

`packages/client/src/components/common/CoachingPanel.jsx`:
```jsx
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

const ERROR_LABELS = {
  conceptual: '개념', computational: '계산', logical: '논리',
  notational: '표기', strategic: '전략', condition: '조건',
};

/** AI 코칭 결과 표시. attempt: coaching_attempts row (또는 review 반환값) */
export default function CoachingPanel({ attempt }) {
  if (!attempt) return null;
  return (
    <div className="rounded-xl border bg-white p-3 shadow-sm">
      <div className="mb-2 flex flex-wrap gap-1.5">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${
          attempt.isCorrect ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
          {attempt.isCorrect ? '정답' : '오답'}
        </span>
        {(attempt.errorTags || []).map((t) => (
          <span key={t} className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700 whitespace-nowrap">
            {ERROR_LABELS[t] || t}
          </span>
        ))}
        {(attempt.conceptTags || []).map((c) => (
          <span key={c} className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 whitespace-nowrap">
            {c}
          </span>
        ))}
      </div>
      <div className="prose prose-sm max-w-none leading-7">
        <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
          {attempt.commentMarkdown || ''}
        </ReactMarkdown>
      </div>
      {attempt.weaknessNotes && (
        <p className="mt-2 text-sm text-gray-500">보완: {attempt.weaknessNotes}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: ProblemPickerModal**

`packages/client/src/components/problems/ProblemPickerModal.jsx`:
```jsx
import { useEffect, useState, useCallback } from 'react';
import ProblemView from '../common/ProblemView';
import { listProblems, getFacets } from '../../lib/problems';

const FILTER_FIELDS = [
  ['subject', '과목'], ['majorUnit', '대단원'], ['difficulty', '난이도'], ['problemType', '유형'],
];

/** 문제은행에서 1개 선택. onSelect(problem) / onClose() */
export default function ProblemPickerModal({ onSelect, onClose }) {
  const [facets, setFacets] = useState({});
  const [filters, setFilters] = useState({});
  const [q, setQ] = useState('');
  const [result, setResult] = useState({ items: [], total: 0, page: 1, pageSize: 20 });
  const [loading, setLoading] = useState(false);

  useEffect(() => { getFacets().then(setFacets).catch(() => {}); }, []);

  const fetchList = useCallback(async (page = 1) => {
    setLoading(true);
    try { setResult(await listProblems({ ...filters, q, page })); }
    finally { setLoading(false); }
  }, [filters, q]);

  useEffect(() => { fetchList(1); }, [fetchList]);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-2" onClick={onClose}>
      <div className="bg-white rounded-lg w-full max-w-3xl max-h-[90dvh] flex flex-col p-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold whitespace-nowrap">문항 선택</h3>
          <button onClick={onClose} className="min-h-11 min-w-11 flex items-center justify-center">✕</button>
        </div>

        <div className="flex flex-wrap gap-2 mb-2">
          {FILTER_FIELDS.map(([key, label]) => (
            <select key={key} className="border rounded px-2 py-1 text-sm"
              value={filters[key] ?? ''}
              onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.value || undefined }))}>
              <option value="">{label} 전체</option>
              {(facets[key] || []).map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          ))}
          <input className="border rounded px-2 py-1 text-sm flex-1 min-w-40" placeholder="키워드 검색"
            value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchList(1)} />
        </div>

        <p className="text-xs text-gray-500 mb-1">{loading ? '불러오는 중…' : `총 ${result.total}개`}</p>
        <div className="flex-1 overflow-y-auto flex flex-col gap-2">
          {result.items.map((p) => (
            <div key={p.id} className="border rounded-md p-2">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-medium whitespace-nowrap truncate">{p.title || '(제목 없음)'}</span>
                <button onClick={() => onSelect(p)}
                  className="px-3 min-h-11 bg-blue-600 text-white rounded text-sm whitespace-nowrap">선택</button>
              </div>
              <p className="text-xs text-gray-500 whitespace-nowrap truncate">
                {[p.subject, p.majorUnit, p.difficulty, p.problemType].filter(Boolean).join(' · ')}
              </p>
              <div className="max-h-24 overflow-hidden mt-1">
                <ProblemView latex={p.problemLatex} figures={p.figures} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 빌드**

Run: `npm run build -w @mathchois/client`
Expected: 성공.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/components/common/CoachingPanel.jsx packages/client/src/components/problems/ProblemPickerModal.jsx
git commit -m "feat(client): CoachingPanel + ProblemPickerModal"
```

---

## Task 10: CoachingViewer (워크스페이스)

**Files:**
- Create: `packages/client/src/pages/Study/CoachingViewer.jsx`

좌 Excalidraw / 우 문제·코칭 패널. 캔버스는 student_notes 자동저장, 헤더에 수식전환·AI검토.

- [ ] **Step 1: 작성**

`packages/client/src/pages/Study/CoachingViewer.jsx`:
```jsx
import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Excalidraw, exportToBlob } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { ArrowLeft, ChevronLeft, ChevronRight, Image as ImageIcon, Loader, Wand2, Sparkles } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../lib/api';
import ProblemView from '../../components/common/ProblemView';
import CoachingPanel from '../../components/common/CoachingPanel';
import { getProblemForCoaching } from '../../lib/problems';
import { convertSolution, reviewSolution, listAttempts, uploadWorkImage } from '../../lib/coaching';

const PANEL_KEY = 'coachingRightPanelWidth';
const MIN_W = 300;

export default function CoachingViewer({ chapterId, pages, currentPage }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const pageId = currentPage.id;

  const excalidrawAPIRef = useRef(null);
  const saveTimerRef = useRef(null);
  const lastSavedRef = useRef(null);

  const [problem, setProblem] = useState(null);
  const [solutionLatex, setSolutionLatex] = useState('');
  const [workImageUrl, setWorkImageUrl] = useState(null);
  const [coaching, setCoaching] = useState(null);   // 최신 attempt
  const [showOriginal, setShowOriginal] = useState(false);
  const [busy, setBusy] = useState('');             // '' | 'convert' | 'review'
  const [error, setError] = useState('');
  const [saveStatus, setSaveStatus] = useState('saved');

  const isWide = typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;
  const [rightWidth, setRightWidth] = useState(() => {
    const saved = Number(localStorage.getItem(PANEL_KEY));
    return saved >= MIN_W ? saved : 400;
  });

  const idx = pages.findIndex((p) => p.id === pageId);
  const prevPage = idx > 0 ? pages[idx - 1] : null;
  const nextPage = idx >= 0 && idx < pages.length - 1 ? pages[idx + 1] : null;
  const go = (p) => p && navigate(`/student/study/${chapterId}/page/${p.id}`);

  /* 문제 + 최신 시도 로드 (정답·해설은 서버에서만 — for-coaching) */
  useEffect(() => {
    let alive = true;
    setProblem(null); setSolutionLatex(''); setWorkImageUrl(null); setCoaching(null); setError('');
    (async () => {
      try {
        const prob = await getProblemForCoaching(currentPage.aiProblemId);
        if (alive) setProblem(prob);
        const attempts = await listAttempts(pageId);
        if (alive && attempts?.length) {
          setCoaching(attempts[0]);
          setSolutionLatex(attempts[0].solutionLatex || '');
        }
      } catch (err) { if (alive) setError(err.message); }
    })();
    return () => { alive = false; };
  }, [pageId, currentPage.aiProblemId]);

  /* 캔버스 자동저장 (student_notes 재사용) */
  const handleChange = useCallback((elements) => {
    const userEls = elements.filter((el) => !el.isDeleted);
    const serialized = JSON.stringify(userEls.map((el) => ({ id: el.id, type: el.type, x: el.x, y: el.y, points: el.points })));
    if (serialized === lastSavedRef.current) return;
    clearTimeout(saveTimerRef.current);
    setSaveStatus('saving');
    saveTimerRef.current = setTimeout(() => {
      const files = excalidrawAPIRef.current?.getFiles?.() ?? {};
      api.put(`/api/notes/student/${pageId}`, { excalidrawData: { elements: userEls, files }, chapterId })
        .then(() => { lastSavedRef.current = serialized; setSaveStatus('saved'); })
        .catch(() => setSaveStatus('saved'));
    }, 1500);
  }, [pageId, chapterId]);

  /* 기존 필기 로드 → 씬에 반영 */
  const handleMount = useCallback(async (api2) => {
    excalidrawAPIRef.current = api2;
    try {
      const note = await api.get(`/api/notes/student/${pageId}`);
      const els = note?.excalidrawData?.elements ?? [];
      const files = note?.excalidrawData?.files ?? {};
      if (files && Object.keys(files).length) api2.addFiles(Object.values(files));
      api2.updateScene({ elements: els });
      lastSavedRef.current = JSON.stringify(els.map((el) => ({ id: el.id, type: el.type, x: el.x, y: el.y, points: el.points })));
    } catch { /* 빈 캔버스 */ }
  }, [pageId]);

  const startResize = useCallback((e) => {
    e.preventDefault();
    const onMove = (ev) => {
      const w = Math.min(window.innerWidth * 0.6, Math.max(MIN_W, window.innerWidth - ev.clientX));
      setRightWidth(w);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      localStorage.setItem(PANEL_KEY, String(rightWidth));
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [rightWidth]);

  async function exportWorkBlob() {
    const excApi = excalidrawAPIRef.current;
    if (!excApi) return null;
    const elements = excApi.getSceneElements().filter((el) => !el.isDeleted);
    if (elements.length === 0) return null;
    return exportToBlob({
      elements,
      appState: { viewBackgroundColor: '#ffffff', exportBackground: true, exportPadding: 8 },
      files: excApi.getFiles(),
      maxWidthOrHeight: 1280,
      mimeType: 'image/png',
    });
  }

  async function handleConvert() {
    setBusy('convert'); setError('');
    try {
      const blob = await exportWorkBlob();
      if (!blob) { setError('먼저 풀이를 작성하세요.'); setBusy(''); return; }
      const url = await uploadWorkImage(blob, `${user.id}/${pageId}`);
      setWorkImageUrl(url);
      const { latex } = await convertSolution(url);
      setSolutionLatex(latex);
    } catch (err) { setError(err.message); }
    setBusy('');
  }

  async function handleReview() {
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
      const attempt = await reviewSolution(pageId, url, solutionLatex);
      setCoaching(attempt);
    } catch (err) { setError(err.message); }
    setBusy('');
  }

  const rightPanel = (
    <div className="flex flex-col gap-4">
      <section>
        <div className="mb-2 flex items-center gap-2">
          {problem?.originalImageUrl && (
            <button onClick={() => setShowOriginal(true)} aria-label="원본 이미지"
              className="min-h-11 min-w-11 flex items-center justify-center border rounded-md">
              <ImageIcon size={18} />
            </button>
          )}
          <h3 className="font-bold whitespace-nowrap">문항</h3>
        </div>
        {problem && (
          <>
            <p className="text-xs text-gray-500 mb-1 whitespace-nowrap truncate">
              {[problem.subject, problem.majorUnit, problem.difficulty, problem.problemType].filter(Boolean).join(' · ')}
            </p>
            <ProblemView latex={problem.problemLatex} figures={problem.figures} />
          </>
        )}
      </section>

      <section>
        <h3 className="mb-2 font-bold whitespace-nowrap">변환된 풀이 (수정 가능)</h3>
        <textarea value={solutionLatex} onChange={(e) => setSolutionLatex(e.target.value)} rows={4}
          className="w-full rounded-lg border p-2 font-mono text-sm" placeholder="[수식전환]을 누르면 채워집니다" />
        {solutionLatex && (
          <div className="mt-2 border rounded-lg p-2"><ProblemView latex={solutionLatex} figures={[]} /></div>
        )}
      </section>

      <section>
        <h3 className="mb-2 font-bold whitespace-nowrap">AI 검토</h3>
        {coaching ? <CoachingPanel attempt={coaching} /> : <p className="text-sm text-gray-400">[AI검토요청]을 누르면 코칭이 표시됩니다.</p>}
      </section>
    </div>
  );

  const header = (
    <header className="flex shrink-0 items-center gap-2 overflow-x-auto border-b bg-white px-2 py-2">
      <button onClick={() => navigate(`/student/classrooms`)} aria-label="나가기"
        className="min-h-11 min-w-11 flex items-center justify-center border rounded-md"><ArrowLeft size={18} /></button>
      <Sparkles size={16} className="text-indigo-500 shrink-0" />
      <h2 className="font-bold whitespace-nowrap">AI 코칭{problem ? ` · ${problem.subject ?? ''} ${problem.difficulty ?? ''}` : ''}</h2>
      <button onClick={() => go(prevPage)} disabled={!prevPage} aria-label="이전"
        className="min-h-11 min-w-11 flex items-center justify-center border rounded-md disabled:opacity-40"><ChevronLeft size={18} /></button>
      <button onClick={() => go(nextPage)} disabled={!nextPage} aria-label="다음"
        className="min-h-11 min-w-11 flex items-center justify-center border rounded-md disabled:opacity-40"><ChevronRight size={18} /></button>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {error && <span className="text-sm text-rose-600 whitespace-nowrap">{error}</span>}
        <span className="text-xs text-gray-400 whitespace-nowrap">{saveStatus === 'saving' ? '저장 중…' : '저장됨'}</span>
        <button onClick={handleConvert} disabled={!!busy}
          className="flex items-center gap-1 px-3 min-h-11 border rounded-md disabled:opacity-50 whitespace-nowrap">
          {busy === 'convert' ? <Loader size={16} className="animate-spin" /> : <Wand2 size={16} />} 수식전환
        </button>
        <button onClick={handleReview} disabled={!!busy}
          className="flex items-center gap-1 px-3 min-h-11 bg-blue-600 text-white rounded-md disabled:opacity-50 whitespace-nowrap">
          {busy === 'review' ? <Loader size={16} className="animate-spin" /> : <Sparkles size={16} />} AI검토요청
        </button>
      </div>
    </header>
  );

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-gray-50" style={{ height: '100dvh' }}>
      {header}
      {isWide ? (
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1 border-r">
            <Excalidraw excalidrawAPI={handleMount} onChange={handleChange} />
          </div>
          <div onPointerDown={startResize} role="separator"
            className="w-1.5 shrink-0 cursor-col-resize bg-gray-200 hover:bg-blue-400" />
          <div className="shrink-0 overflow-y-auto p-3" style={{ width: rightWidth }}>{rightPanel}</div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="h-[55dvh] shrink-0 border-b">
            <Excalidraw excalidrawAPI={handleMount} onChange={handleChange} />
          </div>
          <div className="p-3">{rightPanel}</div>
        </div>
      )}

      {showOriginal && problem?.originalImageUrl && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-2" onClick={() => setShowOriginal(false)}>
          <img src={problem.originalImageUrl} alt="원본 문제" className="max-h-[90dvh] max-w-full rounded" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
```
> 펜입력 고도화 훅(`useExcalidrawTouch` 등)은 #3 MVP 범위에서 제외하고 기본 Excalidraw를 쓴다(S-Pen 게이트는 후속 통합 여지). `onChange`는 `(elements, appState, files)` 시그니처 — 첫 인자만 사용.

- [ ] **Step 2: 빌드**

Run: `npm run build -w @mathchois/client`
Expected: 성공.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/pages/Study/CoachingViewer.jsx
git commit -m "feat(client): CoachingViewer (solve workspace + AI coaching)"
```

---

## Task 11: 라우트 분기 래퍼 + 챕터 에디터 통합

**Files:**
- Create: `packages/client/src/pages/Study/StudyPageRouter.jsx`
- Modify: `packages/client/src/App.jsx`
- Modify: `packages/client/src/pages/Chapters/Editor.jsx`

- [ ] **Step 1: 분기 래퍼**

`packages/client/src/pages/Study/StudyPageRouter.jsx`:
```jsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import StudyViewer from './StudyViewer';
import CoachingViewer from './CoachingViewer';
import { getCachedChapterAndPages } from '../../lib/dataCache';

/** 페이지 타입에 따라 일반 StudyViewer ↔ AI CoachingViewer 분기 */
export default function StudyPageRouter() {
  const { chapterId, pageId } = useParams();
  const [state, setState] = useState({ loading: true, pages: [], page: null });

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    getCachedChapterAndPages(chapterId)
      .then(({ pages }) => {
        if (!alive) return;
        const page = (pages || []).find((p) => p.id === pageId) || null;
        setState({ loading: false, pages: pages || [], page });
      })
      .catch(() => { if (alive) setState({ loading: false, pages: [], page: null }); });
    return () => { alive = false; };
  }, [chapterId, pageId]);

  if (state.loading) {
    return <div className="flex items-center justify-center" style={{ height: '100dvh' }}><p className="text-gray-500">로딩 중...</p></div>;
  }
  if (state.page?.aiProblemId) {
    return <CoachingViewer chapterId={chapterId} pages={state.pages} currentPage={state.page} />;
  }
  return <StudyViewer />;
}
```
> `getCachedChapterAndPages`는 StudyViewer가 쓰는 캐시 함수(`lib/dataCache.js`). 동일 인자 호출은 캐시 히트라 StudyViewer가 다시 불러도 비용 없음. 경로는 StudyViewer의 import를 확인해 맞출 것(`lib/dataCache`).

- [ ] **Step 2: App.jsx 라우트 element 교체**

`packages/client/src/App.jsx`:
- lazy import 추가:
```jsx
const StudyPageRouter = lazy(() => import('./pages/Study/StudyPageRouter'));
```
- 학생 study 라우트의 element를 `<StudyViewer />` → `<StudyPageRouter />` 로 교체:
```jsx
            <Route path="/student/study/:chapterId/page/:pageId" element={<StudyPageRouter />} />
```
(기존 `StudyViewer` lazy import는 그대로 둔다 — StudyPageRouter가 사용.)

- [ ] **Step 3: 챕터 에디터에 [AI 코칭] 추가**

`packages/client/src/pages/Chapters/Editor.jsx`:
- import 추가:
```jsx
import { Sparkles } from 'lucide-react';
import ProblemPickerModal from '../../components/problems/ProblemPickerModal';
import ProblemView from '../../components/common/ProblemView';
import { getProblemForCoaching } from '../../lib/problems';
```
- 상태 추가(컴포넌트 본문 상단, 다른 useState 옆):
```jsx
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState('add'); // 'add' | 'change'
  const [aiPreview, setAiPreview] = useState(null);     // 선택된 페이지의 문제 미리보기
```
- 페이지 추가 버튼군(이미지/유튜브/HTML 버튼들 옆)에 버튼 추가:
```jsx
        <button type="button" onClick={() => { setPickerMode('add'); setShowPicker(true); }}
          title="AI 코칭 문항 추가"
          className="flex items-center gap-1 px-3 min-h-11 border rounded-md whitespace-nowrap">
          <Sparkles size={16} /> AI 코칭
        </button>
```
- 핸들러 추가(다른 handleUpload 옆):
```jsx
  const handlePickProblem = async (problem) => {
    setShowPicker(false);
    try {
      if (pickerMode === 'change' && selectedPage) {
        await api.patch(`/api/pages/${selectedPage.id}`, { aiProblemId: problem.id });
      } else {
        await api.post(`/api/chapters/${chapterId}/pages`, { aiProblemId: problem.id });
      }
      await refetchPages(); // 이 에디터의 페이지 재조회 함수명에 맞춰 호출
    } catch (err) {
      alert(err.message ?? '문항 연결에 실패했습니다.');
    }
  };
```
> `chapterId`, `selectedPage`, 페이지 재조회 함수명은 Editor.jsx의 기존 식별자에 맞춘다(파일을 열어 확인 후 정확히 연결). 페이지 목록 새로고침은 기존 업로드 성공 후 호출하는 함수와 동일하게.
- 메인 미리보기 영역에서 `selectedPage?.aiProblemId`인 경우 분기 렌더 추가(이미지/비디오/HTML 미리보기 분기 옆):
```jsx
        {selectedPage?.aiProblemId ? (
          <div className="flex flex-col gap-2 p-3">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-indigo-500" />
              <span className="font-medium whitespace-nowrap">AI 코칭 문항</span>
              <button onClick={() => { setPickerMode('change'); setShowPicker(true); }}
                className="px-3 min-h-11 border rounded-md text-sm whitespace-nowrap">문제 변경</button>
            </div>
            {aiPreview && <ProblemView latex={aiPreview.problemLatex} figures={aiPreview.figures} />}
          </div>
        ) : null}
```
- `selectedPage` 변경 시 미리보기 로드(useEffect 추가):
```jsx
  useEffect(() => {
    if (selectedPage?.aiProblemId) {
      getProblemForCoaching(selectedPage.aiProblemId).then(setAiPreview).catch(() => setAiPreview(null));
    } else {
      setAiPreview(null);
    }
  }, [selectedPage?.id, selectedPage?.aiProblemId]);
```
- JSX 말미에 모달 렌더:
```jsx
      {showPicker && (
        <ProblemPickerModal onSelect={handlePickProblem} onClose={() => setShowPicker(false)} />
      )}
```

- [ ] **Step 4: 빌드 + 린트(신규/수정 파일)**

Run: `npm run build -w @mathchois/client`
Expected: 성공. (Editor.jsx의 기존 식별자에 맞춰 핸들러/재조회를 연결했는지 확인.)

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/pages/Study/StudyPageRouter.jsx packages/client/src/App.jsx packages/client/src/pages/Chapters/Editor.jsx
git commit -m "feat(client): route branch to CoachingViewer + editor AI-problem picker"
```

---

## Task 12: 통합 검증 · 반응형 · 맵

**Files:** 없음(검증)

- [ ] **Step 1: 전체 빌드**

Run: `npm run build`
Expected: shared→client→server 모두 성공.

- [ ] **Step 2: 클라 테스트**

Run: `npm run test -w @mathchois/client`
Expected: 기존 31 테스트 통과.

- [ ] **Step 3: 라이브 e2e 스모크 (DB + GEMINI_API_KEY 설정 시)**

`npm run dev` 후:
1. 교사: 챕터 편집 → [AI 코칭] → 문항 선택 → AI 페이지 생성 확인. [문제 변경] 동작 확인.
2. 학생: 해당 페이지 진입 → CoachingViewer(좌 캔버스/우 패널) 렌더 확인. 우측에 문제 LaTeX, 원본이미지 아이콘→모달.
3. 캔버스에 풀이 → [수식전환] → 변환 LaTeX 표시 → [AI검토요청] → 코칭 표시(정답/오답 배지+코멘트).
4. 재진입 시 최신 코칭이 패널에 표시되는지, 캔버스 필기가 유지되는지 확인.
5. **정답 유출 점검:** 브라우저 네트워크 탭에서 `/api/problems/:id/for-coaching` 및 페이지 응답에 answer/solution 필드가 **없음**을 확인.

- [ ] **Step 4: 반응형 리뷰**

`responsive-ui-reviewer` 에이전트로 `CoachingViewer.jsx`, `CoachingPanel.jsx`, `ProblemPickerModal.jsx`, Editor 변경분 점검(좌우 분할/모바일 스택 dvh, sticky·줄바꿈·터치타깃). 지적 수정.

- [ ] **Step 5: PROJECT_MAP 갱신**

`project-map-updater`로 `pages.aiProblemId`·`coaching_attempts`·coaching 라우트·CoachingViewer·StudyPageRouter 반영.

- [ ] **Step 6: 최종 Commit**

```bash
git add -A
git commit -m "chore: AI coaching page verification + responsive/map review"
```

---

## Self-Review 결과

**Spec 커버리지:**
- §3.1 pages.aiProblemId → Task 1,2,6 ✅
- §3.2 coaching_attempts → Task 1,2,4 ✅
- §4 AI 서비스(convertSolutionToLatex/reviewSolution) → Task 3 ✅
- §5.1 coaching 라우트(convert/review/attempts) → Task 7,8 ✅
- §5.2 for-coaching(정답 유출 방지) → Task 5,8 ✅
- §5.3 페이지 API(aiProblemId/PATCH) → Task 6 ✅
- §5.4 ai-coaching 버킷 → Task 7 ✅
- §6 교사 편집(picker/변경) → Task 9,11 ✅
- §7 CoachingViewer(레이아웃/3섹션/흐름) → Task 10 ✅, 분기 래퍼 → Task 11 ✅
- CoachingPanel → Task 9 ✅

**타입 일관성:** `CoachingResult`/`CoachingAttempt`/`CoachingProblemView`(shared) ↔ `reviewSolution` 반환 ↔ `coaching_attempts` 컬럼 ↔ `CoachingPanel`/`CoachingViewer` 사용 일치. `errorTags` 6값 enum 일관.

**미해결 가정(구현 시 확인):**
1. `Editor.jsx`의 실제 식별자(`chapterId`/`selectedPage`/페이지 재조회 함수) — 파일 열어 맞출 것(Task 11 Step 3).
2. `lib/dataCache`의 `getCachedChapterAndPages` export 경로 — StudyViewer import로 확인(Task 11 Step 1).
3. `@google/genai`의 `Type.BOOLEAN` 존재 여부 — 없으면 리터럴 `'BOOLEAN'`(Task 3).
4. Excalidraw `onChange`/`excalidrawAPI` prop 시그니처(0.18) — #기존 StudyViewer 사용법과 일치(Task 10).
5. 학생 노트 PUT 응답·`excalidrawData` 구조 — 기존 StudyViewer와 동일 형식 사용(Task 10).
```
