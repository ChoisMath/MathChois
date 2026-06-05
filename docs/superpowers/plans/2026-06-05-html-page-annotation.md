# HTML Page Annotation Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let students/teachers pen-annotate on top of interactive HTML tool pages, by overlaying a transparent Excalidraw layer over the tool iframe in the three viewers where HTML pages exist (① StudyViewer, ② TeacherStudyViewer, ③ StudentWorkViewer).

**Architecture:** A shared `HtmlToolOverlay` component stacks a transparent, viewport-locked Excalidraw canvas over the existing tool `<iframe>`. A `drawing` flag toggles `pointer-events` (overlay vs iframe) and `viewModeEnabled`, so the student either operates the tool or draws. Viewport pan/zoom is locked to keep the overlay aligned 1:1 with the fixed iframe. Persistence/sync/teacher-comments reuse the existing notes/comments tables, routes, and sockets unchanged (no server work).

**Tech Stack:** React 19, Vite 7, Excalidraw 0.18, Tailwind 4, Vitest (jsdom) for the one unit-testable helper. Viewer-level behavior (Excalidraw cannot mount in jsdom) is verified by lint + build + manual E2E, consistent with how this repo already tests its viewers (Playwright/manual).

**Scope note:** ④ AssignmentStudyViewer / ⑤ AssignmentWorkViewer are intentionally excluded — `assignment_pages` has no `html_url` column, so assignment pages cannot be HTML tools and those viewers have no HTML branch. Adding HTML support to assignments is a separate future project.

**Spec:** `docs/superpowers/specs/2026-06-05-html-page-annotation-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/client/src/lib/htmlOverlay.js` (new) | Pure helpers: `overlayPointerEvents`, `iframePointerEvents`, `HTML_OVERLAY_LOCK_BASE`. |
| `packages/client/src/lib/htmlOverlay.test.js` (new) | Vitest unit tests for the helper. |
| `packages/client/src/components/study/HtmlToolOverlay.jsx` (new) | iframe + transparent Excalidraw overlay; the only place the overlay layout lives. |
| `packages/client/src/components/study/DrawingToolbar.jsx` (modify) | Add `htmlMode` prop to hide the image-only "이미지 이동" (Hand) button. |
| `packages/client/src/pages/Study/StudyViewer.jsx` (modify ①) | Use overlay on HTML pages; relax save/toolbar conditions; add `handleHtmlOverlayMount`; viewport lock. |
| `packages/client/src/pages/Study/TeacherStudyViewer.jsx` (modify ②) | Same + new `htmlDrawMode` toggle (this viewer has no view/draw toggle). |
| `packages/client/src/pages/Monitor/StudentWorkViewer.jsx` (modify ③) | Same, reusing existing `commentMode` as the draw flag. |

**Build sequence:** Task 1 (helper) → Task 2 (overlay component) → Task 3 (toolbar prop) → Tasks 4/5/6 (viewers ①/②/③, independent of each other) → Task 7 (manual E2E + map update).

---

### Task 1: Pure overlay helper (`lib/htmlOverlay.js`)

**Files:**
- Create: `packages/client/src/lib/htmlOverlay.js`
- Test: `packages/client/src/lib/htmlOverlay.test.js`

- [ ] **Step 1: Write the failing test**

Create `packages/client/src/lib/htmlOverlay.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { overlayPointerEvents, iframePointerEvents, HTML_OVERLAY_LOCK_BASE } from './htmlOverlay';

describe('htmlOverlay', () => {
  it('overlay captures input only while drawing', () => {
    expect(overlayPointerEvents(true)).toBe('auto');
    expect(overlayPointerEvents(false)).toBe('none');
  });

  it('iframe receives input only when not drawing', () => {
    expect(iframePointerEvents(true)).toBe('none');
    expect(iframePointerEvents(false)).toBe('auto');
  });

  it('overlay and iframe never both capture input', () => {
    for (const drawing of [true, false]) {
      const both = overlayPointerEvents(drawing) === 'auto' && iframePointerEvents(drawing) === 'auto';
      expect(both).toBe(false);
    }
  });

  it('lock base pins the viewport to origin at zoom 1', () => {
    expect(HTML_OVERLAY_LOCK_BASE).toEqual({ zoom: 1, scrollX: 0, scrollY: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @mathchois/client -- src/lib/htmlOverlay.test.js`
Expected: FAIL — cannot resolve `./htmlOverlay` (module not found).

- [ ] **Step 3: Write minimal implementation**

Create `packages/client/src/lib/htmlOverlay.js`:

```js
/* HTML 도구 위 투명 필기 오버레이의 입력 라우팅 + 뷰포트 고정 상수.
   오버레이와 iframe 중 한쪽만 포인터 입력을 받게 해 도구 조작 ↔ 필기를 전환한다. */

export const HTML_OVERLAY_LOCK_BASE = { zoom: 1, scrollX: 0, scrollY: 0 };

export function overlayPointerEvents(drawing) {
  return drawing ? 'auto' : 'none';
}

export function iframePointerEvents(drawing) {
  return drawing ? 'none' : 'auto';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w @mathchois/client -- src/lib/htmlOverlay.test.js`
Expected: PASS (4 passing).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/lib/htmlOverlay.js packages/client/src/lib/htmlOverlay.test.js
git commit -m "feat(annotation): add html overlay pointer-routing helper"
```

---

### Task 2: Shared overlay component (`HtmlToolOverlay.jsx`)

**Files:**
- Create: `packages/client/src/components/study/HtmlToolOverlay.jsx`

No unit test: Excalidraw requires canvas/ResizeObserver and does not mount under jsdom. This component is verified by lint + build (Step 3) and the manual E2E in Task 7.

- [ ] **Step 1: Write the component**

Create `packages/client/src/components/study/HtmlToolOverlay.jsx`:

```jsx
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { toolUrl } from '../../lib/toolUrl';
import ExcalidrawErrorBoundary from '../ExcalidrawErrorBoundary';
import {
  ALWAYS_HIDE_CSS, TOUCH_CSS, PANEL_HIDE_CSS, EXCALIDRAW_UI_OPTIONS,
} from '../../lib/excalidrawUtils';
import { overlayPointerEvents, iframePointerEvents } from '../../lib/htmlOverlay';

/* HTML 도구 iframe 위에 투명 Excalidraw 오버레이를 겹친다.
   drawing=false → 오버레이 click-through(도구 조작), drawing=true → 오버레이가 입력 장악(도구 정지).
   배경 element 없음. 뷰포트 고정은 호출 뷰어의 onChange 복원 로직이 담당한다. */
function HtmlToolOverlay({
  htmlUrl,
  drawing,
  containerRef,
  excalidrawAPI,
  onChange,
  initialElements = [],
  showPanel = false,
}) {
  return (
    <div className="relative w-full h-full bg-white">
      <iframe
        src={toolUrl(htmlUrl)}
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals"
        title="HTML 도구"
        className="absolute inset-0 w-full h-full border-0"
        style={{ pointerEvents: iframePointerEvents(drawing) }}
      />
      <div
        ref={containerRef}
        className="absolute inset-0"
        style={{ pointerEvents: overlayPointerEvents(drawing), background: 'transparent' }}
      >
        <style>{ALWAYS_HIDE_CSS}{TOUCH_CSS}{(drawing && showPanel) ? '' : PANEL_HIDE_CSS}</style>
        <ExcalidrawErrorBoundary key={htmlUrl}>
          <Excalidraw
            excalidrawAPI={excalidrawAPI}
            viewModeEnabled={!drawing}
            initialData={{
              elements: initialElements,
              appState: { viewBackgroundColor: 'transparent', scrollX: 0, scrollY: 0 },
            }}
            onChange={onChange}
            UIOptions={EXCALIDRAW_UI_OPTIONS}
          />
        </ExcalidrawErrorBoundary>
      </div>
    </div>
  );
}

export default HtmlToolOverlay;
```

- [ ] **Step 2: Verify imports resolve**

Confirm these exist (they are already imported by `pages/Study/StudyViewer.jsx`):
- `packages/client/src/components/ExcalidrawErrorBoundary.jsx` (default export)
- `ALWAYS_HIDE_CSS`, `TOUCH_CSS`, `PANEL_HIDE_CSS`, `EXCALIDRAW_UI_OPTIONS` exported from `packages/client/src/lib/excalidrawUtils.js`

Run: `npm run lint`
Expected: PASS (no unresolved-import or unused-var errors for the new file).

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/components/study/HtmlToolOverlay.jsx
git commit -m "feat(annotation): add HtmlToolOverlay component"
```

---

### Task 3: DrawingToolbar `htmlMode` prop

**Files:**
- Modify: `packages/client/src/components/study/DrawingToolbar.jsx`

- [ ] **Step 1: Add the prop to the signature**

Find (line ~33):

```jsx
function DrawingToolbar({ apiRef, pageId, showPanel, onTogglePanel, screenLocked, onToggleScreenLock, onBaseWidthChange, onReloadImage, onUndo, onRedo, canUndo = true, canRedo = true }) {
```

Replace with:

```jsx
function DrawingToolbar({ apiRef, pageId, showPanel, onTogglePanel, screenLocked, onToggleScreenLock, onBaseWidthChange, onReloadImage, onUndo, onRedo, canUndo = true, canRedo = true, htmlMode = false }) {
```

- [ ] **Step 2: Hide the image-move (Hand) button in htmlMode**

Find the "이미지 이동" button (line ~552):

```jsx
      {/* 이미지 이동 */}
      <button onClick={handleToggleImageMove}
        title={imageMoveMode ? '이미지 이동 완료 (잠금)' : '이미지 이동 — 배경 이미지를 드래그로 이동'}
        className={`p-1.5 rounded-md transition-colors cursor-pointer ${
          imageMoveMode ? 'bg-green-100 text-green-600' : 'text-gray-600 hover:bg-gray-100'
        }`}>
        <Hand className="h-4 w-4" />
      </button>
```

Replace with (wrap in `{!htmlMode && (...)}`):

```jsx
      {/* 이미지 이동 (배경 이미지 페이지 전용) */}
      {!htmlMode && (
      <button onClick={handleToggleImageMove}
        title={imageMoveMode ? '이미지 이동 완료 (잠금)' : '이미지 이동 — 배경 이미지를 드래그로 이동'}
        className={`p-1.5 rounded-md transition-colors cursor-pointer ${
          imageMoveMode ? 'bg-green-100 text-green-600' : 'text-gray-600 hover:bg-gray-100'
        }`}>
        <Hand className="h-4 w-4" />
      </button>
      )}
```

The reload (`RefreshCw`) and screen-lock buttons are already gated by `onReloadImage` / `onToggleScreenLock`; the viewers below will not pass those props for HTML, so those buttons disappear automatically. No further toolbar change needed.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/components/study/DrawingToolbar.jsx
git commit -m "feat(annotation): add htmlMode to DrawingToolbar (hide image-move)"
```

---

### Task 4: Integrate overlay into ① StudyViewer

**Files:**
- Modify: `packages/client/src/pages/Study/StudyViewer.jsx`

- [ ] **Step 1: Add imports**

After the existing `import { extractYouTubeId, ... } from '../../lib/youtubeUtils';` line (line ~26), add:

```jsx
import HtmlToolOverlay from '../../components/study/HtmlToolOverlay';
import { HTML_OVERLAY_LOCK_BASE } from '../../lib/htmlOverlay';
```

- [ ] **Step 2: Add `lockActiveRef` (screenLocked OR html page)**

Find (line ~390):

```jsx
  useEffect(() => { screenLockedRef.current = screenLocked; }, [screenLocked]);
```

Replace with:

```jsx
  const lockActiveRef = useRef(false); // screenLocked OR HTML 페이지(오버레이 뷰포트 고정)
  useEffect(() => {
    screenLockedRef.current = screenLocked;
    lockActiveRef.current = screenLocked || !!currentPage?.htmlUrl;
  }, [screenLocked, currentPage?.htmlUrl]);
```

- [ ] **Step 3: Feed the combined lock to the touch hook**

Find (line ~400):

```jsx
  const { triggerPalmRejectionWarmup } = useExcalidrawTouch({ excalidrawAPIRef, containerRef, screenLockedRef, baseStrokeWidthRef, onUserDrawStart: handleUserDrawStart });
```

Replace `screenLockedRef` with `screenLockedRef: lockActiveRef`:

```jsx
  const { triggerPalmRejectionWarmup } = useExcalidrawTouch({ excalidrawAPIRef, containerRef, screenLockedRef: lockActiveRef, baseStrokeWidthRef, onUserDrawStart: handleUserDrawStart });
```

- [ ] **Step 4: Use the combined lock + html base in onChange restoration**

Find (line ~647):

```jsx
    if (appState && screenLockedRef.current) {
      const base = screenLockBaseRef.current;
```

Replace with:

```jsx
    if (appState && lockActiveRef.current) {
      const base = currentPageRef.current?.htmlUrl ? HTML_OVERLAY_LOCK_BASE : screenLockBaseRef.current;
```

- [ ] **Step 5: Add the HTML overlay mount handler**

Immediately after the closing of `handleExcalidrawMount` (the `}, []);` at line ~809), add a new handler:

```jsx
  /* ── HTML 오버레이 마운트: 배경 없이 학생 필기 + 교사 코멘트만 ── */
  const handleHtmlOverlayMount = useCallback(async (excApi) => {
    excalidrawAPIRef.current = excApi;
    setTimeout(() => {
      const savedWidth = parseFloat(localStorage.getItem('mc_stroke_width') || '0.4');
      baseStrokeWidthRef.current = savedWidth;
      const zoom = excApi.getAppState()?.zoom?.value || 1;
      lastZoomRef.current = zoom;
      excApi.updateScene({ appState: { currentItemStrokeColor: '#000000', currentItemStrokeWidth: Math.max(savedWidth / zoom, 0.05), currentItemRoundness: 'sharp' }, commitToHistory: false });
      excApi.setActiveTool({ type: 'freedraw' });
    }, 0);

    await new Promise((r) => setTimeout(r, 0));
    const userFilesList = Object.values(savedFilesRef.current);
    if (userFilesList.length > 0) excApi.addFiles(userFilesList);
    const teacherFilesList = Object.values(teacherCommentFilesRef.current);
    if (teacherFilesList.length > 0) excApi.addFiles(teacherFilesList);
    await new Promise((r) => requestAnimationFrame(r));
    excApi.updateScene({
      elements: [...noteElementsRef.current, ...teacherCommentsRef.current],
      commitToHistory: false,
    });
  }, []);
```

- [ ] **Step 6: Show save-status on HTML draw pages**

Find (line ~888):

```jsx
          {drawMode && !currentPage?.videoUrl && !currentPage?.htmlUrl && (
            <span className={`text-xs ${saveStatus === 'saved' ? 'text-green-600' : 'text-gray-400'}`}>
```

Replace the condition (drop the `!currentPage?.htmlUrl`) so save status shows while drawing on HTML too:

```jsx
          {drawMode && !currentPage?.videoUrl && (
            <span className={`text-xs ${saveStatus === 'saved' ? 'text-green-600' : 'text-gray-400'}`}>
```

(Leave the PDF button condition at line ~896 unchanged — PDF stays disabled on HTML.)

- [ ] **Step 7: Render the DrawingToolbar on HTML draw pages**

Find (line ~994):

```jsx
      {drawMode && !toolbarCollapsed && !currentPage?.videoUrl && !currentPage?.htmlUrl && (
        <DrawingToolbar
          apiRef={excalidrawAPIRef}
          pageId={currentPage?.id}
          showPanel={showExcalidrawPanel}
          onTogglePanel={() => setShowExcalidrawPanel((v) => !v)}
          screenLocked={screenLocked}
          onToggleScreenLock={handleToggleScreenLock}
          onBaseWidthChange={(w) => { baseStrokeWidthRef.current = w; }}
          onReloadImage={handleReloadImage}
          onUndo={undo} onRedo={redo} canUndo={canUndo} canRedo={canRedo}
        />
      )}
```

Replace with (HTML branch omits `onReloadImage`/`onToggleScreenLock`/`screenLocked` and sets `htmlMode`):

```jsx
      {drawMode && !toolbarCollapsed && !currentPage?.videoUrl && (
        currentPage?.htmlUrl ? (
          <DrawingToolbar
            apiRef={excalidrawAPIRef}
            pageId={currentPage?.id}
            showPanel={showExcalidrawPanel}
            onTogglePanel={() => setShowExcalidrawPanel((v) => !v)}
            onBaseWidthChange={(w) => { baseStrokeWidthRef.current = w; }}
            onUndo={undo} onRedo={redo} canUndo={canUndo} canRedo={canRedo}
            htmlMode
          />
        ) : (
          <DrawingToolbar
            apiRef={excalidrawAPIRef}
            pageId={currentPage?.id}
            showPanel={showExcalidrawPanel}
            onTogglePanel={() => setShowExcalidrawPanel((v) => !v)}
            screenLocked={screenLocked}
            onToggleScreenLock={handleToggleScreenLock}
            onBaseWidthChange={(w) => { baseStrokeWidthRef.current = w; }}
            onReloadImage={handleReloadImage}
            onUndo={undo} onRedo={redo} canUndo={canUndo} canRedo={canRedo}
          />
        )
      )}
```

- [ ] **Step 8: Replace the HTML iframe branch with the overlay**

Find (line ~1056):

```jsx
        {currentPage?.htmlUrl ? (
          <div className="w-full h-full flex items-center justify-center bg-white">
            <iframe
              src={toolUrl(currentPage.htmlUrl)}
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals"
              className="w-full h-full"
              title="HTML 도구"
            />
          </div>
        ) : currentPage?.videoUrl ? (
```

Replace with:

```jsx
        {currentPage?.htmlUrl ? (
          <HtmlToolOverlay
            htmlUrl={currentPage.htmlUrl}
            drawing={drawMode}
            containerRef={containerRef}
            excalidrawAPI={handleHtmlOverlayMount}
            onChange={handleExcalidrawChange}
            showPanel={showExcalidrawPanel}
          />
        ) : currentPage?.videoUrl ? (
```

- [ ] **Step 9: Lint + build**

Run: `npm run lint`
Expected: PASS.
Run: `npm run build`
Expected: build succeeds (shared → client → server), no errors.

- [ ] **Step 10: Commit**

```bash
git add packages/client/src/pages/Study/StudyViewer.jsx
git commit -m "feat(annotation): pen overlay on HTML pages in StudyViewer (1)"
```

---

### Task 5: Integrate overlay into ② TeacherStudyViewer (with new draw toggle)

**Files:**
- Modify: `packages/client/src/pages/Study/TeacherStudyViewer.jsx`

This viewer has no view/draw toggle (always editable). Add an HTML-only `htmlDrawMode` so the teacher can switch between operating the tool and drawing.

- [ ] **Step 1: Add imports**

After the existing youtube-utils import (top of file, alongside other `lib` imports ~line 9-26), add:

```jsx
import HtmlToolOverlay from '../../components/study/HtmlToolOverlay';
import { HTML_OVERLAY_LOCK_BASE } from '../../lib/htmlOverlay';
```

- [ ] **Step 2: Add `htmlDrawMode` state + reset on page change**

Find (line ~56):

```jsx
  const [showExcalidrawPanel, setShowExcalidrawPanel] = useState(false);
```

Add right after it:

```jsx
  const [htmlDrawMode, setHtmlDrawMode] = useState(false); // HTML 페이지 전용: 도구조작(false)↔필기(true)
```

Find the page-data effect that sets `currentPage` — add a reset effect near the other effects (after line ~95, the ref-sync effect). Insert:

```jsx
  /* HTML 페이지로 이동하면 항상 도구 조작(뷰) 모드로 시작 */
  useEffect(() => { setHtmlDrawMode(false); }, [currentPage?.id]);
```

- [ ] **Step 3: Add `lockActiveRef`**

Find (line ~80):

```jsx
  useEffect(() => { screenLockedRef.current = screenLocked; }, [screenLocked]);
```

Replace with:

```jsx
  const lockActiveRef = useRef(false);
  useEffect(() => {
    screenLockedRef.current = screenLocked;
    lockActiveRef.current = screenLocked || !!currentPage?.htmlUrl;
  }, [screenLocked, currentPage?.htmlUrl]);
```

- [ ] **Step 4: Feed the combined lock to the touch hook**

Find (line ~82):

```jsx
  useExcalidrawTouch({ excalidrawAPIRef, containerRef, screenLockedRef, baseStrokeWidthRef });
```

Replace with:

```jsx
  useExcalidrawTouch({ excalidrawAPIRef, containerRef, screenLockedRef: lockActiveRef, baseStrokeWidthRef });
```

- [ ] **Step 5: Use the combined lock + html base in onChange restoration**

Find (line ~199):

```jsx
    if (appState && screenLockedRef.current) {
      const base = screenLockBaseRef.current;
```

Replace with:

```jsx
    if (appState && lockActiveRef.current) {
      const base = currentPageRef.current?.htmlUrl ? HTML_OVERLAY_LOCK_BASE : screenLockBaseRef.current;
```

- [ ] **Step 6: Add the HTML overlay mount handler**

Immediately after `handleExcalidrawMount`'s closing `}, []);` (line ~337), add:

```jsx
  /* ── HTML 오버레이 마운트: 배경 없이 교사 필기만 ── */
  const handleHtmlOverlayMount = useCallback(async (api) => {
    excalidrawAPIRef.current = api;
    setTimeout(() => {
      const savedWidth = parseFloat(localStorage.getItem('mc_stroke_width') || '0.2');
      baseStrokeWidthRef.current = savedWidth;
      const zoom = api.getAppState()?.zoom?.value || 1;
      lastZoomRef.current = zoom;
      api.updateScene({ appState: { currentItemStrokeColor: '#000000', currentItemStrokeWidth: Math.max(savedWidth / zoom, 0.05), currentItemRoundness: 'sharp' }, commitToHistory: false });
      api.setActiveTool({ type: 'freedraw' });
    }, 0);

    await new Promise((r) => setTimeout(r, 0));
    const userFilesList = Object.values(savedFilesRef.current);
    if (userFilesList.length > 0) api.addFiles(userFilesList);
    await new Promise((r) => requestAnimationFrame(r));
    api.updateScene({ elements: [...noteElementsRef.current], commitToHistory: false });
  }, []);
```

- [ ] **Step 7: Add the HTML draw toggle to the navbar**

Find the toolbar collapse button (line ~448):

```jsx
          {/* 툴바 접기/펼치기 */}
          <button
            onClick={() => setToolbarCollapsed((v) => !v)}
            title={toolbarCollapsed ? '툴바 펼치기' : '툴바 접기'}
            className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors cursor-pointer"
          >
            {toolbarCollapsed
              ? <ChevronDown className="h-4 w-4" />
              : <ChevronUp className="h-4 w-4" />}
          </button>
```

Insert this block immediately BEFORE it (the toggle only appears on HTML pages):

```jsx
          {/* HTML 필기 모드 토글 (HTML 페이지 전용) */}
          {currentPage?.htmlUrl && (
            <button
              onClick={() => setHtmlDrawMode((v) => !v)}
              title={htmlDrawMode ? '도구 조작 모드로 전환' : '필기 모드로 전환'}
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                htmlDrawMode ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
```

Verify `Pencil` is imported from `lucide-react` at the top of the file; if not, add it to the existing `lucide-react` import.

- [ ] **Step 8: Show save-status while drawing on HTML**

Find (line ~412):

```jsx
          {!currentPage?.videoUrl && !currentPage?.htmlUrl && (
          <span className={`text-xs ${saveStatus === 'saved' ? 'text-green-600' : 'text-gray-400'}`}>
            {saveStatus === 'saved'  && '저장됨'}
            {saveStatus === 'saving' && '저장 중...'}
          </span>
          )}
```

Replace the condition so it also shows while drawing on HTML:

```jsx
          {((currentPage?.htmlUrl && htmlDrawMode) || (!currentPage?.videoUrl && !currentPage?.htmlUrl)) && (
          <span className={`text-xs ${saveStatus === 'saved' ? 'text-green-600' : 'text-gray-400'}`}>
            {saveStatus === 'saved'  && '저장됨'}
            {saveStatus === 'saving' && '저장 중...'}
          </span>
          )}
```

- [ ] **Step 9: Render the toolbar for HTML draw mode**

Find (line ~491):

```jsx
      {!toolbarCollapsed && !currentPage?.videoUrl && !currentPage?.htmlUrl && (
        <DrawingToolbar
          apiRef={excalidrawAPIRef}
          pageId={currentPage?.id}
          showPanel={showExcalidrawPanel}
          onTogglePanel={() => setShowExcalidrawPanel((v) => !v)}
          screenLocked={screenLocked}
          onToggleScreenLock={handleToggleScreenLock}
          onBaseWidthChange={(w) => { baseStrokeWidthRef.current = w; }}
          onReloadImage={handleReloadImage}
          onUndo={undo} onRedo={redo} canUndo={canUndo} canRedo={canRedo}
        />
      )}
```

Replace with:

```jsx
      {!toolbarCollapsed && (
        currentPage?.htmlUrl ? (
          htmlDrawMode && (
            <DrawingToolbar
              apiRef={excalidrawAPIRef}
              pageId={currentPage?.id}
              showPanel={showExcalidrawPanel}
              onTogglePanel={() => setShowExcalidrawPanel((v) => !v)}
              onBaseWidthChange={(w) => { baseStrokeWidthRef.current = w; }}
              onUndo={undo} onRedo={redo} canUndo={canUndo} canRedo={canRedo}
              htmlMode
            />
          )
        ) : (!currentPage?.videoUrl && (
          <DrawingToolbar
            apiRef={excalidrawAPIRef}
            pageId={currentPage?.id}
            showPanel={showExcalidrawPanel}
            onTogglePanel={() => setShowExcalidrawPanel((v) => !v)}
            screenLocked={screenLocked}
            onToggleScreenLock={handleToggleScreenLock}
            onBaseWidthChange={(w) => { baseStrokeWidthRef.current = w; }}
            onReloadImage={handleReloadImage}
            onUndo={undo} onRedo={redo} canUndo={canUndo} canRedo={canRedo}
          />
        ))
      )}
```

- [ ] **Step 10: Replace the HTML iframe branch with the overlay**

Find (line ~553):

```jsx
        {currentPage?.htmlUrl ? (
          <div className="w-full h-full flex items-center justify-center bg-white">
            <iframe
              src={toolUrl(currentPage.htmlUrl)}
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals"
              className="w-full h-full"
              title="HTML 도구"
            />
          </div>
        ) : currentPage?.videoUrl ? (
```

Replace with:

```jsx
        {currentPage?.htmlUrl ? (
          <HtmlToolOverlay
            htmlUrl={currentPage.htmlUrl}
            drawing={htmlDrawMode}
            containerRef={containerRef}
            excalidrawAPI={handleHtmlOverlayMount}
            onChange={handleExcalidrawChange}
            showPanel={showExcalidrawPanel}
          />
        ) : currentPage?.videoUrl ? (
```

- [ ] **Step 11: Lint + build**

Run: `npm run lint`
Expected: PASS.
Run: `npm run build`
Expected: success.

- [ ] **Step 12: Commit**

```bash
git add packages/client/src/pages/Study/TeacherStudyViewer.jsx
git commit -m "feat(annotation): pen overlay on HTML pages in TeacherStudyViewer (2)"
```

---

### Task 6: Integrate overlay into ③ StudentWorkViewer (reuse commentMode)

**Files:**
- Modify: `packages/client/src/pages/Monitor/StudentWorkViewer.jsx`

This viewer already has a `commentMode` toggle (view ↔ comment) — reuse it as the draw flag.

- [ ] **Step 1: Add imports**

Alongside the other `lib`/`components` imports near the top (after `import { useExcalidrawTouch } ...` ~line 30), add:

```jsx
import HtmlToolOverlay from '../../components/study/HtmlToolOverlay';
import { HTML_OVERLAY_LOCK_BASE } from '../../lib/htmlOverlay';
```

- [ ] **Step 2: Add `lockActiveRef`**

Find (line ~196):

```jsx
  useEffect(() => { screenLockedRef.current = screenLocked; }, [screenLocked]);
```

Replace with:

```jsx
  const lockActiveRef = useRef(false);
  useEffect(() => {
    screenLockedRef.current = screenLocked;
    lockActiveRef.current = screenLocked || !!currentPage?.htmlUrl;
  }, [screenLocked, currentPage?.htmlUrl]);
```

(`currentPage` is defined above at line ~85 as `pages[currentPageIndex] || null`, so it is in scope here.)

- [ ] **Step 3: Feed the combined lock to the touch hook**

Find (line ~206):

```jsx
  const { triggerPalmRejectionWarmup } = useExcalidrawTouch({ excalidrawAPIRef, containerRef, screenLockedRef, baseStrokeWidthRef, onUserDrawStart: handleUserDrawStart });
```

Replace `screenLockedRef` with `screenLockedRef: lockActiveRef`:

```jsx
  const { triggerPalmRejectionWarmup } = useExcalidrawTouch({ excalidrawAPIRef, containerRef, screenLockedRef: lockActiveRef, baseStrokeWidthRef, onUserDrawStart: handleUserDrawStart });
```

- [ ] **Step 4: Use the combined lock + html base in onChange restoration**

Find (line ~374):

```jsx
    if (appState && screenLockedRef.current) {
      const base = screenLockBaseRef.current;
```

Replace with:

```jsx
    if (appState && lockActiveRef.current) {
      const base = currentPageRef.current?.htmlUrl ? HTML_OVERLAY_LOCK_BASE : screenLockBaseRef.current;
```

- [ ] **Step 5: Add the HTML overlay mount handler**

Immediately after `handleExcalidrawMount`'s closing `}, [rebuildScene]);` (line ~349), add:

```jsx
  /* ── HTML 오버레이 마운트: 배경 없이 학생 필기(읽기) + 교사 코멘트 ── */
  const handleHtmlOverlayMount = useCallback(async (excApi) => {
    excalidrawAPIRef.current = excApi;
    const savedWidth = parseFloat(localStorage.getItem('mc_stroke_width') || '0.4');
    baseStrokeWidthRef.current = savedWidth;
    const zoom = excApi.getAppState()?.zoom?.value || 1;
    lastZoomRef.current = zoom;

    await new Promise((r) => setTimeout(r, 0));
    const studentFilesList = Object.values(savedStudentFilesRef.current);
    const teacherFilesList = Object.values(savedTeacherFilesRef.current);
    if (studentFilesList.length > 0 || teacherFilesList.length > 0) {
      excApi.addFiles([...studentFilesList, ...teacherFilesList]);
    }
    await new Promise((r) => requestAnimationFrame(r));
    excApi.updateScene({ elements: [...studentEls.current, ...teacherEls.current], commitToHistory: false });

    setTimeout(() => {
      excApi.updateScene({ appState: { currentItemStrokeColor: '#000000', currentItemStrokeWidth: Math.max(savedWidth / zoom, 0.05), currentItemRoundness: 'sharp' }, commitToHistory: false });
      excApi.setActiveTool({ type: 'freedraw' });
    }, 0);
  }, []);
```

- [ ] **Step 6: Show save-status while commenting on HTML**

Find (line ~524):

```jsx
          {commentMode && !currentPage?.videoUrl && !currentPage?.htmlUrl && (
            <span className={`text-xs ${saveStatus === 'saved' ? 'text-green-600' : 'text-gray-400'}`}>
              {saveStatus === 'saved' ? '저장됨' : '저장 중...'}
            </span>
          )}
```

Replace the condition (drop `!currentPage?.htmlUrl`):

```jsx
          {commentMode && !currentPage?.videoUrl && (
            <span className={`text-xs ${saveStatus === 'saved' ? 'text-green-600' : 'text-gray-400'}`}>
              {saveStatus === 'saved' ? '저장됨' : '저장 중...'}
            </span>
          )}
```

(The comment-mode toggle button at line ~574 already works on all page types — no change.)

- [ ] **Step 7: Render the toolbar for HTML comment mode**

Find (line ~633):

```jsx
      {commentMode && !toolbarCollapsed && !currentPage?.videoUrl && !currentPage?.htmlUrl && (
        <DrawingToolbar
          apiRef={excalidrawAPIRef}
          pageId={currentPage?.id}
          showPanel={showExcalidrawPanel}
          onTogglePanel={() => setShowExcalidrawPanel((v) => !v)}
          screenLocked={screenLocked}
          onToggleScreenLock={handleToggleScreenLock}
          onBaseWidthChange={(w) => { baseStrokeWidthRef.current = w; }}
          onReloadImage={handleReloadImage}
          onUndo={undo} onRedo={redo} canUndo={canUndo} canRedo={canRedo}
        />
      )}
```

Replace with:

```jsx
      {commentMode && !toolbarCollapsed && !currentPage?.videoUrl && (
        currentPage?.htmlUrl ? (
          <DrawingToolbar
            apiRef={excalidrawAPIRef}
            pageId={currentPage?.id}
            showPanel={showExcalidrawPanel}
            onTogglePanel={() => setShowExcalidrawPanel((v) => !v)}
            onBaseWidthChange={(w) => { baseStrokeWidthRef.current = w; }}
            onUndo={undo} onRedo={redo} canUndo={canUndo} canRedo={canRedo}
            htmlMode
          />
        ) : (
          <DrawingToolbar
            apiRef={excalidrawAPIRef}
            pageId={currentPage?.id}
            showPanel={showExcalidrawPanel}
            onTogglePanel={() => setShowExcalidrawPanel((v) => !v)}
            screenLocked={screenLocked}
            onToggleScreenLock={handleToggleScreenLock}
            onBaseWidthChange={(w) => { baseStrokeWidthRef.current = w; }}
            onReloadImage={handleReloadImage}
            onUndo={undo} onRedo={redo} canUndo={canUndo} canRedo={canRedo}
          />
        )
      )}
```

- [ ] **Step 8: Replace the HTML iframe branch with the overlay**

Find (line ~698):

```jsx
        {currentPage?.htmlUrl ? (
          <div className="w-full h-full flex items-center justify-center bg-white">
            <iframe
              src={toolUrl(currentPage.htmlUrl)}
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals"
              className="w-full h-full"
              title="HTML 도구"
            />
          </div>
        ) : currentPage?.videoUrl ? (
```

Replace with:

```jsx
        {currentPage?.htmlUrl ? (
          <HtmlToolOverlay
            htmlUrl={currentPage.htmlUrl}
            drawing={commentMode}
            containerRef={containerRef}
            excalidrawAPI={handleHtmlOverlayMount}
            onChange={handleExcalidrawChange}
            showPanel={showExcalidrawPanel}
          />
        ) : currentPage?.videoUrl ? (
```

Verify `toolUrl` is still used elsewhere in the file; if this was its only use, remove the now-unused `import { toolUrl } from '../../lib/toolUrl';` to satisfy lint. (It is also referenced in the sidebar? No — check: only the iframe used it. Remove the import if lint flags it as unused.)

- [ ] **Step 9: Lint + build**

Run: `npm run lint`
Expected: PASS (fix any unused-import warning for `toolUrl`).
Run: `npm run build`
Expected: success.

- [ ] **Step 10: Commit**

```bash
git add packages/client/src/pages/Monitor/StudentWorkViewer.jsx
git commit -m "feat(annotation): pen overlay on HTML pages in StudentWorkViewer (3)"
```

---

### Task 7: Manual E2E verification + map update

**Files:**
- Modify: `.claude/PROJECT_MAP.md` (note the new shared overlay + that HTML pages now carry annotations)

No automated viewer test exists (Excalidraw needs a real browser). Verify manually against a running dev server, then update the map.

- [ ] **Step 1: Start the app**

Run: `npm run dev`
Expected: server on 3001, client on 3000, no console errors at boot.

- [ ] **Step 2: Student study (①) — operate then draw**

As a student, open a chapter HTML-tool page (`/student/study/:chapterId/page/:pageId` where the page has `htmlUrl`).
- View mode: tool buttons/inputs respond (overlay is click-through).
- Toggle ✏️ → draw a stroke. Confirm the tool is frozen, the stroke renders, and the navbar shows "저장됨".
- Reload the page → the stroke reappears in the same position.
- In draw mode, attempt two-finger pan/zoom → the drawing must NOT shift relative to the tool.

- [ ] **Step 3: Teacher study (②)**

As a teacher, open the same chapter's HTML page via TeacherStudyViewer. Confirm the new ✏️ toggle appears only on HTML pages; OFF operates the tool, ON draws and saves teacher notes; reload restores.

- [ ] **Step 4: Teacher comment (③) + realtime**

As a teacher in StudentWorkViewer on an HTML page, toggle comment mode and draw a comment. As that student in StudyViewer on the same page, confirm the teacher comment appears (locked, faded) over the tool and updates in realtime.

- [ ] **Step 5: Regression — image & video pages unchanged**

Open an image page and a video page in each of the three viewers. Confirm drawing, screen-lock, image-move/reload, PDF download, and video playback behave exactly as before. Confirm the PDF button is still hidden on HTML pages.

- [ ] **Step 6: Update PROJECT_MAP.md**

In `.claude/PROJECT_MAP.md`, under "핵심 기능: 5개 필기 페이지" (or the gotchas section), add a note:
- HTML 도구 페이지는 이제 `components/study/HtmlToolOverlay.jsx`(+ `lib/htmlOverlay.js`)를 통해 iframe 위 투명 Excalidraw 오버레이로 필기를 지원한다(①②③ 뷰어). 뷰포트는 고정(pan/zoom 차단), 저장은 기존 notes/comments 재사용. ④⑤(과제)는 `assignment_pages`에 `html_url`이 없어 미지원.

Run the `project-map-updater` agent if available, otherwise edit by hand.

- [ ] **Step 7: Commit**

```bash
git add .claude/PROJECT_MAP.md
git commit -m "docs: note HTML annotation overlay in project map"
```

---

## Self-Review

**Spec coverage:**
- §2 interaction model (toggle, viewModeEnabled, pointer-events) → Tasks 2, 4–6.
- §3 layer structure (iframe + transparent overlay, no bg) → Task 2 + viewer mount handlers (Tasks 4–6).
- §4 viewport lock → `lockActiveRef` + html base in onChange (Tasks 4–6, steps "lockActiveRef"/"restoration"); touch-hook gating via passing `lockActiveRef` as `screenLockedRef`.
- §5 coordinate/alignment limitation → inherent; verified in Task 7 Step 2.
- §6 persistence/sync/teacher-comments reuse → reuse existing `handleExcalidrawChange`/sockets; mount handlers load notes(+comments); toolbar conditions relaxed (Tasks 4–6).
- §7 PDF disabled on HTML → PDF conditions left unchanged (Task 4 Step 6 note, Task 7 Step 5).
- §8 file list → matches Tasks 1–6; `useExcalidrawTouch` unchanged as specified.
- ④⑤ out of scope → stated in header; no tasks, correct.

**Placeholder scan:** No TBD/TODO; every code step shows complete code. (Two conditional cleanups — removing an unused `toolUrl` import — are explicit lint-driven checks, not placeholders.)

**Type/name consistency:** `HtmlToolOverlay` props (`htmlUrl`, `drawing`, `containerRef`, `excalidrawAPI`, `onChange`, `initialElements`, `showPanel`) are passed consistently in Tasks 4–6 (note: `initialElements` defaults to `[]`; viewers rely on the mount handler's `updateScene`, so they omit it). `HTML_OVERLAY_LOCK_BASE`, `overlayPointerEvents`, `iframePointerEvents` names match Task 1 across all consumers. `htmlMode` (toolbar) and `htmlDrawMode` (② only) are used consistently. `lockActiveRef` is introduced and consumed within each viewer.
