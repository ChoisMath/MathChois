# 문제은행 & AI OCR 문항등록 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 교사가 수학 문제 이미지를 업로드하면 Gemini가 OCR(수식 LaTeX·그림영역·분류 메타)을 추출하고, 정답·해설을 채워 전체 공유 문제은행에 등록하고 표로 검색하는 기능을 ChoisClass에 추가한다.

**Architecture:** 서버는 `ai.service.ts`(Gemini 래퍼) + `problem.service.ts`(Drizzle DB) + `routes/problems.ts`(Fastify). 클라이언트는 `/teacher/problems`(DashboardLayout) 안에 등록/목록 탭, KaTeX 렌더 컴포넌트 `ProblemView`. 이미지는 기존 업로드 라우트 + `problem-bank` 버킷 재사용. 중간 OCR/생성은 stateless, 최종 1회 저장.

**Tech Stack:** Fastify 5 · Drizzle ORM · PostgreSQL · `@google/genai` · React 19 · React Router 7 · Tailwind 4 · katex/react-markdown/remark-math/rehype-katex · Vitest(클라).

**참조 spec:** `docs/superpowers/specs/2026-06-02-problem-bank-and-ocr-registration-design.md`

---

## 검증 전략 (중요)

- **서버: 단위 테스트 러너 없음.** 각 서버 태스크는 `npm run build -w @mathchois/server`(tsc 타입체크)를 1차 게이트로 쓰고, 필요한 경우 dev 서버 스모크(아래 명령)로 확인한다.
- **클라이언트: Vitest 있음.** 순수 로직(`lib/problemContent.js`)은 TDD(`*.test.js`)로 작성한다.
- AI 호출(OCR/생성)은 실 Gemini 키가 필요하므로 라이브 스모크는 `packages/server/.env`에 `GEMINI_API_KEY` 설정 후 수동 1회. 키 없이도 타입체크/빌드는 통과해야 한다.
- **구현 중 `@google/genai` SDK의 현행 호출 형태(`responseSchema`/`Type`)는 context7로 최신 문서를 반드시 확인**한다(버전에 따라 형태가 다름).

---

## File Structure

**서버 (`packages/server/src/`)**
- `config/env.ts` — `GEMINI_API_KEY`, `GEMINI_MODEL` 추가 (수정)
- `db/schema.ts` — `problems` 테이블 추가 (수정)
- `db/startupMigrate.ts` — `problems` 멱등 DDL 추가 (수정)
- `services/ai.service.ts` — Gemini 래퍼 + 프롬프트 (신규)
- `services/problem.service.ts` — 문제은행 DB 로직 (신규)
- `routes/problems.ts` — API 라우트 (신규)
- `app.ts` — 라우트 등록 (수정)

**공유 (`packages/shared/src/`)**
- `types/problem.ts` — Problem 타입 (신규)
- `index.ts` — export 추가 (수정)

**클라이언트 (`packages/client/src/`)**
- `lib/problemContent.js` + `lib/problemContent.test.js` — 그림 플레이스홀더 파싱 (신규, TDD)
- `lib/problems.js` — problem API 래퍼 (신규)
- `components/common/ProblemView.jsx` — Markdown+KaTeX+그림 렌더 (신규)
- `pages/Problems/ProblemRegister.jsx` — 등록 탭 (신규)
- `pages/Problems/RegisteredProblems.jsx` — 목록 탭 (신규)
- `pages/Problems/ProblemsPage.jsx` — 탭 컨테이너 (신규)
- `App.jsx` — 라우트 (수정)
- `layouts/DashboardLayout.jsx` — 교사 사이드바 메뉴 (수정)
- `index.html` 또는 진입점 — katex CSS import (수정)

---

## Task 0: 의존성 · env 스캐폴딩

**Files:**
- Modify: `packages/server/package.json` (deps)
- Modify: `packages/client/package.json` (deps)
- Modify: `packages/server/src/config/env.ts`

- [ ] **Step 1: 서버 의존성 설치**

Run (레포 루트):
```bash
npm install @google/genai -w @mathchois/server
```

- [ ] **Step 2: 클라이언트 의존성 설치**

Run:
```bash
npm install katex react-markdown remark-math rehype-katex -w @mathchois/client
```

- [ ] **Step 3: env 스키마에 Gemini 변수 추가**

`packages/server/src/config/env.ts` — `envSchema` 객체에 두 줄 추가 (VOLUME_PATH 아래):
```ts
  VOLUME_PATH: z.string().default('./local-storage'),
  GEMINI_API_KEY: z.string().optional(),  // 없으면 AI 기능만 비활성, 서버는 기동
  GEMINI_MODEL: z.string().default('gemini-2.0-flash'),
  PORT: z.coerce.number().default(3001),
```
> `GEMINI_API_KEY`를 optional로 두어 키 없이도 빌드·기동되게 한다. 호출 시점에 없으면 명확한 에러를 던진다(Task 3).

- [ ] **Step 4: 빌드 타입체크**

Run:
```bash
npm run build -w @mathchois/shared && npm run build -w @mathchois/server
```
Expected: 타입 에러 없이 성공.

- [ ] **Step 5: Commit**

```bash
git add packages/server/package.json packages/client/package.json packages/server/src/config/env.ts package-lock.json
git commit -m "chore: add gemini + katex deps and GEMINI_* env"
```

---

## Task 1: 공유 타입 `Problem`

**Files:**
- Create: `packages/shared/src/types/problem.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: 타입 파일 작성**

`packages/shared/src/types/problem.ts`:
```ts
export type SolutionSource =
  | 'teacher-markscheme'
  | 'ai'
  | 'ai-regenerated'
  | 'teacher-verified';

export interface ProblemFigure {
  idx: number;       // 본문 [FIGURE:idx] 와 1:1
  alt: string;       // 그림 설명 (figureNotes)
  imageUrl: string;  // 삽입된 이미지 URL (/api/files/...)
}

export interface Problem {
  id: string;
  title: string | null;
  problemLatex: string;
  figureNotes: string[];
  originalImageUrl: string | null;
  figures: ProblemFigure[];
  subject: string | null;
  majorUnit: string | null;
  minorUnit: string | null;
  difficulty: string | null;    // 상/중/하
  problemType: string | null;
  detailType: string | null;
  keywords: string[];
  answer: string | null;
  solution: string | null;
  solutionSource: SolutionSource | null;
  markschemeImageUrl: string | null;
  aiModel: string | null;
  status: 'draft' | 'ready';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** AI OCR 추출 결과 (저장 전 폼 상태) */
export interface OcrProblemResult {
  latex: string;
  figureNotes: string[];
  meta: {
    subject: string;
    majorUnit: string;
    minorUnit: string;
    difficulty: string;
    problemType: string;
    detailType: string;
    keywords: string[];
  };
}

export interface SolutionResult {
  answer: string;
  solution: string;
}

/** 목록 검색 응답 */
export interface ProblemListResult {
  items: Problem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ProblemFacets {
  subject: string[];
  majorUnit: string[];
  minorUnit: string[];
  difficulty: string[];
  problemType: string[];
}
```

- [ ] **Step 2: 배럴에 export 추가**

`packages/shared/src/index.ts` 마지막 줄에 추가:
```ts
export * from './types/problem.js';
```

- [ ] **Step 3: 타입체크**

Run:
```bash
npm run typecheck -w @mathchois/shared
```
Expected: 성공.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types/problem.ts packages/shared/src/index.ts
git commit -m "feat(shared): add Problem domain types"
```

---

## Task 2: DB 스키마 — `problems` 테이블

**Files:**
- Modify: `packages/server/src/db/schema.ts`
- Modify: `packages/server/src/db/startupMigrate.ts`

- [ ] **Step 1: 스키마에 테이블 추가**

`packages/server/src/db/schema.ts` 맨 아래에 추가 (`ProblemFigure` 타입은 shared에서 import):
```ts
import type { ProblemFigure } from '@mathchois/shared';

// ─── problems (문제은행) ─────────────────────────────

export const problems = pgTable('problems', {
  id: uuid('id').defaultRandom().primaryKey(),

  title: text('title'),
  problemLatex: text('problem_latex').notNull(),
  figureNotes: jsonb('figure_notes').$type<string[]>().default([]).notNull(),
  originalImageUrl: text('original_image_url'),
  figures: jsonb('figures').$type<ProblemFigure[]>().default([]).notNull(),

  subject: text('subject'),
  majorUnit: text('major_unit'),
  minorUnit: text('minor_unit'),
  difficulty: text('difficulty'),
  problemType: text('problem_type'),
  detailType: text('detail_type'),
  keywords: jsonb('keywords').$type<string[]>().default([]).notNull(),

  answer: text('answer'),
  solution: text('solution'),
  solutionSource: text('solution_source'),
  markschemeImageUrl: text('markscheme_image_url'),

  aiModel: text('ai_model'),
  status: text('status').default('ready').notNull(),
  createdBy: uuid('created_by').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('idx_problems_created_at').on(t.createdAt),
  index('idx_problems_subject').on(t.subject),
  index('idx_problems_major_unit').on(t.majorUnit),
  index('idx_problems_difficulty').on(t.difficulty),
  index('idx_problems_created_by').on(t.createdBy),
]);
```
> `index`는 schema.ts 상단 import에 이미 포함되어 있다(기존 테이블에서 사용 중).

- [ ] **Step 2: startup 멱등 DDL 추가**

`packages/server/src/db/startupMigrate.ts` — `runStartupMigrations` 함수 본문 끝에 추가:
```ts
  await pgClient`
    CREATE TABLE IF NOT EXISTS problems (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title text,
      problem_latex text NOT NULL,
      figure_notes jsonb NOT NULL DEFAULT '[]'::jsonb,
      original_image_url text,
      figures jsonb NOT NULL DEFAULT '[]'::jsonb,
      subject text, major_unit text, minor_unit text,
      difficulty text, problem_type text, detail_type text,
      keywords jsonb NOT NULL DEFAULT '[]'::jsonb,
      answer text, solution text, solution_source text, markscheme_image_url text,
      ai_model text,
      status text NOT NULL DEFAULT 'ready',
      created_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;
  await pgClient`CREATE INDEX IF NOT EXISTS idx_problems_created_at ON problems (created_at)`;
  await pgClient`CREATE INDEX IF NOT EXISTS idx_problems_subject ON problems (subject)`;
  await pgClient`CREATE INDEX IF NOT EXISTS idx_problems_major_unit ON problems (major_unit)`;
  await pgClient`CREATE INDEX IF NOT EXISTS idx_problems_difficulty ON problems (difficulty)`;
  await pgClient`CREATE INDEX IF NOT EXISTS idx_problems_created_by ON problems (created_by)`;
  log.info('startup migration: problems table ensured');
```

- [ ] **Step 3: 타입체크**

Run:
```bash
npm run build -w @mathchois/server
```
Expected: 성공.

- [ ] **Step 4: (선택, DB 있을 때) 마이그레이션 생성**

Run (DATABASE_URL 설정 시):
```bash
npm run db:generate -w @mathchois/server
```
Expected: `packages/server/drizzle/`에 `problems` 생성 SQL 포함된 마이그레이션 파일. (DB 없으면 startupMigrate가 기동 시 보강하므로 생략 가능.)

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/db/schema.ts packages/server/src/db/startupMigrate.ts packages/server/drizzle/
git commit -m "feat(server): add problems table + startup DDL"
```

---

## Task 3: AI 서비스 (`ai.service.ts`)

**Files:**
- Create: `packages/server/src/services/ai.service.ts`

> 구현 전 context7로 `@google/genai`의 `generateContent` / `responseSchema` / `Type` 현행 시그니처 확인.

- [ ] **Step 1: 서비스 골격 + 클라이언트 + 가드 작성**

`packages/server/src/services/ai.service.ts`:
```ts
import { GoogleGenAI, Type } from '@google/genai';
import { env } from '../config/env.js';
import type { OcrProblemResult, SolutionResult } from '@mathchois/shared';

let _client: GoogleGenAI | null = null;
function client(): GoogleGenAI {
  if (!env.GEMINI_API_KEY) {
    throw Object.assign(new Error('AI 기능이 설정되지 않았습니다. (GEMINI_API_KEY 누락)'), { statusCode: 503 });
  }
  if (!_client) _client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  return _client;
}

/** JSON 응답 1회 재시도 파서 */
async function generateJson<T>(parts: object[], responseSchema: object): Promise<T> {
  const ai = client();
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await ai.models.generateContent({
      model: env.GEMINI_MODEL,
      contents: [{ role: 'user', parts }],
      config: { responseMimeType: 'application/json', responseSchema },
    });
    const text = res.text ?? '';
    try {
      return JSON.parse(text) as T;
    } catch {
      if (attempt === 1) throw new Error('AI 응답 파싱 실패');
    }
  }
  throw new Error('unreachable');
}

function imagePart(mimeType: string, base64: string) {
  return { inlineData: { mimeType, data: base64 } };
}
```

- [ ] **Step 2: 프롬프트 상수 추가 (MathCoach 이식 + 그림 번호 업그레이드)**

같은 파일에 추가:
```ts
const PROBLEM_RULE = `다음 규칙으로 수학 문제 이미지를 변환하라.
- 본문을 Markdown + LaTeX 로 변환한다. 인라인 수식은 $...$, 디스플레이 수식은 $$...$$.
- 한국어가 아닌 텍스트는 한국어로 번역하되 수학 표기는 유지한다.
- 강조는 **굵게** 로 표기한다(\\textbf 금지).
- 그래프·도형·표 등 그림 요소는 본문 안에 [FIGURE:1], [FIGURE:2] 처럼 1부터 순번을 매겨 표기하고,
  같은 순서로 figureNotes 배열에 각 그림의 한국어 설명을 넣는다.
  본문의 [FIGURE:n] 개수와 figureNotes 길이는 반드시 일치해야 한다.
- meta 에 과목(subject)·대단원(majorUnit)·소단원(minorUnit)·난이도(difficulty: 상/중/하)
  ·유형(problemType)·세부유형(detailType)·키워드(keywords[]) 를 추출한다.`;

const MARKSCHEME_RULE = `다음 규칙으로 교사가 제공한 정답/풀이(마크스킴) 이미지를 변환하라.
- answer: 간결한 최종 정답.
- solution: 단계별 풀이를 Markdown + LaTeX 로. 인라인 $...$, 디스플레이 $$...$$.
- 한국어가 아닌 텍스트는 한국어로 번역한다.`;

const SOLUTION_RULE = `너는 고등 수학 교사다. 아래 문제(Markdown+LaTeX)의 정답과 단계별 해설을 작성하라.
- answer: 간결한 최종 정답.
- solution: 학생이 이해할 단계별 풀이를 Markdown + LaTeX 로. 인라인 $...$, 디스플레이 $$...$$.`;
```

- [ ] **Step 3: 3개 함수 구현**

같은 파일에 추가:
```ts
const META_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    subject: { type: Type.STRING }, majorUnit: { type: Type.STRING },
    minorUnit: { type: Type.STRING }, difficulty: { type: Type.STRING },
    problemType: { type: Type.STRING }, detailType: { type: Type.STRING },
    keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
};

export async function ocrProblem(mimeType: string, base64: string): Promise<OcrProblemResult> {
  return generateJson<OcrProblemResult>(
    [imagePart(mimeType, base64), { text: `${PROBLEM_RULE}\n위 문제 이미지를 변환하라.` }],
    {
      type: Type.OBJECT,
      properties: {
        latex: { type: Type.STRING },
        figureNotes: { type: Type.ARRAY, items: { type: Type.STRING } },
        meta: META_SCHEMA,
      },
    },
  );
}

export async function ocrMarkscheme(mimeType: string, base64: string): Promise<SolutionResult> {
  return generateJson<SolutionResult>(
    [imagePart(mimeType, base64), { text: `${MARKSCHEME_RULE}\n위 이미지를 변환하라.` }],
    { type: Type.OBJECT, properties: { answer: { type: Type.STRING }, solution: { type: Type.STRING } } },
  );
}

export async function generateSolution(problemLatex: string): Promise<SolutionResult> {
  return generateJson<SolutionResult>(
    [{ text: `${SOLUTION_RULE}\n\n문제:\n${problemLatex}` }],
    { type: Type.OBJECT, properties: { answer: { type: Type.STRING }, solution: { type: Type.STRING } } },
  );
}

export const AI_MODEL_NAME = env.GEMINI_MODEL;
```

- [ ] **Step 4: 타입체크**

Run:
```bash
npm run build -w @mathchois/server
```
Expected: 성공. (실패 시 context7로 `@google/genai` API 형태 재확인 후 수정.)

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/services/ai.service.ts
git commit -m "feat(server): gemini ai.service (ocr/markscheme/solution)"
```

---

## Task 4: 문제은행 DB 서비스 (`problem.service.ts`)

**Files:**
- Create: `packages/server/src/services/problem.service.ts`

- [ ] **Step 1: CRUD + 검색 + facets 구현**

`packages/server/src/services/problem.service.ts`:
```ts
import { eq, and, or, ilike, desc, sql, type SQL } from 'drizzle-orm';
import { db } from '../config/database.js';
import { problems } from '../db/schema.js';

export type ProblemInsert = typeof problems.$inferInsert;

export interface ProblemFilters {
  subject?: string; majorUnit?: string; minorUnit?: string;
  difficulty?: string; problemType?: string; q?: string;
  page?: number; pageSize?: number;
}

export async function createProblem(values: ProblemInsert) {
  const [row] = await db.insert(problems).values(values).returning();
  return row;
}

export async function getProblem(id: string) {
  const rows = await db.select().from(problems).where(eq(problems.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function updateProblem(id: string, patch: Partial<ProblemInsert>) {
  const [row] = await db.update(problems)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(problems.id, id)).returning();
  return row ?? null;
}

export async function deleteProblem(id: string) {
  const [row] = await db.delete(problems).where(eq(problems.id, id)).returning();
  return row ?? null;
}

function buildWhere(f: ProblemFilters): SQL | undefined {
  const conds: SQL[] = [];
  if (f.subject)     conds.push(eq(problems.subject, f.subject));
  if (f.majorUnit)   conds.push(eq(problems.majorUnit, f.majorUnit));
  if (f.minorUnit)   conds.push(eq(problems.minorUnit, f.minorUnit));
  if (f.difficulty)  conds.push(eq(problems.difficulty, f.difficulty));
  if (f.problemType) conds.push(eq(problems.problemType, f.problemType));
  if (f.q) {
    const kw = `%${f.q}%`;
    const search = or(
      ilike(problems.title, kw),
      ilike(problems.problemLatex, kw),
      ilike(problems.majorUnit, kw),
      ilike(problems.minorUnit, kw),
      sql`${problems.keywords}::text ilike ${kw}`,
    );
    if (search) conds.push(search);
  }
  return conds.length ? and(...conds) : undefined;
}

export async function listProblems(f: ProblemFilters) {
  const page = Math.max(1, f.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, f.pageSize ?? 20));
  const where = buildWhere(f);

  const items = await db.select().from(problems)
    .where(where)
    .orderBy(desc(problems.createdAt))
    .limit(pageSize).offset((page - 1) * pageSize);

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
    .from(problems).where(where);

  return { items, total: count, page, pageSize };
}

export async function getFacets() {
  const distinct = async (col: typeof problems.subject) => {
    const rows = await db.selectDistinct({ v: col }).from(problems);
    return rows.map((r) => r.v).filter((v): v is string => !!v).sort();
  };
  return {
    subject: await distinct(problems.subject),
    majorUnit: await distinct(problems.majorUnit),
    minorUnit: await distinct(problems.minorUnit),
    difficulty: await distinct(problems.difficulty),
    problemType: await distinct(problems.problemType),
  };
}
```

- [ ] **Step 2: 타입체크**

Run:
```bash
npm run build -w @mathchois/server
```
Expected: 성공.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/services/problem.service.ts
git commit -m "feat(server): problem.service (crud/search/facets)"
```

---

## Task 5: API 라우트 (`routes/problems.ts`)

**Files:**
- Create: `packages/server/src/routes/problems.ts`
- Modify: `packages/server/src/app.ts`

- [ ] **Step 1: 라우트 작성**

`packages/server/src/routes/problems.ts`:
```ts
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleGuard.js';
import { readFile, urlToStoragePath } from '../services/storage.service.js';
import { ocrProblem, ocrMarkscheme, generateSolution, AI_MODEL_NAME } from '../services/ai.service.js';
import * as svc from '../services/problem.service.js';

function imageMime(filePath: string): string {
  const ext = filePath.toLowerCase().split('.').pop() ?? '';
  return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' } as Record<string, string>)[ext] ?? 'image/png';
}

/** /api/files/... URL → base64 + mime */
async function loadImage(imageUrl: string) {
  const parsed = urlToStoragePath(imageUrl);
  if (!parsed) throw Object.assign(new Error('잘못된 이미지 URL'), { statusCode: 400 });
  const file = await readFile(parsed.bucket, parsed.path);
  if (!file) throw Object.assign(new Error('이미지를 찾을 수 없습니다'), { statusCode: 404 });
  return { base64: file.data.toString('base64'), mimeType: imageMime(parsed.path) };
}

const problemBody = z.object({
  title: z.string().nullable().optional(),
  problemLatex: z.string().min(1),
  figureNotes: z.array(z.string()).default([]),
  originalImageUrl: z.string().nullable().optional(),
  figures: z.array(z.object({ idx: z.number(), alt: z.string(), imageUrl: z.string() })).default([]),
  subject: z.string().nullable().optional(),
  majorUnit: z.string().nullable().optional(),
  minorUnit: z.string().nullable().optional(),
  difficulty: z.string().nullable().optional(),
  problemType: z.string().nullable().optional(),
  detailType: z.string().nullable().optional(),
  keywords: z.array(z.string()).default([]),
  answer: z.string().nullable().optional(),
  solution: z.string().nullable().optional(),
  solutionSource: z.enum(['teacher-markscheme', 'ai', 'ai-regenerated', 'teacher-verified']).nullable().optional(),
  markschemeImageUrl: z.string().nullable().optional(),
});

export async function problemRoutes(app: FastifyInstance) {
  const teacher = { preHandler: [authenticate, requireRole('teacher')] };

  // ── AI: OCR (stateless) ──
  app.post<{ Body: { imageUrl: string } }>('/api/problems/ocr', teacher, async (req, reply) => {
    const { imageUrl } = z.object({ imageUrl: z.string() }).parse(req.body);
    const { base64, mimeType } = await loadImage(imageUrl);
    return ocrProblem(mimeType, base64);
  });

  app.post<{ Body: { imageUrl: string } }>('/api/problems/markscheme-ocr', teacher, async (req) => {
    const { imageUrl } = z.object({ imageUrl: z.string() }).parse(req.body);
    const { base64, mimeType } = await loadImage(imageUrl);
    return ocrMarkscheme(mimeType, base64);
  });

  app.post<{ Body: { problemLatex: string } }>('/api/problems/generate-solution', teacher, async (req) => {
    const { problemLatex } = z.object({ problemLatex: z.string().min(1) }).parse(req.body);
    return generateSolution(problemLatex);
  });

  // ── 목록 / facets ──
  app.get('/api/problems', teacher, async (req) => {
    const q = req.query as Record<string, string>;
    return svc.listProblems({
      subject: q.subject, majorUnit: q.majorUnit, minorUnit: q.minorUnit,
      difficulty: q.difficulty, problemType: q.problemType, q: q.q,
      page: q.page ? parseInt(q.page, 10) : undefined,
      pageSize: q.pageSize ? parseInt(q.pageSize, 10) : undefined,
    });
  });

  app.get('/api/problems/facets', teacher, async () => svc.getFacets());

  app.get<{ Params: { id: string } }>('/api/problems/:id', teacher, async (req, reply) => {
    const row = await svc.getProblem(req.params.id);
    if (!row) return reply.status(404).send({ error: '문항을 찾을 수 없습니다' });
    return row;
  });

  // ── 생성 ──
  app.post('/api/problems', teacher, async (req) => {
    const body = problemBody.parse(req.body);
    return svc.createProblem({ ...body, aiModel: AI_MODEL_NAME, createdBy: req.user.sub });
  });

  // ── 수정 / 삭제 (작성자 or admin) ──
  app.patch<{ Params: { id: string } }>('/api/problems/:id', teacher, async (req, reply) => {
    const existing = await svc.getProblem(req.params.id);
    if (!existing) return reply.status(404).send({ error: '문항을 찾을 수 없습니다' });
    if (existing.createdBy !== req.user.sub && !req.user.isAdmin) {
      return reply.status(403).send({ error: '수정 권한이 없습니다' });
    }
    const body = problemBody.partial().parse(req.body);
    return svc.updateProblem(req.params.id, body);
  });

  app.delete<{ Params: { id: string } }>('/api/problems/:id', teacher, async (req, reply) => {
    const existing = await svc.getProblem(req.params.id);
    if (!existing) return reply.status(404).send({ error: '문항을 찾을 수 없습니다' });
    if (existing.createdBy !== req.user.sub && !req.user.isAdmin) {
      return reply.status(403).send({ error: '삭제 권한이 없습니다' });
    }
    await svc.deleteProblem(req.params.id);
    return reply.status(204).send();
  });
}
```
> `req.user.sub`/`req.user.isAdmin`는 `TokenPayload` 필드. 실제 필드명이 다르면(`id` 등) `auth.ts`/shared `TokenPayload`를 확인해 맞춘다.

- [ ] **Step 2: app.ts 등록**

`packages/server/src/app.ts`:
- import 추가 (다른 라우트 import 옆):
```ts
import { problemRoutes } from './routes/problems.js';
```
- 라우트 등록부에 추가 (`app.register(adminRoutes);` 위/아래):
```ts
  app.register(problemRoutes);
```

- [ ] **Step 3: 타입체크**

Run:
```bash
npm run build -w @mathchois/server
```
Expected: 성공. (`TokenPayload`에 `sub`/`isAdmin`이 없으면 에러 → shared `auth.ts` 확인 후 필드명 수정.)

- [ ] **Step 4: (선택) 라이브 스모크 — CRUD (AI 불필요)**

DB 연결된 dev 서버에서, 교사 토큰으로:
```bash
# 목록 (빈 배열 + total 0 기대)
curl -s -H "Authorization: Bearer <TEACHER_JWT>" "http://localhost:3001/api/problems" | head
# facets (빈 배열들 기대)
curl -s -H "Authorization: Bearer <TEACHER_JWT>" "http://localhost:3001/api/problems/facets"
```
Expected: `{"items":[],"total":0,...}` / `{"subject":[],...}`.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/routes/problems.ts packages/server/src/app.ts
git commit -m "feat(server): problems API routes (ocr/crud/search)"
```

---

## Task 6: 클라 순수 로직 — `problemContent.js` (TDD)

본문 `[FIGURE:n]` 플레이스홀더를 텍스트/그림 세그먼트로 분해하고 정합성을 검증하는 순수 함수. Vitest로 TDD.

**Files:**
- Create: `packages/client/src/lib/problemContent.test.js`
- Create: `packages/client/src/lib/problemContent.js`

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/client/src/lib/problemContent.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { splitFigureSegments, validateFigures } from './problemContent.js';

describe('splitFigureSegments', () => {
  it('splits text around [FIGURE:n] markers', () => {
    const segs = splitFigureSegments('앞 $x^2$ [FIGURE:1] 뒤 [FIGURE:2] 끝');
    expect(segs).toEqual([
      { type: 'text', value: '앞 $x^2$ ' },
      { type: 'figure', idx: 1 },
      { type: 'text', value: ' 뒤 ' },
      { type: 'figure', idx: 2 },
      { type: 'text', value: ' 끝' },
    ]);
  });

  it('returns single text segment when no markers', () => {
    expect(splitFigureSegments('수식만 $a+b$')).toEqual([{ type: 'text', value: '수식만 $a+b$' }]);
  });
});

describe('validateFigures', () => {
  it('passes when marker count matches figureNotes length', () => {
    expect(validateFigures('[FIGURE:1] [FIGURE:2]', ['a', 'b']).ok).toBe(true);
  });

  it('fails when counts mismatch', () => {
    const r = validateFigures('[FIGURE:1]', ['a', 'b']);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('일치');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run:
```bash
npm run test -w @mathchois/client
```
Expected: FAIL — `problemContent.js`가 없어서 import 에러.

- [ ] **Step 3: 최소 구현**

`packages/client/src/lib/problemContent.js`:
```js
const FIGURE_RE = /\[FIGURE:(\d+)\]/g;

/** 본문을 text/figure 세그먼트 배열로 분해 */
export function splitFigureSegments(latex) {
  const segments = [];
  let lastIndex = 0;
  let m;
  FIGURE_RE.lastIndex = 0;
  while ((m = FIGURE_RE.exec(latex)) !== null) {
    if (m.index > lastIndex) {
      segments.push({ type: 'text', value: latex.slice(lastIndex, m.index) });
    }
    segments.push({ type: 'figure', idx: parseInt(m[1], 10) });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < latex.length) {
    segments.push({ type: 'text', value: latex.slice(lastIndex) });
  }
  return segments.length ? segments : [{ type: 'text', value: latex }];
}

/** 본문 [FIGURE:n] 개수와 figureNotes 길이 정합성 검증 */
export function validateFigures(latex, figureNotes) {
  FIGURE_RE.lastIndex = 0;
  const count = (latex.match(FIGURE_RE) || []).length;
  if (count !== figureNotes.length) {
    return { ok: false, message: `본문의 그림 표시(${count}개)와 그림 설명(${figureNotes.length}개) 개수가 일치하지 않습니다.` };
  }
  return { ok: true };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run:
```bash
npm run test -w @mathchois/client
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/lib/problemContent.js packages/client/src/lib/problemContent.test.js
git commit -m "feat(client): problemContent figure-segment parser (tested)"
```

---

## Task 7: 렌더 컴포넌트 `ProblemView` + KaTeX CSS + API 래퍼

**Files:**
- Create: `packages/client/src/components/common/ProblemView.jsx`
- Create: `packages/client/src/lib/problems.js`
- Modify: 진입점에 katex CSS import (`packages/client/src/main.jsx` 또는 `App.jsx` 최상단)

- [ ] **Step 1: KaTeX CSS 전역 import**

`packages/client/src/main.jsx`(없으면 `App.jsx`) 최상단 import 그룹에 추가:
```js
import 'katex/dist/katex.min.css';
```

- [ ] **Step 2: ProblemView 작성**

`packages/client/src/components/common/ProblemView.jsx`:
```jsx
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { splitFigureSegments } from '../../lib/problemContent';

function Markdown({ children }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
      {children}
    </ReactMarkdown>
  );
}

/**
 * 문제/해설 본문 렌더: Markdown+LaTeX, [FIGURE:n] 자리에 figures[idx] 이미지 삽입
 * @param {{ latex: string, figures?: {idx:number, imageUrl:string, alt:string}[] }} props
 */
export default function ProblemView({ latex, figures = [] }) {
  const byIdx = new Map(figures.map((f) => [f.idx, f]));
  const segments = splitFigureSegments(latex || '');

  return (
    <div className="prose prose-sm max-w-none break-normal">
      {segments.map((seg, i) => {
        if (seg.type === 'text') return <Markdown key={i}>{seg.value}</Markdown>;
        const fig = byIdx.get(seg.idx);
        return fig?.imageUrl
          ? <img key={i} src={fig.imageUrl} alt={fig.alt || `그림 ${seg.idx}`} className="my-2 max-w-full" />
          : <span key={i} className="inline-block px-2 py-1 my-1 text-xs bg-amber-50 text-amber-700 rounded">[그림 {seg.idx} 미삽입]</span>;
      })}
    </div>
  );
}
```

- [ ] **Step 3: API 래퍼 작성**

`packages/client/src/lib/problems.js`:
```js
import { api } from './api';

export const ocrProblem = (imageUrl) => api.post('/api/problems/ocr', { imageUrl });
export const ocrMarkscheme = (imageUrl) => api.post('/api/problems/markscheme-ocr', { imageUrl });
export const generateSolution = (problemLatex) => api.post('/api/problems/generate-solution', { problemLatex });
export const createProblem = (body) => api.post('/api/problems', body);
export const updateProblem = (id, body) => api.patch(`/api/problems/${id}`, body);
export const deleteProblem = (id) => api.delete(`/api/problems/${id}`);
export const getProblem = (id) => api.get(`/api/problems/${id}`);
export const getFacets = () => api.get('/api/problems/facets');

export function listProblems(filters = {}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v != null && v !== '') params.set(k, String(v));
  }
  const qs = params.toString();
  return api.get(`/api/problems${qs ? `?${qs}` : ''}`);
}

/** problem-bank 버킷에 이미지 업로드 → URL 반환 */
export async function uploadProblemImage(file, directory) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await api.upload(
    `/api/files/upload?bucket=problem-bank&directory=${encodeURIComponent(directory)}`,
    fd,
  );
  return res.url;
}
```

- [ ] **Step 4: 빌드 확인**

Run:
```bash
npm run build -w @mathchois/client
```
Expected: 성공 (import 해결).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/common/ProblemView.jsx packages/client/src/lib/problems.js packages/client/src/main.jsx
git commit -m "feat(client): ProblemView (katex) + problems api wrappers"
```

---

## Task 8: 등록 탭 `ProblemRegister.jsx`

업로드→OCR→폼 편집→그림 슬롯→정답/해설→저장. (편집 모드는 `initial` prop으로 재사용.)

**Files:**
- Create: `packages/client/src/pages/Problems/ProblemRegister.jsx`

- [ ] **Step 1: 컴포넌트 작성**

`packages/client/src/pages/Problems/ProblemRegister.jsx`:
```jsx
import { useState } from 'react';
import { Loader, Upload, Wand2 } from 'lucide-react';
import ProblemView from '../../components/common/ProblemView';
import { validateFigures } from '../../lib/problemContent';
import {
  ocrProblem, ocrMarkscheme, generateSolution,
  createProblem, updateProblem, uploadProblemImage,
} from '../../lib/problems';

const EMPTY = {
  title: '', problemLatex: '', figureNotes: [], figures: [],
  originalImageUrl: null, subject: '', majorUnit: '', minorUnit: '',
  difficulty: '', problemType: '', detailType: '', keywords: [],
  answer: '', solution: '', solutionSource: null, markschemeImageUrl: null,
};

export default function ProblemRegister({ initial, onSaved }) {
  const [form, setForm] = useState(initial ?? EMPTY);
  const [dir] = useState(() => `drafts/${Date.now()}`);
  const [busy, setBusy] = useState('');   // '' | 'ocr' | 'markscheme' | 'solution' | 'save'
  const [error, setError] = useState('');

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const handleProblemImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy('ocr'); setError('');
    try {
      const url = await uploadProblemImage(file, dir);
      const res = await ocrProblem(url);
      set({
        originalImageUrl: url,
        problemLatex: res.latex,
        figureNotes: res.figureNotes,
        figures: res.figureNotes.map((alt, i) => ({ idx: i + 1, alt, imageUrl: '' })),
        ...res.meta,
        keywords: res.meta.keywords ?? [],
      });
    } catch (err) { setError(err.message); }
    setBusy('');
  };

  const handleFigureImage = async (idx, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadProblemImage(file, `${dir}/figures`);
    set({ figures: form.figures.map((fig) => fig.idx === idx ? { ...fig, imageUrl: url } : fig) });
  };

  const handleMarkscheme = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy('markscheme'); setError('');
    try {
      const url = await uploadProblemImage(file, `${dir}/markscheme`);
      const res = await ocrMarkscheme(url);
      set({ answer: res.answer, solution: res.solution, solutionSource: 'teacher-markscheme', markschemeImageUrl: url });
    } catch (err) { setError(err.message); }
    setBusy('');
  };

  const handleGenerateSolution = async () => {
    if (!form.problemLatex) { setError('먼저 문제 본문을 입력하세요.'); return; }
    setBusy('solution'); setError('');
    try {
      const res = await generateSolution(form.problemLatex);
      set({ answer: res.answer, solution: res.solution, solutionSource: 'ai' });
    } catch (err) { setError(err.message); }
    setBusy('');
  };

  const handleSave = async () => {
    const v = validateFigures(form.problemLatex, form.figureNotes);
    if (!v.ok) { setError(v.message); return; }
    setBusy('save'); setError('');
    try {
      // 교사가 내용을 수정해 저장하면 검수된 것으로 본다(마크스킴은 그대로 우선 유지)
      const solutionSource = form.solutionSource === 'teacher-markscheme'
        ? 'teacher-markscheme'
        : (form.solution ? 'teacher-verified' : form.solutionSource);
      const payload = { ...form, solutionSource, title: form.title || null };
      const saved = initial?.id
        ? await updateProblem(initial.id, payload)
        : await createProblem(payload);
      onSaved?.(saved);
      if (!initial) setForm(EMPTY);
    } catch (err) { setError(err.message); }
    setBusy('');
  };

  const META_FIELDS = [
    ['subject', '과목'], ['majorUnit', '대단원'], ['minorUnit', '소단원'],
    ['difficulty', '난이도'], ['problemType', '유형'], ['detailType', '세부유형'],
  ];

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      {/* 좌: 입력 */}
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        <label className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-md cursor-pointer w-fit">
          {busy === 'ocr' ? <Loader className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          <span className="whitespace-nowrap">문제 이미지 업로드 + AI 분석</span>
          <input type="file" accept="image/*" className="hidden" disabled={!!busy} onChange={handleProblemImage} />
        </label>

        <input className="border rounded px-3 py-2" placeholder="제목(선택)"
          value={form.title} onChange={(e) => set({ title: e.target.value })} />

        <textarea className="border rounded px-3 py-2 font-mono text-sm h-40" placeholder="문제 본문 (Markdown + LaTeX)"
          value={form.problemLatex} onChange={(e) => set({ problemLatex: e.target.value })} />

        {/* 그림 슬롯 */}
        {form.figures.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-gray-500">감지된 그림 — 각 슬롯에 이미지를 삽입하세요</p>
            {form.figures.map((fig) => (
              <div key={fig.idx} className="flex items-center gap-2">
                <span className="text-xs whitespace-nowrap">[그림 {fig.idx}] {fig.alt}</span>
                <input type="file" accept="image/*" onChange={(e) => handleFigureImage(fig.idx, e)} />
                {fig.imageUrl && <span className="text-green-600 text-xs">✓</span>}
              </div>
            ))}
          </div>
        )}

        {/* 분류 */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {META_FIELDS.map(([key, label]) => (
            <input key={key} className="border rounded px-2 py-1 text-sm" placeholder={label}
              value={form[key] ?? ''} onChange={(e) => set({ [key]: e.target.value })} />
          ))}
          <input className="border rounded px-2 py-1 text-sm col-span-2 sm:col-span-3" placeholder="키워드(쉼표로 구분)"
            value={(form.keywords || []).join(', ')}
            onChange={(e) => set({ keywords: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
        </div>

        {/* 정답·해설 */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 px-3 py-2 border rounded-md cursor-pointer">
            {busy === 'markscheme' ? <Loader className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            <span className="whitespace-nowrap">마크스킴 이미지</span>
            <input type="file" accept="image/*" className="hidden" disabled={!!busy} onChange={handleMarkscheme} />
          </label>
          <button onClick={handleGenerateSolution} disabled={!!busy}
            className="flex items-center gap-1 px-3 py-2 border rounded-md disabled:opacity-50">
            {busy === 'solution' ? <Loader className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            <span className="whitespace-nowrap">AI 정답·해설 생성</span>
          </button>
          {form.solutionSource && <span className="text-xs text-gray-500">출처: {form.solutionSource}</span>}
        </div>
        <input className="border rounded px-3 py-2" placeholder="정답"
          value={form.answer ?? ''} onChange={(e) => set({ answer: e.target.value })} />
        <textarea className="border rounded px-3 py-2 font-mono text-sm h-32" placeholder="해설 (Markdown + LaTeX)"
          value={form.solution ?? ''} onChange={(e) => set({ solution: e.target.value })} />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button onClick={handleSave} disabled={!!busy || !form.problemLatex}
          className="px-4 py-2 bg-green-600 text-white rounded-md disabled:opacity-50 w-fit">
          {busy === 'save' ? '저장 중…' : (initial ? '수정 저장' : '문항 저장')}
        </button>
      </div>

      {/* 우: 미리보기 */}
      <div className="flex-1 min-w-0 border rounded-md p-3 bg-white">
        <p className="text-xs text-gray-400 mb-2">미리보기</p>
        <ProblemView latex={form.problemLatex} figures={form.figures} />
        {form.solution && (
          <>
            <hr className="my-3" />
            <p className="text-xs text-gray-400 mb-1">해설</p>
            <ProblemView latex={form.solution} figures={[]} />
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 빌드 확인**

Run:
```bash
npm run build -w @mathchois/client
```
Expected: 성공.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/pages/Problems/ProblemRegister.jsx
git commit -m "feat(client): ProblemRegister tab (ocr/figures/solution/save)"
```

---

## Task 9: 목록 탭 `RegisteredProblems.jsx`

필터바 + 반응형 표 + 상세/수정/삭제.

**Files:**
- Create: `packages/client/src/pages/Problems/RegisteredProblems.jsx`

- [ ] **Step 1: 컴포넌트 작성**

`packages/client/src/pages/Problems/RegisteredProblems.jsx`:
```jsx
import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import ProblemView from '../../components/common/ProblemView';
import ProblemRegister from './ProblemRegister';
import { listProblems, getFacets, deleteProblem } from '../../lib/problems';

const FILTER_FIELDS = [
  ['subject', '과목'], ['majorUnit', '대단원'], ['minorUnit', '소단원'],
  ['difficulty', '난이도'], ['problemType', '유형'],
];

export default function RegisteredProblems() {
  const { profile } = useAuth();
  const [facets, setFacets] = useState({});
  const [filters, setFilters] = useState({});
  const [q, setQ] = useState('');
  const [result, setResult] = useState({ items: [], total: 0, page: 1, pageSize: 20 });
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState(null);   // 보기 대상 problem
  const [editing, setEditing] = useState(null); // 수정 대상 problem

  useEffect(() => { getFacets().then(setFacets).catch(() => {}); }, []);

  const fetchList = useCallback(async (page = 1) => {
    setLoading(true);
    try { setResult(await listProblems({ ...filters, q, page })); }
    finally { setLoading(false); }
  }, [filters, q]);

  useEffect(() => { fetchList(1); }, [fetchList]);

  const canManage = (p) => p.createdBy === profile?.id || profile?.isAdmin;

  const handleDelete = async (p) => {
    if (!confirm('이 문항을 삭제할까요?')) return;
    await deleteProblem(p.id);
    fetchList(result.page);
  };

  if (editing) {
    return (
      <ProblemRegister
        initial={{ ...editing, keywords: editing.keywords || [] }}
        onSaved={() => { setEditing(null); fetchList(result.page); }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 필터바 */}
      <div className="flex flex-wrap gap-2">
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
        <button onClick={() => fetchList(1)} className="px-3 py-1 bg-blue-600 text-white rounded text-sm whitespace-nowrap">검색</button>
      </div>

      <p className="text-xs text-gray-500">{loading ? '불러오는 중…' : `총 ${result.total}개`}</p>

      {/* 표 — 반응형: 래퍼 overflow-x-auto, thead sticky, 첫 열 sticky */}
      <div className="overflow-x-auto border rounded-md max-h-[70dvh] overflow-y-auto">
        <table className="min-w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100">
              {['제목', '과목', '대단원', '소단원', '난이도', '유형', '세부유형', '키워드', '작성일', ''].map((h, i) => (
                <th key={h || i}
                  className={`px-3 py-2 text-left whitespace-nowrap sticky top-0 bg-gray-100 z-20 ${i === 0 ? 'left-0 z-30' : ''}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.items.map((p) => (
              <tr key={p.id} className="border-t hover:bg-blue-50 cursor-pointer" onClick={() => setDetail(p)}>
                <td className="px-3 py-2 whitespace-nowrap sticky left-0 bg-white z-10 max-w-60 truncate">{p.title || '(제목 없음)'}</td>
                <td className="px-3 py-2 whitespace-nowrap">{p.subject}</td>
                <td className="px-3 py-2 whitespace-nowrap">{p.majorUnit}</td>
                <td className="px-3 py-2 whitespace-nowrap">{p.minorUnit}</td>
                <td className="px-3 py-2 whitespace-nowrap">{p.difficulty}</td>
                <td className="px-3 py-2 whitespace-nowrap">{p.problemType}</td>
                <td className="px-3 py-2 whitespace-nowrap">{p.detailType}</td>
                <td className="px-3 py-2 whitespace-nowrap">{(p.keywords || []).join(', ')}</td>
                <td className="px-3 py-2 whitespace-nowrap">{(p.createdAt || '').slice(0, 10)}</td>
                <td className="px-3 py-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                  {canManage(p) && (
                    <span className="flex gap-2">
                      <button className="text-blue-600" onClick={() => setEditing(p)}>수정</button>
                      <button className="text-red-600" onClick={() => handleDelete(p)}>삭제</button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      {result.total > result.pageSize && (
        <div className="flex gap-2 justify-center">
          <button disabled={result.page <= 1} onClick={() => fetchList(result.page - 1)}
            className="px-3 py-1 border rounded disabled:opacity-40">이전</button>
          <span className="px-2 py-1 text-sm">{result.page} / {Math.ceil(result.total / result.pageSize)}</span>
          <button disabled={result.page >= Math.ceil(result.total / result.pageSize)} onClick={() => fetchList(result.page + 1)}
            className="px-3 py-1 border rounded disabled:opacity-40">다음</button>
        </div>
      )}

      {/* 상세 패널 */}
      {detail && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-2" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90dvh] overflow-y-auto p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-bold whitespace-nowrap">{detail.title || '(제목 없음)'}</h3>
              <button onClick={() => setDetail(null)} className="p-2">✕</button>
            </div>
            <ProblemView latex={detail.problemLatex} figures={detail.figures} />
            {detail.originalImageUrl && (
              <details className="mt-2">
                <summary className="text-xs text-gray-500 cursor-pointer">원본 이미지 보기</summary>
                <img src={detail.originalImageUrl} alt="원본" className="mt-2 max-w-full" />
              </details>
            )}
            {detail.answer && <p className="mt-3"><b>정답:</b> {detail.answer}</p>}
            {detail.solution && (<><hr className="my-2" /><p className="text-xs text-gray-400">해설</p><ProblemView latex={detail.solution} figures={[]} /></>)}
          </div>
        </div>
      )}
    </div>
  );
}
```
> sticky 첫 열/헤더 배경색은 `bg-white`/`bg-gray-100`로 명시(반응형 규칙 §3.5). z-index 서열: 헤더 z-20, 첫열 z-10, 좌상단 교차 z-30.

- [ ] **Step 2: 빌드 확인**

Run:
```bash
npm run build -w @mathchois/client
```
Expected: 성공.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/pages/Problems/RegisteredProblems.jsx
git commit -m "feat(client): RegisteredProblems tab (filter/table/detail/edit)"
```

---

## Task 10: 탭 컨테이너 + 라우팅 + 사이드바

**Files:**
- Create: `packages/client/src/pages/Problems/ProblemsPage.jsx`
- Modify: `packages/client/src/App.jsx`
- Modify: `packages/client/src/layouts/DashboardLayout.jsx`

- [ ] **Step 1: 탭 컨테이너 작성**

`packages/client/src/pages/Problems/ProblemsPage.jsx`:
```jsx
import { useSearchParams } from 'react-router-dom';
import ProblemRegister from './ProblemRegister';
import RegisteredProblems from './RegisteredProblems';

export default function ProblemsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'register' ? 'register' : 'list';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 border-b">
        <button onClick={() => setParams({ tab: 'register' })}
          className={`px-4 py-2 whitespace-nowrap ${tab === 'register' ? 'border-b-2 border-blue-600 text-blue-600 font-medium' : 'text-gray-500'}`}>
          문항등록
        </button>
        <button onClick={() => setParams({ tab: 'list' })}
          className={`px-4 py-2 whitespace-nowrap ${tab === 'list' ? 'border-b-2 border-blue-600 text-blue-600 font-medium' : 'text-gray-500'}`}>
          등록된 문항
        </button>
      </div>
      {tab === 'register'
        ? <ProblemRegister onSaved={() => setParams({ tab: 'list' })} />
        : <RegisteredProblems />}
    </div>
  );
}
```

- [ ] **Step 2: 라우트 등록**

`packages/client/src/App.jsx`:
- lazy import 추가 (다른 lazy 옆):
```jsx
const ProblemsPage = lazy(() => import('./pages/Problems/ProblemsPage'));
```
- Teacher DashboardLayout 블록 안(`/teacher/board` 라우트들 근처)에 추가:
```jsx
              <Route path="/teacher/problems" element={<ProblemsPage />} />
```

- [ ] **Step 3: 사이드바 메뉴 추가**

`packages/client/src/layouts/DashboardLayout.jsx`:
- import에 아이콘 추가:
```js
import { Users, LogIn, LayoutList, Loader, BookMarked } from 'lucide-react';
```
- `TeacherSidebar`의 "게시판" `<Link>` 아래에 추가:
```jsx
        <Link
          to="/teacher/problems"
          className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors mb-1 ${
            location.pathname.startsWith('/teacher/problems')
              ? 'bg-blue-50 text-blue-700'
              : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          <BookMarked className={`mr-2 h-4 w-4 ${location.pathname.startsWith('/teacher/problems') ? 'text-blue-500' : 'text-gray-400'}`} />
          문제은행
        </Link>
```

- [ ] **Step 4: 빌드 확인**

Run:
```bash
npm run build -w @mathchois/client
```
Expected: 성공.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/pages/Problems/ProblemsPage.jsx packages/client/src/App.jsx packages/client/src/layouts/DashboardLayout.jsx
git commit -m "feat(client): problems page tabs + route + sidebar menu"
```

---

## Task 11: 통합 검증 · 반응형 리뷰

**Files:** 없음 (검증 단계)

- [ ] **Step 1: 전체 빌드**

Run:
```bash
npm run build
```
Expected: shared → client → server 모두 성공.

- [ ] **Step 2: 클라 테스트 + 린트**

Run:
```bash
npm run test -w @mathchois/client && npm run lint
```
Expected: 통과.

- [ ] **Step 3: 라이브 엔드투엔드 스모크 (DB + GEMINI_API_KEY 설정 시)**

`npm run dev`로 서버+클라 기동 후 교사 계정으로:
1. `/teacher/problems?tab=register` → 문제 이미지 업로드 → "AI 분석" → 본문/그림목록/분류 채워짐 확인.
2. 그림 슬롯에 이미지 삽입 → 미리보기에서 해당 위치에 이미지 표시 확인.
3. "AI 정답·해설 생성" → 정답/해설 채워짐. 저장.
4. `?tab=list` → 표에 등록 문항 표시, 필터/검색 동작 확인.
5. 행 클릭 → 상세 렌더(수식 KaTeX) 확인. 수정/삭제 확인.

- [ ] **Step 4: 반응형 UI 리뷰**

`responsive-ui-reviewer` 에이전트로 신규 `pages/Problems/*.jsx`, `components/common/ProblemView.jsx` 점검(표 sticky/overflow, 줄바꿈 금지, 터치타깃, 100dvh). 지적사항 수정.

- [ ] **Step 5: PROJECT_MAP 갱신**

`project-map-updater` 에이전트로 새 라우트(`/teacher/problems`)·테이블(`problems`)·서비스(`ai.service`, `problem.service`) 반영.

- [ ] **Step 6: 최종 Commit**

```bash
git add -A
git commit -m "chore: problem bank e2e verification + map/responsive review fixes"
```

---

## Self-Review 결과

**Spec 커버리지:**
- §3 데이터 모델 → Task 1,2 ✅
- §4 AI 서비스(ocrProblem/ocrMarkscheme/generateSolution + 프롬프트 + 그림번호 업그레이드) → Task 3 ✅
- §5 API(ocr/markscheme-ocr/generate-solution/CRUD/facets, problem-bank 버킷, 권한, 정답출처 로직) → Task 5,8 ✅
- §6.1 라우트·사이드바 → Task 10 ✅
- §6.2 등록 탭(업로드/OCR/그림슬롯/분류/정답·해설/저장) → Task 8 ✅
- §6.3 목록 탭(필터/표 반응형/상세/수정·삭제) → Task 9 ✅
- §6.4 수식 렌더(katex 등) + ProblemView + api 래퍼 → Task 0,7 ✅

**타입 일관성:** `Problem`/`ProblemFigure`/`OcrProblemResult`/`SolutionResult`(shared) ↔ `ProblemInsert`(service) ↔ 폼 필드명 일치 확인. `solutionSource` enum 4값 일관.

**미해결 가정(구현 시 확인):**
1. `TokenPayload` 필드명(`sub`/`isAdmin`) — shared `auth.ts` 확인 후 라우트의 `req.user.*` 맞추기.
2. `@google/genai` `responseSchema`/`Type` 현행 시그니처 — context7 확인.
3. KaTeX CSS import 위치가 `main.jsx`인지 — 실제 진입점 확인(`App.jsx`일 수 있음).
```
