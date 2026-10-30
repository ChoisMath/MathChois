# 필기 도구바 재배치 · 형광펜 · 색상 슬롯 · 화면고정 플로팅 버튼 — 설계

작성일: 2026-10-30
상태: 질의응답으로 확정 (형광펜 색·두께는 펜과 별도 기억 · 투명도 40% 균일 두께 · 바로가기 5칸 모두 편집 가능 + 기본값 복원 ·
화이트보드는 이번 범위 밖)

## 배경 / 문제

5개 필기 뷰어(①~⑤) + AI 코칭 뷰어가 공유하는 `components/study/DrawingToolbar.jsx` 는 도구가 추가되면서 순서가 쓰는 흐름과
맞지 않게 됐다. 색상은 기본 6색 + 사용자 추가 최대 6색이 한 줄로 늘어나고, 추가한 색을 지울 방법이 없다. 형광펜이 없어 밑줄·강조를
펜 두께로 흉내 낸다. 화면고정 버튼이 도구바 안에 있어 도구바를 접거나 보기 모드로 바꾸면 쓸 수 없다.

## 목표

1. **도구 순서**를 아래 한 줄로 고정한다 (6개 뷰어 공통, `DrawingToolbar.jsx` 하나만 바뀐다).
2. **형광펜** 도구를 추가한다 — 투명도 40% 의 Excalidraw freedraw 획. 저장 형식이 바뀌지 않아 지우개·문지르기 지우개·되돌리기·
   저장·실시간 동기화·PDF 가 그대로 동작한다.
3. **색상 바로가기 5칸 + 색상 모달**: 바에는 5칸과 팔레트 버튼만, 편집(스포이드·색상 선택기·HEX·기본값 복원)은 모달에서.
4. **두께 슬라이더 하나**로 펜·형광펜 두께를 켜진 도구에 따라 조절한다.
5. **화면고정 플로팅 버튼**: 이미지 페이지 필기 영역 우측 상단에 작은 버튼으로 항상 표시(보기 모드·도구바 접힘 포함).

### 비목표

- 화이트보드(`components/whiteboard/WhiteboardCanvas.jsx`, Excalidraw 기본 도구바)는 바꾸지 않는다. 형광펜이 필요하면 별도 작업.
- 사각 끝(마커) 모양 형광펜, 형광펜 멈춤 도형 보정, 도형 도구의 두께 조절(지금처럼 2 고정).
- 기존 `mc_custom_colors` 의 이전(마이그레이션). 더 이상 읽지 않는다.

## 도구바 구성

```
[↶ ↷] | [펜] [형광펜] [손가락필기] [레이저포인터] | [●][●][●][●][●] [🎨] | [두께 슬라이더 + 미리보기] |
[지우개] [이미지이동] (이동 모드일 때 W−+ H−+) [이미지새로고침] [이미지추가] | [직선] [텍스트] [도형▾] [선택] | [전체지움] | [설정]
```

- HTML 도구 페이지(`htmlMode`)에서는 지금처럼 이미지이동·이미지새로고침이 숨겨진다 (`onReloadImage` 미전달).
- 도형▾ 서브메뉴(사각형·원·삼각형)는 지금처럼 버튼 옆에 인라인으로 펼쳐진다.
- 바에서 빠지는 것: 스포이드, 색 추가(+), 화면고정. 각각 모달과 플로팅 버튼으로 이동.
- 아이콘(lucide-react 0.575): 형광펜 `Highlighter`, 팔레트 `Palette`, 고정 `Lock`/`Unlock`(기존). 나머지는 기존 아이콘 유지.

## 형광펜

- 논리 도구 이름 `highlighter`. Excalidraw 쪽은 `activeTool: freedraw`, `currentItemOpacity: 40`, `currentItemStrokeColor` 는
  형광펜 색, `currentItemStrokeWidth` 는 형광펜 두께(줌 보정 `sceneStrokeWidth`).
- 펜(`freedraw`)으로 돌아갈 때 `currentItemOpacity: 100` 과 펜 색·두께를 복구한다. 다른 도구(직선·도형·텍스트)로 갈 때도 투명도를
  100 으로 되돌린다 — 형광펜 뒤에 그린 사각형이 반투명이 되면 안 된다.
- **별도 기억**(localStorage): 색 `mc_hl_color`(기본 `#ffd43b`), 두께 `mc_hl_width`(기본 1.2 = 화면 12px, 범위 0.4~3, 단계 0.1).
  펜은 기존 `mc_tool_color`·`mc_stroke_width`(0.05~2, 단계 0.05) 그대로.
- 페이지 진입 시 초기화는 지금처럼 **펜 + 검정**. 형광펜 색·두께는 저장값을 유지한다.
- 웻잉크(`hooks/useWetInk.js`): 미리보기와 commit 요소 모두 `currentItemOpacity` 를 따른다(`makeFreedrawElement` 에 `opacity`
  옵션). `currentItemOpacity < 100` 이면 멈춤 도형 보정을 하지 않는다(형광펜 획은 보정 대상이 아니다). 6개 뷰어의
  `onActiveToolChange` 는 `freedraw` 와 `highlighter` 둘 다 펜 활성으로 넘긴다.
- 줌 보정(`baseStrokeWidthRef`): 도구바가 `onBaseWidthChange` 로 **켜진 도구의 두께**를 넘기므로 뷰어 코드는 바뀌지 않는다.
  도구를 바꿀 때도 호출한다.

## 색상 바로가기 5칸 + 모달

- 바: 5칸(현재 도구 색과 같은 칸에 테두리 강조) + 🎨 버튼. 칸을 누르면 **켜진 도구**(펜 또는 형광펜)의 색이 바뀐다. 지우개·선택·
  이미지이동 중이면 지금처럼 펜으로 전환된다(형광펜 중이면 형광펜 유지).
- 저장: `mc_color_slots` 에 길이 5 의 HEX 배열. 기본 `['#000000', '#e03131', '#1971c2', '#2f9e44', '#f08c00']`(검정·빨강·파랑·초록·주황 — 검정은 기존 펜 초기색 그대로).
  잘못된 값(길이·형식)이면 기본값으로.
- 모달(`components/study/ColorSlotsModal.jsx`, `createPortal` → body, 바깥 클릭·Esc·닫기 버튼으로 닫힘):
  - 상단: 5칸. 처음 선택 칸은 현재 도구 색과 같은 칸, 없으면 1번. 칸을 누르면 그 칸이 편집 대상이 되고 그 색이 현재 도구에 적용된다.
  - 자주 쓰는 색 격자(약 20색) — 누르면 선택 칸이 그 색으로 바뀌고 현재 도구에 적용.
  - 네이티브 `<input type="color">`, HEX 입력(`#rrggbb` 유효할 때만 적용), 스포이드(`window.EyeDropper` 없으면 비활성 + 안내 제목).
  - 「기본값으로」 버튼: 5칸을 기본값으로 되돌림.
  - 모든 변경은 즉시 `mc_color_slots` 저장.
- `lib/excalidrawUtils.js` 의 `DEFAULT_COLORS`·`MAX_CUSTOM_COLORS` 는 다른 곳에서 쓰지 않으면 제거한다.

## 두께 슬라이더

- 켜진 도구가 형광펜이면 `mc_hl_width` 범위·값, 아니면 펜 범위·값. 미리보기 선은 켜진 도구의 색, 형광펜이면 투명도 0.4.
- 변경 시 해당 저장 키와 `currentItemStrokeWidth`(줌 보정)를 갱신하고 `onBaseWidthChange` 를 부른다.

## 화면고정 플로팅 버튼

- `components/study/ScreenLockFab.jsx`: `{ locked, onToggle }`. 32px 원형, `absolute top-2 right-2 z-30`, 고정 중 노란색
  (`bg-amber-100 text-amber-600`), 아니면 흰 배경 회색 아이콘. `aria-label`/`title` 은 기존 문구(「화면 고정 — 확대/축소·이동 차단」
  / 「화면 고정 해제」).
- 각 뷰어의 **이미지 페이지 Excalidraw 컨테이너**(`ref={containerRef}` 인 `relative overflow-hidden` div) 안에 둔다 — 보기 모드·
  도구바 접힘과 무관하게 캔버스가 있으면 보인다. 다음 페이지 화살표(`PageNavOverlay`, 우측 세로 중앙)와 겹치지 않는다.
- 영상·HTML 페이지에는 두지 않는다(HTML 은 항상 고정). `DrawingToolbar` 의 `screenLocked`/`onToggleScreenLock` prop 은 제거한다.
- 대상: StudyViewer, TeacherStudyViewer, StudentWorkViewer, AssignmentWorkViewer, AssignmentStudyViewer, CoachingViewer.

## 모듈

- `lib/toolPrefs.js`(신규, 순수 함수): 색 슬롯 로드/저장/기본값, 펜·형광펜 상수(`HL_OPACITY = 40`, `HL_WIDTH_*`, `HL_COLOR_DEFAULT`),
  HEX 검증. 테스트 `lib/toolPrefs.test.js`.
- `components/study/ColorSlotsModal.jsx`(신규), `components/study/ScreenLockFab.jsx`(신규).
- `components/study/DrawingToolbar.jsx`: 순서·형광펜·슬롯·슬라이더. jsdom 테스트 `components/study/DrawingToolbar.test.js`
  (버튼 순서, 형광펜 전환 시 appState, 슬라이더 값 전환, 슬롯 클릭).
- `hooks/useWetInk.js`, `lib/wetInkStroke.js`: opacity 전달·보정 생략. 기존 훅 테스트에 케이스 추가.

## 검증

vitest 전체 녹색, eslint 0 오류, `vite build` 성공, Playwright 로 도구바·모달·플로팅 버튼 스크린샷 확인 후 main 머지 → Railway 배포 확인.
