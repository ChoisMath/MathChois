# 펜 멈춤 → 도형 자동 보정 (Pen Shape Snap) — 설계

작성일: 2026-10-29
상태: 질의응답으로 확정 (A. 펜 획(freedraw)으로 저장 · 항상 켜짐 · 원과 타원 모두 포함 · 기준값은 아래 그대로)

## 배경 / 문제

5개 필기 뷰어의 펜 자유필기는 웻잉크 오버레이(`hooks/useWetInk.js`)가 펜 입력을 가로채 직접 렌더하고
pointerup 에 `makeFreedrawElement` 로 Excalidraw freedraw 요소를 commit 한다. 수업 필기에서 선분·원·삼각형·사각형을
반듯하게 그리려면 도형 도구로 바꿨다가 펜으로 되돌아와야 해서 흐름이 끊긴다. 노트 앱(GoodNotes·Samsung Notes)처럼
**그린 뒤 펜을 뗀 채로 두지 않고 잠시 멈추면** 도형으로 바뀌게 한다. 특히 선분은 필수.

## 목표

1. 펜 도구로 그리다 **한 자리에서 0.5초 멈추면** 지금까지의 획을 선분 / 원·타원 / 삼각형 / 사각형 중 하나로 판정하고,
   판정되면 미리보기를 즉시 반듯한 도형으로 바꾼다. 판정되지 않으면 아무 일도 없다.
2. 결과는 **점만 다듬은 freedraw 요소**로 저장한다(A 방식). 펜 두께·색이 손글씨와 같고 문지르기 지우개·되돌리기·
   저장·실시간 동기화·PDF 가 전부 그대로 동작한다.
3. 별도 버튼 없이 **항상 켜짐**. 오인식은 크기·적합도 안전장치로 막는다.

### 비목표 (Out of scope)

- 손가락 필기·마우스 입력(Excalidraw 가 직접 그리므로 라이브 점이 없다). 펜만.
- (적용 범위 보충, 2026-10-29) 5개 필기 뷰어 + AI 코칭 + HTML 도구 오버레이는 같은 `useWetInk` 를 쓰므로 자동 적용.
  **모둠 공유 화이트보드**(`components/whiteboard/WhiteboardCanvas.jsx`)는 웻잉크를 쓰지 않았으므로 같은 훅을 장착한다
  (Excalidraw 내장 펜 도구일 때만 가로채고, commit 은 `captureUpdate: IMMEDIATELY` 로 내장 undo 에 바로 잡히며
  onChange → 요소 단위 동기화를 그대로 탄다). 펜 획 중 협업자 커서 위치 전송은 건너뛴다(획은 commit 시 전파).
- Excalidraw 도형 요소(line/rectangle/ellipse)로의 변환(B 방식), 변환 뒤 선택·크기 조절.
- 화살표·다각형(5각 이상)·곡선 보정, 두 획 이상을 합치는 인식, 글자 인식.
- 툴바 토글·설정 화면. 비상 끄기만 `?shapesnap=0`(웻잉크 `?wetink=0` 과 같은 방식, localStorage `mc_shape_snap_off`).

## 동작 (사용자 관점)

| 단계 | 동작 |
|---|---|
| 멈춤 감지 | 마지막 유의미한 이동(멈춤 반경 **4px** 밖) 뒤 **500ms** 동안 펜이 그 반경 안에 머물면 판정을 시도한다. 성공할 때까지 멈출 때마다 시도하고(펜을 대고 생각만 하는 20px 미만은 제외), 성공한 뒤에는 그 획에서 다시 판정하지 않는다. 취소된 뒤 다시 멈추면 다시 시도한다. |
| 선분 | 길이 **40px** 이상, 모든 점이 시작–끝 현(弦)에서 max(길이×4%, 3px) 이내. 결과는 시작점→끝점 직선. 수평·수직에서 **3°** 이내면 각도를 0°/90° 로 맞춘다. 멈춘 뒤 펜을 더 끌면 **끝점이 펜을 따라온다**(시작점 고정, 각도 스냅은 그때그때 다시 적용). |
| 닫힌 도형 공통 | 닫힘 틈(끝점↔획의 처음 25% 구간, 시작점↔마지막 25% 구간 중 최소 거리 — 시작 변을 지나쳐 겹친 끝 허용) ≤ max(바운딩박스 대각선×15%, 25px), 바운딩박스 짧은 변 ≥ **30px**, 총 길이 ≥ 100px. |
| 삼각형·사각형 | 2px 간격 리샘플 → RDP(ε = 대각선×5%) 로 꼭짓점 추출 → 닫는 중복점·거의 일직선 꼭짓점 정리. 3개면 삼각형(꼭짓점 그대로), 4개면 사각형: 네 변이 축에서 12° 이내면 **축 정렬 직사각형**(바운딩박스), 아니면 꼭짓점 그대로의 사각형. 각 변 ≥ 15px. |
| 원·타원 | 꼭짓점이 5개 이상이거나 다각형 적합이 나쁘면 타원 적합: 중심 = 바운딩박스 중심, 반지름 a·b = 폭/2·높이/2. 각 점의 ((x−cx)/a)²+((y−cy)/b)² 의 제곱근 r 에 대해 mean|r−1| ≤ 0.12, max|r−1| ≤ 0.30 이면 타원. a/b 가 0.85~1.18 이면 **원**(a=b=평균). 결과는 64점 폐곡선. |
| 닫힌 도형 확정 | 판정 즉시 고정. 멈춘 뒤 펜이 **20px** 이상 더 움직이면 보정을 **취소**하고 지금까지의 손글씨 점 전부로 되돌린다(글자를 쓰다 멈춘 경우 글씨가 사라지지 않게). |
| 커밋 | pointerup 에 기존 경로 그대로 `makeFreedrawElement(보정된 점)`. 압력은 균일(0.5). |

모든 거리는 **화면 px**(client 좌표) 기준이라 줌과 무관하다. 판정 순서: 선분 → 닫힘 검사 → 다각형(3·4) → 타원.
다각형과 타원이 둘 다 맞으면 적합 오차가 작은 쪽.

결과 점은 **3px 간격으로 촘촘히** 만든다 — perfect-freehand 의 streamline(0.16)·smoothing(0.12) 이 드문 꼭짓점을 둥글리기
때문. 닫힌 도형은 마지막 점 = 첫 점.

## 구조

- **`lib/shapeRecognizer.js`(신규, 순수 함수)** — `recognizeShape(points, opts?) → null | { kind: 'line'|'rect'|'triangle'|'ellipse'|'circle', points }`
  (입력·출력 모두 `[x, y]` 화면 px). `snapLineEnd(start, end)`(각도 스냅 포함, 선분 끝점 추종용). 모든 임계값은 이 파일의
  상수로 모은다(`HOLD_MS`, `HOLD_RADIUS_PX`, `CANCEL_MOVE_PX`, `MIN_LINE_PX` …). DOM·Excalidraw 의존 없음.
- **`hooks/useWetInk.js`** — 멈춤 감지(타이머: 유의미한 이동마다 재설정), 판정 성공 시 `snapped = { kind, points }` 를 두고
  `render()`·`commit()` 이 `snapped ? snapped.points : pts` 를 쓴다. 선분은 onMove 에서 끝점 갱신, 닫힌 도형은 20px 이동 시
  `snapped = null`. pointerup/cancel 에 타이머 정리. 그 외 로직(가로채기 조건·캔버스·commit 경로)은 그대로.
- 바뀌지 않는 것: `lib/wetInkStroke.js`, Vite transform, 저장/소켓/노트 서비스, 툴바.

## 데이터 흐름

pen pointerdown → pts 누적(onMove, coalesced) → [이동 ≤4px 가 500ms] → `recognizeShape(pts)` → 성공이면 `snapped`
→ render 가 snapped.points 로 외곽선 → (선분: onMove 마다 끝점 갱신 / 닫힌 도형: 20px 이동 시 취소) → pointerup →
`makeFreedrawElement(snapped?.points ?? pts)` → `updateScene` → onChange → 기존 저장·동기화·히스토리.

## 오류 처리

- 인식기는 예외를 던지지 않는다(점이 2개 미만·NaN 이면 `null`). 훅은 `snapped` 가 없으면 현재와 완전히 같은 경로.
- 타이머는 획 종료·언마운트에서 항상 정리한다. `pointercancel` 도 pointerup 과 같이 처리.

## 테스트

- `lib/shapeRecognizer.test.js`: 흔들린 선분(스냅 각도 포함)·대충 그린 직사각형(축 정렬·회전)·삼각형·원·타원은 판정, 글씨
  모양 획(ㄱ·ㅅ·지그재그)·너무 작은 도형·열린 곡선·점 1~2개는 `null`. 결과 점 간격·폐곡선·크기 불변식.
- `hooks/useWetInk.test.js`(jsdom, 가짜 타이머, `pointerType: 'pen'`): 멈춤 500ms → commit 된 요소의 점이 직선 / 선분 끝점
  추종 / 닫힌 도형 20px 이동 취소 / 짧은 획·판정 실패는 손글씨 그대로 / `?shapesnap=0` 이면 미동작.
- 실제 렌더: Playwright Chromium 으로 보정 전후 획을 그려 눈으로 확인(커밋 전 자체 검증).

## 기본값 요약

멈춤 500ms · 멈춤 반경 4px · 취소 이동 20px · 선분 최소 40px · 선분 편차 max(4%, 3px) · 각도 스냅 3° · 닫힘 거리
max(15%, 25px) · 닫힌 도형 최소 변 30px·총 길이 100px · RDP ε 5% · 직사각형 축 정렬 12° · 타원 mean 0.12 / max 0.30 ·
원 비율 0.85~1.18 · 결과 점 간격 3px.
