# 단원 불러오기·내보내기 + 필기 챕터 단원 필터 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 영상 카드의 필기 챕터 선택지를 같은 단원 챕터로 좁히고, 여러 단원을 여러 학급으로 통째로 복사(단원·챕터·영상 배정·필기 연결, 겹치면 합치기)하는 API와 화면을 만든다.

**Architecture:** 무엇을 새로 만들고/옮기고/합칠지는 DB 없는 순수 함수 `planUnitCopy`(shared)가 정하고 Vitest 로 검증한다. 서버 `services/unitCopy.service.ts` 는 대상 학급마다 트랜잭션 하나에서 그 계획을 실행한다(새 id 매핑·필기 연결 잇기). 화면은 `UnitBrowser` 에 붙는 `UnitTransferModal` 하나가 불러오기·내보내기를 모두 맡는다.

**Tech Stack:** Fastify 5 + Drizzle ORM 0.45 + PostgreSQL, zod, React 19 + Tailwind 4, lucide-react 0.575, Vitest, Playwright(e2e 스모크).

**Spec:** `docs/superpowers/specs/2026-10-28-unit-transfer-design.md`

## Global Constraints

- 원본·대상 학급 모두 요청 교사 소유. 원본 단원들은 한 학급 것. 대상에 원본 학급 포함 금지.
- `unitIds` 1..50, `targetClassroomIds` 1..50 (uuid, 중복 제거).
- 이름 비교는 `titleKey`(NFC·앞뒤 공백 제거·연속 공백 하나로, 대소문자 구분) — 단원·챕터 모두.
- 대상 학급마다 트랜잭션 하나 + `pg_advisory_xact_lock(hashtext('chapter-title:' || classroomId))` (챕터 가져오기 `createChapterUnlessTitleTaken` 과 같은 키).
- 새 챕터는 연결 챕터: `sourceChapterId = 원본.sourceChapterId ?? 원본.id`, `title`·`description` 복사.
- 새 단원: 맨 뒤(`max(position)+1` 부터 원본 순서대로), 이름·설명·숨김 복사. 합칠 때 대상 단원의 이름·설명·숨김은 그대로.
- 새 챕터·새 배정: 맨 앞(`0..n-1`, 원본 순서), 기존 항목 `position += n`. 옮긴 항목은 `unitId` 만 바꾼다.
- 기존 배정의 `note` 는 비어 있을 때(null 또는 공백뿐)만 원본 메모로 채운다. 기존 `chapterId` 는 덮어쓰지 않는다.
- 복사하지 않는 것: 댓글, 시청 기록, 필기, 미분류 항목.
- 아이콘 버튼은 `components/common/IconButton.jsx`(`label` 필수). 불러오기 `FolderInput`, 내보내기 `FolderOutput`.
- 화면 문구는 한국어. 결과 한 줄 형식: `{학급}: 단원 새로 a · 합침 b / 챕터 추가 c · 옮김 d / 영상 추가 e · 옮김 f` (+ `· 필기 챕터 연결 못 함 g` 는 g>0 일 때).

### 로컬 검증 환경 (Task 3·4 스모크용, 커밋하지 않음)

```bash
pg_ctlcluster 16 main start
su postgres -c "psql -c \"ALTER USER postgres PASSWORD 'postgres';\" -c 'CREATE DATABASE mathchois_qa;'"   # 이미 있으면 오류 무시
# packages/server/.env (gitignore 됨): DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/mathchois_qa,
#   JWT_SECRET/JWT_REFRESH_SECRET 16자 이상 아무 값, GOOGLE_CLIENT_ID/SECRET=dummy, VOLUME_PATH=./local-storage, PORT=3001, NODE_ENV=development
npm run db:push -w @mathchois/server -- --force
npm run dev   # 3000(Vite) + 3001(서버), /api/health 200 을 기다린다
```

## Review Focus

1. **원본 단원 안에 같은 이름 챕터가 둘**(챕터 중복 금지 규칙 이전에 생긴 것) → 대상에는 하나만 생긴다. (Task 1 테스트)
2. **선택한 원본 단원 둘의 이름이 같음** → 대상에 단원 하나로 합쳐지고 `unitsCreated` 는 1. (Task 1 테스트)
3. **원본 영상의 필기 챕터가 그 단원 밖(다른 단원·미분류) 챕터** → 대상에 같은 이름 챕터가 있으면 잇고, 없으면 `linksUnresolved` 에 센다(그 챕터를 따라 복사하지 않음). (Task 1 테스트)
4. **대상에 이미 배정된 영상이 다른 단원에 있고 메모·필기 연결도 있음** → 단원만 옮기고 메모·연결은 유지, `linksUnresolved` 에 세지 않는다. (Task 1 테스트)
5. **같은 단원을 같은 학급으로 두 번 내보냄** → 두 번째는 `unitsCreated/chaptersCreated/videosCreated` 모두 0, 개수 그대로. (Task 3 스모크)

---

## File Structure

| 파일 | 책임 |
|---|---|
| `packages/shared/src/chapter/title.ts` (수정) | `titleKey` 일반화, `chapterTitleKey` 는 별칭으로 유지 |
| `packages/shared/src/units/copyPlan.ts` (신규) | `planUnitCopy` — 복사 계획 순수 함수 |
| `packages/shared/src/index.ts` (수정) | `copyPlan` export |
| `packages/client/src/lib/unitCopyPlan.test.js` (신규) | `planUnitCopy` Vitest |
| `packages/client/src/lib/chapterTitle.test.js` (수정) | `titleKey` 케이스 |
| `packages/client/src/lib/chapterOptions.js` (+`.test.js`, 신규) | 필기 챕터 선택지 순수 함수 |
| `packages/client/src/components/videos/ClassroomVideoTab.jsx` (수정) | 드롭다운에 `chapterOptionsForVideo` 적용, `onItemsChanged` 처리 |
| `packages/server/src/services/unitCopy.service.ts` (신규) | 원본 읽기 → `planUnitCopy` → 대상 학급 트랜잭션 실행 |
| `packages/server/src/routes/units.ts` (수정) | `POST /api/units/copy` |
| `packages/server/scripts/unit-transfer-e2e-setup.ts` (신규) | 스모크용 시드 |
| `packages/client/e2e/unit-transfer.smoke.mjs` (신규) | API + 화면 스모크 |
| `packages/client/src/lib/units.js` (수정) | `copyUnits` |
| `packages/client/src/components/units/UnitTransferModal.jsx` (신규) | 불러오기·내보내기 모달 |
| `packages/client/src/components/units/UnitBrowser.jsx` (수정) | 버튼 + 모달 연결, `onItemsChanged` prop |
| `packages/client/src/components/classrooms/ChapterTab.jsx` (수정) | `onItemsChanged` 전달 |
| 문서: `CLAUDE.md`, `.claude/PROJECT_MAP.md`, `docs/superpowers/specs/2026-10-25-classroom-units-design.md` | 한 줄씩 갱신 |

---

### Task 1: 복사 계획 순수 함수 `planUnitCopy` + `titleKey`

**Files:**
- Modify: `packages/shared/src/chapter/title.ts`, `packages/shared/src/index.ts`
- Create: `packages/shared/src/units/copyPlan.ts`
- Test: `packages/client/src/lib/unitCopyPlan.test.js`, `packages/client/src/lib/chapterTitle.test.js`

**Interfaces:**
- Produces (shared, `@mathchois/shared` 에서 export):

```ts
export function titleKey(title: string | null | undefined): string;   // chapterTitleKey 는 같은 함수의 별칭

export interface CopySourceUnit {
  id: string; title: string; description: string | null; isHidden: boolean;
  chapters: { id: string; title: string; description: string | null; sourceChapterId: string | null }[]; // position 순
  videos: { videoId: string; note: string | null; chapterTitle: string | null }[];                        // position 순, chapterTitle = 원본 필기 챕터 이름
}
export interface CopyTargetState {
  units: { id: string; title: string }[];
  chapters: { id: string; title: string }[];
  videos: { id: string; videoId: string; note: string | null; chapterId: string | null }[];
}
export interface UnitCopyPlan {
  units: { existingUnitId: string | null; title: string; description: string | null; isHidden: boolean }[]; // 대상 단원(중복 없음), 원본 순서
  newChapters: { unitIndex: number; title: string; description: string | null; sourceChapterId: string }[];  // 이 순서가 position 0..n-1
  movedChapters: { chapterId: string; unitIndex: number }[];
  newVideos: { unitIndex: number; videoId: string; note: string | null; chapterTitle: string | null }[];      // 이 순서가 position 0..m-1
  movedVideos: { classroomVideoId: string; unitIndex: number; fillNote: string | null; linkChapterTitle: string | null }[];
  counts: { unitsCreated: number; unitsMerged: number; chaptersCreated: number; chaptersMoved: number;
            videosCreated: number; videosMoved: number; linksUnresolved: number };
}
export function planUnitCopy(sources: CopySourceUnit[], target: CopyTargetState): UnitCopyPlan;
```

규칙(스펙 "대상 학급 하나의 처리"): `unitIndex` 는 `plan.units` 의 위치. `fillNote` 는 대상 note 가 비었고 원본 note 가 있을 때만 원본 note, 아니면 null. `linkChapterTitle` 은 대상 `chapterId` 가 null 이고 원본 `chapterTitle` 이 있을 때만 그 이름, 아니면 null. `linksUnresolved` = (새 배정의 `chapterTitle` + 옮긴 배정의 `linkChapterTitle`) 중 대상 기존 챕터 ∪ `newChapters` 이름(titleKey)에 없는 것의 수. `chaptersMoved` 는 대상 챕터 id 기준 중복 없이 센다. 같은 videoId 가 원본에 두 번 나오면 첫 번째만.

- [ ] **Step 1: 실패하는 테스트 작성** — `unitCopyPlan.test.js` (`import { planUnitCopy, titleKey } from '@mathchois/shared'`)

```js
const src = (id, title, chapters = [], videos = [], extra = {}) =>
  ({ id, title, description: null, isHidden: false, chapters, videos, ...extra });
const ch = (id, title, sourceChapterId = null) => ({ id, title, description: null, sourceChapterId });
const v = (videoId, chapterTitle = null, note = null) => ({ videoId, note, chapterTitle });
const empty = { units: [], chapters: [], videos: [] };

it('빈 학급: 단원·챕터·영상 모두 새로, 원본 순서 유지, 연결 챕터 id', () => {
  const p = planUnitCopy([src('u1', '1단원', [ch('c1', '수열'), ch('c2', '급수', 'orig')], [v('v1', '수열')])], empty);
  expect(p.units).toEqual([{ existingUnitId: null, title: '1단원', description: null, isHidden: false }]);
  expect(p.newChapters.map((c) => [c.title, c.sourceChapterId, c.unitIndex])).toEqual([['수열', 'c1', 0], ['급수', 'orig', 0]]);
  expect(p.newVideos).toEqual([{ unitIndex: 0, videoId: 'v1', note: null, chapterTitle: '수열' }]);
  expect(p.counts).toMatchObject({ unitsCreated: 1, unitsMerged: 0, chaptersCreated: 2, videosCreated: 1, linksUnresolved: 0 });
});
it('같은 이름 단원은 합치고 숨김은 대상 값(계획엔 existingUnitId 만)', ...);          // existingUnitId: 't-u1', unitsMerged 1
it('대상에 같은 이름 챕터(공백만 다름)가 있으면 새로 만들지 않고 옮김', ...);        // movedChapters [{chapterId:'t-c1', unitIndex:0}], chaptersCreated 0
it('원본 단원 안 같은 이름 챕터 둘 → 하나만 생성', ...);                              // Review Focus 1
it('선택한 원본 단원 둘의 이름이 같으면 대상 단원 하나', ...);                         // Review Focus 2: units.length 1, 두 단원 챕터 모두 unitIndex 0, unitsCreated 1
it('필기 챕터가 단원 밖: 대상에 같은 이름 있으면 연결, 없으면 linksUnresolved', ...); // Review Focus 3
it('이미 배정된 영상: 옮기고 메모·연결 유지, 미해결로 세지 않음', ...);               // Review Focus 4: target video {note:'기존', chapterId:'t-c9'} → fillNote null, linkChapterTitle null, linksUnresolved 0
it('이미 배정된 영상의 메모가 공백뿐이면 원본 메모로 채움', ...);                    // fillNote '원본 메모'
it('빈 단원도 단원은 생성', ...);                                                    // units.length 1, 나머지 0
it('숨긴 원본 단원을 새로 만들 때 isHidden 복사', ...);
```

`chapterTitle.test.js` 에 `titleKey` 가 `chapterTitleKey` 와 같은 결과인지 한 줄 추가.

- [ ] **Step 2: 실패 확인** — `cd packages/client && npx vitest run src/lib/unitCopyPlan.test.js` → FAIL(`planUnitCopy is not a function`)
- [ ] **Step 3: 구현** — `title.ts` 에 `titleKey` + `export const chapterTitleKey = titleKey`; `units/copyPlan.ts` 에 위 인터페이스와 `planUnitCopy`; `index.ts` 에 `export * from './units/copyPlan.js';`. 대상 이름 → id 는 `Map<titleKey, id>` 로, 이번 계획에서 만든 단원·챕터도 같은 Map 에 넣어 뒤 원본이 재사용하게 한다.
- [ ] **Step 4: 통과 확인** — `npx vitest run` (클라이언트 전체) → 모두 PASS
- [ ] **Step 5: 커밋** — `git commit -m "feat(units): 단원 복사 계획 순수 함수 planUnitCopy, titleKey"`

---

### Task 2: 필기 챕터 드롭다운을 같은 단원으로

**Files:**
- Create: `packages/client/src/lib/chapterOptions.js`, `packages/client/src/lib/chapterOptions.test.js`
- Modify: `packages/client/src/components/videos/ClassroomVideoTab.jsx` (`VideoCard` 의 `<select>` 옵션 `chapters.map` 부분)

**Interfaces:**
- Produces: `chapterOptionsForVideo(chapters: {id,title,unitId?}[], cv: {unitId?, chapterId?}, units: {id}[]): {id,title}[]`

- [ ] **Step 1: 실패하는 테스트**

```js
const chapters = [{ id: 'a', title: 'A', unitId: 'u1' }, { id: 'b', title: 'B', unitId: 'u2' }, { id: 'c', title: 'C', unitId: null }];
it('단원 없는 학급 → 전부', () => expect(chapterOptionsForVideo(chapters, { unitId: null }, []).map((c) => c.id)).toEqual(['a', 'b', 'c']));
it('미분류 영상 → 전부', () => expect(chapterOptionsForVideo(chapters, { unitId: null }, [{ id: 'u1' }]).map((c) => c.id)).toEqual(['a', 'b', 'c']));
it('단원 영상 → 그 단원 챕터만', () => expect(chapterOptionsForVideo(chapters, { unitId: 'u1' }, [{ id: 'u1' }]).map((c) => c.id)).toEqual(['a']));
it('현재 연결이 다른 단원 챕터면 끝에 붙임', () =>
  expect(chapterOptionsForVideo(chapters, { unitId: 'u1', chapterId: 'b' }, [{ id: 'u1' }]).map((c) => c.id)).toEqual(['a', 'b']));
it('unitId 가 목록에 없는 단원(지워짐)이면 전부', () =>
  expect(chapterOptionsForVideo(chapters, { unitId: 'gone' }, [{ id: 'u1' }]).map((c) => c.id)).toEqual(['a', 'b', 'c']));
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/lib/chapterOptions.test.js` → FAIL
- [ ] **Step 3: 구현** + `VideoCard` 에서 `chapters.map` → `chapterOptionsForVideo(chapters, cv, units).map`. 기존 `cv.chapter` 대체 옵션 블록은 그대로 둔다.
- [ ] **Step 4: 통과 + lint** — `npx vitest run && cd ../.. && npm run lint` → 테스트 PASS, lint 오류 0
- [ ] **Step 5: 커밋** — `git commit -m "feat(videos): 필기 챕터 선택지를 영상과 같은 단원 챕터로"`

---

### Task 3: 서버 `POST /api/units/copy` + API 스모크

**Files:**
- Create: `packages/server/src/services/unitCopy.service.ts`, `packages/server/scripts/unit-transfer-e2e-setup.ts`, `packages/client/e2e/unit-transfer.smoke.mjs`
- Modify: `packages/server/src/routes/units.ts`, `packages/client/src/lib/units.js`

**Interfaces:**
- Consumes: Task 1 `planUnitCopy`, `titleKey`, 타입들.
- Produces:
  - `copyUnitsToClassroom(sourceUnitIds: string[], targetClassroomId: string, addedBy: string): Promise<UnitCopyPlan['counts']>` (unitCopy.service.ts)
  - `loadCopySources(unitIds: string[]): Promise<{ classroomId: string; sources: CopySourceUnit[] } | { error: 404 | 400 }>` — 원본 단원 position 순, 각 단원의 챕터·배정 position 순, 배정의 `chapterTitle` 은 연결 챕터 이름(left join).
  - 라우트 응답 `{ results: ({ classroomId, ok: true, ...counts } | { classroomId, ok: false, error })[] }`
  - 클라이언트 `copyUnits(unitIds, targetClassroomIds)` → 위 응답.

- [ ] **Step 1: 스모크 시드 작성** — `unit-transfer-e2e-setup.ts` (형식은 `scripts/units-e2e-setup.ts` 를 따른다, 접두어 `UT E2E `, `--cleanup` 지원). 교사 1명, 학급 S·T1·T2. S: 단원 `UT E2E 1단원`(챕터 `수열`·`급수`, 영상 V1→필기 `수열`, V2→필기 `미분`(미분류 챕터)), 단원 `UT E2E 2단원`(숨김, 챕터 `극한`, 영상 V3), 미분류 챕터 `미분`. T1: 비어 있음. T2: 단원 `UT E2E 1단원`(숨기지 않음), 미분류 챕터 ` 수열 `, V2 배정(메모 `기존`, 필기 없음). id 를 JSON 으로 출력.
- [ ] **Step 2: API 스모크(실패) 작성** — `unit-transfer.smoke.mjs` 의 API 부분(`ctx.request` 로 로그인 후 `token` 을 Bearer 로):
  1. S→[T1] 두 단원: `results[0]` = `{ ok:true, unitsCreated:2, unitsMerged:0, chaptersCreated:3, chaptersMoved:0, videosCreated:3, videosMoved:0, linksUnresolved:1 }` (V2 의 `미분` 은 T1 에 없음). T1 단원 2개, 2단원 `isHidden:true`, V1 의 chapter 는 T1 의 `수열`.
  2. 같은 요청 반복 → `unitsCreated:0, unitsMerged:2, chaptersCreated:0, chaptersMoved:3, videosCreated:0, videosMoved:3, linksUnresolved:1`(V2 의 `미분` 은 여전히 없음) 이고 T1 챕터 3개·영상 3개 그대로. (Review Focus 5)
  3. S→[T2] 1단원: `unitsMerged:1, chaptersCreated:1(급수), chaptersMoved:1(수열), videosCreated:1(V1), videosMoved:1(V2), linksUnresolved:1(V2→미분)`; T2 의 V2 메모 `기존` 유지; T2 `수열` 챕터의 unitId = T2 의 1단원.
  4. 대상에 S 포함 → 400, 다른 학급 단원 섞음 → 400, 없는 단원 → 404.
  실행: 서버 기동 후 `node e2e/unit-transfer.smoke.mjs "$SCRATCH/ut.json" --api` → 404(라우트 없음)로 FAIL.
- [ ] **Step 3: 서비스 구현** — 트랜잭션 순서: advisory lock → 대상 상태 읽기 → `planUnitCopy` → 새 단원 insert(`position = max+1+i`) → 옮길 챕터 `unitId` update → 새 챕터: 기존 `position += n` 후 insert → 새 배정: 기존 `position += m` 후 insert(`addedBy`) → 옮길 배정 `unitId`(+`fillNote`) update → 필기 연결: 대상 챕터 `titleKey → id` Map(삽입 후 다시 읽음)로 새 배정의 `chapterTitle`·옮긴 배정의 `linkChapterTitle` 을 id 로 바꿔 update. `Tx` 타입은 `chapter.service.ts` 의 것을 export 해서 쓴다.
- [ ] **Step 4: 라우트 구현** — `units.ts` 에 zod `copyBody`(`unitIds`/`targetClassroomIds`: `z.array(z.string().uuid()).min(1).max(50)` → `new Set` 으로 중복 제거), 검사 순서는 스펙 표(404 → 400 한 학급 → 403 원본 → 403 대상 → 400 원본 포함). 대상마다 `try { ok:true, ...counts } catch (e) { request.log.error(e); ok:false, error:'복사하지 못했습니다' }`. 클라이언트 `units.js` 에 `copyUnits`.
- [ ] **Step 5: 검증** — `npm run build -w @mathchois/shared && npx tsc --noEmit -p packages/server` → 오류 0; 시드 재실행 후 API 스모크 → 모든 ✓.
- [ ] **Step 6: 커밋** — `git commit -m "feat(units): 단원 통째 복사 API POST /api/units/copy"`

---

### Task 4: 불러오기·내보내기 화면 + 문서

**Files:**
- Create: `packages/client/src/components/units/UnitTransferModal.jsx`
- Modify: `packages/client/src/components/units/UnitBrowser.jsx`, `packages/client/src/components/classrooms/ChapterTab.jsx`, `packages/client/src/components/videos/ClassroomVideoTab.jsx`, `packages/client/e2e/unit-transfer.smoke.mjs`, `CLAUDE.md`, `.claude/PROJECT_MAP.md`, `docs/superpowers/specs/2026-10-25-classroom-units-design.md`

**Interfaces:**
- Consumes: Task 3 `copyUnits`, 기존 `listUnits`, `api.get('/api/classrooms/other/:id')`.
- Produces:
  - `<UnitTransferModal mode="import"|"export" classroomId units onDone(result) onClose />` — `units` 는 export 때 이 학급 단원(개수 포함).
  - `UnitBrowser` 새 prop `onItemsChanged?: () => void` — 불러오기 성공 후 `onUnitsChanged()` 와 함께 호출.

- [ ] **Step 1: 화면 스모크(실패) 작성** — 같은 스모크 파일의 UI 부분(`--ui`): 시드 재실행 후 교사로 T1 `?tab=chapters` → [단원 불러오기] → 학급 S 선택 → 전체 선택 → [불러오기] → 결과 줄에 `단원 새로 2` 와 `필기 챕터 연결 못 함 1` → X → 단원 카드 2장. S `?tab=videos` → [단원 내보내기] → 1단원만 체크 + T2 체크 → 결과 `합침 1`. T1 `?tab=videos&unit=<1단원>` 의 V1 카드 드롭다운 옵션 = `연결 없음, 수열, 급수`(2단원 `극한` 없음). 실행 중 배경 클릭으로 안 닫힘. 콘솔 오류 0. → 버튼이 없어 FAIL.
- [ ] **Step 2: `UnitTransferModal` 구현** — 스펙 "단원 불러오기·내보내기" 그대로: 내보내기 = 단원 체크(전체 선택, `챕터 n · 영상 m`) + 학급 체크(`/api/classrooms/other/:id`, 전체 선택); 불러오기 = 학급 `<select>` → `listUnits(cid)` 체크(전체 선택); 실행 중 버튼 잠금·배경 클릭 무시; 4xx 는 모달 안 문구; 결과 화면은 Global Constraints 의 한 줄 형식, 실패 줄은 `text-red-500`, 닫기는 `IconButton icon={X} label="닫기"`.
- [ ] **Step 3: 연결** — `UnitBrowser`: 평면(교사) 버튼 줄에 [단원 불러오기], 단원 목록 화면 위(교사)에 `flex justify-end gap-3 mb-3` 줄로 [단원 불러오기][단원 내보내기]; 불러오기 성공 시 `onUnitsChanged(); onItemsChanged?.()`. `ChapterTab` → `onItemsChanged={fetchChapters}`, `ClassroomVideoTab` → 목록(`fetchList`)과 필기 챕터 목록을 함께 다시 읽는 함수(챕터 목록 effect 를 `reloadChapters` 콜백으로 뺀다).
- [ ] **Step 4: 검증** — `npm run lint`(오류 0) · `cd packages/client && npx vitest run`(PASS) · `npm run build`(성공) · 시드 재실행 후 `node e2e/unit-transfer.smoke.mjs ... --api` 와 `--ui` 모두 ✓ · 결과 화면 스크린샷 확인.
- [ ] **Step 5: 문서** — `CLAUDE.md` 단원 문단 끝에 "단원 불러오기·내보내기 `POST /api/units/copy`(겹치면 합치기, 필기 챕터는 이름으로 다시 연결; `docs/superpowers/specs/2026-10-28-unit-transfer-design.md`)"; `PROJECT_MAP.md` 라우트 표 units 행과 `units/` 컴포넌트 목록·shared `units/` 줄에 `copyPlan.ts`, `UnitTransferModal`; 단원 설계 문서 비목표 줄에 "→ 2026-10-28 단원 불러오기·내보내기 설계에서 지원" 링크.
- [ ] **Step 6: 커밋** — `git commit -m "feat(units): 단원 불러오기·내보내기 화면, 문서"`
