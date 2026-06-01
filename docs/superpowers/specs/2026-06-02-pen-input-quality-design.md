# 펜 입력 품질 개선 설계 (5개 필기 뷰어)

- 날짜: 2026-06-02
- 대상: `@mathchois/client` 의 5개 필기 뷰어
  - `pages/Study/StudyViewer.jsx` (학생 필기 ①, 교사 코멘트 열람)
  - `pages/Study/TeacherStudyViewer.jsx` (교사 필기 ②)
  - `pages/Monitor/StudentWorkViewer.jsx` (학생용 교사 코멘트 ③ 작성)
  - `pages/Assignment/AssignmentStudyViewer.jsx` (학생 과제 필기 ④)
  - `pages/Assignment/AssignmentWorkViewer.jsx` (교사 과제 코멘트 ⑤ 작성)
- 공유 자산: `hooks/useExcalidrawTouch.js`, `hooks/useScribbleErase.js`,
  `lib/excalidrawUtils`, `components/study/DrawingToolbar.jsx`

## 목적

스타일러스 필기 경험에서 세 가지를 개선한다.

1. **사전 선(팜 획) 제거** — 손바닥이 펜보다 먼저 닿을 때 생기는 유령 획/연결선.
2. **필기감 개선** — 약간만 확대해도 곡선이 부채꼴로 각지고 원이 어색한 문제.
3. **undo/redo 활성화** — 현재 트리거 수단이 없어 사실상 동작하지 않음.

## 공통 제약 (Constraints)

- **실기기 검증은 Railway 배포로만 가능하고 원격 콘솔이 없다.** 따라서 진단·실험을
  위한 **온디바이스 오버레이/토글**을 빌드에 내장해야 한다. (아래 0번 작업)
- 주 사용 기기: **iPad + Apple Pencil, Galaxy Tab + S Pen.** 둘 다 OS 팜 리젝션이
  강력하고 `getCoalescedEvents()` 고주파 펜 샘플을 지원한다.
- 5개 뷰어가 동일 펜 파이프라인을 공유한다. 수정은 **공유 훅/유틸에 한 번** 넣고
  5곳에 배선한다. 뷰어별 중복 로직 복제 금지.
- 다음을 깨뜨리지 않는다(회귀 금지 목록):
  - 스크리블 지우개(`useScribbleErase` — freedraw `points` 패턴 읽음)
  - 줌-독립 펜 두께(`currentItemStrokeWidth = baseStrokeWidth / zoom`)
  - S Pen 배럴 버튼 지우개(`barrelEraserRef`)
  - 배경 element(`__bg_image__`) lock, `bgPosition`
  - Socket.IO 실시간 동기화, 1.5s debounce 자동저장
  - jspdf PDF 내보내기
  - `excalidraw_data` 저장 포맷(5개 테이블)

## 범위 밖 (Out of scope)

- **Excalidraw 엔진 교체(tldraw/커스텀 잉크).** 작업②의 C 스파이크가 "필기감 천장"이
  명백히 부족하다고 판정할 때만, **별도 의사결정**으로 다룬다. 본 spec에서는 마이그레이션
  하지 않는다. (사유: 5개 테이블의 `excalidraw_data` 포맷·동기화·배경 합성·PDF가 모두
  Excalidraw에 결합돼 있어 교체 비용이 코어 재작성 + 데이터 마이그레이션 규모.)
- 이번 수정이 닿지 않는 뷰어 코드 중복의 광범위한 리팩터링.

---

## 작업 0 — 온디바이스 진단 오버레이 (인에이블러, 먼저 구축)

작업 ①·② 모두 실기기 재현·실측이 필요하나 콘솔이 없다. 이를 가능케 하는 공유 도구.

### 동작
- `?penlog=1` 쿼리 파라미터(또는 동등한 숨은 토글)로 활성화. 기본 비활성.
- 화면 모서리 오버레이에 표시:
  - 최근 N개 포인터 이벤트: `pointerType`, `pointerId`, `button`, `width/height`,
    **coalesced 개수**, 이전 이벤트와의 `dt(ms)`.
  - 현재 refs 상태: `penActive`, `penEverDetected`, `touchPointerIds.size`,
    `penNearby`.
  - 각 이벤트가 **차단(blocked) / 통과(passed)** 중 무엇이었는지와 그 사유.
- 이벤트 **링버퍼**를 화면에 텍스트로 덤프(길게 눌러 복사 가능) → 사용자가 회신.
- **런타임 토글 패널**(redeploy 없이 변형 실측): coalesced 주입 on/off, 리샘플링
  on/off, pending 창(ms) 슬라이더. 토글 상태는 `localStorage`에 저장.

### 배치
- 공유 컴포넌트 `components/study/PenDiagnosticsOverlay.jsx` + 상태 훅
  `hooks/usePenDiagnostics.js`. 5개 뷰어 공통 마운트.
- 실험 토글 값은 작업①·②의 훅들이 ref로 구독한다.

### 성공 기준
- 콘솔 없이 iPad/Galaxy에서 포인터 이벤트 흐름과 차단 여부를 화면으로 읽을 수 있다.
- 토글 변경이 즉시 펜 파이프라인 거동에 반영된다(재배포 불필요).

---

## 작업 ① — 사전 선(팜 획) 제거 (A + B)

### 근본 원인 가설
손바닥 터치가 펜보다 먼저 도착해 freedraw 획을 시작한다. 기존 방어(펜 세션 락 +
suspect-touch 소급취소 via 합성 pointerup + Ctrl+Z)가 **"손-먼저·빠른 드롭"** 케이스에서
누수한다. 정확한 누수 경로는 작업 0 오버레이로 기기별 특정한다.

### A. 진단 기반 결정적 차단
- 오버레이로 누수 경로를 특정(예: `penEverDetected` 설정 전 race, 이벤트가 캡처
  핸들러보다 먼저 canvas 도달 등).
- 펜 디바이스(`penEverDetected === true`)에서는 **단일 터치가 freedraw 획을 절대
  시작하지 못하도록** `useExcalidrawTouch` 의 차단을 강화한다. 2손가락 핀치줌은 유지.
- 펜 획에는 **지연 0**.

### B. 보류 후 폐기 (Ctrl+Z 소급취소 대체)
- 현재 진행 중 freedraw 획을 **시작한 pointerType** 을 추적한다.
- 터치로 시작된 획은 짧은 창(기본 ~150ms, 오버레이 토글로 조정) 동안 *uncommitted*
  로 간주. 그 창 안에 펜 `pointerdown` 이 오면 **commit 전에 해당 element 를 통째로
  제거**한다(`isDeleted`로 마킹 후 정리, 히스토리 커밋 안 함).
- 기존의 합성 pointerup + `document.dispatchEvent(Ctrl+Z)` 소급취소 로직을 제거한다
  → undo 스택 오염 제거(작업 ③과 직접 연결).

### 성공 기준
- iPad/Galaxy에서 **빠른 손-먼저 드롭을 반복해도** 사전 선/손-펜 연결선이 생기지 않는다.
- 정상 펜 획에 추가 지연이 없다(체감 즉시).
- 스크리블 지우개, 2손가락 핀치줌/팬, S Pen 배럴 지우개가 그대로 동작한다.
- undo 스택에 팜 관련 흔적이 남지 않는다.

---

## 작업 ② — 필기감 개선 (C → A → B)

### C. 필기감 천장 측정 스파이크 (게이트)
- 오버레이 토글로 `getCoalescedEvents()` 주입을 켜고 iPad/Galaxy에서 곡선·원이
  충분히 매끄러워지는지 **실측**한다.
- **게이트 판정**:
  - 충분 → A + B 진행(Excalidraw 유지).
  - 명백히 부족 → 본 작업② 중단하고 "엔진 교체 평가"를 **별도 의사결정**으로 올린다.
- 산출물: 스파이크 결과 메모(천장 평가 + A의 구현 방식 결정).

### A. 라이브 고주파 포인트 주입
- C 통과 시, `pointermove` 의 coalesced 포인트를 살려 freedraw 에 반영한다.
- **정확한 방식은 C 스파이크가 결정**한다. 후보: (1) 컨테이너 포인터 프리프로세서로
  보조 포인트 합성, (2) `patch-package` 로 `@excalidraw/excalidraw` 의 포인터 처리
  패치. 유지보수 부담이 낮은 쪽 우선.

### B. 획 완료 후 리샘플링
- 획 완료 감지는 `useScribbleErase` 의 "points 증가 멈춤(300ms)" 방식을 재사용한다.
- 완료된 freedraw 의 `points` 를 **Chaikin 또는 Catmull-Rom** 으로 촘촘·매끄럽게
  재계산 후 `updateScene` 으로 교체한다.
- 조건:
  - **스크리블 지우개 보존**: 리샘플링은 스크리블 패턴 판정 **이후**에만 적용하거나,
    리샘플된 points 로도 동일 판정이 나도록 검증한다(둘 중 안전한 쪽).
  - `excalidraw_data` 포맷 유지(추가 필드 없이 points 만 교체).
  - **멱등**: 이미 매끄럽게 처리된 획을 재처리하지 않는다(처리 마킹 or 길이/밀도 기준).
  - 줌-독립 두께(`baseStrokeWidth / zoom`)를 존중.
  - 교사 코멘트/타인 레이어(`excludePrefixes`)와 배경(`__bg_image__`)은 대상에서 제외.

### 배치
- ② 로직을 공유 훅 `hooks/useFreedrawSmoothing.js` + `lib/excalidrawUtils` 의 순수
  함수(리샘플링)로 분리, 5개 뷰어에 배선.

### 성공 기준
- iPad/Galaxy에서 곡선/원을 그릴 때, 그리고 확대 상태에서 부채꼴/각짐이 눈에 띄게
  감소한다(전/후 비교).
- 스크리블 지우개가 리샘플 전후 모두 정상 동작.
- 동기화·자동저장·PDF 결과가 깨지지 않는다.

---

## 작업 ③ — undo / redo 활성화 (화면 버튼 + 키보드)

### 원인 가설
Excalidraw 히스토리는 내장돼 있으나 (a) 뷰어가 패널/네이티브 버튼을 CSS로 숨겨
트리거가 없고, (b) 태블릿엔 키보드가 없어 Ctrl+Z 불가. 정확한 트리거 방식(API vs
키보드 디스패치 vs 네이티브 액션)은 소규모 스파이크로 확정한다.

### 설계
- **화면 버튼**: `DrawingToolbar` 에 ↶(undo) / ↷(redo) 버튼 추가. 터치 타겟 ≥ 44px.
  Excalidraw 히스토리에 연결.
- **키보드**(데스크톱): undo = `Ctrl+Z`, redo = `Ctrl+Shift+Z`(및 `Ctrl+Y`). 작업①
  B로 Ctrl+Z 자체 디스패치를 제거했으므로 충돌 없음.
- **히스토리 격리(필수 요건)**: 히스토리 기준선을 **초기 로드 완료 시점(배경 +
  기존 노트 lock 후)** 이후로 잡는다. undo가 배경 이미지·교사 코멘트 레이어·기존
  필기·타인 콘텐츠를 절대 제거하지 않도록 한다. 사용자는 자신의 신규 획만 되돌린다.
- **동기화 정합성**: undo/redo 후에도 1.5s 자동저장·Socket 동기화가 일관되게 반영.

### 성공 기준
- iPad/Galaxy에서 화면 버튼으로 직전 획 undo/redo 가능.
- 데스크톱에서 키보드 단축키 동작.
- undo를 끝까지 눌러도 배경/교사 레이어/기존 필기가 사라지지 않는다.
- 버튼 상태(가능/불가)가 히스토리 유무에 맞게 표시(가능하면).

---

## 순서 (Sequencing)

기기 의존 단계마다: **배포 → 사용자가 오버레이로 재현 → 회신 → 반복.**

1. 작업 0: 진단 오버레이 + 런타임 토글.
2. 작업 ①: A(진단→결정적 차단) + B(보류-폐기, Ctrl+Z 디스패치 제거).
3. 작업 ③: 화면 버튼 + 키보드 undo/redo + 히스토리 격리. (① 이후 — 히스토리 정합)
4. 작업 ②: C 스파이크(게이트) → A(라이브 주입) → B(리샘플링).

## 테스트 전략

- **순수 함수 단위테스트**(`@mathchois/client`): 리샘플링 함수, 리샘플 후 스크리블
  패턴 감지, pending-폐기 상태머신.
- **기기 거동**: Railway 배포 + 진단 오버레이로 검증(콘솔 부재 대응).
- 회귀: 위 "회귀 금지 목록" 항목별 수동 체크리스트.

## 미해결/스파이크로 확정할 항목

- 작업①A: 기기별 정확한 누수 경로(오버레이로 특정).
- 작업②A: coalesced 주입의 구현 방식(프리프로세서 vs patch-package) — C 스파이크 결정.
- 작업②: 필기감 천장 게이트 판정(통과 시 A/B, 미달 시 엔진 평가 별도 결정).
- 작업③: undo/redo 트리거 메커니즘(API/키보드 디스패치/액션매니저) — 소규모 스파이크.
