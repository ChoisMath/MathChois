# 시각화자료 라이브러리 (Visualization Library) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 교사가 등록한 standalone HTML을 메타데이터(제목/과목/대단원/소단원/설명)와 함께 저장·검색·공유하고, 챕터 HTML 삽입 버튼에서 선택하면 페이지 전용 복사본으로 삽입하는 [시각화자료] 라이브러리를 만든다.

**Architecture:** 신규 `visualizations` 테이블 + 버킷에 원본 HTML을 보관한다. 챕터 페이지 삽입 시 서버가 원본을 `chapter-tools` 버킷으로 복제하여 페이지가 독립 복사본을 참조하게 한다(원본 수정/삭제가 과거 페이지에 영향 없음). 기존 `POST /api/chapters/:chapterId/pages` 라우트를 `fromVisualizationId` 옵션으로 확장해 삽입을 원자적으로 처리한다.

**Tech Stack:** Fastify 5, Drizzle ORM, PostgreSQL, zod (server) / React 19, Vite, React Router 7, Tailwind 4, Vitest (client). 공용 타입은 `@mathchois/shared` 소스 export.

> **테스트 정책:** 서버 패키지에는 테스트 러너가 없다(레포 관행). 서버 작업은 `npm run build -w @mathchois/server`(tsc 타입체크) + 수동 검증으로 확인한다. 클라이언트의 순수 로직(쿼리 빌더)은 Vitest로 TDD한다.

---

## File Structure

**서버**
- `packages/shared/src/types/visualization.ts` — 신규. `Visualization`, `VisualizationListResult`, `VisualizationFacets`, `VisualizationFilters`.
- `packages/shared/src/index.ts` — 수정. 위 타입 re-export.
- `packages/server/src/db/schema.ts` — 수정. `visualizations` 테이블.
- `packages/server/src/db/startupMigrate.ts` — 수정. 멱등 DDL.
- `packages/server/src/services/storage.service.ts` — 수정. `copyHtmlToChapterTools` 헬퍼.
- `packages/server/src/services/visualization.service.ts` — 신규. CRUD + list/facets.
- `packages/server/src/services/page.service.ts` — 수정. `createPage`에 `fromVisualizationId`.
- `packages/server/src/routes/visualizations.ts` — 신규. REST 라우트.
- `packages/server/src/routes/pages.ts` — 수정. 단일 삽입 body에 `fromVisualizationId`.
- `packages/server/src/routes/storage.ts` — 수정. `visualizations` 버킷 HTML-only.
- `packages/server/src/app.ts` — 수정. `visualizationRoutes` 등록.

**클라이언트**
- `packages/client/src/lib/visualizations.js` — 신규. API 래퍼 + 쿼리 빌더.
- `packages/client/src/lib/visualizations.test.js` — 신규. Vitest.
- `packages/client/src/components/visualizations/VisualizationForm.jsx` — 신규. 등록/수정 공용 폼.
- `packages/client/src/components/visualizations/VisualizationPickerModal.jsx` — 신규. 검색·선택·등록 모달.
- `packages/client/src/pages/Visualizations/VisualizationsPage.jsx` — 신규. 본인 자료 관리 페이지.
- `packages/client/src/pages/Chapters/Editor.jsx` — 수정. HTML 버튼 → 모달 연동.
- `packages/client/src/App.jsx` — 수정. `/teacher/visualizations` 라우트.
- `packages/client/src/layouts/DashboardLayout.jsx` — 수정. 사이드바 메뉴.
- `.claude/PROJECT_MAP.md` — 수정. 신규 구조 반영.

---

## Task 1: 공용 타입 정의

**Files:**
- Create: `packages/shared/src/types/visualization.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: 타입 파일 생성**

`packages/shared/src/types/visualization.ts`:

```typescript
export interface Visualization {
  id: string;
  createdBy: string;
  title: string;
  subject: string | null;
  majorUnit: string | null;
  minorUnit: string | null;
  description: string | null;
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface VisualizationListResult {
  items: Visualization[];
  total: number;
  page: number;
  pageSize: number;
}

export interface VisualizationFacets {
  subject: string[];
  majorUnit: string[];
  minorUnit: string[];
}

export interface VisualizationFilters {
  q?: string;
  subject?: string;
  majorUnit?: string;
  minorUnit?: string;
  mine?: boolean;
  page?: number;
  pageSize?: number;
}
```

- [ ] **Step 2: index에서 re-export**

`packages/shared/src/index.ts`의 마지막 export 줄 다음에 추가:

```typescript
export * from './types/visualization.js';
```

- [ ] **Step 3: 커밋**

```bash
git add packages/shared/src/types/visualization.ts packages/shared/src/index.ts
git commit -m "feat(shared): visualization library types"
```

---

## Task 2: DB 스키마 + 기동 마이그레이션

**Files:**
- Modify: `packages/server/src/db/schema.ts`
- Modify: `packages/server/src/db/startupMigrate.ts`

- [ ] **Step 1: Drizzle 테이블 추가**

`packages/server/src/db/schema.ts`의 `coachingAttempts` 정의 블록 **다음**(파일 끝)에 추가:

```typescript
// ─── visualizations (시각화자료 라이브러리) ──────────

export const visualizations = pgTable('visualizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  createdBy: uuid('created_by').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  subject: text('subject'),
  majorUnit: text('major_unit'),
  minorUnit: text('minor_unit'),
  description: text('description'),
  htmlUrl: text('html_url').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('idx_visualizations_created_by').on(t.createdBy),
  index('idx_visualizations_subject').on(t.subject, t.majorUnit, t.minorUnit),
]);
```

(`pgTable`, `uuid`, `text`, `timestamp`, `index`는 파일 상단에서 이미 import됨 — 추가 import 불필요.)

- [ ] **Step 2: 기동 마이그레이션 DDL 추가**

`packages/server/src/db/startupMigrate.ts`의 `runStartupMigrations` 함수 끝(마지막 `log.info` 다음, 함수 닫는 `}` 직전)에 추가:

```typescript
  await pgClient`
    CREATE TABLE IF NOT EXISTS visualizations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      created_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      title text NOT NULL,
      subject text, major_unit text, minor_unit text,
      description text,
      html_url text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;
  await pgClient`CREATE INDEX IF NOT EXISTS idx_visualizations_created_by ON visualizations (created_by)`;
  await pgClient`CREATE INDEX IF NOT EXISTS idx_visualizations_subject ON visualizations (subject, major_unit, minor_unit)`;
  log.info('startup migration: visualizations table ensured');
```

- [ ] **Step 3: 타입체크**

Run: `npm run build -w @mathchois/server`
Expected: 빌드 성공(에러 없음). `visualizations` export 인식.

- [ ] **Step 4: 커밋**

```bash
git add packages/server/src/db/schema.ts packages/server/src/db/startupMigrate.ts
git commit -m "feat(db): visualizations table + startup migration"
```

---

## Task 3: 스토리지 복제 헬퍼

**Files:**
- Modify: `packages/server/src/services/storage.service.ts`

페이지 삽입 시 원본 HTML(`visualizations` 버킷)을 `chapter-tools` 버킷으로 복제해 독립 복사본을 만든다.

- [ ] **Step 1: `copyHtmlToChapterTools` 추가**

`packages/server/src/services/storage.service.ts`의 `urlToStoragePath` 함수 **다음**에 추가:

```typescript
/**
 * 시각화자료 원본 HTML을 chapter-tools 버킷으로 복제한다.
 * 페이지는 이 복사본을 참조하므로 원본 수정/삭제와 독립적이다.
 */
export async function copyHtmlToChapterTools(
  sourceHtmlUrl: string,
  chapterId: string,
): Promise<string> {
  const parsed = urlToStoragePath(sourceHtmlUrl);
  if (!parsed) {
    throw Object.assign(new Error('잘못된 HTML URL'), { statusCode: 400 });
  }
  const file = await readFile(parsed.bucket, parsed.path);
  if (!file) {
    throw Object.assign(new Error('원본 HTML 파일을 찾을 수 없습니다'), { statusCode: 400 });
  }
  const baseName = parsed.path.split('/').pop() ?? 'tool.html';
  const fileName = `${Date.now()}_${baseName}`;
  return uploadFile('chapter-tools', `chapters/${chapterId}`, fileName, file.data);
}
```

(`readFile`, `uploadFile`, `urlToStoragePath`는 모두 같은 파일 내 정의/import됨.)

- [ ] **Step 2: 타입체크**

Run: `npm run build -w @mathchois/server`
Expected: 빌드 성공.

- [ ] **Step 3: 커밋**

```bash
git add packages/server/src/services/storage.service.ts
git commit -m "feat(storage): copyHtmlToChapterTools helper for independent page copies"
```

---

## Task 4: 시각화자료 서비스

**Files:**
- Create: `packages/server/src/services/visualization.service.ts`

`problem.service.ts` 패턴을 따른다(list/facets/CRUD). 삭제 시 원본 파일도 제거한다.

- [ ] **Step 1: 서비스 파일 생성**

`packages/server/src/services/visualization.service.ts`:

```typescript
import { eq, and, or, ilike, desc, sql, type SQL } from 'drizzle-orm';
import { db } from '../config/database.js';
import { visualizations } from '../db/schema.js';
import { removeFile, urlToStoragePath } from './storage.service.js';

export type VisualizationInsert = typeof visualizations.$inferInsert;

export interface ListFilters {
  q?: string;
  subject?: string;
  majorUnit?: string;
  minorUnit?: string;
  createdBy?: string;
  page?: number;
  pageSize?: number;
}

export async function createVisualization(values: VisualizationInsert) {
  const [row] = await db.insert(visualizations).values(values).returning();
  return row;
}

export async function getVisualizationById(id: string) {
  const rows = await db.select().from(visualizations).where(eq(visualizations.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function updateVisualization(id: string, patch: Partial<VisualizationInsert>) {
  const [row] = await db.update(visualizations)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(visualizations.id, id)).returning();
  return row ?? null;
}

export async function removeVisualization(id: string) {
  const row = await getVisualizationById(id);
  if (!row) return null;
  const parsed = urlToStoragePath(row.htmlUrl);
  if (parsed) await removeFile(parsed.bucket, parsed.path);
  await db.delete(visualizations).where(eq(visualizations.id, id));
  return row;
}

function buildWhere(f: ListFilters): SQL | undefined {
  const conds: SQL[] = [];
  if (f.createdBy) conds.push(eq(visualizations.createdBy, f.createdBy));
  if (f.subject)   conds.push(eq(visualizations.subject, f.subject));
  if (f.majorUnit) conds.push(eq(visualizations.majorUnit, f.majorUnit));
  if (f.minorUnit) conds.push(eq(visualizations.minorUnit, f.minorUnit));
  if (f.q) {
    const kw = `%${f.q}%`;
    const search = or(
      ilike(visualizations.title, kw),
      ilike(visualizations.description, kw),
    );
    if (search) conds.push(search);
  }
  return conds.length ? and(...conds) : undefined;
}

export async function listVisualizations(f: ListFilters) {
  const page = Math.max(1, Number.isFinite(f.page) ? Number(f.page) : 1);
  const pageSize = Math.min(100, Math.max(1, Number.isFinite(f.pageSize) ? Number(f.pageSize) : 20));
  const where = buildWhere(f);

  const items = await db.select().from(visualizations)
    .where(where)
    .orderBy(desc(visualizations.createdAt))
    .limit(pageSize).offset((page - 1) * pageSize);

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
    .from(visualizations).where(where);

  return { items, total: count, page, pageSize };
}

export async function getFacets() {
  const toSortedStrings = (rows: { v: string | null }[]) =>
    rows.map((r) => r.v).filter((v): v is string => !!v).sort();

  const [subjects, majorUnits, minorUnits] = await Promise.all([
    db.selectDistinct({ v: visualizations.subject }).from(visualizations).then(toSortedStrings),
    db.selectDistinct({ v: visualizations.majorUnit }).from(visualizations).then(toSortedStrings),
    db.selectDistinct({ v: visualizations.minorUnit }).from(visualizations).then(toSortedStrings),
  ]);

  return { subject: subjects, majorUnit: majorUnits, minorUnit: minorUnits };
}
```

- [ ] **Step 2: 타입체크**

Run: `npm run build -w @mathchois/server`
Expected: 빌드 성공.

- [ ] **Step 3: 커밋**

```bash
git add packages/server/src/services/visualization.service.ts
git commit -m "feat(server): visualization service (CRUD + list/facets)"
```

---

## Task 5: 페이지 생성에 fromVisualizationId 연동

**Files:**
- Modify: `packages/server/src/services/page.service.ts`
- Modify: `packages/server/src/routes/pages.ts`

- [ ] **Step 1: page.service에 import 추가**

`packages/server/src/services/page.service.ts` 상단 import 블록(기존 `import { resolveSourceChapterId, isLinkedChapter } from './chapter.service.js';` 다음)에 추가:

```typescript
import { getVisualizationById } from './visualization.service.js';
import { copyHtmlToChapterTools } from './storage.service.js';
```

- [ ] **Step 2: createPage 시그니처·로직 수정**

`packages/server/src/services/page.service.ts`의 `createPage` 함수를 다음으로 교체:

```typescript
/** 페이지 생성 */
export async function createPage(data: {
  chapterId: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  htmlUrl?: string | null;
  aiProblemId?: string | null;
  fromVisualizationId?: string | null;
  position?: number;
}) {
  let htmlUrl = data.htmlUrl ?? null;

  // 시각화자료에서 삽입: 원본 HTML을 페이지 전용 복사본으로 복제(독립)
  if (data.fromVisualizationId) {
    const vis = await getVisualizationById(data.fromVisualizationId);
    if (!vis) {
      throw Object.assign(new Error('시각화자료를 찾을 수 없습니다'), { statusCode: 404 });
    }
    htmlUrl = await copyHtmlToChapterTools(vis.htmlUrl, data.chapterId);
  }

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
      htmlUrl: htmlUrl ?? null,
      aiProblemId: data.aiProblemId ?? null,
      position,
    })
    .returning();
  return created;
}
```

- [ ] **Step 3: pages 라우트 body 확장**

`packages/server/src/routes/pages.ts`의 단일 삽입 블록(현재 56–63줄 영역)을 다음으로 교체:

```typescript
    // 단일 삽입
    const { imageUrl, videoUrl, htmlUrl, aiProblemId, fromVisualizationId, position } = body as {
      imageUrl?: string; videoUrl?: string; htmlUrl?: string; aiProblemId?: string;
      fromVisualizationId?: string; position?: number;
    };
    if (!imageUrl && !videoUrl && !htmlUrl && !aiProblemId && !fromVisualizationId) {
      return reply.status(400).send({ error: 'imageUrl, videoUrl, htmlUrl, aiProblemId, or fromVisualizationId is required' });
    }
    const page = await createPage({ chapterId, imageUrl, videoUrl, htmlUrl, aiProblemId, fromVisualizationId, position });
    return reply.status(201).send(page);
```

- [ ] **Step 4: 타입체크**

Run: `npm run build -w @mathchois/server`
Expected: 빌드 성공. (page.service ↔ visualization.service 간 순환 import 없음 — visualization.service는 page.service를 import하지 않음.)

- [ ] **Step 5: 커밋**

```bash
git add packages/server/src/services/page.service.ts packages/server/src/routes/pages.ts
git commit -m "feat(server): create page from visualization (copy-on-insert)"
```

---

## Task 6: 시각화자료 라우트 + 등록 + 버킷 제한

**Files:**
- Create: `packages/server/src/routes/visualizations.ts`
- Modify: `packages/server/src/app.ts`
- Modify: `packages/server/src/routes/storage.ts`

- [ ] **Step 1: 라우트 파일 생성**

`packages/server/src/routes/visualizations.ts`:

```typescript
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleGuard.js';
import * as svc from '../services/visualization.service.js';

const visBody = z.object({
  title: z.string().min(1),
  subject: z.string().nullable().optional(),
  majorUnit: z.string().nullable().optional(),
  minorUnit: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  htmlUrl: z.string().min(1),
});

export async function visualizationRoutes(app: FastifyInstance) {
  const teacher = { preHandler: [authenticate, requireRole('teacher')] };

  app.get('/api/visualizations', teacher, async (req) => {
    const q = req.query as Record<string, string>;
    const mine = q.mine === '1' || q.mine === 'true';
    return svc.listVisualizations({
      subject: q.subject, majorUnit: q.majorUnit, minorUnit: q.minorUnit, q: q.q,
      createdBy: mine ? req.user.sub : undefined,
      page: q.page ? parseInt(q.page, 10) : undefined,
      pageSize: q.pageSize ? parseInt(q.pageSize, 10) : undefined,
    });
  });

  app.get('/api/visualizations/facets', teacher, async () => svc.getFacets());

  app.get<{ Params: { id: string } }>('/api/visualizations/:id', teacher, async (req, reply) => {
    const row = await svc.getVisualizationById(req.params.id);
    if (!row) return reply.status(404).send({ error: '시각화자료를 찾을 수 없습니다' });
    return row;
  });

  app.post('/api/visualizations', teacher, async (req) => {
    const body = visBody.parse(req.body);
    return svc.createVisualization({ ...body, createdBy: req.user.sub });
  });

  app.patch<{ Params: { id: string } }>('/api/visualizations/:id', teacher, async (req, reply) => {
    const existing = await svc.getVisualizationById(req.params.id);
    if (!existing) return reply.status(404).send({ error: '시각화자료를 찾을 수 없습니다' });
    if (existing.createdBy !== req.user.sub && !req.user.isAdmin) {
      return reply.status(403).send({ error: '수정 권한이 없습니다' });
    }
    const body = visBody.partial().parse(req.body);
    return svc.updateVisualization(req.params.id, body);
  });

  app.delete<{ Params: { id: string } }>('/api/visualizations/:id', teacher, async (req, reply) => {
    const existing = await svc.getVisualizationById(req.params.id);
    if (!existing) return reply.status(404).send({ error: '시각화자료를 찾을 수 없습니다' });
    if (existing.createdBy !== req.user.sub && !req.user.isAdmin) {
      return reply.status(403).send({ error: '삭제 권한이 없습니다' });
    }
    await svc.removeVisualization(req.params.id);
    return reply.status(204).send();
  });
}
```

- [ ] **Step 2: app.ts에 라우트 등록**

`packages/server/src/app.ts`의 import 블록(`import { dashboardRoutes } from './routes/dashboard.js';` 다음)에 추가:

```typescript
import { visualizationRoutes } from './routes/visualizations.js';
```

그리고 라우트 등록 블록(`app.register(dashboardRoutes);` 다음)에 추가:

```typescript
  app.register(visualizationRoutes);
```

- [ ] **Step 3: storage 버킷 HTML-only 확장**

`packages/server/src/routes/storage.ts`의 10번째 줄을 교체:

```typescript
// HTML 전용 버킷 (text/html 만 허용)
const HTML_ONLY_BUCKETS = new Set(['chapter-tools', 'visualizations']);
```

그리고 같은 파일에서 `if (bucket === HTML_TOOL_BUCKET && file.mimetype !== 'text/html') {` 줄을 교체:

```typescript
      if (HTML_ONLY_BUCKETS.has(bucket) && file.mimetype !== 'text/html') {
```

- [ ] **Step 4: 타입체크**

Run: `npm run build -w @mathchois/server`
Expected: 빌드 성공. `HTML_TOOL_BUCKET` 미사용 참조가 남지 않았는지 확인(에러 시 해당 상수 제거).

- [ ] **Step 5: 커밋**

```bash
git add packages/server/src/routes/visualizations.ts packages/server/src/app.ts packages/server/src/routes/storage.ts
git commit -m "feat(server): visualization REST routes + HTML-only bucket"
```

---

## Task 7: 클라이언트 API 래퍼 + 쿼리 빌더 (TDD)

**Files:**
- Create: `packages/client/src/lib/visualizations.js`
- Test: `packages/client/src/lib/visualizations.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/client/src/lib/visualizations.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { buildVisualizationQuery } from './visualizations';

describe('buildVisualizationQuery', () => {
  it('빈 필터는 빈 문자열', () => {
    expect(buildVisualizationQuery({})).toBe('');
  });

  it('값이 있는 필드만 포함', () => {
    const qs = buildVisualizationQuery({ q: '원', subject: '수학', majorUnit: '' });
    const params = new URLSearchParams(qs);
    expect(params.get('q')).toBe('원');
    expect(params.get('subject')).toBe('수학');
    expect(params.has('majorUnit')).toBe(false);
  });

  it('null/undefined/false 는 제외, mine=1 은 포함', () => {
    const qs = buildVisualizationQuery({ minorUnit: null, page: undefined, mine: false });
    expect(qs).toBe('');
    const qs2 = buildVisualizationQuery({ mine: 1, page: 2 });
    const params = new URLSearchParams(qs2);
    expect(params.get('mine')).toBe('1');
    expect(params.get('page')).toBe('2');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm run test -w @mathchois/client -- visualizations`
Expected: FAIL — `buildVisualizationQuery` is not defined (모듈 없음).

- [ ] **Step 3: 라이브러리 구현**

`packages/client/src/lib/visualizations.js`:

```javascript
import { api } from './api';

export function buildVisualizationQuery(filters = {}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v != null && v !== '' && v !== false) params.set(k, String(v));
  }
  return params.toString();
}

export function listVisualizations(filters = {}) {
  const qs = buildVisualizationQuery(filters);
  return api.get(`/api/visualizations${qs ? `?${qs}` : ''}`);
}

export const getVisualization = (id) => api.get(`/api/visualizations/${id}`);
export const getFacets = () => api.get('/api/visualizations/facets');
export const createVisualization = (body) => api.post('/api/visualizations', body);
export const updateVisualization = (id, body) => api.patch(`/api/visualizations/${id}`, body);
export const deleteVisualization = (id) => api.delete(`/api/visualizations/${id}`);

/** visualizations 버킷에 HTML 업로드 → URL 반환 */
export async function uploadVisualizationHtml(file) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await api.upload('/api/files/upload?bucket=visualizations&directory=library', fd);
  return res.url;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm run test -w @mathchois/client -- visualizations`
Expected: PASS (3 tests).

- [ ] **Step 5: 커밋**

```bash
git add packages/client/src/lib/visualizations.js packages/client/src/lib/visualizations.test.js
git commit -m "feat(client): visualizations API wrapper + query builder (tested)"
```

---

## Task 8: 등록/수정 공용 폼 컴포넌트

**Files:**
- Create: `packages/client/src/components/visualizations/VisualizationForm.jsx`

등록(파일 필수)과 수정(파일 선택적 교체)에 모두 쓰는 폼. 저장 성공 시 `onSaved(visualization)` 호출.

- [ ] **Step 1: 컴포넌트 작성**

`packages/client/src/components/visualizations/VisualizationForm.jsx`:

```jsx
import { useState } from 'react';
import { uploadVisualizationHtml, createVisualization, updateVisualization } from '../../lib/visualizations';

/**
 * 시각화자료 등록/수정 폼.
 * props: initial(수정 시 기존 레코드) / onSaved(vis) / onCancel()
 */
export default function VisualizationForm({ initial = null, onSaved, onCancel }) {
  const isEdit = !!initial;
  const [title, setTitle] = useState(initial?.title ?? '');
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [majorUnit, setMajorUnit] = useState(initial?.majorUnit ?? '');
  const [minorUnit, setMinorUnit] = useState(initial?.minorUnit ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!title.trim()) { setError('제목을 입력하세요.'); return; }
    if (!isEdit && !file) { setError('HTML 파일을 선택하세요.'); return; }

    setSaving(true);
    try {
      let htmlUrl = initial?.htmlUrl;
      if (file) htmlUrl = await uploadVisualizationHtml(file);

      const meta = {
        title: title.trim(),
        subject: subject.trim() || null,
        majorUnit: majorUnit.trim() || null,
        minorUnit: minorUnit.trim() || null,
        description: description.trim() || null,
      };

      const saved = isEdit
        ? await updateVisualization(initial.id, file ? { ...meta, htmlUrl } : meta)
        : await createVisualization({ ...meta, htmlUrl });

      onSaved?.(saved);
    } catch (err) {
      setError(err.message ?? '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 whitespace-normal break-keep">
        외부 의존 없이 단독 실행 가능한 standalone HTML 파일만 등록하세요.
      </p>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">제목 *</span>
        <input className="border rounded px-2 min-h-11" value={title}
          onChange={(e) => setTitle(e.target.value)} placeholder="예: 원의 방정식 시각화" />
      </label>

      <div className="flex flex-wrap gap-2">
        <input className="border rounded px-2 min-h-11 text-sm flex-1 min-w-32" placeholder="과목"
          value={subject} onChange={(e) => setSubject(e.target.value)} />
        <input className="border rounded px-2 min-h-11 text-sm flex-1 min-w-32" placeholder="대단원"
          value={majorUnit} onChange={(e) => setMajorUnit(e.target.value)} />
        <input className="border rounded px-2 min-h-11 text-sm flex-1 min-w-32" placeholder="소단원"
          value={minorUnit} onChange={(e) => setMinorUnit(e.target.value)} />
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">설명</span>
        <textarea className="border rounded px-2 py-1" rows={2} value={description}
          onChange={(e) => setDescription(e.target.value)} placeholder="간단한 설명" />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{isEdit ? 'HTML 파일 교체 (선택)' : 'HTML 파일 *'}</span>
        <input type="file" accept=".html,text/html"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        {isEdit && <span className="text-xs text-gray-400">선택하지 않으면 기존 HTML이 유지됩니다.</span>}
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2 justify-end">
        {onCancel && (
          <button type="button" onClick={onCancel}
            className="px-3 min-h-11 border rounded whitespace-nowrap">취소</button>
        )}
        <button type="submit" disabled={saving}
          className="px-4 min-h-11 bg-emerald-600 text-white rounded disabled:opacity-50 whitespace-nowrap">
          {saving ? '저장 중…' : (isEdit ? '수정' : '등록')}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add packages/client/src/components/visualizations/VisualizationForm.jsx
git commit -m "feat(client): VisualizationForm (register/edit)"
```

---

## Task 9: 삽입 모달 컴포넌트

**Files:**
- Create: `packages/client/src/components/visualizations/VisualizationPickerModal.jsx`

`ProblemPickerModal` 패턴. 리스트 모드 + 등록 모드 토글. 선택 또는 등록 완료 시 `onSelect(visualization)`.

- [ ] **Step 1: 컴포넌트 작성**

`packages/client/src/components/visualizations/VisualizationPickerModal.jsx`:

```jsx
import { useEffect, useState, useCallback } from 'react';
import { listVisualizations, getFacets } from '../../lib/visualizations';
import VisualizationForm from './VisualizationForm';

const FILTER_FIELDS = [
  ['subject', '과목'], ['majorUnit', '대단원'], ['minorUnit', '소단원'],
];

/** 시각화자료 선택/등록 모달. onSelect(visualization) / onClose() */
export default function VisualizationPickerModal({ onSelect, onClose }) {
  const [mode, setMode] = useState('list'); // 'list' | 'register'
  const [facets, setFacets] = useState({});
  const [filters, setFilters] = useState({});
  const [q, setQ] = useState('');
  const [result, setResult] = useState({ items: [], total: 0, page: 1, pageSize: 20 });
  const [loading, setLoading] = useState(false);

  useEffect(() => { getFacets().then(setFacets).catch(() => {}); }, []);

  const fetchList = useCallback(async (page = 1) => {
    setLoading(true);
    try { setResult(await listVisualizations({ ...filters, q, page })); }
    finally { setLoading(false); }
  }, [filters, q]);

  useEffect(() => { if (mode === 'list') fetchList(1); }, [fetchList, mode]);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-2" onClick={onClose}>
      <div className="bg-white rounded-lg w-full max-w-3xl max-h-[90dvh] flex flex-col p-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2 gap-2">
          <h3 className="font-bold whitespace-nowrap">{mode === 'list' ? '시각화자료 선택' : '새 HTML 등록'}</h3>
          <div className="flex items-center gap-2">
            {mode === 'list' && (
              <button onClick={() => setMode('register')}
                className="px-3 min-h-11 bg-emerald-600 text-white rounded text-sm whitespace-nowrap">새html등록</button>
            )}
            <button onClick={onClose} className="min-h-11 min-w-11 shrink-0 flex items-center justify-center">✕</button>
          </div>
        </div>

        {mode === 'register' ? (
          <div className="overflow-y-auto">
            <VisualizationForm
              onSaved={(vis) => onSelect(vis)}
              onCancel={() => setMode('list')}
            />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 mb-2">
              {FILTER_FIELDS.map(([key, label]) => (
                <select key={key} className="border rounded px-2 min-h-11 text-sm"
                  value={filters[key] ?? ''}
                  onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.value || undefined }))}>
                  <option value="">{label} 전체</option>
                  {(facets[key] || []).map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              ))}
              <input className="border rounded px-2 min-h-11 text-sm flex-1 min-w-40" placeholder="제목·설명 검색"
                value={q} onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchList(1)} />
            </div>

            <p className="text-xs text-gray-500 mb-1">{loading ? '불러오는 중…' : `총 ${result.total}개`}</p>
            <div className="flex-1 overflow-y-auto flex flex-col gap-2">
              {result.items.map((v) => (
                <div key={v.id} className="border rounded-md p-2">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-medium whitespace-nowrap truncate">{v.title}</span>
                    <button onClick={() => onSelect(v)}
                      className="px-3 min-h-11 bg-blue-600 text-white rounded text-sm whitespace-nowrap">삽입</button>
                  </div>
                  <p className="text-xs text-gray-500 whitespace-nowrap truncate">
                    {[v.subject, v.majorUnit, v.minorUnit].filter(Boolean).join(' · ')}
                  </p>
                  {v.description && <p className="text-xs text-gray-400 truncate">{v.description}</p>}
                </div>
              ))}
              {!loading && result.items.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">등록된 시각화자료가 없습니다.</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add packages/client/src/components/visualizations/VisualizationPickerModal.jsx
git commit -m "feat(client): VisualizationPickerModal (search + register)"
```

---

## Task 10: 관리 페이지 + 라우트 + 사이드바

**Files:**
- Create: `packages/client/src/pages/Visualizations/VisualizationsPage.jsx`
- Modify: `packages/client/src/App.jsx`
- Modify: `packages/client/src/layouts/DashboardLayout.jsx`

- [ ] **Step 1: 관리 페이지 작성**

`packages/client/src/pages/Visualizations/VisualizationsPage.jsx`:

```jsx
import { useEffect, useState, useCallback } from 'react';
import { listVisualizations, getFacets, deleteVisualization } from '../../lib/visualizations';
import VisualizationForm from '../../components/visualizations/VisualizationForm';
import { toolUrl } from '../../lib/toolUrl';

const FILTER_FIELDS = [
  ['subject', '과목'], ['majorUnit', '대단원'], ['minorUnit', '소단원'],
];

export default function VisualizationsPage() {
  const [facets, setFacets] = useState({});
  const [filters, setFilters] = useState({});
  const [q, setQ] = useState('');
  const [result, setResult] = useState({ items: [], total: 0, page: 1, pageSize: 20 });
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);   // 레코드 또는 'new'
  const [preview, setPreview] = useState(null);

  useEffect(() => { getFacets().then(setFacets).catch(() => {}); }, []);

  const fetchList = useCallback(async (page = 1) => {
    setLoading(true);
    try { setResult(await listVisualizations({ ...filters, q, mine: 1, page })); }
    finally { setLoading(false); }
  }, [filters, q]);

  useEffect(() => { if (!editing) fetchList(1); }, [fetchList, editing]);

  const handleDelete = async (v) => {
    if (!confirm(`"${v.title}" 자료를 삭제할까요? (이미 삽입된 챕터 페이지는 유지됩니다)`)) return;
    try {
      await deleteVisualization(v.id);
      fetchList(result.page);
    } catch (err) {
      alert(err.message ?? '삭제에 실패했습니다.');
    }
  };

  if (editing) {
    return (
      <div className="max-w-2xl">
        <h2 className="font-bold mb-3">{editing === 'new' ? '새 시각화자료 등록' : '시각화자료 수정'}</h2>
        <VisualizationForm
          initial={editing === 'new' ? null : editing}
          onSaved={() => setEditing(null)}
          onCancel={() => setEditing(null)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold whitespace-nowrap">시각화자료</h2>
        <button onClick={() => setEditing('new')}
          className="px-3 min-h-11 bg-emerald-600 text-white rounded text-sm whitespace-nowrap">새 html 등록</button>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTER_FIELDS.map(([key, label]) => (
          <select key={key} className="border rounded px-2 py-1 text-sm"
            value={filters[key] ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.value || undefined }))}>
            <option value="">{label} 전체</option>
            {(facets[key] || []).map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        ))}
        <input className="border rounded px-2 py-1 text-sm flex-1 min-w-40" placeholder="제목·설명 검색"
          value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && fetchList(1)} />
        <button onClick={() => fetchList(1)} className="px-3 py-1 bg-blue-600 text-white rounded text-sm whitespace-nowrap">검색</button>
      </div>

      <p className="text-xs text-gray-500">{loading ? '불러오는 중…' : `총 ${result.total}개`}</p>

      <div className="overflow-x-auto border rounded-md max-h-[70dvh] overflow-y-auto">
        <table className="min-w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100">
              {['제목', '과목', '대단원', '소단원', '설명', '등록일', ''].map((h, i) => (
                <th key={h || i}
                  className={`px-3 py-2 text-left whitespace-nowrap sticky top-0 bg-gray-100 z-20 ${i === 0 ? 'left-0 z-30' : ''}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.items.map((v) => (
              <tr key={v.id} className="border-t hover:bg-blue-50">
                <td className="px-3 py-2 whitespace-nowrap sticky left-0 bg-white z-10 max-w-60 truncate">{v.title}</td>
                <td className="px-3 py-2 whitespace-nowrap">{v.subject}</td>
                <td className="px-3 py-2 whitespace-nowrap">{v.majorUnit}</td>
                <td className="px-3 py-2 whitespace-nowrap">{v.minorUnit}</td>
                <td className="px-3 py-2 whitespace-nowrap max-w-60 truncate">{v.description}</td>
                <td className="px-3 py-2 whitespace-nowrap">{(v.createdAt || '').slice(0, 10)}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className="flex gap-2">
                    <button className="text-gray-600 inline-flex items-center min-h-11 px-2 whitespace-nowrap" onClick={() => setPreview(v)}>미리보기</button>
                    <button className="text-blue-600 inline-flex items-center min-h-11 px-2 whitespace-nowrap" onClick={() => setEditing(v)}>수정</button>
                    <button className="text-red-600 inline-flex items-center min-h-11 px-2 whitespace-nowrap" onClick={() => handleDelete(v)}>삭제</button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {result.total > result.pageSize && (
        <div className="flex gap-2 justify-center">
          <button disabled={result.page <= 1} onClick={() => fetchList(result.page - 1)}
            className="px-3 min-h-11 border rounded disabled:opacity-40 whitespace-nowrap">이전</button>
          <span className="px-2 py-1 text-sm flex items-center">{result.page} / {Math.ceil(result.total / result.pageSize)}</span>
          <button disabled={result.page >= Math.ceil(result.total / result.pageSize)} onClick={() => fetchList(result.page + 1)}
            className="px-3 min-h-11 border rounded disabled:opacity-40 whitespace-nowrap">다음</button>
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-2" onClick={() => setPreview(null)}>
          <div className="bg-white rounded-lg w-full max-w-4xl h-[85dvh] flex flex-col p-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-bold whitespace-nowrap truncate">{preview.title}</h3>
              <button onClick={() => setPreview(null)} className="min-h-11 min-w-11 flex items-center justify-center">✕</button>
            </div>
            <iframe src={toolUrl(preview.htmlUrl)}
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals"
              className="flex-1 rounded bg-white border" title="시각화자료 미리보기" />
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: App.jsx에 lazy import + 라우트 추가**

`packages/client/src/App.jsx`에서 `ProblemsPage` lazy import 줄 다음에 추가:

```javascript
const VisualizationsPage = lazy(() => import('./pages/Visualizations/VisualizationsPage'));
```

그리고 `<Route path="/teacher/problems" element={<ProblemsPage />} />` 줄 다음에 추가:

```jsx
              <Route path="/teacher/visualizations" element={<VisualizationsPage />} />
```

- [ ] **Step 3: 사이드바 메뉴 추가**

`packages/client/src/layouts/DashboardLayout.jsx` 상단의 `lucide-react` import에 `LayoutTemplate`를 추가한다(기존 import 목록에 식별자 추가). 그리고 TeacherSidebar의 "문제은행" `Link` 블록(현재 184–195줄) **다음**에 추가:

```jsx
        {/* 시각화자료 */}
        <Link
          to="/teacher/visualizations"
          className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors mb-1 ${
            location.pathname.startsWith('/teacher/visualizations')
              ? 'bg-blue-50 text-blue-700'
              : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          <LayoutTemplate className={`mr-2 h-4 w-4 ${location.pathname.startsWith('/teacher/visualizations') ? 'text-blue-500' : 'text-gray-400'}`} />
          시각화자료
        </Link>
```

- [ ] **Step 4: 빌드/린트 확인**

Run: `npm run lint`
Expected: 신규 파일에 lint 에러 없음.

- [ ] **Step 5: 커밋**

```bash
git add packages/client/src/pages/Visualizations/VisualizationsPage.jsx packages/client/src/App.jsx packages/client/src/layouts/DashboardLayout.jsx
git commit -m "feat(client): visualization management page + route + sidebar"
```

---

## Task 11: Editor HTML 버튼 → 모달 연동

**Files:**
- Modify: `packages/client/src/pages/Chapters/Editor.jsx`

기존 직접 파일 업로드(`htmlInputRef` + `handleUploadHtml`)를 제거하고 HTML 버튼이 모달을 열도록 교체한다.

- [ ] **Step 1: import + 상태 추가**

`packages/client/src/pages/Chapters/Editor.jsx`의 `ProblemPickerModal` import 다음에 추가:

```javascript
import VisualizationPickerModal from '../../components/visualizations/VisualizationPickerModal';
```

`const [showPicker, setShowPicker] = useState(false);` 다음에 추가:

```javascript
  const [showVisPicker, setShowVisPicker] = useState(false);
```

- [ ] **Step 2: handleUploadHtml 제거 + 삽입 핸들러 추가**

`handleUploadHtml` 함수 전체(현재 185–219줄)를 다음으로 교체:

```javascript
  const handleInsertVisualization = async (vis) => {
    setShowVisPicker(false);
    const basePosition = pages.length > 0 ? Math.max(...pages.map((p) => p.position)) + 1 : 0;
    try {
      const newPage = await api.post(`/api/chapters/${id}/pages`, {
        fromVisualizationId: vis.id,
        position: basePosition,
      });
      invalidatePagesCache(id);
      await fetchData();
      if (newPage) setSelectedPage(newPage);
    } catch (err) {
      alert(err.message ?? '시각화자료 삽입에 실패했습니다.');
    }
  };
```

- [ ] **Step 3: HTML 버튼 교체 (input 제거)**

HTML 관련 `<input ref={htmlInputRef} .../>`와 그 버튼(현재 439–453줄)을 다음으로 교체:

```jsx
              <button
                onClick={() => setShowVisPicker(true)}
                disabled={uploading}
                title="HTML 시각화자료 추가"
                className="inline-flex items-center justify-center p-2 border border-transparent rounded-md shadow-sm bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
              >
                <FileCode2 className="h-5 w-5" />
              </button>
```

- [ ] **Step 4: 미사용 ref 정리**

`const htmlInputRef = useRef(null);` 줄(현재 34줄)을 삭제한다. (다른 곳에서 참조하지 않음 — Step 3에서 input을 제거했으므로.)

- [ ] **Step 5: 모달 렌더 추가**

`{showPicker && ( <ProblemPickerModal ... /> )}` 블록 다음에 추가:

```jsx
      {/* ── 시각화자료 선택/등록 모달 ── */}
      {showVisPicker && (
        <VisualizationPickerModal
          onSelect={handleInsertVisualization}
          onClose={() => setShowVisPicker(false)}
        />
      )}
```

- [ ] **Step 6: 빌드/린트 확인**

Run: `npm run lint`
Expected: 에러 없음. 특히 `htmlInputRef` 미사용 경고가 사라졌는지 확인.

- [ ] **Step 7: 커밋**

```bash
git add packages/client/src/pages/Chapters/Editor.jsx
git commit -m "feat(client): chapter HTML button opens visualization picker"
```

---

## Task 12: 수동 검증 + PROJECT_MAP 갱신

**Files:**
- Modify: `.claude/PROJECT_MAP.md`

- [ ] **Step 1: 전체 빌드 확인**

Run: `npm run build`
Expected: shared → client → server 빌드 성공.

- [ ] **Step 2: 수동 E2E 검증 (dev 서버)**

Run: `npm run dev` (server 3001 + client 3000)

교사 계정으로 다음을 순서대로 확인:
1. 사이드바 "시각화자료" → 관리 페이지 진입, [새 html 등록]으로 standalone HTML 등록(제목/과목/대단원/소단원/설명) → 목록에 표시, [미리보기]로 렌더 확인.
2. 챕터 편집(`/teacher/chapters/:id/edit`) → HTML 버튼(FileCode2) → 모달에서 검색·필터로 자료 찾기 → [삽입] → 페이지가 추가되고 미리보기 iframe 렌더 확인.
3. 모달 [새html등록] → 폼 작성 → 등록 즉시 현재 챕터에 삽입되는지 확인.
4. **독립성 검증:** 관리 페이지에서 방금 삽입에 쓴 자료의 HTML을 다른 파일로 [수정](교체) → 1·2에서 삽입한 기존 챕터 페이지는 **이전 내용 그대로** 유지되는지 확인.
5. **권한:** 다른 교사 계정으로 로그인 → 검색 리스트에 1번 자료가 보이고 삽입 가능하나, 관리 페이지(mine=1)에는 보이지 않고 수정/삭제 버튼이 노출되지 않는지 확인.
6. 관리 페이지에서 [삭제] → 레코드/원본 파일 제거되지만 이미 삽입된 챕터 페이지는 유지되는지 확인.

Expected: 6개 항목 모두 통과.

- [ ] **Step 3: PROJECT_MAP 갱신**

`.claude/PROJECT_MAP.md`에 다음을 반영:
- 폴더 구조: `components/visualizations/`, `pages/Visualizations/`, `lib/visualizations.js`, `routes/visualizations.ts`, `services/visualization.service.ts`.
- 클라이언트 라우트 표: `/teacher/visualizations` → VisualizationsPage(DashboardLayout).
- 서버 API 표: `visualizations` 그룹(GET 목록/facets/:id, POST/PATCH/DELETE) + `POST /api/chapters/:chapterId/pages`의 `fromVisualizationId` 옵션.
- 데이터 모델 표: `visualizations` 테이블(createdBy→profiles, title/subject/majorUnit/minorUnit/description/htmlUrl).
- 외부 의존성/버킷: `visualizations` 버킷(HTML 전용, 라이브러리 원본). 페이지 삽입 시 chapter-tools로 복제(독립).
- 주의사항: 시각화자료는 삽입 시 복사본(독립) — 원본 교체/삭제가 기존 페이지에 영향 없음. 수정은 파일교체/단원/설명만(HTML 내부 편집 없음).

- [ ] **Step 4: 커밋**

```bash
git add .claude/PROJECT_MAP.md
git commit -m "docs(map): visualization library structure"
```

---

## Self-Review 결과

**Spec coverage:**
- 라이브러리 저장(제목/과목/대단원/소단원/설명) → Task 1·2·4·6·8. ✓
- standalone 안내 → Task 8 폼 문구. ✓
- HTML 삽입 버튼 → 검색 리스트 먼저 → Task 9·11. ✓
- 우측 상단 [새html등록] → Task 9 모달. ✓
- 등록 + 즉시 삽입 → Task 9(onSaved→onSelect) + Task 11(handleInsertVisualization). ✓
- 모든 교사 공유 / 본인만 수정·삭제 → Task 6(403 가드) + Task 10(mine=1). ✓
- 복사본(독립) → Task 3·5(copyHtmlToChapterTools). ✓
- 텍스트+과목/단원 필터 검색 → Task 4 buildWhere + Task 9 필터. ✓
- 별도 관리 페이지(파일교체/단원/설명 수정, 삭제) → Task 10. ✓

**Type consistency:** `fromVisualizationId`는 Task 5(service/route)·Task 11(client) 모두 동일. `copyHtmlToChapterTools(sourceHtmlUrl, chapterId)` 시그니처는 Task 3 정의·Task 5 호출 일치. `buildVisualizationQuery`/`listVisualizations`는 Task 7 정의·Task 9·10 사용 일치. facets 키(`subject`/`majorUnit`/`minorUnit`)는 Task 4·9·10 일치.

**Placeholder scan:** 없음. 모든 코드 스텝에 완전한 코드 포함.
