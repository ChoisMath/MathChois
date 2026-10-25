# 학급 단원 묶음 (Classroom Units) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 학급의 챕터·영상을 교사가 만든 단원(재생목록 카드)으로 한 단계 묶어 보여 주고, 단원을 학생 목록에서 숨길 수 있게 한다.

**Architecture:** `units` 테이블과 `chapters.unit_id` / `classroom_videos.unit_id`(NULL = 미분류, `ON DELETE SET NULL`)를 추가한다. 숨김 판단·묶기·주소 해석 규칙은 `@mathchois/shared` 순수 함수로 두고, 서버는 학생 요청에서 숨긴 단원의 항목을 목록에서 뺀다. 화면은 공용 `components/units/*` 를 챕터 탭(새로 분리하는 `ChapterTab.jsx`)과 영상 탭이 함께 쓰고, 탭·단원 위치는 주소 쿼리 `?tab=&unit=` 에 둔다.

**Tech Stack:** Fastify 5 · Drizzle ORM 0.45.4 · zod 4.3 · PostgreSQL 16(로컬 검증) · React 19 · React Router 7.18 (`useSearchParams`) · dnd-kit · lucide-react 0.575 · Vitest

**Spec:** `docs/superpowers/specs/2026-10-25-classroom-units-design.md`

## Global Constraints

- 단원 이름 1~100자(앞뒤 공백 제거 후), 설명 0~500자. 상수 `UNIT_TITLE_MAX = 100`, `UNIT_DESCRIPTION_MAX = 500`.
- 주소의 미분류 값은 `'none'` (상수 `UNASSIGNED`).
- 단원 삭제 시 항목은 지우지 않는다(FK `ON DELETE SET NULL`). 학급 삭제 시 단원은 `CASCADE`.
- 숨김은 **목록에서만**: 학생의 챕터 목록·영상 목록·시청 화면 siblings 에서 뺀다. 상세 주소 접근은 막지 않는다.
- 단원이 0개인 학급의 화면은 지금과 같아야 한다(교사에게 [+ 새 단원] 버튼만 추가).
- 새 단원은 맨 뒤(`max(position)+1`). 새 챕터·영상은 지금처럼 맨 앞(0).
- 오류 문구: `이 학급의 단원이 아닙니다`, `단원을 찾을 수 없습니다`, `단원 이름을 입력하세요`.
- 화면 문구: 미분류 카드는 교사 `미분류` / 학생 `기타 자료`. 삭제 확인 `단원만 삭제됩니다. 안에 있던 챕터 {N}개와 영상 {M}개는 미분류로 옮겨집니다.`
- 아이콘만 있는 버튼은 `components/common/IconButton.jsx` (label 필수). 아이콘: 새 단원 `FolderPlus`, 단원 카드 빈 그림 `Library`, 가져오기 `ListPlus`, 숨김 `EyeOff`, 수정 `Pencil`, 삭제 `Trash2`, 뒤로 `ArrowLeft`.
- 스키마 변경은 `schema.ts` + `startupMigrate.ts` 멱등 DDL (drizzle-kit 마이그레이션 파일은 만들지 않는다).
- 서버 zod 는 기존 파일처럼 `z.string().uuid()` 를 쓴다.
- 커밋 메시지는 기존 형식(`feat(units): …` 한국어 요약)과 세션 attribution 줄을 따른다. 커밋·PR 에 모델 이름을 쓰지 않는다.

## Review Focus

1. **공백만 있는 단원 이름 / 101자 이름** → 400 `단원 이름을 입력하세요`·길이 오류, DB 에 행이 생기지 않는다. (Task 2 스모크)
2. **학생이 예전 링크로 숨긴 단원의 영상 시청 화면을 엶** → 화면은 열리지만 siblings 에 숨긴 단원 영상이 없다. (Task 3 스모크)
3. **가져오기에 다른 학급 챕터 id 가 섞임** → 400, 같은 요청의 정상 항목도 옮겨지지 않는다. (Task 3 스모크)
4. **학생 주소 `?tab=videos&unit=X` 인데 X 단원에 영상이 없음(챕터만 있음)** → 단원 목록 화면. (Task 1 단위 테스트)
5. **교사가 단원 안의 마지막 항목을 다른 단원으로 옮김** → 단원 안 화면에 머물고 빈 안내가 보인다. (Task 7 브라우저 스모크)

---

## File Structure

| 파일 | 책임 |
|---|---|
| `shared/src/units/units.ts` (신규) | 상수, `groupByUnit`, `visibleUnits`, `resolveUnitParam`, `unitCountForTab` |
| `shared/src/types/models.ts`, `types/video.ts` | `Unit`, `UnitWithCounts`, `Chapter.unitId`, `ClassroomVideo.unitId` |
| `server/src/db/schema.ts`, `db/startupMigrate.ts` | `units` 테이블, 두 `unit_id` 컬럼 |
| `server/src/services/unit.service.ts` (신규) | 단원 CRUD·순서·일괄 소속 |
| `server/src/routes/units.ts` (신규) | 단원 API 6개 |
| `server/src/services/chapter.service.ts`, `routes/chapters.ts` | `unitId` 입출력, 학생 숨김 필터, 페이지 `imageUrl` |
| `server/src/services/classroomVideo.service.ts`, `routes/classroomVideos.ts` | `unitId` 입출력, 학생 숨김 필터, 단원 siblings |
| `server/scripts/units-smoke.ts` (신규) | 실행 중인 서버 대상 API 스모크 |
| `client/src/lib/units.js` (신규) | 단원 API 래퍼 |
| `client/src/components/classrooms/ChapterTab.jsx` (신규) | `ClassroomDetail` 에서 분리한 챕터 탭(카드·정렬·PDF·생성/가져오기/삭제 모달) |
| `client/src/components/units/*.jsx` (신규) | `UnitCard`, `UnitGrid`, `UnitHeader`, `UnitFormModal`, `UnitDeleteModal`, `UnitSelect`, `UnitItemPickerModal`, `UnitBrowser` |
| `client/src/pages/Classrooms/ClassroomDetail.jsx` | 헤더·탭(주소 쿼리)·단원 목록 로드 |
| `client/src/components/videos/ClassroomVideoTab.jsx`, `pages/Videos/ClassroomVideoWatch.jsx` | 영상 탭 단원 연결, 시청 화면 옆 목록 제목 |
| `client/e2e/units.smoke.mjs` (신규) | 교사·학생 브라우저 흐름 |

---

### Task 1: 공유 단원 규칙과 타입

**Files:**
- Create: `packages/shared/src/units/units.ts`
- Modify: `packages/shared/src/index.ts`, `packages/shared/src/types/models.ts`, `packages/shared/src/types/video.ts`
- Test: `packages/client/src/lib/units.test.js`

**Interfaces:**
- Produces (모두 `@mathchois/shared` 에서 export):
  - `UNASSIGNED = 'none'`, `UNIT_TITLE_MAX = 100`, `UNIT_DESCRIPTION_MAX = 500`
  - `type UnitTab = 'chapters' | 'videos'`
  - `interface Unit { id; classroomId; title; description: string | null; position: number; isHidden: boolean; createdAt: string }`
  - `interface UnitWithCounts extends Unit { chapterCount: number; videoCount: number }`
  - `Chapter.unitId?: string | null`, `ClassroomVideo.unitId: string | null`
  - `groupByUnit<T extends { unitId?: string | null }>(units: { id: string }[], items: T[]): { byUnit: Map<string, T[]>; unassigned: T[] }` — 모든 단원 id 에 대해 빈 배열이라도 키가 있다. 입력 순서 유지.
  - `unitCountForTab(unit: { chapterCount: number; videoCount: number }, tab: UnitTab): number`
  - `visibleUnits<U extends { id: string; isHidden: boolean; position: number }>(units: U[], counts: Map<string, number>, isTeacher: boolean): U[]` — position 오름차순. 학생: `isHidden` 제외 + `(counts.get(id) ?? 0) === 0` 제외.
  - `resolveUnitParam(param: string | null, visibleUnitIds: string[], hasUnassigned: boolean): string | null`

- [ ] **Step 1: 실패하는 테스트 작성** — `units.test.js` (`import { … } from '@mathchois/shared'`, `classroomColorShared.test.js` 와 같은 방식)

```js
const U = (id, position, isHidden = false) => ({ id, position, isHidden });
describe('groupByUnit', () => {
  it('단원별로 묶고 unitId 없음/모르는 단원은 미분류', () => {
    const { byUnit, unassigned } = groupByUnit([{ id: 'u1' }, { id: 'u2' }],
      [{ id: 'a', unitId: 'u1' }, { id: 'b', unitId: null }, { id: 'c', unitId: 'gone' }, { id: 'd' }]);
    expect(byUnit.get('u1').map((x) => x.id)).toEqual(['a']);
    expect(byUnit.get('u2')).toEqual([]);
    expect(unassigned.map((x) => x.id)).toEqual(['b', 'c', 'd']);
  });
});
describe('visibleUnits', () => {
  const units = [U('u2', 1), U('u1', 0), U('h', 2, true), U('empty', 3)];
  const counts = new Map([['u1', 2], ['u2', 1], ['h', 5]]);
  it('교사: 전부 position 순', () => {
    expect(visibleUnits(units, counts, true).map((u) => u.id)).toEqual(['u1', 'u2', 'h', 'empty']);
  });
  it('학생: 숨김·0개 제외', () => {
    expect(visibleUnits(units, counts, false).map((u) => u.id)).toEqual(['u1', 'u2']);
  });
});
describe('unitCountForTab', () => {
  it('탭별 개수', () => {
    expect(unitCountForTab({ chapterCount: 3, videoCount: 1 }, 'chapters')).toBe(3);
    expect(unitCountForTab({ chapterCount: 3, videoCount: 1 }, 'videos')).toBe(1);
  });
});
describe('resolveUnitParam', () => {
  it('보이는 단원 id 는 그대로', () => expect(resolveUnitParam('u1', ['u1'], false)).toBe('u1'));
  it('없거나 보이지 않는 단원은 null', () => expect(resolveUnitParam('h', ['u1'], true)).toBeNull());
  it("'none' 은 미분류가 있을 때만", () => {
    expect(resolveUnitParam(UNASSIGNED, ['u1'], true)).toBe(UNASSIGNED);
    expect(resolveUnitParam(UNASSIGNED, ['u1'], false)).toBeNull();
  });
  it('null/빈 값은 null', () => {
    expect(resolveUnitParam(null, ['u1'], true)).toBeNull();
    expect(resolveUnitParam('', ['u1'], true)).toBeNull();
  });
  it('학생 영상 탭: 챕터만 있는 단원은 visible 에 없으므로 null (Review Focus 4)', () => {
    const units = [U('x', 0)];
    const videoCounts = new Map([['x', 0]]);
    const ids = visibleUnits(units, videoCounts, false).map((u) => u.id);
    expect(resolveUnitParam('x', ids, false)).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npm test -w @mathchois/client -- src/lib/units.test.js` / Expected: FAIL (`groupByUnit` 등이 export 되지 않음)

- [ ] **Step 3: `shared/src/units/units.ts` 구현, `index.ts` 에 `export * from './units/units.js';`, 타입 추가** — `Unit`·`UnitWithCounts` 는 `types/models.ts` 의 `Chapter` 아래에 둔다. `ClassroomVideo` 에 `/** 소속 단원. 단원 삭제 시 FK SET NULL */ unitId: string | null;`.

- [ ] **Step 4: 통과 확인** — Run: `npm test -w @mathchois/client -- src/lib/units.test.js && npm run typecheck -w @mathchois/shared` / Expected: PASS, 타입 오류 없음

- [ ] **Step 5: Commit** — `feat(units): 단원 공유 규칙(묶기·보이는 단원·주소 해석)과 타입`

---

### Task 2: DB 스키마 + 단원 API

**Files:**
- Modify: `packages/server/src/db/schema.ts` (`classroomVideos` 위에 `units`; `chapters`·`classroomVideos` 에 `unitId`)
- Modify: `packages/server/src/db/startupMigrate.ts` (`backfillClassroomColors` 호출 전에 DDL 블록 + `log.info('startup migration: units ensured')`)
- Create: `packages/server/src/services/unit.service.ts`, `packages/server/src/routes/units.ts`
- Modify: `packages/server/src/app.ts` (`app.register(unitRoutes)` — `classroomVideoRoutes` 다음)
- Create: `packages/server/scripts/units-smoke.ts`

**Interfaces:**
- Consumes: Task 1 의 `UNIT_TITLE_MAX`, `UNIT_DESCRIPTION_MAX`, `UnitWithCounts`
- Produces:
  - schema: `export const units = pgTable('units', { id, classroomId, title, description, position, isHidden: boolean('is_hidden').notNull().default(false), createdAt }, (t) => [index('idx_units_classroom').on(t.classroomId, t.position)])`; `chapters.unitId = uuid('unit_id').references((): any => units.id, { onDelete: 'set null' })` + `index('idx_chapters_unit')`; `classroomVideos.unitId` 동일 + `index('idx_classroom_videos_unit')`. (`units` 는 `chapters` 보다 아래에 정의되므로 `(): any =>` 지연 참조.)
  - `unit.service.ts`:
    - `listUnits(classroomId: string, opts: { includeHidden: boolean }): Promise<UnitWithCounts[]>` — 개수는 상관 서브쿼리 `count(*)::int`
    - `getUnitById(id: string): Promise<Unit | null>`
    - `createUnit(classroomId: string, data: { title: string; description: string | null; isHidden: boolean }): Promise<Unit>` — position = `COALESCE(MAX(position), -1) + 1`
    - `updateUnit(id: string, patch: { title?: string; description?: string | null; isHidden?: boolean }): Promise<Unit | null>`
    - `deleteUnit(id: string): Promise<void>`
    - `reorderUnits(classroomId: string, ids: string[]): Promise<boolean>` — ids 집합이 학급 단원 집합과 다르면 false, 아니면 트랜잭션으로 position = index
    - `isUnitInClassroom(unitId: string, classroomId: string): Promise<boolean>`
    - `assignItemsToUnit(unitId: string, classroomId: string, items: { chapterIds: string[]; classroomVideoIds: string[] }): Promise<boolean>` — 트랜잭션. 각 UPDATE 를 `classroom_id = classroomId AND id IN (...)` 로 걸고 `returning` 개수가 요청 개수와 다르면 throw 해서 롤백 → false
  - `routes/units.ts` `export async function unitRoutes(app)` — 스펙 표의 6개 경로. 목록 접근 규칙은 `classroomVideos.ts` 의 `canAccessClassroom` 과 같다(교사=소유자, 학생=멤버). 학생이면 `includeHidden: false`.
  - zod 본문: `title: z.string().trim().min(1, '단원 이름을 입력하세요').max(UNIT_TITLE_MAX)`, `description: z.string().trim().max(UNIT_DESCRIPTION_MAX).nullable().optional()` (빈 문자열 → null), `isHidden: z.boolean().optional()`. zod 실패는 400 `{ error: 첫 issue message }`.

- [ ] **Step 1: 스모크 스크립트 작성(실패 상태)** — `scripts/units-smoke.ts`, `wb-smoke.ts` 의 `check`/`api` 헬퍼 패턴을 그대로 쓴다. 준비: `seed:test` 계정(`test.teacher@chois.test`, `test.student@chois.test`, 학급 `TEST0001`) 토큰을 `signAccessToken` 으로 만들고, 시작 시 그 학급의 기존 단원을 지운다. 검사:
  - 교사 POST `{ title: '1단원 다항식' }` → 201, `position === 0`; 두 번째 → `position === 1`
  - POST `{ title: '   ' }` → 400, `error === '단원 이름을 입력하세요'`; `'가'.repeat(101)` → 400; 그 뒤 GET 개수 2 (Review Focus 1)
  - 학생 POST → 403
  - PATCH `{ isHidden: true }` 두 번째 단원 → 200; 학생 GET → 1개, 교사 GET → 2개, 각 원소에 `chapterCount`·`videoCount` 숫자
  - PUT reorder 역순 → 200, GET 순서 반대; ids 1개만 → 400
  - DELETE → 204; 다시 PATCH → 404 `단원을 찾을 수 없습니다`
  - 다른 교사(스크립트가 `ensureUser('units.other@chois.test', …, 'teacher')`)로 PATCH → 403

- [ ] **Step 2: 실패 확인** — 로컬 DB 준비 후 실행:
  ```bash
  # (한 번만) 로컬 PostgreSQL 16 (클라우드 컨테이너에 설치되어 있음, root 로 실행)
  service postgresql start
  su postgres -c "psql -c \"ALTER USER postgres PASSWORD 'postgres'\" -c 'CREATE DATABASE mathchois_dev'"
  # packages/server/.env (커밋하지 않음): DATABASE_URL=postgres://postgres:postgres@localhost:5432/mathchois_dev,
  #   JWT_SECRET / JWT_REFRESH_SECRET (16자 이상 임의 값), GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET=dummy,
  #   VOLUME_PATH=./local-storage, PORT=3001, NODE_ENV=development
  # 스키마는 서버 기동 시 startupMigrate 가 만든다. 기존 테이블이 없으면 먼저: npm run db:push -w @mathchois/server
  npm run seed:test -w @mathchois/server && npm run dev:server &
  cd packages/server && npx tsx --env-file=.env scripts/units-smoke.ts
  ```
  Expected: `✗` (404 Route not found), exit 1

- [ ] **Step 3: 스키마·DDL·서비스·라우트 구현** — DDL 은 스펙 "데이터 모델" 블록 그대로(`units` 생성 → 두 ALTER → 인덱스 순).

- [ ] **Step 4: 통과 확인** — 서버 재시작 후 같은 스모크 / Expected: 모든 줄 `✓`, exit 0. 이어서 `npm run build -w @mathchois/server` / Expected: tsc 오류 없음

- [ ] **Step 5: Commit** — `feat(units): units 테이블·단원 API(목록·생성·수정·삭제·순서)`

---

### Task 3: 챕터·영상의 단원 연결과 학생 숨김 필터

**Files:**
- Modify: `packages/server/src/services/chapter.service.ts`, `packages/server/src/routes/chapters.ts`
- Modify: `packages/server/src/services/classroomVideo.service.ts`, `packages/server/src/routes/classroomVideos.ts`
- Modify: `packages/server/src/routes/units.ts` (`POST /api/units/:id/items`)
- Modify: `packages/server/scripts/units-smoke.ts`

**Interfaces:**
- Consumes: Task 2 `units`, `isUnitInClassroom`, `assignItemsToUnit`
- Produces:
  - `getChaptersByClassroom(classroomId: string, opts?: { studentView?: boolean })` — `studentView` 이면 `.leftJoin(units, eq(chapters.unitId, units.id))` + `or(isNull(chapters.unitId), eq(units.isHidden, false))`, select 는 `getTableColumns(chapters)`. 페이지 select 에 `imageUrl: pages.imageUrl` 추가.
  - `createChapter(data: { …기존; unitId?: string | null })`, `updateChapter(id, data: { title?; description?; unitId?: string | null })`
  - `classroomVideoSelect.unitId`; `listClassroomVideos(classroomId, opts?: { studentView?: boolean })` (같은 left join 필터)
  - `addClassroomVideo(classroomId, videoId, addedBy, note?, unitId?: string | null)`; `ClassroomVideoPatch.unitId?: string | null`
  - `getClassroomVideoDetail(id, opts?: { studentView?: boolean })` → `{ …cv, classroom, unit: { id; title } | null, siblings }` — siblings = `listClassroomVideos(classroomId, opts)` 에서 자기 제외, `cv.unitId` 가 있으면 같은 `unitId` 만.
  - 라우트: 학생 판단 `req.user.role === 'student'`. `unitId` 가 있으면 `isUnitInClassroom(unitId, 대상 학급)` 아니면 400 `이 학급의 단원이 아닙니다`. 챕터 import 는 `Body.unitId` 를 **대상 학급** 기준으로 검사. `POST /api/units/:id/items` 본문 `{ chapterIds?: uuid[], classroomVideoIds?: uuid[] }`(최대 200개씩), `assignItemsToUnit` 이 false 면 400 `이 학급의 항목이 아닙니다`, 성공 시 `{ ok: true }`.

- [ ] **Step 1: 스모크에 검사 추가(실패 상태)** — 준비: 학급에 챕터 3개(`createChapter` 직접 호출 또는 API), 영상 라이브러리 1개 + 학급 배정 2개, 다른 학급(다른 교사) 챕터 1개.
  - POST 챕터 `{ title, unitId: u1 }` → 201, `unitId === u1`
  - PATCH 챕터 `{ unitId: 다른학급단원 }` → 400 `이 학급의 단원이 아닙니다`; `{ unitId: null }` → 200 `unitId === null`
  - POST `/api/units/u1/items` `{ chapterIds: [c1, c2], classroomVideoIds: [cv1] }` → 200; GET 목록에서 세 항목 `unitId === u1`
  - POST items `{ chapterIds: [c3, 다른학급챕터] }` → 400, 그 뒤 c3 `unitId === null` (Review Focus 3)
  - u1 숨김 → 학생 GET chapters 에 c1·c2 없음, 교사 GET 에는 있음; 학생 GET videos 에 cv1 없음
  - cv2 를 미분류로 두고 학생 GET `/api/classroom-videos/cv1` → 200, `siblings` 에 cv1 단원(숨김) 영상 없음 (Review Focus 2); 교사 GET cv1 → `unit.id === u1`, siblings 는 같은 단원만
  - 챕터 GET 응답의 `pages[0]` 에 `imageUrl` 키 존재
  - DELETE u1 → c1·c2·cv1 `unitId === null`
- [ ] **Step 2: 실패 확인** — 같은 명령 / Expected: 새 검사 `✗`
- [ ] **Step 3: 서비스·라우트 변경 구현**
- [ ] **Step 4: 통과 확인** — 스모크 전부 `✓` + `npm run build -w @mathchois/server` 오류 없음
- [ ] **Step 5: Commit** — `feat(units): 챕터·영상 단원 소속, 학생 숨김 필터, 단원 기준 다른 영상`

---

### Task 4: 클라이언트 단원 API + 챕터 탭 분리 + 탭 주소화 (동작 변화 없음)

**Files:**
- Create: `packages/client/src/lib/units.js`
- Create: `packages/client/src/components/classrooms/ChapterTab.jsx`
- Modify: `packages/client/src/pages/Classrooms/ClassroomDetail.jsx`

**Interfaces:**
- Produces:
  - `lib/units.js`: `listUnits(cid)`, `createUnit(cid, { title, description, isHidden })`, `updateUnit(id, patch)`, `deleteUnit(id)`, `reorderUnits(cid, ids)` (PUT `{ ids }`), `addItemsToUnit(id, { chapterIds, classroomVideoIds })` — `lib/videos.js` 처럼 `api` 래퍼 한 줄씩.
  - `ChapterTab({ classroomId, isTeacher, onCountChange? })` — `ClassroomDetail` 의 챕터 로드·`SortableChapterCard`·정렬·드래그·학생 PDF·새 챕터 모달(직접 만들기/가져오기)·챕터 삭제 모달을 그대로 옮긴다. 헤더의 [+ 새 챕터] 버튼은 탭 툴바(정렬 칸 옆, `IconButton icon={Plus} label="새 챕터" variant="primary"`)로 옮긴다.
  - `ClassroomDetail`: `const [searchParams, setSearchParams] = useSearchParams()`; `activeTab = searchParams.get('tab') ?? 'chapters'` (알 수 없는 값 → `'chapters'`); 탭 클릭 시 `setSearchParams(next, { replace: true })` 로 `tab` 만 바꾸고 `unit` 은 유지. 헤더는 [+ 새 게시글]·삭제·나가기만 남는다.

- [ ] **Step 1: 분리 전 기준 확인** — Run: `npm run lint && npm test -w @mathchois/client && npm run build -w @mathchois/client` / Expected: 모두 통과(기준선)
- [ ] **Step 2: `lib/units.js` 작성, `ChapterTab.jsx` 로 옮기기, `ClassroomDetail` 탭 주소화**
- [ ] **Step 3: 확인** — Step 1 명령 다시 / Expected: 통과. `ClassroomDetail.jsx` 400줄 이하. `npm run dev` 후 교사 로그인 → 챕터 탭 새 챕터 생성·드래그·삭제, 학생 → 챕터 열기 → 뒤로 가기 시 `?tab=chapters` 유지, 영상 탭에서 영상 열고 뒤로 → 영상 탭으로 돌아옴
- [ ] **Step 4: Commit** — `refactor(classroom): 챕터 탭을 ChapterTab 으로 분리, 탭을 주소 쿼리로 기억`

---

### Task 5: 단원 공용 화면 컴포넌트

**Files:**
- Create: `packages/client/src/components/units/UnitCard.jsx`, `UnitGrid.jsx`, `UnitHeader.jsx`, `UnitFormModal.jsx`, `UnitDeleteModal.jsx`, `UnitSelect.jsx`, `UnitItemPickerModal.jsx`, `UnitBrowser.jsx`

**Interfaces:**
- Consumes: Task 1 shared 함수, Task 4 `lib/units.js`
- Produces:
  - `UnitCard({ unit, tab, isTeacher, count, cover, sortable, onOpen, onEdit, onDelete })` — `cover` = 이미지 URL | null(없으면 `Library` 아이콘). 겹친 카드 배경(뒤에 `translate` 된 두 장). 숨김이면 `opacity-60` + `EyeOff` 배지 "숨김". 이름 `line-clamp-2`, 설명 `line-clamp-2`, 개수 `챕터 {n}개`/`영상 {n}개`.
  - `UnitGrid({ units, tab, isTeacher, countOf(unit), coverOf(unit), unassignedCount, unassignedCover, onOpen(unitIdOrNone), onCreate, onEdit, onDelete, onReorder(ids) })` — `CARD_GRID`; 교사·dnd-kit `rectSortingStrategy` 로 단원 카드 순서 변경(미분류·새 단원 카드는 정렬 대상 아님). 미분류 카드는 `unassignedCount > 0` 일 때만, 이름 교사 `미분류`/학생 `기타 자료`.
  - `UnitHeader({ title, description, onBack, children })` — `IconButton icon={ArrowLeft} label="단원 목록"` + 글자 `단원 목록`, 오른쪽 `children`(탭별 버튼).
  - `UnitFormModal({ initial?, onSubmit({ title, description, isHidden }), onClose })` — 이름 `maxLength={UNIT_TITLE_MAX}`, 설명 `maxLength={UNIT_DESCRIPTION_MAX}`, "학생에게 숨김" 체크. 빈 이름이면 저장 버튼 disabled.
  - `UnitDeleteModal({ unit, onConfirm, onClose })` — Global Constraints 의 삭제 문구.
  - `UnitSelect({ units, value, onChange(unitIdOrNull) })` — `<select>` "미분류" + 단원들(position 순), `min-h-9`, `onClick` stopPropagation. 영상 카드의 "필기 챕터" select 와 같은 클래스.
  - `UnitItemPickerModal({ title, items, renderLabel(item), onSubmit(ids), onClose })` — 체크 목록, "N개 넣기" 버튼, 비었으면 "미분류 항목이 없습니다".
  - `UnitBrowser({ tab, units, items, isTeacher, unitParam, onUnitParamChange(next|null), coverOfItem(item), onUnitsChanged(), renderItems(filteredItems, ctx), toolbar(ctx) })` — 두 탭이 공유하는 상태 기계. `ctx = { unitId: string | null /* null = 미분류 */, unit }`.
    - `units.length === 0` → `renderItems(items, { unitId: null, unit: null, flat: true })` 그대로(기존 화면) + 교사 `toolbar` 에 [+ 새 단원].
    - 아니면 `groupByUnit` → `counts` → `visibleUnits` → `resolveUnitParam(unitParam, …)`; null 이면 `UnitGrid`, 아니면 `UnitHeader` + `renderItems(그 단원 항목, ctx)`. 항목 0개면 빈 안내 `이 단원에 챕터가 없습니다`/`이 단원에 영상이 없습니다` (Review Focus 5).
    - 단원 생성·수정·삭제·순서 변경 후 `onUnitsChanged()`. 삭제·수정 404 → `alert('단원을 찾을 수 없습니다')` 후 `onUnitsChanged()`. 순서 변경은 낙관적 갱신, 실패 시 `onUnitsChanged()`.

- [ ] **Step 1: 컴포넌트 작성** (이 Task 는 로직이 Task 1 shared 함수에 있으므로 새 단위 테스트 없음)
- [ ] **Step 2: 확인** — Run: `npm run lint && npm run build -w @mathchois/client` / Expected: 오류 없음
- [ ] **Step 3: Commit** — `feat(units): 단원 카드·격자·머리·모달·선택 칸 공용 컴포넌트`

---

### Task 6: 챕터 탭·영상 탭·시청 화면에 단원 연결

**Files:**
- Modify: `packages/client/src/pages/Classrooms/ClassroomDetail.jsx` (단원 목록 로드·전달)
- Modify: `packages/client/src/components/classrooms/ChapterTab.jsx`
- Modify: `packages/client/src/components/videos/ClassroomVideoTab.jsx`
- Modify: `packages/client/src/pages/Videos/ClassroomVideoWatch.jsx`
- Modify: `packages/client/src/lib/videos.js` (`addClassroomVideo(classroomId, videoId, note, unitId)`)

**Interfaces:**
- Consumes: Task 5 `UnitBrowser`, `UnitSelect`, `UnitItemPickerModal`; Task 4 `lib/units.js`; Task 3 응답 필드 `unitId`, `pages[].imageUrl`, 상세 `unit`
- Produces:
  - `ClassroomDetail`: `units` 상태 + `reloadUnits()` (`listUnits` 실패 시 `[]`). 탭 진입·`visibilitychange` 시 다시 읽는다. `unitParam = searchParams.get('unit')`, `setUnitParam(next)` = `unit` 키 set/delete(`replace: false` → 뒤로 가기로 단원 목록 복귀). 두 탭에 `units`, `unitParam`, `onUnitParamChange`, `onUnitsChanged` props.
  - `ChapterTab`: `UnitBrowser tab="chapters"`; `coverOfItem = (ch) => ch.pages?.[0]?.imageUrl ?? null`; 교사 카드에 `UnitSelect`(낙관적 `PATCH /api/chapters/:id { unitId }`, 실패 시 되돌리고 `alert(err.message ?? '단원을 바꾸지 못했습니다.')`, 성공 후 `onUnitsChanged()`); 툴바: 정렬 칸, [+ 새 챕터](현재 단원 id 를 `unitId` 로), 단원 안에서 `IconButton icon={ListPlus} label="기존 항목 가져오기"`(미분류 챕터 → `addItemsToUnit`); 새 챕터 모달 '가져오기' 탭도 `unitId` 전달. 드래그 정렬은 걸러진 목록 안에서만, `PUT /api/chapters/reorder` 에 그 항목만.
  - `ClassroomVideoTab({ classroomId, isTeacher, units, unitParam, onUnitParamChange, onUnitsChanged })`: 같은 방식. `coverOfItem = (cv) => cv.video.thumbnailUrl ?? null`; 카드 `UnitSelect` 는 "필기 챕터" 줄 위; `reorderClassroomVideos` 는 걸러진 id 만; [+ 영상 추가] → `addClassroomVideo(cid, video.id, undefined, 현재 단원 id)`.
  - `ClassroomVideoWatch`: `detail.unit` 이 있으면 옆 목록 제목 `이 단원의 다른 영상 · {detail.unit.title}`, 없으면 기존 `이 학급의 다른 영상`.

- [ ] **Step 1: 구현**
- [ ] **Step 2: 확인** — Run: `npm run lint && npm test -w @mathchois/client && npm run build` / Expected: 모두 통과
- [ ] **Step 3: 손 확인** (Task 2 의 로컬 DB·`npm run dev`) — 교사: 단원 0개 학급은 기존 격자 + [+ 새 단원]; 단원 생성 → 카드; 단원 안 [+ 새 챕터] 가 그 단원에 들어감; 영상 탭 전환 시 같은 단원 유지; 숨김 → 흐린 카드. 학생: 숨긴 단원 안 보임, 챕터 열고 뒤로 → 같은 단원 화면.
- [ ] **Step 4: Commit** — `feat(units): 챕터·영상 탭 단원 재생목록 화면, 카드별 단원 선택, 기존 항목 가져오기`

---

### Task 7: 브라우저 스모크 + 문서

**Files:**
- Create: `packages/server/scripts/units-e2e-setup.ts`, `packages/client/e2e/units.smoke.mjs`
- Modify: `CLAUDE.md`, `.claude/PROJECT_MAP.md`

**Interfaces:**
- Consumes: 앞 Task 전부
- Produces: `units-e2e-setup.ts` — `wb-e2e-setup.ts` 의 `ensureUser` 패턴. 교사·학생·학급(`TEST0001`) 기준으로 기존 단원 삭제 → 단원 `u1`(보임)·`u2`(보임)·`uh`(숨김) 생성, 챕터 4개(u1 에 2개 — 각 1페이지, u2 에 1개, 미분류 1개), uh 에 챕터 1개, 영상 배정 1개(u1). id 들을 JSON 출력, `--cleanup` 지원.

- [ ] **Step 1: 스모크 작성** — `whiteboard.smoke.mjs` 의 `session`/`check` 패턴. 검사:
  - 학생 `/student/classrooms/{cid}` → 단원 카드 2장(`u1`, `u2`) + `기타 자료`, `uh` 이름 없음
  - `u1` 클릭 → 주소에 `unit=u1`, 챕터 카드 2개 → 첫 카드 클릭 → 뷰어 → `page.goBack()` → 다시 `u1` 안 화면
  - 영상 탭 클릭 → 주소 `tab=videos&unit=u1`, 영상 카드 1개
  - 교사 `/teacher/classrooms/{cid}` → `uh` 카드에 `숨김` 배지
  - 교사 `u2` 안 → 유일한 챕터의 단원 선택을 `u1` 로 → `u2` 안 화면 유지, `이 단원에 챕터가 없습니다` 보임 (Review Focus 5)
  - 콘솔 오류 0개
- [ ] **Step 2: 실행** — Run:
  ```bash
  # SCRATCH = 세션 스크래치 디렉터리(저장소 밖)
  cd packages/server && npx tsx --env-file=.env scripts/units-e2e-setup.ts > "$SCRATCH/units.json"
  npm run dev   # 루트, 다른 셸
  cd packages/client && node e2e/units.smoke.mjs "$SCRATCH/units.json" "$SCRATCH/shots"
  ```
  Expected: 모든 줄 `✓`, exit 0. 실패하면 원인을 고치고 다시.
- [ ] **Step 3: 문서** — `CLAUDE.md` "Beyond annotation" 문단 뒤에 한 줄: 학급 단원(`units`; `chapters.unit_id`/`classroom_videos.unit_id`, 숨김은 목록에서만, `components/units/`, 스펙 경로). Data model 테이블 목록에 `units`. `PROJECT_MAP.md` 에 테이블·라우트(`routes/units.ts`)·컴포넌트(`components/units/*`, `classrooms/ChapterTab`)·스크립트 2개.
- [ ] **Step 4: 최종 확인** — Run: `npm run lint && npm test -w @mathchois/client && npm run build` + 서버 스모크 / Expected: 모두 통과
- [ ] **Step 5: Commit & push** — `test(units): 단원 브라우저 스모크, 문서 갱신` → `git push -u origin claude/eloquent-wozniak-wtf1q7`
