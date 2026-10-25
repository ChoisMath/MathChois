# 학급 단원 묶음 (Classroom Units) — 설계

작성일: 2026-10-25
상태: 질의응답으로 확정 (단원 공유 A · 재생목록 카드 A · 카드별 단원 선택 + 가져오기 A · 숨김 토글 A · 목록에서만 숨김 (a) · 접근안 ①)

## 배경 / 문제

학급 상세(`ClassroomDetail.jsx`)의 **[챕터]** 탭과 **[영상]** 탭(`ClassroomVideoTab.jsx`)은 학급의 모든 챕터·영상을
한 장의 카드 격자로 한꺼번에 펼친다. 학기가 진행되어 챕터가 수십 개가 되면 학생은 첫 화면에서 너무 많은 정보를
마주하게 되고, 지금 무엇을 봐야 하는지 찾기 어렵다.

교사는 유튜브 재생목록처럼 챕터와 영상을 **단원별로 한 단계 묶어서** 보여 주고 싶다. 학생은 먼저 단원 카드 몇 장만
보고, 단원을 눌러 그 안의 챕터·영상으로 들어간다.

## 목표

1. 교사가 학급마다 **단원**(예: "1단원 다항식")을 만들고, 이름·설명·순서를 정한다.
2. 하나의 단원에 **챕터와 영상을 함께** 담는다. 두 탭은 같은 단원 목록을 쓴다.
3. 두 탭 모두 첫 화면은 **단원 카드(재생목록 카드)** 이고, 카드를 누르면 그 단원의 항목이 지금과 같은 카드 격자로 나온다.
4. 교사는 카드의 **단원 선택 칸**, 단원 안에서의 **새로 만들기/추가(자동 소속)**, **기존 항목 가져오기(여러 개 선택)** 로
   항목을 단원에 넣는다.
5. 교사는 단원을 **학생에게 숨김** 처리할 수 있다. 숨긴 단원과 그 항목은 학생의 목록에 나오지 않는다.
6. 단원을 하나도 만들지 않은 학급은 **지금 화면 그대로** 동작한다.

### 비목표 (Out of scope)

- 단원 안에 단원을 두는 여러 단계 묶음.
- 한 항목을 여러 단원에 넣기.
- 숨긴 단원의 **주소 접근 차단**. 숨김은 목록 정리용이다(아래 "숨김의 범위").
- 다른 학급에서 단원을 통째로 가져오기. 챕터 가져오기는 지금처럼 하나씩 한다.
- 영상자료 라이브러리(`videos`)의 `subject / majorUnit / minorUnit` 글자 정보와 새 단원을 연결하는 일. 그대로 둔다.
- 과제(`assignments`), 게시판, 화이트보드의 단원 묶음.

## 핵심 설계 결정

| 결정 | 선택 | 비고 |
|---|---|---|
| 단원의 범위 | **학급별, 챕터·영상 공유** | 같은 단원이 두 탭에 모두 나온다. 학급 삭제 시 함께 삭제된다. |
| 데이터 구조 | **`units` 테이블 + `chapters.unit_id` / `classroom_videos.unit_id`** | 항목은 단원 0~1개에 속한다. NULL = 미분류. 다대다 조인 테이블은 쓰지 않는다(YAGNI). |
| 단원 삭제 | **항목은 미분류로** (`ON DELETE SET NULL`) | 챕터·영상·필기는 지워지지 않는다. `classroom_videos.chapter_id` 와 같은 패턴. |
| 화면 형태 | **재생목록 카드 → 단원 안 화면** | 아코디언·2단 화면은 쓰지 않는다. |
| 항목 배치 방법 | 카드의 단원 선택 칸 + 단원 안 새로 만들기/추가 + 기존 항목 가져오기 | 드래그로 단원에 넣기는 터치에서 스크롤과 헷갈려 쓰지 않는다. |
| 숨김의 범위 | **목록에서만** | 학생의 챕터·영상 목록과 영상 시청 화면의 "다른 영상" 목록에서 뺀다. 주소로 직접 들어가는 것은 막지 않는다. |
| 단원이 없는 학급 | **기존 평면 격자 그대로** | 교사에게만 [+ 새 단원] 버튼이 추가된다. |
| 탭·단원 위치 | **주소 쿼리** `?tab=…&unit=…` | 뒤로 가기로 보던 단원에 돌아온다. `unit=none` 은 미분류. |
| 스키마 반영 | `schema.ts` + `startupMigrate.ts` 멱등 DDL | 기존 컬럼 추가 방식과 같다. |

## 공유 모듈 — `packages/shared/src/units/`

화면과 서버가 함께 쓰는 판단 규칙을 순수 함수로 둔다. 클라이언트 Vitest 로 테스트한다
(`classroomColorShared.test.js` 처럼 shared 를 직접 import).

```ts
// units.ts
export const UNASSIGNED = 'none';            // 주소 쿼리의 미분류 값
export const UNIT_TITLE_MAX = 100;
export const UNIT_DESCRIPTION_MAX = 500;

export type UnitTab = 'chapters' | 'videos';

/** 단원별로 항목을 묶는다. unitId 가 없거나 목록에 없는 단원이면 미분류로 모은다. */
export function groupByUnit<T extends { unitId: string | null }>(
  units: { id: string }[], items: T[],
): { byUnit: Map<string, T[]>; unassigned: T[] };

/** 화면에 보일 단원. 학생: 숨김 제외 + 이 탭의 항목이 0개인 단원 제외. 교사: 전부. position 순. */
export function visibleUnits<U extends { id: string; isHidden: boolean; position: number }>(
  units: U[], counts: Map<string, number>, isTeacher: boolean,
): U[];

/** 주소의 unit 값 해석 → 단원 id | UNASSIGNED | null(단원 목록 화면).
 *  없는 단원, 학생에게 보이지 않는 단원, 미분류 항목이 없는데 'none' 이면 null. */
export function resolveUnitParam(
  param: string | null, visibleUnitIds: string[], hasUnassigned: boolean,
): string | null;
```

`shared/src/index.ts` 에서 export 한다. 서버는 학생용 필터에 같은 숨김 규칙을 쓴다(숨김 여부 판단만; 개수 판단은 화면 몫).

## 데이터 모델

### `units` (Drizzle `schema.ts` + `startupMigrate.ts` 멱등 DDL)

```sql
CREATE TABLE IF NOT EXISTS units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id uuid NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  position integer NOT NULL DEFAULT 0,
  is_hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_units_classroom ON units (classroom_id, position);

ALTER TABLE chapters         ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES units(id) ON DELETE SET NULL;
ALTER TABLE classroom_videos ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES units(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_chapters_unit         ON chapters (unit_id);
CREATE INDEX IF NOT EXISTS idx_classroom_videos_unit ON classroom_videos (unit_id);
```

- `units` 는 `chapters` 보다 먼저 만들어야 FK 가 걸린다. `startupMigrate` 에서 `units` 생성 → 두 `ALTER` 순서로 둔다.
- 새 단원은 맨 뒤(`max(position)+1`)에 들어간다. 단원은 수업 순서대로 쌓이므로 챕터와 달리 앞에 끼우지 않는다.
- 항목의 단원 일관성(항목과 단원이 같은 학급)은 DB 제약이 아니라 서비스 계층에서 검사한다.

### 공유 타입 — `shared/src/types/models.ts`

```ts
export interface Unit {
  id: string; classroomId: string; title: string; description: string | null;
  position: number; isHidden: boolean; createdAt: string;
}
export interface UnitWithCounts extends Unit { chapterCount: number; videoCount: number; }
```

`Chapter` 와 `ClassroomVideo` 타입에 `unitId: string | null` 을 더한다.

## 서버 API — `routes/units.ts` + `services/unit.service.ts`

교사 작업은 `requireRole('teacher')` + `isClassroomOwner`. 목록 조회는 교사는 소유자, 학생은 학급 멤버만
(`classroomVideos.ts` 의 `canAccessClassroom` 과 같은 규칙). 입력 검사는 zod.

| 메서드 | 경로 | 내용 |
|---|---|---|
| GET | `/api/classrooms/:cid/units` | 단원 목록(position 순) + `chapterCount`, `videoCount`. 학생: 숨긴 단원 제외. |
| POST | `/api/classrooms/:cid/units` | `{ title, description?, isHidden? }` → 201 + 단원 |
| PATCH | `/api/units/:id` | `{ title?, description?, isHidden? }` |
| DELETE | `/api/units/:id` | 204. 항목은 FK 로 미분류가 된다. |
| PUT | `/api/classrooms/:cid/units/reorder` | `{ ids: uuid[] }` — 그 학급 단원 전부의 새 순서 |
| POST | `/api/units/:id/items` | `{ chapterIds?: uuid[], classroomVideoIds?: uuid[] }` — 한 트랜잭션. 하나라도 다른 학급 항목이면 400, 아무것도 바꾸지 않는다. |

### 기존 API 변경

| 경로 | 변경 |
|---|---|
| `GET /api/classrooms/:cid/chapters` | 응답에 `unitId`. 페이지 select 에 `imageUrl` 추가(단원 카드 그림용). **학생이면 숨긴 단원의 챕터를 뺀다.** |
| `POST /api/classrooms/:cid/chapters` | 선택 `unitId`. 같은 학급 단원이 아니면 400. |
| `PATCH /api/chapters/:id` | 선택 `unitId`(null = 미분류). 같은 학급 단원이 아니면 400. |
| `POST /api/chapters/:id/import` | 선택 `unitId`(대상 학급의 단원). 없으면 미분류. 원본 챕터의 `unit_id` 는 복사하지 않는다. |
| `GET /api/classrooms/:cid/videos` | 응답에 `unitId`. **학생이면 숨긴 단원의 영상을 뺀다.** |
| `POST /api/classrooms/:cid/videos` | 선택 `unitId`. |
| `PATCH /api/classroom-videos/:id` | 선택 `unitId`. |
| `GET /api/classroom-videos/:id` (시청 화면 상세) | 영상에 단원이 있으면 `siblings` 를 **같은 단원의 영상**으로 좁히고 `unit: { id, title }` 를 함께 준다. 학생이면 숨긴 단원의 영상은 siblings 에서 뺀다. |

학생 여부는 `req.user.role === 'student'` 로 판단한다. 학생 필터는 `units.is_hidden` 과 left join 해서
`unit_id IS NULL OR is_hidden = false` 인 행만 남긴다.

### 오류 응답

| 상황 | 응답 |
|---|---|
| 학생이 단원 생성·수정·삭제·순서·가져오기 | 403 (`requireRole`) |
| 학급 소유자가 아님 | 403 |
| 다른 학급의 단원을 항목에 지정 | 400 `이 학급의 단원이 아닙니다` |
| 단원 이름이 비었거나 100자 초과 / 설명 500자 초과 | 400 |
| 단원이 없음 | 404 `단원을 찾을 수 없습니다` |
| reorder `ids` 가 그 학급 단원 집합과 다름 | 400 |

## 클라이언트

### 1) API — `lib/units.js`

`listUnits(cid)`, `createUnit(cid, body)`, `updateUnit(id, body)`, `deleteUnit(id)`, `reorderUnits(cid, ids)`,
`addItemsToUnit(id, { chapterIds, classroomVideoIds })`. `lib/videos.js` 와 같은 `api` 래퍼 사용.

### 2) 탭·단원 위치 — `ClassroomDetail.jsx`

- `activeTab` 을 `useSearchParams` 의 `tab` 으로 옮긴다(기본 `chapters`). 단원 위치는 `unit`.
- 단원 목록은 `ClassroomDetail` 이 한 번 불러 두 탭에 내려 준다(두 탭이 같은 단원을 쓰므로).
- 탭을 바꿀 때 `unit` 은 유지한다. 새 탭에서 `resolveUnitParam` 이 null 이면 단원 목록 화면을 보여 준다.
- 단원 목록을 불러오지 못하면 `units = []` 로 두어 기존 평면 격자로 동작한다.
- `ClassroomDetail.jsx` 는 이미 922줄이다. 챕터 탭 본문을 `components/classrooms/ChapterTab.jsx` 로 떼어 내고
  (카드 `SortableChapterCard`, 정렬, PDF 다운로드 포함), `ClassroomDetail` 은 헤더·탭·모달만 맡는다.

### 3) 공용 단원 화면 — `components/units/`

| 파일 | 역할 |
|---|---|
| `UnitGrid.jsx` | 단원 카드 격자 + 미분류 카드 + (교사) [+ 새 단원] 카드. 교사는 dnd-kit 으로 단원 카드 순서 변경(`rectSortingStrategy`). |
| `UnitCard.jsx` | 재생목록 모양 카드: 겹친 카드 배경, 그림(영상 탭: 첫 영상 썸네일 / 챕터 탭: 첫 챕터 첫 페이지 `imageUrl`, 없으면 아이콘), 이름, 설명 2줄, 이 탭의 개수. 교사: 숨김 배지(흐리게), `IconButton` 수정·삭제. |
| `UnitHeader.jsx` | 단원 안 화면 머리: `← 단원 목록`(IconButton + 글자), 이름, 설명, 오른쪽에 탭이 넘겨 주는 버튼들. |
| `UnitFormModal.jsx` | 새 단원 / 단원 수정: 이름(필수), 설명(선택), "학생에게 숨김" 체크. |
| `UnitDeleteModal.jsx` | "단원만 삭제됩니다. 안에 있던 챕터 N개와 영상 M개는 미분류로 옮겨집니다." |
| `UnitItemPickerModal.jsx` | 기존 항목 가져오기: 이 탭의 **미분류 항목**을 체크 목록으로 보여 주고 한 번에 넣는다. |
| `UnitSelect.jsx` | 교사용 카드의 `단원: [ ▾ ]` 선택 칸(“미분류” + 단원들). 기존 "필기 챕터" select 와 같은 모양(`min-h-9`). |

- 미분류 카드 이름: 교사 "미분류", 학생 "기타 자료". 미분류 항목이 없으면 카드를 그리지 않는다.
- 학생은 `visibleUnits` 로 숨긴 단원과 이 탭의 항목이 0개인 단원을 빼고 본다.
- 단원이 하나도 없으면 `UnitGrid` 를 건너뛰고 기존 격자를 그린다. 교사에게는 정렬 칸 옆에 [+ 새 단원] 버튼.

### 4) 탭 연결

- **챕터 탭(`ChapterTab.jsx`)**: 단원 안 화면에서 `sortedChapters` 를 그 단원(또는 미분류) 항목으로 거른 뒤 지금 격자를 그린다.
  드래그 정렬은 걸러진 목록 안에서만 하고, 기존 `PUT /api/chapters/reorder` 에 그 항목들의 position 만 보낸다
  (단원 간 position 이 겹쳐도 단원 안에서만 비교하므로 문제없다). [+ 새 챕터] 는 현재 단원 id 를 함께 보낸다.
  가져오기 모달의 "가져오기" 탭도 현재 단원으로 넣는다.
- **영상 탭(`ClassroomVideoTab.jsx`)**: `units`, `unitParam`, `onUnitChange` props 를 받아 같은 방식으로 거른다.
  [+ 영상 추가] 는 현재 단원 id 를 함께 보낸다. `reorderClassroomVideos` 는 걸러진 항목 id 만 보낸다.
- **교사 카드의 단원 선택**: 먼저 화면에서 옮기고(낙관적 갱신), 실패하면 되돌리고 `alert` 로 알린다. 단원 개수도 다시 읽는다.
- **시청 화면(`ClassroomVideoWatch.jsx`)**: 상세에 `unit` 이 있으면 옆 목록 제목을 "이 단원의 다른 영상 · {단원 이름}" 으로,
  없으면 지금처럼 "이 학급의 다른 영상".
- 아이콘만 있는 버튼은 `IconButton`(라벨 = title + aria-label, 44px). 아이콘: 새 단원 `FolderPlus`, 단원 카드 빈 그림 `Library`,
  가져오기 `ListPlus`, 숨김 `EyeOff`, 수정 `Pencil`, 삭제 `Trash2`, 뒤로 `ArrowLeft` (lucide-react).

## 흐름

1. 교사: [챕터] 탭 → [+ 새 단원] → "1단원 다항식" 저장 → 단원 카드 생김.
2. 교사: "1단원 다항식" 카드 → [기존 항목 가져오기] → 미분류 챕터 5개 체크 → 넣기 → 단원 안에 5개.
3. 교사: [영상] 탭으로 바꾸면 같은 단원 안 화면(영상 0개) → [+ 영상 추가] → 고른 영상이 이 단원에 들어감.
4. 교사: "3단원" 수정 → "학생에게 숨김" → 교사 화면에는 흐린 카드 + [숨김].
5. 학생: 학급 → 단원 카드 2장 + "기타 자료" → "1단원" → 챕터 열어 필기 → 뒤로 가기 → 다시 "1단원" 안 화면.

## 엣지케이스

| 상황 | 처리 |
|---|---|
| 주소의 단원이 지워졌거나 학생에게 숨김 | `resolveUnitParam` → null → 단원 목록 화면 |
| `unit=none` 인데 미분류 항목이 없음 | 단원 목록 화면 |
| 교사가 단원 안에서 마지막 항목을 다른 단원으로 옮김 | 단원 안 화면에 머물고 빈 안내("이 단원에 챕터가 없습니다" + 버튼들)를 보여 준다 |
| 영상의 필기 챕터가 숨긴 단원에 있음 | 숨김은 목록에서만이므로 2분할 화면은 그대로 열린다 |
| 학생의 '이어보기'(`mc_lastPage_*`)가 숨긴 단원의 챕터 | 목록에 없으므로 들어갈 길이 없다. 직접 주소는 열린다(비목표) |
| linked 챕터(`sourceChapterId`) | `unit_id` 는 학급별 챕터 행에 있으므로 원본·복사본이 각자 단원을 갖는다 |
| 다른 기기에서 단원 수정 | 탭 전환·`visibilitychange` 때 단원 목록을 다시 읽는다 |
| 동시에 같은 단원 삭제 | 404 → "단원을 찾을 수 없습니다" 안내 후 단원 목록 새로고침 |

## 테스트

- **단위(Vitest, `client/src/lib/units.test.js`)**: shared `groupByUnit`, `visibleUnits`, `resolveUnitParam`.
  - 미분류 모으기, 목록에 없는 unitId → 미분류
  - 학생: 숨김 제외, 개수 0 제외 / 교사: 전부, position 순
  - 주소 값: 정상 id, 없는 id, 숨긴 id(학생), `none` + 미분류 있음/없음, null
- **정적 검사**: `npm test -w @mathchois/client`, `npm run lint`, `npm run build`(서버 `tsc` 포함).
- **브라우저(Playwright)**: DB 가 있는 환경에서 교사·학생 계정으로 "흐름" 1~5 확인. 클라우드 세션에 DB 가 없으면
  보고에 그 사실을 적고 화면 확인은 배포 후로 남긴다.

## 영향 받는 파일 (요약)

- shared: `src/units/units.ts`(신규), `src/index.ts`, `src/types/models.ts`
- server: `db/schema.ts`, `db/startupMigrate.ts`, `routes/units.ts`(신규), `services/unit.service.ts`(신규), `app.ts`(라우트 등록),
  `routes/chapters.ts`, `services/chapter.service.ts`, `routes/classroomVideos.ts`, `services/classroomVideo.service.ts`
- client: `lib/units.js`(신규), `lib/units.test.js`(신규), `components/units/*`(신규), `components/classrooms/ChapterTab.jsx`(신규, `ClassroomDetail` 에서 분리),
  `pages/Classrooms/ClassroomDetail.jsx`, `components/videos/ClassroomVideoTab.jsx`, `pages/Videos/ClassroomVideoWatch.jsx`, `lib/videos.js`
- 문서: `CLAUDE.md`(학급 단원 한 줄), `.claude/PROJECT_MAP.md`(테이블·라우트·컴포넌트)
