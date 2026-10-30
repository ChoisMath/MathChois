# 올가미 선택 · 배경 이미지 화면 맞춤 — 설계

작성일: 2026-10-30
상태: 질의응답으로 확정 (열 때 화면을 이미지에 맞춤 · 비율 불일치는 높이 보정 · 올가미 기준 "획 점의 절반 이상" ·
선택 영역 안은 이동, 밖은 새 올가미)

## 1. 배경 이미지가 작게/찌그러져 뜨는 문제

### 원인 (코드 분석)

5개 필기 뷰어는 페이지를 열 때 노트에 저장된 `bgPosition`(배경 이미지 요소의 x·y·폭·높이, **scene 절대 px**)이 있으면
그대로 쓰고, 없을 때만 `calculateBgPosition(컨테이너 폭·높이, 이미지 원본 폭·높이)`로 화면에 맞춰 계산한다. 페이지를 **열기만 해도**
첫 onChange 에서 `bgPosition` 이 노트와 함께 저장된다(`lastSavedRef` 초기값 null).

1. **작게 보임**: 어떤 기기(예: 휴대폰 360px 폭)에서 처음 연 페이지는 그 화면 크기로 폭·높이가 저장되고, 이후 아이패드·PC 에서도
   줌 1·스크롤 0 으로 그대로 재사용되어 작게 보인다. 처음 연 기기가 페이지마다 다르면 같은 챕터 안에서도 들쭉날쭉하다.
   교사·학생 노트가 각자 `bgPosition` 을 가지므로 사용자마다 다르게 나타난다.
2. **찌그러짐**: 저장된 폭·높이 비율이 이미지 원본 비율과 다르면 Excalidraw 가 그 상자에 이미지를 늘려 그린다. 페이지 이미지는
   교체되지 않으므로(이미지 변경 API 없음) 비율이 틀어지는 경로는 이미지 이동 모드의 **W/H 버튼** 또는 **모서리 핸들 크기 조절**이
   저장된 경우다. 진단 오버레이로 기기에서 확인한다(아래).

### 수정

- 저장된 위치·크기는 필기 좌표와 맞물려 있으므로 **바꾸지 않는다**. 대신 열 때 **뷰포트(줌·스크롤)를 이미지에 맞춘다**:
  `lib/bgFit.js` `fitViewportToBg({ containerWidth, containerHeight, bg })` → `{ zoom, scrollX, scrollY }`.
  줌 = min((W−2·여백)/bg.width, (H−여백)/bg.height) 를 Excalidraw 범위(0.1~30)로 자르고, 가로 중앙·위 여백 정렬.
  Excalidraw 좌표: screen = (scene + scroll)·zoom → scrollX = (W/zoom − bg.width)/2 − bg.x, scrollY = 여백/zoom − bg.y.
- 비율 불일치: `fixBgAspect(saved, imageW, imageH, tol = 0.02)` — 저장 비율이 이미지 비율과 2% 넘게 다르면 **폭·x·y 는 유지하고
  높이만 이미지 비율로** 바꾼다. 보정된 값은 onChange 경로로 자연히 다시 저장된다.
- 적용 지점: 5개 뷰어의 Excalidraw 마운트(저장값/계산값 모두 — 계산값은 줌≈1, 가로 중앙 정렬만 달라짐)와 이미지 새로고침.
  `updateScene({ elements, appState: { zoom, scrollX, scrollY } })` 한 번에. 펜 두께는 뷰어 공통 줌 보정이 이미 처리한다.
  화면 고정은 고정 시점의 뷰포트를 기준으로 삼으므로 영향 없다. HTML 도구 페이지(배경 없음)·영상·코칭 뷰어(배경 없음)는 대상 아님.
- **진단**: `?penlog=1` 오버레이에 「배경 이미지」 줄 추가 — 출처(저장값/계산), 저장 폭×높이, 이미지 원본 폭×높이, 비율 차(%),
  컨테이너 폭×높이, 적용 줌. `lib/bgLoadLog.js`(set/subscribe) 에 뷰어가 기록한다.

## 2. 올가미 선택

Excalidraw 0.18.1 에는 올가미 도구가 없다(번들에 `lasso` 없음). 도구바의 「선택」(사각 끌기)을 **올가미**로 바꾼다.

- 도구바: `selection` 버튼 → `lasso`(lucide `LassoSelect`, 제목 「올가미 선택」). `TOOLBAR_ORDER` 의 `selection` → `lasso`.
  논리 도구 `lasso` 일 때 Excalidraw 도구는 `selection`. `onActiveToolChange('lasso')` 로 뷰어가 `lassoActiveRef` 를 켠다.
- `hooks/useLasso.js({ excalidrawAPIRef, overlayRef, drawModeRef, lassoActiveRef, excludeIds, excludePrefixes })`:
  웻잉크와 같은 window-capture 가로채기, 같은 오버레이 캔버스를 공유한다(두 도구는 동시에 켜지지 않는다).
  - 가로채는 입력: 펜·마우스 주버튼, 손가락은 입력 모드가 `finger` 일 때만(스타일러스 모드의 손가락은 팬/줌). 두 번째 손가락이 닿으면
    진행 중 올가미를 취소한다.
  - 그리는 동안 오버레이에 **점선**(회색 `#4b5563`, 1.5px, dash 6/4)으로 경로를 그리고 끝점→시작점을 옅은 점선으로 닫아 보여준다.
  - 떼면: 경로 점을 scene 좌표로 바꿔 `lib/lasso.js` `lassoSelection(elements, polygon, opts)` 로 선택 집합을 구하고
    `updateScene({ appState: { selectedElementIds, selectedGroupIds } })`. 이동 거리 < 6px(탭) 또는 점 3개 미만이면 선택 해제만.
  - 선택이 있는 상태에서 다시 누르면: 누른 점이 **선택 묶음의 화면 bbox + 핸들 여백 안**이면 가로채지 않는다(Excalidraw 가 이동·크기
    조절·회전 처리). 밖이면 새 올가미(이전 선택은 지워진다). 여백은 Excalidraw 핸들 기하(상자 밖 여백 4 + 핸들 한 변 마우스 8 /
    펜 16 / 손가락 28 − 안쪽 겹침, +2 허용; 위쪽은 회전 핸들 16 더)를 포인터 종류별로 계산한다(`selectionPad`, 2026-10-30 아이패드
    확인에서 8px 고정 여백으로는 펜·손가락 핸들을 누를 때 새 올가미가 시작되던 문제 수정).
- `lib/lasso.js`(순수): `pointInPolygon(p, poly)`(ray casting), `lassoSelection(elements, poly, { excludeIds, excludePrefixes })`:
  - 제외: `isDeleted`, `locked`, 배경 `__bg_image__`, 교사 코멘트 접두사 등 `excludePrefixes`, `excludeIds`.
  - freedraw/line/arrow: `el.x + p[0], el.y + p[1]` 점들 중 **50% 이상**이 안에 있으면 선택.
  - 그 외(image/text/rectangle/ellipse/…): bbox 중심이 안에 있으면 선택.
  - 그룹: 선택된 요소가 속한 그룹(`groupIds` 마지막)의 모든 요소를 함께 선택하고 `selectedGroupIds` 에 그룹을 넣는다
    (도형 보정 채우기 `customData.shapeFill` 은 획과 같은 그룹이므로 함께 움직인다).
  - `selectionScreenBounds(elements, selectedIds, appState, pad)` → 화면 좌표 bbox 또는 null.
- 삭제·이동·크기 조절은 Excalidraw 선택 상태의 기존 동작(키보드 Delete, 드래그, 핸들). 지우개로 획 단위 삭제도 그대로.
- 화이트보드(Excalidraw 기본 도구바)는 대상 아님.

## 검증

`lib/bgFit.test.js`, `lib/lasso.test.js`, `hooks/useLasso.test.js`(jsdom: 올가미 → 선택 집합, 탭 → 해제, 선택 안 누름 → 통과),
`DrawingToolbar.test.js` 순서 갱신. eslint 0 오류, 빌드, Playwright 로 올가미 점선 렌더 확인 → main 머지 → 배포 확인.
