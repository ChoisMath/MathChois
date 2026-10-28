# 단원 불러오기·내보내기 + 필기 챕터 단원 필터 — 설계

작성일: 2026-10-28
상태: 질의응답으로 확정 (겹칠 때 합치기 · 미분류 영상은 모든 챕터 · 여러 단원 골라서 · 접근안 ① 서버 일괄 복사)

## 배경 / 문제

학급 단원(`2026-10-25-classroom-units-design.md`)이 생기면서 교사는 챕터와 영상을 단원별로 정리한다.
두 가지가 불편하다.

1. 영상 카드의 **필기 챕터** 드롭다운에 학급의 모든 챕터가 나온다. 챕터가 많으면 그 영상과 같은 단원의 챕터를
   찾기 어렵다.
2. 같은 과목을 여러 학급에 가르치는 교사는 한 학급에서 만든 단원 구성(단원 → 챕터·영상 → 필기 챕터 연결)을
   다른 학급에 똑같이 만들려면 단원을 다시 만들고, 챕터를 하나씩 가져오고, 영상을 하나씩 배정하고, 필기 챕터를
   하나씩 다시 연결해야 한다.

단원 설계 문서는 "다른 학급에서 단원을 통째로 가져오기"를 범위 밖으로 두었다. 이 문서가 그 범위를 연다.

## 목표

1. 단원이 있는 학급에서 **단원에 속한 영상**의 필기 챕터 드롭다운에는 **그 단원의 챕터만** 나온다.
2. 교사가 단원 목록 화면에서 **여러 단원을 골라 여러 학급으로 내보내거나**, **다른 학급의 단원을 여러 개 골라
   불러온다**.
3. 단원을 복사하면 **단원(이름·설명·숨김), 단원의 챕터, 단원의 영상 배정(메모 포함), 영상의 필기 챕터 연결**이
   대상 학급에 그대로 만들어진다. 필기 챕터 연결은 **대상 학급의 챕터**를 가리키도록 다시 잇는다.
4. 같은 단원을 여러 번 복사해도 대상 학급에 단원·챕터·영상이 **중복되지 않는다**(합치기).

### 비목표 (Out of scope)

- 챕터 페이지를 독립 사본으로 복제하기. 챕터는 지금의 챕터 가져오기처럼 **연결 챕터**(`sourceChapterId`)로 만든다.
- 댓글, 시청 기록, 학생·교사 필기, 학생 코멘트 복사.
- 단원 밖(미분류) 항목 복사. 미분류 항목은 지금의 챕터 가져오기·영상 추가로 옮긴다.
- 다른 교사의 학급과 주고받기. 원본·대상 학급 모두 본인 소유여야 한다.
- 파일(JSON)로 내보내기·불러오기.
- 필기 챕터 드롭다운에서 다른 단원 챕터를 고르도록 따로 펼치는 기능.

## 핵심 설계 결정

| 결정 | 선택 | 비고 |
|---|---|---|
| 복사 방식 | **서버 일괄 복사 API 하나** | 대상 학급마다 트랜잭션 하나. 실패하면 그 학급만 통째로 되돌아간다. |
| 복사 단위 | **여러 단원 × 여러 학급** | 내보내기·불러오기 모두 같은 API. 불러오기 = 대상이 이 학급 하나. |
| 같은 이름 단원 | **합치기** | 대상 학급에 같은 이름(`titleKey`) 단원이 있으면 새로 만들지 않고 그 단원에 넣는다. 숨김은 대상 값 유지. |
| 이미 있는 챕터 | **그 단원으로 옮김** | 같은 이름 챕터가 있으면 새로 만들지 않는다(챕터 중복 금지 규칙 유지). 다른 단원·미분류에 있어도 옮긴다. |
| 이미 있는 영상 | **그 단원으로 옮김** | 같은 영상(`video_id`)이 배정돼 있으면 새로 배정하지 않는다. 메모가 비어 있을 때만 원본 메모로 채운다. |
| 필기 챕터 연결 | **이름으로 다시 잇기, 덮어쓰지 않음** | 원본 연결 챕터와 같은 이름의 대상 학급 챕터로 잇는다. 대상 영상에 이미 연결이 있으면 그대로 둔다. 못 찾으면 연결 없음 + 결과에 개수. |
| 드롭다운 필터 | **단원 영상 → 그 단원 챕터, 미분류 영상·단원 없는 학급 → 모든 챕터** | 현재 연결된 챕터는 목록 밖이어도 보이게 남긴다. |
| 순서 | 새 단원은 맨 뒤에 원본 순서대로, 새 챕터·영상은 맨 앞에 원본 순서대로 | 기존 "새 항목은 맨 위" 규칙과 같다. 옮긴 항목은 위치를 바꾸지 않는다. |

## 공유 모듈

### `packages/shared/src/chapter/title.ts` (기존 파일 확장)

단원 이름 비교에도 같은 규칙을 쓴다. 이름만 일반화한다.

```ts
/** 비교용 키: NFC, 앞뒤 공백 제거, 연속 공백 하나로. 대소문자 구분. */
export function titleKey(title: string | null | undefined): string;
/** 기존 이름 유지(호출부 변경 없음) */
export const chapterTitleKey = titleKey;
export function hasSameChapterTitle(chapters, title): boolean; // 그대로
```

### `packages/client/src/lib/chapterOptions.js` (신규, 순수 함수)

```js
/**
 * 영상 카드의 필기 챕터 선택지.
 * units 가 비었거나 cv.unitId 가 없으면 chapters 전부.
 * 아니면 unitId 가 같은 챕터만. 현재 연결(cv.chapterId)이 빠지면 그 챕터를 끝에 붙인다(목록에 있을 때).
 */
export function chapterOptionsForVideo(chapters, cv, units)
```

`ClassroomVideoTab` 의 기존 "목록 로드 실패 시 현재 값 표시" 대체 옵션(`cv.chapter`)은 그대로 둔다.

## 서버 API

### `POST /api/units/copy` — `routes/units.ts` + `services/unitCopy.service.ts`(신규)

교사 전용(`requireRole('teacher')`). 입력 검사는 zod.

```ts
// 요청
{ unitIds: uuid[] (1..50, 중복 제거), targetClassroomIds: uuid[] (1..50, 중복 제거) }

// 응답 200
{
  results: Array<{
    classroomId: string;
    ok: true;
    unitsCreated: number; unitsMerged: number;
    chaptersCreated: number; chaptersMoved: number;
    videosCreated: number; videosMoved: number;
    linksUnresolved: number;     // 원본엔 필기 챕터 연결이 있었으나 대상에서 같은 이름 챕터를 못 찾음
  } | { classroomId: string; ok: false; error: string }>
}
```

#### 검사 (전체 실패 — 아무것도 바꾸지 않음)

| 상황 | 응답 |
|---|---|
| 단원이 하나라도 없음 | 404 `단원을 찾을 수 없습니다` |
| 단원들이 한 학급 것이 아님 | 400 `한 학급의 단원만 함께 복사할 수 있습니다` |
| 원본 학급 소유자가 아님 | 403 |
| 대상 학급 중 하나라도 소유자가 아님 | 403 |
| 대상에 원본 학급이 들어 있음 | 400 `같은 학급으로는 복사할 수 없습니다` |

검사를 통과하면 대상 학급마다 따로 처리한다. 한 학급이 실패하면(예외) 그 학급만 `ok:false` 로 남기고 다음 학급을
계속한다.

#### 대상 학급 하나의 처리 (트랜잭션 하나)

```text
copyUnitsToClassroom(sourceUnits(position 순), target)
  advisory lock 'chapter-title:{target}'        # 챕터 가져오기와 같은 키 → 서로 줄 선다
  읽기: 대상 학급 단원·챕터(title, unitId, position)·classroom_videos(videoId, note, chapterId)
  원본 읽기: 각 단원의 챕터(position 순), classroom_videos(position 순, 연결 챕터 title 포함)

  for 원본 단원 (position 순)
    대상 단원 = 같은 titleKey 단원 ?? 새 단원(맨 뒤, 이름·설명·숨김 복사)     # unitsMerged / unitsCreated
    for 원본 챕터
      있음(같은 titleKey) → unitId = 대상 단원                                  # chaptersMoved
      없음 → 새 연결 챕터 목록에 추가 (sourceChapterId = 원본.sourceChapterId ?? 원본.id)
    for 원본 영상 배정
      있음(같은 videoId) → unitId = 대상 단원, note 비었으면 원본 note           # videosMoved
      없음 → 새 배정 목록에 추가 (note 복사)

  새 챕터 n개: 기존 챕터 position += n, 새 챕터 position = 0..n-1 (원본 단원 순 → 챕터 순)   # chaptersCreated
  새 배정 m개: 기존 배정 position += m, 새 배정 position = 0..m-1                          # videosCreated

  필기 연결: 원본 배정마다 원본 연결 챕터가 있으면
    대상 배정.chapterId 가 비어 있을 때만 → 대상 학급의 같은 titleKey 챕터 id
    (이번 복사로 만든 챕터 포함, 단원 밖 챕터도 포함). 못 찾으면 linksUnresolved++
```

- 새 단원의 `position` 은 기존 `createUnit` 과 같이 `max(position)+1`, 여러 개면 원본 순서대로 이어 붙인다.
- 원본 단원 둘의 이름이 같으면 둘 다 같은 대상 단원으로 합쳐진다(같은 규칙의 자연스러운 결과).
- 원본 단원 안에서 같은 이름 챕터가 둘이면 대상에는 하나만 생긴다(챕터 중복 금지).
- `addedBy` 는 요청한 교사.

### 기존 API

변경 없음. 불러오기 화면은 원본 학급의 단원 목록을 기존 `GET /api/classrooms/:cid/units`(교사·소유자)로 읽고,
학급 목록은 기존 `GET /api/classrooms/other/:excludeId` 로 읽는다.

## 화면

### 필기 챕터 드롭다운 — `components/videos/ClassroomVideoTab.jsx`

`VideoCard` 가 `chapterOptionsForVideo(chapters, cv, units)` 결과로 `<option>` 을 그린다. 교사 챕터 목록 요청
(`GET /api/classrooms/:cid/chapters`)은 이미 `unitId` 를 준다. 카드의 단원을 바꾸면(`handleUnitChange`) 드롭다운
선택지도 바로 바뀐다. 연결은 바꾸지 않는다.

### 단원 불러오기·내보내기 — `components/units/UnitTransferModal.jsx`(신규)

`UnitBrowser` 의 교사 버튼 줄에 붙는다. [챕터]·[영상] 탭 모두 같은 `UnitBrowser` 를 쓰므로 두 탭에 다 나온다.

| 화면 | 버튼 |
|---|---|
| 단원 없음(평면) | [새 단원] [단원 불러오기] |
| 단원 목록 | 기존 버튼 + [단원 불러오기] [단원 내보내기] |
| 단원 안 | 없음 |

아이콘 버튼(`IconButton`)을 쓴다: 불러오기 `FolderInput`, 내보내기 `FolderOutput`(lucide).

모달(`mode: 'import' | 'export'`):

- **내보내기**: ① 이 학급 단원 체크 목록(전체 선택, 챕터·영상 개수) ② 대상 학급 체크 목록(전체 선택)
  → [내보내기] → `POST /api/units/copy { unitIds, targetClassroomIds }`.
- **불러오기**: ① 학급 선택(`<select>`) → 그 학급 단원 체크 목록(전체 선택, 개수)
  → [불러오기] → `POST /api/units/copy { unitIds, targetClassroomIds: [이 학급] }`.
- 결과 화면: 학급마다 한 줄 — `QA 2반: 단원 새로 2 · 합침 1 / 챕터 추가 5 · 옮김 1 / 영상 추가 3 · 옮김 0`,
  `linksUnresolved > 0` 이면 `필기 챕터 연결 못 함 N`, 실패면 빨간 글씨로 사유. [닫기] 는 X.
- 불러오기가 끝나면 `onUnitsChanged()` + 탭 목록 다시 읽기(아래).
- 실행 중에는 버튼을 잠그고 X 로만 닫는다(배경 클릭 무시).

`UnitBrowser` 에 `onItemsChanged` prop 을 더해, 불러오기 후 탭(챕터/영상)이 자기 목록을 다시 읽게 한다.
반대 탭 목록은 탭을 열 때 다시 읽으므로 따로 처리하지 않는다.

## 오류 처리

- 검사 실패(4xx)는 모달 안에 문구로 보여 주고 모달은 그대로 둔다.
- 학급별 실패(`ok:false`)는 결과 화면에서 그 학급 줄만 빨간 글씨. 다른 학급 결과는 정상 표시.
- 네트워크 오류는 모달 안 문구 + 다시 시도 가능.

## 테스트

- Vitest: `titleKey`(기존 `chapterTitle.test.js` 확장), `chapterOptionsForVideo`
  (단원 없음 / 미분류 영상 / 단원 영상 / 현재 연결이 다른 단원 챕터).
- 서버: `tsc` 타입 검사. (서버 단위 테스트 틀은 없다.)
- Playwright 스모크(`packages/client/e2e/unit-transfer.smoke.mjs` + `packages/server/scripts/unit-transfer-e2e-setup.ts`):
  1. 원본 학급: 단원 2개(챕터·영상·필기 연결 포함). 빈 학급으로 내보내기 → 단원·챕터·영상·연결이 대상 학급 챕터로 이어짐.
  2. 같은 학급으로 다시 내보내기 → 단원·챕터·영상 개수 그대로(합침/옮김만).
  3. 같은 이름 단원·챕터가 일부 있는 학급에서 불러오기 → 합쳐지고, 미분류에 있던 같은 이름 챕터가 단원으로 옮겨짐.
  4. 영상 카드 드롭다운: 단원 영상은 그 단원 챕터만, 미분류 영상은 모든 챕터.
  5. 콘솔 오류 0.

## 문서

- `CLAUDE.md` 단원 설명에 불러오기·내보내기 한 줄, `.claude/PROJECT_MAP.md` 라우트 표·컴포넌트 목록 갱신.
- `2026-10-25-classroom-units-design.md` 비목표의 "다른 학급에서 단원을 통째로 가져오기"에 이 문서 링크를 단다.
