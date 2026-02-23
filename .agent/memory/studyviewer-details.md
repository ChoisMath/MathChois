# StudyViewer 및 AssignmentViewer 상세 구현

## 개요

- 학생이 교사가 업로드한 수학 페이지/과제 이미지를 보면서 Excalidraw로 필기하는 전체화면 뷰어
- DashboardLayout 밖에 배치 (사이드바 없는 독립 전체화면)
- 라우트:
  - 일반 학습: `/student/study/:chapterId/page/:pageId`
  - 과제 풀이: `/student/assignments/:assignmentId/page/:pageId` (Phase 5 신규)

---

## 핵심 구조 및 상수

- **BG_ELEMENT_ID (`__bg_image__`)**: 배경 이미지 Excalidraw element ID. 이미지를 배경 CSS로 깔지 않고 객체로 삽입해 확대/축소 시 펜 획과 어긋나지 않게 함.
- **모바일 100dvh**: 상단/하단 툴바가 브라우저 주소창 스크롤에 의해 가려지는 문제를 막기 위해 `height: 100dvh` 적용.
- **DrawingToolbar.jsx**: 펜, 텍스트, 지우개, 색상 팔레트 등 담당.
  - **펜 기본값**: 두께 `0.2`, 색상 `#000000` (순수 검정). localStorage(`mc_stroke_width`, `mc_tool_color`)에 값이 있으면 그 값 사용 (페이지 이동 시 설정 유지).
  - **두께 슬라이더**: 범위 `0.1 ~ 2.0` (step 0.1), 넓이 `w-32` (Tailwind).
  - **레이저 포인터 모드**: 선택한 색상의 네온 글로우 트레일이 2초에 걸쳐 서서히 사라짐. Canvas 오버레이(`fixed inset-0 z-50`)로 구현, Excalidraw 위에 겹침. 포인터 그리기 데이터는 저장하지 않음.

## 자동 저장 로직 (일반 학습)

- `student_notes` 테이블 사용
- Excalidraw `onChange` 이벤트 발생 시 1500ms 디바운싱 타이머 작동
- 캔버스 내 `BG_ELEMENT_ID` 객체를 제외한 순수 필기(elements)만 JSON 형태로 저장

## 과제 시스템 추가 로직 (Phase 5)

- 일반 학습과 동일한 뷰어 메커니즘을 사용하되 테이블과 스토리지 경로가 다름.
- `assignment_notes` 테이블을 사용해 필기 데이터 저장 (디바운스 동일)
- 제출 전 상태('draft')에서 학생이 직접 "제출하기" 버튼 등을 통해 `assignment_submissions` 테이블의 `status`를 'submitted'로 변경.
- 교사는 `AssignmentWorkViewer` (과제 확인 뷰어)를 통해 학생의 `assignment_notes`를 렌더링하고, 투명도가 들어간 `assignment_teacher_comments`를 덧그려 피드백할 수 있음.

---

## 중요: 모바일 터치 처리 및 제스처 하이재킹 (Palm Rejection & Vertical Panning)

모든 전체화면 뷰어(교사/학생, 일반/과제)에는 동일한 터치 우회 로직이 삽입되어 있습니다. Excalidraw 자체 물리 엔진이 일으키는 줌 가속도 튕김(Feedback Loop) 현상을 원천 차단하기 위한 것입니다.

1. **Palm Rejection (손바닥/넓은 면적 인식 차단)**
   - `pointerdown`, `pointermove`, `touchstart`, `touchmove`를 capture(=true) 단계에서 감지.
   - 포인터의 `width`/`height` 또는 터치의 `radiusX`/`radiusY`가 25를 초과하면 해당 이벤트를 `e.stopPropagation()` 시켜 Excalidraw 캔버스 객체에 전달되지 않도록 막아, 손목이 닿았을 때 선이 그어지는 것을 방지합니다.

2. **2-Finger 펜 모드 하이재킹 (Strict Vertical Panning)**
   - **문제점:** 펜(Freedraw) 모드 상태에서 두 손가락으로 화면을 이동(Panning)시킬 때, Excalidraw는 확대/축소(Zoom)와 이동(Scroll)을 동시에 연산하여 화면이 급격하게 축소되거나 가로로 틀어지는 버그가 존재했습니다.
   - **해결책:** `activeTool === 'freedraw'` 상태일 때, 터치가 2개 감지되면 `e.stopPropagation()`으로 Excalidraw의 고유 제스처 처리를 즉시 중단시킵니다. 그 후, 이전 이벤트 대비 상승/하강한 Y좌표의 변화량(deltaY)만을 추출해 `excalidrawAPI.updateScene({ appState: { scrollY: ... } })`로 줌 비율(`appState.zoom.value`)에 맞춰 수동 주입합니다. 이를 통해 **사용자는 펜 모드에서 완전히 고정된 가로 폭 크기로 깔끔한 상하 스크롤링만 경험**하게 됩니다.

## PDF 생성 흐름 (usePdfDownloader)

학생(StudyViewer, AssignmentStudyViewer) 및 교사(TeacherStudyViewer) 사이드바에서 특정 페이지 다운로드 밎 전권 다운로드 기능이 존재합니다.

- `html2canvas`와 `jspdf`를 결합하여 사용합니다.
- `<Excalidraw>`의 `exportToCanvas` API 함수를 보이지 않는 메모리 상단의 백그라운드 캔버스 요소로 랜더링 조립 후 PNG 버퍼로 떠서 A4 비율 PDF로 뽑아냅니다.
- **전권 다운로드:** 해당 챕터/과제의 전체 Array 길이를 순회하면서 배경 및 사용자 Elements 데이터를 모두 합성하여 단일 PDF에 Multi-page로 Add시킵니다.
