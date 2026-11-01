# 메모지(포스트잇) 배경 도형 — 설계

작성일: 2026-11-01
상태: 질의응답으로 확정 (모델 · 스타일 A+C 4유형 · 자체 마스코트 '도형 친구들' · 기본 잠금 + 이미지 이동 도구로 해제 ·
도구바 쓰는 모든 창 · 교사 코멘트 메모지 반투명 · 고르는 창 = 유형별 친구 한 줄 + 무늬 한 줄 — 설계 6개 섹션 승인) → 구현 계획 대기

## 배경 / 문제

교사는 문제와 설명이 담긴 PDF 교재를 챕터 페이지로 배치한다. 교사가 여백을 넉넉히 두어도 학생이 풀이를 쓰다 보면
종이 안 여백이 모자란다. 캔버스는 무한하므로 학생은 이미 종이 밖에 쓸 수 있지만, 종이 밖 필기는 **어느 문항의 풀이인지
구분이 없고** 책상색 바탕 위에 흩어진다.

검토한 대안과 결론:

- 학생이 자기 필기에 **페이지를 추가**하는 안 — 문제가 있는 쪽과 풀이가 다른 쪽에 갈라져 "다른 데 적는" 느낌이 그대로
  남고, 학생별 페이지·썸네일·교사 코멘트 키·PDF 순서까지 손대야 한다. 제외.
- 캔버스 안에서 **스티커로 접히는 포스트잇**(다 쓰면 축소, 누르면 다시 펼침) — 스냅샷 재생성, 겹침·가림, 6개 뷰어·내보내기·
  동기화가 모두 새 요소를 이해해야 해 비용이 가장 크다. 제외.
- **종이 밖 여백에 문항별로 구분되는 메모지(포스트잇) 배경을 깔고 그 위에 쓴다** — 채택. 새 요소 종류 없이 Excalidraw
  이미지 요소 하나로 표현되므로 저장·동기화·내보내기 경로가 모두 기존과 같다.

## 목표

1. 학생이 도구바에서 **메모지**를 골라 캔버스에 붙이고 그 위에 펜·형광펜으로 쓴다. 메모지는 문항별 풀이를 묶어 보이게 한다.
2. 메모지는 **붙으면 잠겨** 펜·지우개·선택·올가미가 통과한다. 옮기기·크기 바꾸기·지우기는 기존 **이미지 이동** 도구에서 한다.
3. 메모지는 **문구점 포스트잇(A)** 의 파스텔 면·무늬와 **캐릭터(C)** 를 함께 가진다. 유형 4종 × 자체 마스코트 6종 × 무늬 3종.
4. 서버·DB·소켓은 바꾸지 않는다. 기존 삽입 이미지와 같은 데이터 경로(`excalidraw_data.elements` + `files`)를 쓴다.
5. `DrawingToolbar` 를 쓰는 모든 창(①②③④⑤ + AI 코칭 뷰어)에서 같은 단추·같은 동작.

### 비목표 (v1)

- 메모지를 접거나 스티커로 축소하기, 메모지 안 필기를 메모지와 함께 묶어 옮기기(Excalidraw 프레임). 필요하면 2차.
- 학생 페이지 추가. 종이(`bgPosition`)·썸네일·PDF 쪽 순서는 그대로다.
- 화이트보드(`components/whiteboard/WhiteboardCanvas.jsx`, Excalidraw 기본 UI)에 메모지 단추 넣기.
- 메모지 색·크기를 따로 고르기(색은 친구가 정하고, 크기는 붙인 뒤 이동 도구로 바꾼다). 문항 번호 입력란(손으로 쓴다).
- 참고로 본 상용 캐릭터(산리오·카카오프렌즈·리락쿠마 등)의 모양을 가져오는 것. 마스코트는 전부 자체 제작이다.
- 메모지 크기의 자유 비율 조절(이미지 요소라 비율이 고정된다 — 아래 "제약" 참고).

## 핵심 설계 결정 (질의응답 확정)

| # | 결정 | 선택 |
|---|---|---|
| Q1 | 여백 부족을 푸는 모델 | **종이 밖 여백 + 메모지 배경 도형**. 페이지 추가·접히는 포스트잇은 제외. |
| Q2 | 교사가 학생 메모지를 보는 방식 | 학생 노트 요소로 저장되므로 교사 코멘트 창(③⑤)에 그대로 보이고 그 위에 코멘트를 쓴다. |
| Q3 | 범위 | 챕터 + 과제. `DrawingToolbar` 를 쓰는 6개 창 전부. |
| Q4 | 스타일 | **A + C**: 파스텔 면·무늬 + 캐릭터. 유형 ①모서리 탭 ②얼굴 메모지 ③은은한 워터마크 ④다이컷 **네 가지 모두**. |
| Q5 | 마스코트 | 자체 **'도형 친구들' 6종**, 학급 표지색 6색과 1:1 (동글·네모·세모·별·뭉게·하티). |
| Q6 | 지우개·이동 | **기본 잠금**(Excalidraw 지우개는 잠긴 요소를 건너뛴다) + **이미지 이동 도구**로 잠금 해제해 옮기고·키우고·지운다. |
| Q7 | 어느 창 | 도구바를 쓰는 모든 창. 교사도 코멘트·필기에 메모지를 쓴다. |
| Q8 | 교사 코멘트 메모지 | ③⑤에서 붙인 메모지는 **투명도 70%** 라 아래 학생 필기가 비친다. |
| Q9 | 고르는 창 | **유형별 친구 6명 미리보기 한 줄씩(4줄) + 무늬 한 줄(민무늬·줄·모눈)**. 누르면 즉시 붙고 마지막 선택을 기억한다. |

## 용어

- **메모지** — 사용자에게 보이는 이름(단추·툴팁·삭제 단추). 코드 식별자는 `sticky`.
- **친구(friend)** — 마스코트 6종 중 하나. 색을 결정한다.
- **유형(type)** — 메모지 모양 4종: `tab`(모서리 탭) · `face`(얼굴 메모지) · `mark`(워터마크) · `cut`(다이컷).
- **무늬(pattern)** — `plain` · `ruled` · `grid`.

## 요소 모델

메모지 하나 = **Excalidraw `image` 요소 하나**. 그림은 서버 파일이 아니라 클라이언트가 규칙으로 만든 **SVG data URL** 이다.

```js
// 요소 (기존 삽입 이미지와 같은 모양에 세 가지가 더 붙는다)
{
  type: 'image',
  id: 'sticky_' + <random>,          // 접두사로 제외 목록·판별
  fileId: 'stickyf_v1_tab_circle_ruled', // 조합당 하나 — 같은 조합은 한 노트 안에서 파일을 공유
  status: 'saved',
  locked: true,                       // 붙는 순간부터 잠김
  opacity: 100,                       // 코멘트 창(③⑤)에서는 70
  customData: { sticky: { v: 1, type: 'tab', friend: 'circle', pattern: 'ruled' } },
  x, y, width, height, ...            // 나머지는 삽입 이미지와 같다
}
// files[fileId] = { id: fileId, mimeType: 'image/svg+xml', dataURL: 'data:image/svg+xml;utf8,…', created }
```

- 판별은 `customData.sticky` 가 있으면 메모지, 없으면 일반 이미지. `id` 접두사 `sticky_` 는 문지르기 지우개·올가미의
  `excludePrefixes` 에 넣기 위한 것이다(두 훅은 접두사로만 거른다).
- `fileId` 가 결정적이므로 같은 메모지를 열 번 붙여도 `files` 에는 SVG 한 장만 들어간다(조합당 약 3~6KB). 조합이 모두 쓰여도
  노트당 최대 72장 × 6KB 수준이며 실제로는 두세 장이다.
- `v: 1` 은 그림 규칙 버전이다. 나중에 그림을 바꾸면 `v: 2` 와 새 `fileId` 접두사(`stickyf_v2_`)를 쓰고, 이미 저장된 v1 요소는
  자기 파일을 그대로 가지고 있으므로 바뀌지 않는다(저장된 노트는 재생성하지 않는다).
- **크기·위치**: 처음 붙을 때 너비 = 종이(`bgPositionRef.current.width`)의 36%, 종이가 없으면 260 씬 단위. 높이는 유형별 비율로
  정한다(아래 표). 위치는 **현재 보이는 화면의 가운데**(삽입 이미지와 같은 계산: `(vpW/2 - scrollX)/zoom`)에 가운데 맞춤.
  같은 자리에 연달아 붙이면 겹치므로 직전 메모지와 같은 자리면 오른쪽 아래로 24 씬 단위씩 비켜 놓는다.
- Excalidraw 는 이미지 요소의 모서리 크기 조절에서 **비율을 유지**하므로 얼굴·탭이 찌그러지지 않는다. (제약: 가로만 늘리기는
  안 된다. 더 넓은 자리가 필요하면 메모지를 하나 더 붙인다.)

### 새 모듈 `packages/client/src/lib/stickyPads.js` (순수 함수, 테스트 대상)

```js
export const STICKY_TYPES    = ['tab', 'face', 'mark', 'cut'];
export const STICKY_FRIENDS  = ['circle', 'square', 'triangle', 'star', 'cloud', 'heart']; // 동글·네모·세모·별·뭉게·하티
export const STICKY_PATTERNS = ['plain', 'ruled', 'grid'];
export const STICKY_ID_PREFIX = 'sticky_';

export function stickyFileId({ type, friend, pattern })      // 'stickyf_v1_<type>_<friend>_<pattern>'
export function stickySvg({ type, friend, pattern })         // 결정적 SVG 문자열 (viewBox 고정)
export function stickyDataUrl(spec)                          // 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
export function stickyAspect(type)                           // height / width
export function isStickyElement(el)                          // !!el?.customData?.sticky
export function buildStickyElement(spec, { x, y, width, opacity = 100, id }) // 잠긴 image 요소 한 개
export function friendColor(friend)                          // { tint, deep, cover } — lib/classroomColor.js 의 COLOR_STYLES
export const FRIEND_LABEL = { circle: '동글', square: '네모', triangle: '세모', star: '별', cloud: '뭉게', heart: '하티' };
```

친구 ↔ 학급 색: circle=sky, square=mustard, triangle=coral, star=lavender, cloud=sage, heart=rose. 색 값은
`packages/client/src/lib/classroomColor.js` 의 `COLOR_STYLES` 를 그대로 쓴다(새 팔레트를 만들지 않는다).

## 그림 규칙 (SVG)

공통: 선은 잉크색 `#1c2b4a`. 얼굴은 **눈 두 점(r=2.6) · 입 하나 · 볼터치 두 개(`#f6a5a5` 70%)** 만. 그림자는 넣지 않는다
(Excalidraw 의 다른 요소와 같은 평면). 모든 좌표는 아래 viewBox 기준이고 SVG 는 `width/height` 속성 없이 `viewBox` 만 가진다.

| 유형 | viewBox (w×h) | 면 | 친구 | 무늬 적용 |
|---|---|---|---|---|
| `tab` 모서리 탭 | 180×180 (비율 1) | 친구의 `tint` 로 채운 네모. 오른쪽 위 모서리는 30×28 이 패여 있고 그 자리에 친구가 들어간다. 왼쪽 아래 모서리를 살짝 들린 곡선(`Q`)으로 종이 느낌 | 패인 모서리에 지름 32 의 친구 얼굴 전체(`cover` 로 채움, 선 2) | 면 전체 |
| `face` 얼굴 메모지 | 180×200 (비율 1.11) | 친구 **몸통이 메모지**. 둥근 몸통(타원형 pill, 세모·별은 각이 둥근 다각형, 하티는 하트)을 `tint` 로 채우고 `cover` 40% 선 | 위에서 30 지점에 눈·입·볼터치만(지름 없음, 얼굴이 면에 직접) | 얼굴 아래 56 부터 |
| `mark` 워터마크 | 200×190 (비율 0.95) | 종이색 `#f8fafd` 네모, 테두리 `deep` 50% 1.2px, 왼쪽 위에 44×26 색 탭(`deep`, 오른쪽 아래 모서리 r=6) | 가운데에 친구 윤곽 + 얼굴을 **12% 농도**로 면의 70% 크기 | 면 전체(워터마크 위) |
| `cut` 다이컷 | 180×170 (비율 0.94) | 친구마다 다른 외곽: 동글=사과, 네모=우표(톱니 테두리), 세모=조각 케이크, 별=별똥별(꼬리), 뭉게=구름, 하티=말풍선. `tint` 채움, `cover` 40% 선 | 오른쪽 아래 가장자리에 지름 36 의 친구 얼굴이 매달림 | 외곽 안쪽에 `clipPath` 로 |

무늬: `ruled` 는 간격 22 의 수평선, `grid` 는 간격 14 의 정사각 모눈, 둘 다 잉크색 **13% 농도 1px**. `plain` 은 없음.
무늬의 선은 `tint` 면 위에서도, 종이색 위에서도 글씨 대비를 해치지 않도록 13% 를 넘기지 않는다.

이 표는 치수의 기준이고, 실제 경로는 구현에서 `stickyPads.js` 안에 상수로 둔다. 시안 렌더(책상색 위 비교 이미지)는 이 설계를
확정할 때 사용자가 승인한 모양이며 구현은 그 인상을 따른다: 파스텔 면은 조용하고, 캐릭터는 작고, 쓰는 면이 넓다.

## 동작

### 붙이기

1. 도구바 **메모지** 단추(`data-tb="sticky"`, lucide `StickyNote`)를 누르면 도구바 **아래에 붙는 팝오버**가 열린다(도형 메뉴처럼
   도구바 안에 늘어놓기에는 27칸이라 너무 길다). 다른 팝오버(도형·팔레트)와 동시에 열리지 않는다.
2. 팝오버 구성 — 위에서부터 유형 4줄, 각 줄에 친구 6명의 **실제 메모지 미리보기**(해당 유형·친구·현재 무늬로 만든 SVG, 표시 40px,
   누르는 영역 44px 이상). 마지막 줄은 무늬 3칸(민무늬·줄·모눈, 아이콘 + 글자, 현재 값 `aria-pressed`). 줄 머리에 유형 이름을
   작은 글자로 둔다(모서리 탭 · 얼굴 메모지 · 워터마크 · 다이컷). 대문자·번호 없음.
3. 미리보기를 누르면 **즉시** `buildStickyElement` 로 요소를 만들어 `api.addFiles([file])` → `api.updateScene({ elements: [...els, el],
   captureUpdate: CaptureUpdateAction.IMMEDIATELY })` 로 붙이고 팝오버를 닫는다. 붙인 뒤 활성 도구는 **그대로**(펜이면 펜) 라
   바로 쓸 수 있다. undo 한 단계.
4. 마지막 선택(유형·친구·무늬)은 `toolPrefs` 에 기억한다(`mc_sticky_last` = `{ type, friend, pattern }`). 다음에 팝오버를 열면
   그 칸이 `aria-current` 로 표시되고, **단추를 길게 누르거나(500ms) 더블탭하면 팝오버 없이 마지막 메모지를 바로 붙인다**.
5. 폰(≤640px)에서는 팝오버가 화면 너비를 채우고 세로 스크롤된다.

### 잠금 — 쓰기·지우기가 통과

- 메모지는 `locked: true` 라 Excalidraw 의 선택·이동·지우개 모두 건너뛴다(`handleEraser` 는 `locked` 요소를 건너뛴다 —
  0.18.1 코드로 확인). 펜·형광펜은 그 위에 보통 요소로 그려지며 z-순서는 메모지가 아래다(메모지를 나중에 붙이면 기존 필기
  아래로 보내기 위해 붙일 때 **요소 배열의 앞쪽**, 즉 배경 이미지 바로 뒤에 넣는다).
- 문지르기 지우개(`useScribbleErase`)와 올가미(`useLasso`)는 `excludePrefixes` 에 `STICKY_ID_PREFIX` 를 **모든 뷰어에서** 추가한다
  (CoachingViewer·TeacherStudyViewer 는 지금 빈 배열이므로 거기에도).
- `clear`(전체 지우기)는 메모지도 지운다 — 사용자가 "다 지우기"를 눌렀을 때 메모지만 남으면 더 이상하다.

### 이미지·메모지 이동 모드

- `image_move` 단추의 이름을 **"이미지·메모지 이동"** 으로 바꾼다(툴팁 "이미지·메모지 이동 — 배경 이미지와 메모지를 드래그로
  옮기고 크기 조절", 끝낼 때 "이동 완료 (잠금)"). 아이콘은 그대로.
- 켜면 `handleToggleImageMove` 가 배경 이미지와 함께 **`isStickyElement` 인 요소도 `locked: false`** 로 바꾸고, 끄면 다시
  `locked: true` 로 돌린다(배경과 같은 `updateScene`). 모드 안에서는 선택 도구이므로 드래그 이동·모서리 크기 조절(비율 유지)이 된다.
- 모드 안에서 **선택된 요소에 메모지가 하나라도 있으면** 도구바의 W/H 미니 단추 옆에 **[메모지 삭제]** 단추(`data-tb="sticky_delete"`,
  `vw-tb-btn vw-tb-btn--danger`, lucide `Trash2`)가 나타난다. 누르면 선택된 메모지를 `isDeleted: true` 로 바꾼다(undo 한 단계).
  키보드 Delete/Backspace 는 Excalidraw 기본 동작으로 이미 지워진다.
- 선택 변화는 도구바가 **직접** `apiRef.current.onChange((elements, appState) => …)` 를 구독해(0.18 API, 해제 함수 반환)
  `appState.selectedElementIds` 에 메모지가 있는지 계산한다. 뷰어에 새 콜백 prop 을 더하지 않는다. 이동 모드가 켜져 있을 때만 구독한다.

### 교사 코멘트 창(③⑤)

- `DrawingToolbar` 에 `stickyOpacity` prop 을 둔다. 기본 100, `StudentWorkViewer`·`AssignmentWorkViewer` 는 70 을 넘긴다.
  붙일 때 요소의 `opacity` 로 들어가며, 학생 화면에 코멘트 요소로 내려올 때도 그 값이 유지된다(Excalidraw 요소 속성).
- 학생 노트의 메모지는 교사 창에서 학생 필기 층의 요소라 교사가 건드리지 못한다(기존 `STUDENT_NOTE_PREFIX` 보호 규칙 그대로).
  교사의 메모지는 코멘트 층에 들어가 교사만 옮기고 지운다.

### 저장 · 동기화 · 내보내기 · 썸네일

- 저장: 삽입 이미지와 같다. 요소는 `elements`, SVG 는 `files`. 서버·DB·소켓 핸들러·`note.service.ts` 변경 없음.
- 실시간 동기화: 노트 전체 저장 방식(①~⑤)이라 요소와 파일이 함께 간다. 화이트보드는 범위 밖.
- PDF 내보내기(`lib/pdfDownloader.jsx`): `exportToBlob` 이 이미지 요소를 로드된 `<img>` 로 그리므로 SVG 도 래스터로 들어간다.
  별도 처리 없음(구현 시 실제 내보내기로 한 번 확인).
- 페이지 목록 썸네일은 배경(이미지/PDF)만 그리므로 바뀌지 않는다.

## 도구바 변경 (`components/study/DrawingToolbar.jsx`, `lib/toolPrefs.js`)

`TOOLBAR_ORDER` 에 `'sticky'` 를 `'image_add'` 바로 앞에 넣는다(삽입 계열끼리):

```
… 'eraser', 'image_move', 'image_reload', 'sticky', 'image_add', 'line', 'text', 'shapes', 'lasso', 'clear', 'settings'
```

`sticky_delete` 는 이동 모드에서만 나타나는 조건부 단추라 순서 배열에는 넣지 않는다(W/H 미니 단추와 같은 취급).
새 props: `stickyOpacity` (number, 기본 100). 메모지 삽입에 필요한 종이 너비는 도구바가 이미 받는 `apiRef` 로
`getSceneElements()` 의 `__bg_image__` 요소 너비, PDF 쪽은 뷰어가 넘기는 `paperWidth` prop(없으면 260)로 얻는다.

`toolPrefs.js`:
- `mc_sticky_last` — `{ type, friend, pattern }`, `loadStickyLast()` / `saveStickyLast(spec)`. 잘못된 값이면 기본
  `{ type: 'tab', friend: 'circle', pattern: 'plain' }`.

팝오버 CSS 는 `viewer.css` 에 `.vw-tb-pop`(도구바 아래 붙는 흰 판, 하단 그림자 하나, 모서리 8px), `.vw-tb-pop-row`,
`.vw-tb-pop-head`(유형 이름, 12px `--vw-soft`), `.vw-tb-pop-cell`(44px, `aria-current` 는 남색 테두리), `.vw-tb-pop-pattern` 를 추가한다.
색은 상태에만 쓴다(현재 선택 = 남색 테두리). 폰 규칙은 `viewer.css` 의 기존 `@media (max-width: 640px)` 블록에 넣는다.

## 뷰어별 변경

| 창 | 변경 |
|---|---|
| ① `StudyViewer` ② `TeacherStudyViewer` ④ `AssignmentStudyViewer` 코칭 `CoachingViewer` | `useLasso`/`useScribbleErase` 의 `excludePrefixes` 에 `STICKY_ID_PREFIX` 추가. PDF 쪽이면 `paperWidth` 전달. |
| ③ `StudentWorkViewer` ⑤ `AssignmentWorkViewer` | 위와 같음 + `<DrawingToolbar stickyOpacity={70} …>` |

뷰어 쪽 변경은 이 두 가지뿐이다. 붙이기·이동·삭제 로직은 전부 도구바와 `stickyPads.js` 에 있다.

## 오류 · 경계

- `apiRef.current` 가 없으면(초기화 전) 단추는 비활성(`disabled`)이다.
- `addFiles` 뒤 같은 틱에 `updateScene` 하면 이미지가 안 보일 수 있다(StudyViewer 의 배경 로드와 같은 문제) → `addFiles` 후
  다음 프레임에 `updateScene` 한다.
- 읽기 전용 상태(과제 잠김 `isLocked`, 보기 모드)에서는 도구바 자체가 안 나오므로 메모지도 못 붙인다. 추가 처리 없음.
- 오래된 클라이언트가 `customData` 를 모르는 경우: Excalidraw 가 알 수 없는 `customData` 를 그대로 보존하므로 요소가 깨지지 않는다.
- 색각 이상: 친구는 색뿐 아니라 **모양**이 다르므로 색만으로 구분하지 않는다.

## 테스트

- `lib/stickyPads.test.js` — 같은 spec 은 같은 SVG·같은 fileId(결정성), 네 유형의 `stickyAspect`, 무늬별로 `ruled`/`grid` 선 포함
  여부, `buildStickyElement` 가 `locked: true`·`customData.sticky`·`opacity` 를 넣고 `id` 가 `sticky_` 로 시작, `isStickyElement`.
- `components/study/DrawingToolbar.test.js` — `TOOLBAR_ORDER` 에 `sticky` 위치, 단추가 팝오버를 열고 4줄 × 6칸 + 무늬 3칸,
  미리보기 클릭이 `addFiles` 와 `updateScene`(요소 하나 추가, 배경 뒤 위치, `captureUpdate: 'IMMEDIATELY'`)을 호출하고 팝오버를 닫음,
  `stickyOpacity={70}` 이 요소 `opacity` 에 반영, 마지막 선택 기억(`mc_sticky_last`), 이동 모드 켜기/끄기가 메모지 `locked` 를 토글,
  이동 모드에서 메모지를 선택하면 [메모지 삭제] 가 나타나고 누르면 `isDeleted`.
- `hooks/useScribbleErase.test.js` / `lib/lasso.test.js` — `sticky_` 접두사가 제외됨(기존 접두사 테스트에 한 줄).
- 브라우저 확인(Playwright, 기존 `viewer-shots` 픽스처): 학생 창에서 메모지 붙이기 → 그 위에 쓰기 → 지우개로 글만 지워짐 →
  이동 모드에서 옮기고 삭제 → 저장 후 새로고침 유지 → 교사 창에서 보임 + 교사 메모지 70% → PDF 내보내기에 포함.

## 제약 · 뒤로 미룬 것

- **비율 고정 크기 조절**: 이미지 요소의 성질이다. 자유 비율이 꼭 필요해지면 `tab`·`mark` 두 유형만 "면 = 네모 도형 + 친구 = 작은
  그림" 두 요소 묶음으로 바꾸는 2차가 가능하다(그림 규칙 `v: 2`).
- 메모지와 그 위 필기를 **함께 옮기기**: 이동 모드에서 올가미로 같이 선택하면 지금도 함께 움직이지만, 메모지만 끌어도 글이
  따라오게 하려면 프레임 또는 그룹이 필요하다. 2차.
- 문항 번호 자동 라벨, 메모지 접기, 화이트보드 적용 — 모두 2차 이후.

## 참고

- 핀치·도구바·뷰어 크롬: `docs/superpowers/specs/2026-10-30-drawing-toolbar-reorg-highlighter-design.md`, `components/study/viewer.css`
- PDF 페이지(종이 사각형 `bgPosition`): `docs/superpowers/specs/2026-10-30-pdf-pages-design.md`
- 학급 색 6종: `lib/classroomColor.js` `COLOR_STYLES`, `@mathchois/shared` `classroom/color.ts`
