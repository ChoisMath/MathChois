# HTML 페이지 위 펜 필기 (HTML Page Annotation Overlay) — 설계

- 날짜: 2026-06-05
- 범위: **HTML 페이지가 실제 존재하는 3개 뷰어** — ① 학생필기(StudyViewer), ② 교사필기(TeacherStudyViewer), ③ 교사 학생코멘트(StudentWorkViewer). 모두 챕터 `pages.htmlUrl` 위에서 동작.
- **④⑤(과제 뷰어)는 범위 외**: `assignment_pages` 스키마에 `html_url` 컬럼이 없어 과제 페이지는 HTML 도구를 가질 수 없다(`schema.ts:164-171`, 두 뷰어에 HTML 분기 자체가 없음). 과제 HTML 지원(스키마+편집기+서버)은 별도 후속 프로젝트로 분리.
- 접근법: **A — Excalidraw 투명 오버레이** (iframe 스냅샷/전용 캔버스 대안은 기각)

## 1. 문제

챕터/과제 페이지 배경은 이미지·영상·**HTML 도구**(`pages.html_url`) 중 하나다. 현재 HTML 페이지는
iframe만 렌더되고 그 위에 Excalidraw 필기 레이어가 없어, 이미지/영상과 달리 **HTML 도구 위에는 필기를
전혀 할 수 없다**. 학생(및 교사)이 HTML 도구 위에 주석처럼 펜 필기를 남길 수 있게 한다.

HTML 도구는 버튼·입력 등 **조작 가능한** 콘텐츠다. 필기 레이어와 도구가 동시에 포인터 입력을 받을 수
없으므로, "도구 조작 ↔ 필기"를 전환하는 모델이 필요하다.

## 2. 상호작용 모델

기존 navbar의 **✏️ 필기모드 토글을 재사용**한다.

| 모드 | 오버레이 `pointer-events` | iframe `pointer-events` | Excalidraw | 동작 |
|---|---|---|---|---|
| 뷰 모드 (필기 OFF) | `none` (click-through) | `auto` | `viewModeEnabled=true` | 펜·손가락이 iframe **도구를 조작**. 기존 필기는 보이되 편집 불가 |
| 필기 모드 (ON) | `auto` | `none` (정지) | `viewModeEnabled=false` | 오버레이가 입력을 장악, **도구 정지**, 필기 |

- Excalidraw는 **항상 마운트**한다. 모드 전환은 `pointer-events` + `viewModeEnabled` prop 토글뿐이며
  재마운트/씬 재로드/깜빡임이 없다. 필기는 두 모드 모두 항상 보인다.
- **펜 자동-필기전환은 HTML에 적용하지 않는다.** 뷰 모드의 펜은 도구 조작용이므로, HTML 페이지에서는
  ✏️ 토글로만 필기에 진입한다(이미지 페이지의 pen-auto-on 동작과 의도적으로 다름).

## 3. 레이어 구조 (5개 뷰어 공통 변경)

각 뷰어의 `currentPage?.htmlUrl` 분기를 iframe 단독 → **iframe + 투명 Excalidraw 오버레이 겹침**으로 바꾼다.

```jsx
{currentPage?.htmlUrl ? (
  <div className="relative w-full h-full">
    <iframe
      src={toolUrl(currentPage.htmlUrl)}
      sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals"
      className="w-full h-full"
      style={{ pointerEvents: drawMode ? 'none' : 'auto' }}
      title="HTML 도구"
    />
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ pointerEvents: drawMode ? 'auto' : 'none', background: 'transparent' }}
    >
      <style>{ALWAYS_HIDE_CSS}{TOUCH_CSS}{PANEL_HIDE_CSS}</style>
      <ExcalidrawErrorBoundary key={currentPage.id}>
        <Excalidraw
          excalidrawAPI={handleExcalidrawMount}
          viewModeEnabled={!drawMode}
          initialData={{ elements: noteElements, appState: { viewBackgroundColor: 'transparent', scrollX: 0, scrollY: 0 } }}
          onChange={handleExcalidrawChange}
          UIOptions={EXCALIDRAW_UI_OPTIONS}
        />
      </ExcalidrawErrorBoundary>
    </div>
  </div>
) : currentPage?.videoUrl ? ( /* 기존 영상 분기 유지 */ ) : ( /* 기존 이미지 Excalidraw 분기 유지 */ )}
```

- **배경 element 없음**: `BG_ELEMENT_ID`/`BG_FILE_ID`/`bgPosition` 미사용. iframe 자체가 배경.
  `handleExcalidrawMount`는 HTML일 때 이미지 로드(`fetchAsDataUrl`/`createBgElement`) 단계를 건너뛰고
  `noteElements`(+교사코멘트 ref)만 `updateScene` 한다.
- 뷰 모드의 오버레이 `pointer-events:none`는 펜/클릭을 iframe으로 통과시킨다.

## 4. 뷰포트 고정 (HTML 한정)

iframe은 DOM에 고정되어 Excalidraw 캔버스를 pan/zoom하면 필기만 어긋난다. HTML 오버레이는
**zoom=1, scrollX=0, scrollY=0를 상시 고정**한다.

- 기존 `screenLocked` 복원 로직(`handleExcalidrawChange` 내 base로 zoom/scroll 되돌리기)을 HTML 페이지에서
  **강제 ON**(사용자 토글과 무관). base = `{ zoom: 1, scrollX: 0, scrollY: 0 }`.
- `useExcalidrawTouch`의 두 손가락 핀치줌/팬을 HTML 오버레이일 때 게이트(동작 안 함). 입력 모드 게이트
  (스타일러스/손가락, 팜 리젝션)·펜 두께/색 로직은 그대로 재사용.
- 줌이 1로 고정되므로 줌-독립 펜 두께 보정은 사실상 no-op(base 두께 그대로).

## 5. 좌표·정렬

배경 이미지·`bgPosition`이 없으므로 필기는 **뷰포트 좌표(scroll0/zoom1)** 로 저장된다. 같은 컨테이너 크기에서
다시 열면 1:1로 정렬된다.

**수용한 한계**: 기기/방향이 달라 컨테이너 픽셀 크기가 바뀌고 도구가 반응형이면, 필기와 도구 콘텐츠가
어긋날 수 있다. v1에서는 도구 DOM에 앵커하지 않고 뷰포트 좌표를 그대로 쓴다(주석 레이어의 본질적 트레이드오프).

## 6. 저장·동기화·교사코멘트

**기존 테이블·라우트·소켓을 그대로 재사용**한다(모두 `pageId` 기준이라 HTML 페이지도 동작).

- 저장 payload: `excalidrawData = { elements, files }`(필요 시), `bgPosition` 생략.
- `handleExcalidrawChange`의 저장 경로는 HTML에서도 동작해야 한다. 현재 navbar 저장상태/툴바/PDF가
  `!currentPage?.htmlUrl` 조건으로 숨겨져 있는데, **저장상태 표시와 `DrawingToolbar`는 HTML 필기모드에서도
  노출**하도록 조건을 완화한다.
- `DrawingToolbar`의 **이미지 전용 컨트롤은 HTML에서 숨긴다**: 이미지 리로드(`onReloadImage`), 화면고정
  토글(HTML은 상시 고정). 펜 색/두께/지우개/undo·redo는 유지.
- ③⑤ 교사 코멘트 오버레이(`TEACHER_NOTE_PREFIX`, locked, opacity 60)·실시간 소켓 구독은 변경 없이 동작.
- 자동저장 1.5초 debounce·세션 캐시(`_notesCache`/`_commentsCache`)·페이지 이동 flush 로직 모두 재사용.

## 7. PDF 내보내기

HTML 도구는 별도 origin의 live iframe이라 래스터화가 불가하다. **HTML 페이지의 PDF 버튼은 계속 비활성**
(필기 미포함). 후속 과제로 남긴다.

## 8. 영향 받는 파일

신규(공유):
- `lib/htmlOverlay.js` — pointer-events 결정 + 뷰포트 고정 상수(`HTML_OVERLAY_LOCK_BASE`). 단위 테스트 대상.
- `components/study/HtmlToolOverlay.jsx` — iframe + 투명 Excalidraw 오버레이 공통 컴포넌트(3개 뷰어가 재사용).

수정:
- `pages/Study/StudyViewer.jsx` (①) — HTML 분기를 `HtmlToolOverlay`로 교체, 저장상태/툴바 조건 완화, `handleHtmlOverlayMount` 추가, 뷰포트 고정(`lockActiveRef`). (모달 내 교사필기 HTML은 뷰 전용 유지)
- `pages/Study/TeacherStudyViewer.jsx` (②) — 위 + HTML 전용 `htmlDrawMode` 토글 신설(이 뷰어는 view/draw 토글이 없음).
- `pages/Monitor/StudentWorkViewer.jsx` (③) — 위 + 기존 `commentMode`를 draw 플래그로 재사용.
- `components/study/DrawingToolbar.jsx` — `htmlMode` prop로 이미지 전용 컨트롤(이미지 이동 Hand) 숨김. 리로드·화면고정은 해당 prop 미전달로 자연히 숨김.

**`useExcalidrawTouch.js`는 변경 없음**: HTML일 때 `lockActiveRef`(=screenLocked||html)를 `screenLockedRef` 자리에 전달하면 기존 window 리스너의 `screenLocked && count>=2` 분기가 2손가락 핀치/팬을 그대로 차단한다(별도 게이트 불필요).

서버: **변경 없음**(기존 notes/comments 라우트·소켓 재사용).

## 9. 비목표 (Out of Scope)

- HTML 페이지 필기의 PDF 내보내기.
- 필기를 HTML 도구의 특정 DOM 요소에 앵커링(반응형 재정렬).
- HTML 도구 내부(iframe 안)에서의 필기.
- 이미지 페이지의 기존 pen-auto-on 동작을 HTML로 확장.

## 10. 검증 (수동 E2E)

1. HTML 도구 페이지 진입 → 뷰 모드에서 도구 버튼/입력이 정상 동작(오버레이 통과).
2. ✏️ 필기모드 ON → 도구 정지, 펜으로 그려짐, 저장상태 "저장됨" 표시.
3. 새로고침/페이지 재진입 → 필기가 같은 위치에 복원.
4. 두 손가락으로 pan/zoom 시도 → 오버레이가 어긋나지 않음(고정).
5. 교사(②/③) 화면에서 같은 HTML 페이지에 필기·코멘트 → 학생 화면 실시간 반영(③⑤).
6. 과제 HTML 페이지(④⑤) 동일 동작.
7. PDF 버튼은 HTML 페이지에서 비활성(회귀 없음).
