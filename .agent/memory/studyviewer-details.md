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
- **DrawingToolbar.jsx**: 펜, 텍스트, 지우개, 색상 팔레트 등 담당. Samsung S Pen 배럴 버튼(사이드 버튼)을 누르면 지우개로 전환되는 로직 내장.

## 자동 저장 로직 (일반 학습)

- `student_notes` 테이블 사용
- Excalidraw `onChange` 이벤트 발생 시 1500ms 디바운싱 타이머 작동
- 캔버스 내 `BG_ELEMENT_ID` 객체를 제외한 순수 필기(elements)만 JSON 형태로 저장

## 과제 시스템 추가 로직 (Phase 5)

- 일반 학습과 동일한 뷰어 메커니즘을 사용하되 테이블과 스토리지 경로가 다름.
- `assignment_notes` 테이블을 사용해 필기 데이터 저장 (디바운스 동일)
- 제출 전 상태('draft')에서 학생이 직접 "제출하기" 버튼 등을 통해 `assignment_submissions` 테이블의 `status`를 'submitted'로 변경할 것으로 예상.
- 교사는 `AssignmentWorkViewer` (과제 확인 뷰어)를 통해 학생의 `assignment_notes`를 렌더링하고, 투명도가 들어간 `assignment_teacher_comments`를 덧그려 피드백할 수 있음.
