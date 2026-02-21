# StudyViewer 상세 구현 (src/pages/Study/StudyViewer.jsx)

## 개요
- 학생이 교사가 업로드한 수학 페이지 이미지를 보면서 Excalidraw로 필기하는 전체화면 뷰어
- DashboardLayout 밖에 배치 (사이드바 없는 독립 전체화면)
- 라우트: `/student/study/:chapterId/page/:pageId`

---

## 레이아웃 구조

```
h-screen flex flex-col
├── 상단 네비바 (h-14)
│   ├── 뒤로가기 버튼 (navigate(-1))
│   ├── 챕터 제목 + 페이지 번호 (N / total)
│   ├── 저장 상태 표시 ('저장됨' / '저장 중...')
│   └── 필기 모드 토글 버튼
├── 필기 툴바 (h-11, drawMode=true 시에만 표시)
│   └── DrawingToolbar 컴포넌트
└── 본문 (flex-1)
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
| 실행 취소 | Undo2 | `api.history.undo()` |
| 다시 실행 | Redo2 | `api.history.redo()` |
| 전체 지우기 | Trash2 | BG element 유지, 나머지 elements 모두 제거 |
| 세부 설정 | SlidersHorizontal | `showExcalidrawPanel` 토글 (PANEL_HIDE_CSS 적용 여부) |

### EyeDropper (스포이드)
- `window.EyeDropper` 존재 여부로 Chrome/Edge 95+ 감지
- 색상 선택 후 커스텀 색상 목록에 추가, `localStorage` 동기화

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
4. **Excalidraw 버전**: 0.18 기준 — 업그레이드 시 API 변경(`history.undo`, `setActiveTool` 등) 확인 필요
5. **CORS**: `fetchAsDataUrl`은 Storage 버킷이 public이고 CORS 허용이어야 작동
