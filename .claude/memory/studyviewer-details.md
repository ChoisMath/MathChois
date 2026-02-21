# StudyViewer 상세 구현 (src/pages/Study/StudyViewer.jsx)

## 개요
- 학생이 교사가 업로드한 수학 페이지 이미지를 보면서 Excalidraw로 필기하는 전체화면 뷰어
- DashboardLayout 밖에 배치 (사이드바 없는 독립 전체화면)
- 라우트: `/student/study/:chapterId/page/:pageId`

---

## 레이아웃 구조

```
flex flex-col overflow-hidden (height: 100dvh)
├── 상단 네비바 (h-14, flex-shrink-0)
│   ├── 뒤로가기 / 챕터 제목 / 페이지 번호
│   ├── 저장 상태 표시
│   ├── 툴바 접기/펼치기 버튼 (ChevronUp/Down, draw 모드에서만)
│   └── 필기 모드 토글 버튼 (Pencil 아이콘)
├── 필기 툴바 (h-11, drawMode=true && !toolbarCollapsed 시에만 표시)
│   └── DrawingToolbar 컴포넌트
└── 본문 (flex-1 overflow-hidden)
    ├── 페이지 목록 사이드바 (w-44, sidebarOpen=true 시)
    ├── 뷰 모드: 페이지 이미지 + 이전/다음 버튼
    └── 필기 모드: 모눈종이 배경(GRID_STYLE) + Excalidraw
```

---

## 모드

| 모드 | 설명 |
|------|------|
| 뷰 모드 (기본) | 페이지 이미지를 `max-height: calc(100vh - 12rem)`으로 표시, 이전/다음 버튼 네비게이션 |
| 필기 모드 | 모눈종이 배경 + Excalidraw. 배경 이미지를 Excalidraw image element(`BG_ELEMENT_ID`)로 삽입 |

---

## 핵심 상수

```js
BG_ELEMENT_ID = '__bg_image__'   // 배경 이미지 Excalidraw element ID
BG_FILE_ID    = '__bg_file__'    // Excalidraw Files 맵 키

DEFAULT_COLORS = ['#1e1e1e', '#e03131', '#2f9e44', '#1971c2', '#f08c00', '#9c36b5']
MAX_CUSTOM_COLORS = 6            // localStorage 'mc_custom_colors' 키에 저장

STROKE_WIDTHS = [
  { value: 1, label: 'S' },
  { value: 2, label: 'M' },
  { value: 4, label: 'L' },
  { value: 8, label: 'XL' },
]

GRID_STYLE = {
  backgroundColor: '#ffffff',
  backgroundImage: 'linear-gradient(rgba(180,190,210,0.35) 1px, ...) ...',
  backgroundSize: '20px 20px',
}
```

---

## DrawingToolbar 도구 목록

| 도구 | 아이콘 | 동작 |
|------|--------|------|
| 선택 | MousePointer | `api.setActiveTool({ type: 'selection' })` |
| 자유 필기 | Pen | `api.setActiveTool({ type: 'freedraw' })` |
| 텍스트 | Type | `api.setActiveTool({ type: 'text' })` |
| 직선 | Minus | `api.setActiveTool({ type: 'line' })` |
| 사각형 | Square | `api.setActiveTool({ type: 'rectangle' })` |
| 획 지우기 | Eraser | `api.setActiveTool({ type: 'eraser' })` — 획 단위 |
| 영역 삭제 | Scissors | selection 모드로 전환 후 `handleDeleteSelected` 버튼 노출 (BG element 보호) |
| 이미지 이동 | Hand | BG element의 `locked` 속성 토글 |
| 색상 팔레트 | — | DEFAULT_COLORS 6개 + 커스텀 최대 6개 + EyeDropper |
| 선 굵기 | — | S(1)/M(2)/L(4)/XL(8) → `api.updateScene({ appState: { currentItemStrokeWidth } })` |
| 실행 취소 | Undo2 | `document.dispatchEvent(new KeyboardEvent('keydown', { code:'KeyZ', ctrlKey:true, bubbles:true }))` |
| 다시 실행 | Redo2 | `document.dispatchEvent(new KeyboardEvent('keydown', { code:'KeyY', ctrlKey:true, bubbles:true }))` |
| 전체 지우기 | Trash2 | BG element 유지, 나머지 elements 모두 제거 |
| 세부 설정 | SlidersHorizontal | `showExcalidrawPanel` 토글 (PANEL_HIDE_CSS 적용 여부) |

### EyeDropper (스포이드)
- `window.EyeDropper` 존재 여부로 Chrome/Edge 95+ 감지
- 색상 선택 후 커스텀 색상 목록에 추가, `localStorage` 동기화

> 주의: Excalidraw v0.18 API에 `history.undo()` / `history.redo()` 없음. `history`는 `clear()` 만 있음.

---

## S Pen 배럴(Side) 버튼 지원 (DrawingToolbar.jsx)

Samsung Galaxy Tab S Pen의 배럴 버튼(옆 버튼)을 누른 동안 자동으로 지우개 모드로 전환.

### 구현 패턴
- 감지: `pointerType === 'pen' && button === 2`
- `capture: true` — Excalidraw 내부 핸들러보다 먼저 실행됨
- Stale closure 방지: `activeToolRef.current = activeTool` (매 렌더) + `applyToolRef.current = applyTool` (함수 정의 직후)
- `sPenPrevToolRef` — 버튼 누르기 전 도구 저장 → 버튼 뗄 때 복원

```js
// 중요: applyToolRef.current = applyTool 은 반드시 함수 정의 후에 위치해야 함
// const applyTool = ... 보다 앞에 applyToolRef.current = applyTool 을 두면
// ReferenceError: Cannot access 'applyTool' before initialization 발생
const applyTool = (type) => { ... };
applyToolRef.current = applyTool; // ← 함수 정의 바로 다음!
```

이벤트 리스너는 `useEffect` 내에서 등록 (deps: []):
- `pointerdown` (capture) → 배럴 버튼 감지 → 지우개로 전환
- `pointerup`, `pointercancel` → 이전 도구 복원

---

## 모바일 Chrome 뷰포트 처리

### 문제
- `h-screen` (= `100vh`): 모바일 Chrome에서 주소창 표시 여부와 무관하게 고정 높이 → 주소창이 표시될 때 레이아웃이 화면 아래로 넘쳐 네비바가 스크롤되어 올라감
- `fixed inset-0`: 네비바 고정 성공하지만 Chrome의 "캔버스를 위로 스와이프하여 주소창 숨기기" 제스처 차단

### 해결책
```jsx
<div className="flex flex-col overflow-hidden bg-gray-100" style={{ height: '100dvh' }}>
```
- `100dvh` (dynamic viewport height): 주소창 표시/숨김에 따라 자동으로 높이 조절
- `overflow-hidden`: 실제 페이지 스크롤 방지 (네비바 고정)
- `position: static` (기본값): Chrome의 스와이프 제스처 감지 허용

### 지원
Chrome 108+, Firefox 101+, Safari 15.4+

---

## 배경 이미지 처리 파이프라인 (handleExcalidrawMount)

```
1. fetchAsDataUrl(url)
   └── CORS fetch → Blob → FileReader → { dataUrl, mimeType }

2. getImageNaturalSize(dataUrl)
   └── Image onload → { w: naturalWidth, h: naturalHeight }

3. 초기 bgPosition 계산
   ├── bgPositionRef.current 있으면 → 저장된 값 사용
   └── 없으면 → object-contain 방식으로 containerRef 크기 기준 계산
       scale = Math.min(containerW / iW, containerH / iH)
       bgW = iW * scale, bgH = iH * scale
       bgX = (containerW - bgW) / 2, bgY = (containerH - bgH) / 2

4. api.addFiles([{ id: BG_FILE_ID, dataURL, mimeType, created: Date.now() }])

5. api.updateScene({
     elements: [
       createBgElement(bgX, bgY, bgW, bgH),  // locked: true
       ...noteElementsRef.current
     ]
   })
```

---

## Excalidraw CSS 숨김 설정

```js
// ALWAYS_HIDE_CSS (항상 숨김)
.excalidraw .App-toolbar
.excalidraw .App-toolbar-container
.excalidraw .layer-ui__wrapper__top-left
.excalidraw .layer-ui__wrapper__top-right
.excalidraw .App-bottom-bar
.excalidraw .HintViewer
.excalidraw [data-testid="toolbar"]
.excalidraw .ToolIcon__keybinding { display: none !important; }

// PANEL_HIDE_CSS (showExcalidrawPanel=false 시 추가 숨김)
.excalidraw .island
.excalidraw .App-menu
.excalidraw .popover
.excalidraw .context-menu
.excalidraw .layer-ui__wrapper__footer { display: none !important; }
```

### UIOptions (비활성화)
```js
canvasActions: {
  changeViewBackgroundColor: false,
  clearCanvas: false,
  export: false,
  loadScene: false,
  saveToActiveFile: false,
  toggleTheme: false,
  saveAsImage: false,
}
tools: { image: false }  // 사용자 이미지 삽입 비활성화
```

---

## 저장 로직

### 트리거
- `handleExcalidrawChange(elements)`: Excalidraw `onChange` 콜백
- debounce 1500ms (`saveTimerRef`)
- BG element(`id === BG_ELEMENT_ID`) 및 `isDeleted` elements 제외하고 저장

### Supabase upsert
```js
student_notes.upsert({
  student_id: user.id,
  page_id: currentPage.id,
  excalidraw_data: {
    elements: userElements,            // BG 제외
    bgPosition: bgPositionRef.current  // { x, y, width, height }
  },
  updated_at: new Date().toISOString()
}, { onConflict: 'student_id,page_id' })
```

### 더티체크 (중복 저장 방지)
- `lastSavedRef.current` — 마지막 성공 저장 내용의 JSON 문자열
- 직렬화 키: `{ id, type, x, y, points, text, width, height, strokeColor, strokeWidth }`
- `onChange` 시 `serialized === lastSavedRef.current` 이면 debounce 타이머 설정 안 함
- 저장 성공 시 `lastSavedRef.current = serialized` 갱신
- 페이지 변경 시 `lastSavedRef.current = null` 초기화

### 저장 상태
- `'saved'` → "저장됨" (green)
- `'saving'` → "저장 중..." (gray)

---

## Refs 사용 목적 (무한루프 방지)

| Ref | 용도 |
|-----|------|
| `currentPageRef` | onChange closure의 stale closure 방지 |
| `noteElementsRef` | Excalidraw 마운트 시 초기 elements 주입 |
| `bgPositionRef` | BG element 이동 추적, 저장/복원 |
| `saveTimerRef` | debounce setTimeout ID |
| `excalidrawAPIRef` | DrawingToolbar에서 Excalidraw API 호출 |
| `containerRef` | 컨테이너 크기 측정 (배경 초기 위치 계산) |

---

## 알려진 제약사항

1. **EyeDropper**: Chrome/Edge 95+만 지원, Firefox 미지원
2. **이미지 이동**: BG element locked 해제로 이동 가능하나, 이동 후 별도 re-lock 필요
3. **필기→뷰 모드 전환**: debounce 1500ms 중 전환 시 마지막 필기 손실 가능성
4. **Excalidraw v0.18 API 주의사항**:
   - `history.undo()` / `history.redo()` 없음 → `document.dispatchEvent(KeyboardEvent)` 사용
   - `history`는 `clear()` 만 있음
   - `updateScene()` 기본값은 `commitToHistory: true` → 프로그래매틱 호출 시 반드시 `commitToHistory: false` 명시
5. **CORS**: `fetchAsDataUrl`은 Storage 버킷이 public이고 CORS 허용이어야 작동
