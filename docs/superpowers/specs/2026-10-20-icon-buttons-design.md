# 글자 버튼 → 아이콘 버튼 정리 — 설계

작성일: 2026-10-20
상태: 질의응답(질문 1~7)으로 확정 → 1단계(공통 부품 + 학급·사이드바) 화면 확인 후 2~5단계 진행
선행: 클래스룸 리디자인 2단계(PR #13, 남색 상단 바 + 색 인덱스 탭)

## 배경 / 문제

앱에는 이미 아이콘만 있는 버튼이 약 180개 있다(창 아래 `✕` + 실행 아이콘, `title`로 이름 표시).
그런데 글자 버튼이 약 110개 남아 있어 화면마다 글자가 많고 규칙이 어긋난다. 또 아이콘만 있는데
이름이 없는 버튼이 약 50개 있어(`✕`·`←` 글자 버튼, 뒤로가기·이전/다음 등) 화면 읽기 프로그램이 읽지 못한다.

## 결정 사항

| # | 질문 | 결정 |
|---|---|---|
| 1·5 | 어떤 버튼을 아이콘으로? | **적극적으로** 바꾼다. 아래 "글자로 남길 것" 다섯 가지만 글자 유지. |
| 2 | 이름은 어떻게? | 공통 부품 `IconButton` — `label` 하나로 `title` + `aria-label`. 길게 눌러 이름 보기는 **보류**. |
| 3 | 이름 없는 기존 아이콘 버튼 | 함께 정리 — `IconButton`으로 바꾸고 이름을 붙인다. `✕` 글자는 `X` 아이콘으로. 필기 도구 모음(`DrawingToolbar`)은 손대지 않는다. |
| 4 | 아이콘 사전 | 아래 표. |
| 6 | 모양 | 3가지 종류(기본·주요·위험), 누르는 영역 44px, 아이콘 20px. 범위 **(가)**: 이번에 바꾸는 버튼 + 이름 없는 버튼만 새 부품. 이름 있는 기존 아이콘 버튼 약 180개는 그대로. |
| 7 | 진행 | 1단계를 먼저 화면으로 확인받고, 2~5단계는 이어서 진행 → PR → main 병합. |

## 공통 부품 `IconButton`

파일: `packages/client/src/components/common/IconButton.jsx` (+ `IconButton.css`)

```jsx
<IconButton icon={Trash2} label="삭제" variant="danger" onClick={…} />
<IconButton icon={Plus} label="만들기" variant="primary" type="submit" busy={creating} busyLabel="만드는 중..." />
<IconButton as={Link} to="…" icon={ArrowLeft} label="영상으로 돌아가기" />
```

- props: `icon`(lucide 컴포넌트), `label`(필수 — `title`·`aria-label`), `variant` = `'ghost'`(기본) | `'primary'` | `'danger'` | `'danger-solid'`,
  `busy`(true면 아이콘 대신 돌아가는 `Loader2`, `aria-busy`, 누름 막음), `busyLabel`, `as`(기본 `button`; `Link`·`a` 가능),
  `size` = `'md'`(44px, 기본) | `'sm'`(36px 보이는 크기 + 44px 누르는 영역 — 표 줄처럼 촘촘한 곳), 나머지 props 는 그대로 전달
  (`type` 기본 `'button'`, `disabled`, `className`, `aria-pressed` 등).
- 모양:
  - **ghost(기본)**: 아이콘 `#56627c`, hover/active 시 배경 `rgba(28,43,74,.08)`·아이콘 `#1c2b4a`.
  - **primary(주요)**: 배경 남색 `#1c2b4a`, 흰 아이콘, 둥근 모서리, hover `#142039`.
  - **danger(목록 줄 삭제)**: ghost 모양 + hover 시 아이콘 `#c62828`·배경 `#fdecea`.
  - **danger-solid(확인 창 삭제·초기화)**: 배경 `#d32f2f`, 흰 아이콘, hover `#b71c1c`.
- 공통: 누르는 영역 44×44px, 아이콘 20px, `:focus-visible` 3px 남색 테두리(남색 배경 버튼은 흰 테두리 대비 확보),
  `disabled`/`busy` 시 opacity .5·커서 기본, `prefers-reduced-motion` 시 전환 없음, hover 효과는 `@media (hover: hover)` 안에.
- 글자 크기 단위는 px(html 루트가 12~18px 로 바뀌므로 rem 금지).

## 아이콘 사전

| 행동 | 아이콘(lucide) | variant |
|---|---|---|
| 취소·닫기 | `X` | ghost |
| 저장·수정 저장 | `Save` | primary |
| 만들기·등록·추가·새 ○○ 등록 | `Plus` | primary(창 실행) / ghost(머리글·도구 모음) |
| 수정 | `Pencil` | ghost |
| 삭제 | `Trash2` | danger(목록) / danger-solid(확인 창) |
| 미리보기 | `Eye` | ghost |
| 검색·조회 | `Search` | ghost |
| 이전 / 다음 | `ChevronLeft` / `ChevronRight` | ghost |
| 고르기 창의 선택·삽입·배정 | `Check` (배정됨: 채운 체크 + `disabled`) | primary |
| PNG / PDF / 전체 모둠 PDF | `ImageDown` / `FileDown` / `Files` | ghost |
| 직전 상태로 / 초기화(모둠 보드) | `Undo2` / `Eraser` | ghost / danger (확인 창 유지) |
| YouTube 링크 / 영상자료에서 선택 | `Link` / `Clapperboard` | ghost(큰 선택 타일) |
| AI 정답·해설 생성, AI 코칭 | `Sparkles` | ghost |
| 2분할로 필기하며 보기 | `Columns2` | ghost |
| 템플릿 / 화면 맞춤 / 설정(모둠 보드 상단) | `LayoutTemplate` / `Maximize2` / `Settings` | ghost |
| 자동 배분 / 모둠 추가 | `Shuffle` / `Plus` | ghost |
| 코칭 기록 / 리셋 | `History` / `RotateCcw` | ghost |
| 교사 화면 열기 / 템플릿 변경 / 문제 변경 | `ExternalLink` / `LayoutTemplate` / `Replace` | ghost |
| 현재 시각 첨부 / 답글 | `Clock` / `Reply` | ghost |
| 썸네일 교체 / 다른 장면으로 | `ImagePlus` / `Camera` | ghost |
| 돌아가기(영상으로 등) | `ArrowLeft` | ghost |
| 필기 이미지 보기 / 숨기기 | `Eye` / `EyeOff` | ghost |
| 참여(사이드바) | `ArrowRight` | primary |

`Youtube` 브랜드 아이콘은 lucide 에서 폐지 예정이라 쓰지 않고 `Link`를 쓴다.

## 글자로 남길 것

1. 빈 화면의 첫 시작 버튼(예: "첫 학급 만들기").
2. 관리자 "전체 초기화"(글자 입력 확인).
3. 메뉴 탭·카드·썸네일·아코디언 머리, 로그인·약관·역할 선택 화면.
4. 학생 코칭 화면(`CoachingViewer`)의 "수식전환"·"AI검토요청".
5. 코칭 기록의 기간 선택(최근 1주 / 1개월 / 전체)과 오류 화면의 "돌아가기"·"다시 확인".

## 단계별 범위

1. **공통 부품 + 학급·사이드바** — `IconButton`, `ClassroomList` 새 학급 창(취소·만들기), 머리글 "새 학급", `ClassroomDetail` 코칭 기록,
   `DashboardLayout` 참여 버튼. → **화면 캡처로 사용자 확인.**
2. **문제은행·시각화자료·영상자료** — `pages/Problems/*`, `pages/Visualizations/*`, `pages/Videos/*`, `components/problems|visualizations|videos/*`
   (목록 줄 미리보기·수정·삭제, 이전/다음, 검색, 고르기 창 선택·삽입·배정·새 등록, 입력 창 취소·등록, 영상 댓글, 썸네일, 2분할, 돌아가기).
3. **챕터·과제 편집 화면의 창** — `pages/Chapters/Editor.jsx`, `pages/Assignment/AssignmentEditor.jsx`
   (영상 넣기 선택, YouTube 창, 내보내기 창, AI 코칭, 교사 화면 열기, 템플릿·문제 변경).
4. **모둠 보드·코칭** — `components/whiteboard/*`, `pages/Whiteboard/*`, `pages/Study/TeacherCoachingReview.jsx`,
   `components/coaching/CoachingHistoryView.jsx`(조회·이미지 보기, 이전/다음), `PdfDownloadButton`, `ChapterMonitor` 보드 열기.
5. **이름 없는 아이콘 버튼** — `✕`/`←` 글자 버튼과 `title`·`aria-label` 없는 아이콘 버튼(Assignment*·Study*·Board·FileAttachmentPanel·
   SortablePageItem 등)을 `IconButton`으로. `DrawingToolbar` 제외.

## 지켜야 할 것

- 버튼 동작·조건(disabled, confirm(), 로딩 상태, 권한)은 그대로. 바뀌는 것은 겉모양과 이름뿐.
- 로딩 중 글자("만드는 중...")는 `busyLabel`로 `title`·`aria-label`에 남긴다.
- 표 줄처럼 촘촘한 곳은 `size="sm"`.
- 필기 뷰어(DashboardLayout 밖)의 펜 작업 흐름을 방해하지 않는다.

## 검증

- `npx vitest run`(client), eslint 0 오류, client 빌드.
- `IconButton` 단위 테스트(이름·busy·variant·as=Link).
- Playwright(빌드 + 모의 API): 단계마다 해당 화면 1280·375 캡처, 페이지 오류 0, 가로 스크롤 없음,
  이름 없는 `<button>` 수 측정(접근 가능한 이름이 빈 버튼 0 — `DrawingToolbar` 제외).

## 구현 중 확정된 변경(리뷰 반영)

- `IconButton` 에 `size="lg"`(72px 선택 타일) 추가 — 영상 넣기 방식 고르기(YouTube 링크 / 영상자료)에 사용. 아이콘만 표시(사용자 승인).
- "…됨"(이미 배정·삽입됨) 상태는 `CircleCheck` + `disabled` 로 일반 `Check` 와 구분.
- 영상 댓글 등록·답글 등록은 `Send`, 댓글 수정 저장은 `Save`.
- 검색 버튼은 ghost. 영상자료 표의 미리보기·수정·삭제 칸은 오른쪽 고정(sticky).
- 챕터 편집 도구 모음의 "AI 코칭"은 이웃 버튼(36px) 모양을 유지한 채 글자만 빼고 이름을 붙였다.
- 필기 뷰어(StudyViewer·Assignment*Viewer 등)·FileAttachmentPanel·SortablePageItem·PenDiagnosticsOverlay 의 아이콘 버튼은
  크기·위치를 유지하고 `aria-label` + `title` 만 붙였다.
- 모둠 보드 상단 바는 휴대폰에서 44px 버튼이 잘리지 않도록 `min-h-[44px]`.
- 챕터 모니터의 "{n}페이지 보드 열기" 칩은 페이지 번호가 유일한 구분이라 글자 유지.
- `as`(링크 등)로 쓴 버튼이 `disabled`/`busy` 이면 `aria-disabled` + `tabIndex=-1` + 클릭 막음.
- 토글(필기 이미지 보기)은 이름을 고정하고 `aria-pressed` 로 상태를 알린다.
