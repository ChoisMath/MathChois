# 입력 모드 분리 (스타일러스 ↔ 손가락) — 설계

날짜: 2026-06-02
대상: 5개 필기창 (StudyViewer / TeacherStudyViewer / StudentWorkViewer / AssignmentStudyViewer / AssignmentWorkViewer)

## 배경 / 문제

손바닥이 펜보다 먼저 닿는 급하강 시 손바닥 터치가 freedraw 획을 시작해 "연결선(phantom line)"이 남는다. 기존 팜 리젝션은 휴리스틱 누적(크기 >25px, pen-session-lock, pending-discard, warmup)이라 다음 이유로 뚫린다:

- 손바닥이 4×4 등 작은 터치로 들어와 크기 임계값(25px)을 통과.
- 펜이 한 번도 감지되지 않은 첫 입력 경로에서는 pen-session-lock이 비활성.
- 펜이 `touch`로 보고되거나 discard 창(150ms)이 지나면 pending-discard가 못 잡음.

## 해결 방향

입력을 **스타일러스 모드(기본)** 와 **손가락 모드** 로 분리한다. 손바닥은 항상 `touch`이므로, 스타일러스 모드에서 그리기 도구의 단일 손가락 터치를 이벤트 첫 발생부터 결정적으로 차단하면 phantom line의 근본 원인이 제거된다. 휴리스틱 누적을 단일 규칙으로 대체한다.

## 1. 입력 모드 스토어 — `lib/inputMode.js` (신규)

`lib/penToggles.js`와 동일 패턴.

- localStorage 키 `mc_input_mode`, 값 `'stylus'` | `'finger'`, 기본 `'stylus'`.
- export: `getInputMode()`, `setInputMode(mode)`, `subscribeInputMode(fn)` (구독 해제 함수 반환).
- 5개 뷰어 전역 공유. 한 번 변경하면 모든 필기창에 적용.

## 2. 입력 규칙 판정 — 순수 함수

`shouldBlockTouchDraw(mode, tool, touchCount)` 를 순수 함수로 추출(`inputMode.js`에 동봉)해 단위 테스트 가능하게 한다.

- 그리기 도구 집합: `freedraw`, `line`, `rectangle`, `ellipse`, `triangle` (삼각형은 내부적으로 freedraw로 동작 → freedraw로 커버됨).
- 규칙: `mode === 'stylus' && touchCount < 2 && DRAW_TOOLS.has(tool)` → `true`(차단).
- 그 외(`mouse`/`pen`은 애초에 이 함수 미적용, 선택·지우개·이미지이동 도구, 2손가락) → `false`.

| 입력 | 스타일러스 모드 | 손가락 모드 |
|---|---|---|
| `pen` | 필기 | 필기 |
| `mouse` | 필기 | 필기 |
| 1손가락 + 그리기 도구 | 차단 | 필기 |
| 2손가락 | 줌/팬 | 줌/팬 |
| 손가락 + 선택/지우개/이미지이동 | 동작 | 동작 |

## 3. `useExcalidrawTouch.js` 재작성

이벤트 시점에 `getInputMode()`를 실시간 호출(현행 `getToggles()`와 동일 — useEffect 재바인딩 불필요). 훅 시그니처/반환값은 유지하여 5개 뷰어 호출부 변경 최소화.

**제거:**
- 크기 기반 팜 리젝션 (`e.width/height > 25`, `radiusX/Y > 25`).
- pen-session-lock (`penEverDetectedRef`, localStorage `mathchois_pen_detected`).
- penActive/penNearby 단일터치 차단 로직 및 관련 ref/timeout.
- pending-discard (`pendingDiscardRef`, `createPendingDiscard` import).
- draw-mode warmup 기반 touch 차단 (`drawModeWarmupRef`). `triggerPalmRejectionWarmup`는 호출부 보존을 위해 no-op로 유지하거나 반환 유지.

**유지:**
- `touch-action: none`, Safari `gesture*` 차단.
- Excalidraw 영역 `contextmenu` 차단 (S Pen 배럴버튼 스크롤 방지).
- S Pen 배럴버튼(`e.button !== 0`) → 그리기 전달 차단/지우개 토글 (`barrelEraserRef`, `prevToolRef`).
- 2손가락 커스텀 핀치줌 + 팬 (freedraw), screenLocked 처리, 줌-독립 펜 두께 보정.

**신규 차단 로직(handlePointerDown / handlePointerMove, `e.pointerType === 'touch'`):**
- `touchPointerIdsRef`로 동시 터치 수 추적(유지).
- `shouldBlockTouchDraw(getInputMode(), getActiveTool(), touchPointerIdsRef.size)` → `true`면 `preventDefault()` + `stopPropagation()` 후 백스톱 무장.

**백스톱(보강, 비파괴 보장):**
- 차단한 터치의 `pointerId`와 차단 시각을 기록.
- 해당 터치의 pointerup/pointercancel 시, 차단 시각 이후 생성된 freedraw가 존재하면 `commitToHistory: false`로 `isDeleted: true` 처리(undo 스택 오염 없음).
- Excalidraw는 먼저 잡은 단일 포인터로만 그리므로(손바닥이 먼저면 그 획이 곧 phantom, 펜이 먼저면 손가락 터치는 차단됨) 펜 획을 잘못 제거할 위험이 없다.

## 4. `DrawingToolbar.jsx`

**추가 — 손가락 모드 토글 버튼:**
- 아이콘 `Pointer` (lucide). freedraw `Pen` 아이콘과 구분.
- 상태: `useState(getInputMode())` + `subscribeInputMode`로 갱신. 스타일러스=회색 비활성, 손가락=파란 활성.
- 클릭 시 `setInputMode(다음 모드)`.
- 툴팁: 스타일러스 모드 → "손가락 필기 켜기 (현재: 스타일러스 전용)", 손가락 모드 → "손가락 필기 끄기 (현재: 손가락 허용)".
- 모드는 스토어를 직접 읽으므로 뷰어 prop 추가 불필요.

**삭제 — 영역 삭제(가위) 기능:**
- `Scissors` 버튼(`eraser_area`) 및 활성 시 나타나는 휴지통 버튼.
- `handleDeleteSelected` 함수.
- `applyTool`의 `eraser_area` 분기, `applyColor`의 `eraser_area` 포함 분기.
- 미사용 import 정리(`Scissors` 등; `Trash2`는 전체 지우기에서 계속 사용).

## 5. 테스트 (Vitest, `packages/client`)

`lib/inputMode.test.js`:
- 기본값 `'stylus'`.
- `setInputMode`/`getInputMode` 왕복, localStorage 반영.
- `subscribeInputMode` 콜백 호출 및 해제.
- `shouldBlockTouchDraw`:
  - stylus + freedraw + 1손가락 → true.
  - stylus + freedraw + 2손가락 → false.
  - stylus + selection + 1손가락 → false.
  - finger + freedraw + 1손가락 → false.
  - stylus + rectangle/ellipse/triangle/line + 1손가락 → true.

## 6. 기기 검증 (Railway 배포 후)

- 스타일러스 모드: 손바닥 먼저+펜 급하강 시 연결선 0, 펜 필기 정상.
- 손가락 모드 토글: 손가락 필기 동작, 다시 스타일러스로 토글 시 손가락 필기 차단.
- 두 손가락 줌/팬: 양쪽 모드 모두 동작.
- 모드 설정이 새로고침/다른 필기창 이동 후에도 유지(localStorage).

## 비목표 (YAGNI)

- 스타일러스 모드에서 한 손가락 팬은 제공하지 않음(무동작). 화면 이동은 2손가락.
- 기기별 펜 유무 자동 감지/모드 자동전환은 하지 않음. 손가락 전용 기기 사용자는 토글 1회로 전환(localStorage 유지).
