# 챕터 화이트보드 (모둠 공유 보드) — 설계

작성일: 2026-10-18
상태: 질의응답으로 확정 (Q1~Q10) → 구현 완료 (2026-10-18, 계획 `docs/superpowers/plans/2026-10-18-whiteboard.md` 참조; 태블릿 실기기 확인 미완)

## 배경 / 문제

챕터 페이지는 이미지·영상·HTML 도구 위에 **개인별** 필기를 남기는 구조다. 학생 여러 명이 한 화면에
동시에 쓰고 꾸미는 "모둠 공유 보드"(Canva 화이트보드, Padlet Sandbox, 옛 Google Jamboard 유형)가 없다.
현재 실시간 동기화는 "저장 완료 알림 → 전체 재조회"이고 저장은 Excalidraw JSON 전체 덮어쓰기(1.5초
디바운스)라, 여러 사람이 한 보드를 동시에 편집하면 서로의 작업을 지운다. 새 동기화 방식이 필요하다.

## 목표

1. 챕터에 **화이트보드 페이지**를 추가한다. 학급 **모둠(그룹)별**로 보드 하나씩 생기고, 모둠원이 동시에
   그리고 꾸민다(발표자료 제작).
2. 학급마다 **기본 모둠**을 설정해 두고, 화이트보드 페이지를 만들면 그 모둠 구성이 복사된다. 페이지별로
   교사가 배정을 바꿀 수 있다.
3. 교사 화면은 **그룹 드롭다운으로 보드 전환**하는 단일 보기와, **학급 전체 모둠 보드를 타일로 동시에
   보는 격자 보기**를 제공한다. 타일을 클릭하면 그 모둠 보드가 전체 화면으로 열린다.
4. Padlet Sandbox처럼 **템플릿**(흰 바탕 + 검은 구분선)으로 시작할 수 있고, 학생이 **바탕색**을 바꿀 수 있다.

### 비목표 (v1)

- 보드 버전 이력 탐색(타임라인) — 직전 저장본 1개 복원만 제공.
- 모둠 간 보드 복제, 댓글/스티커 반응, 투표.
- 다중 서버 인스턴스 간 보드 상태 공유(Redis 어댑터). Railway 단일 인스턴스 전제.
- 학생이 스스로 모둠을 고르거나 한 학생이 여러 모둠에 속하는 기능.

## 핵심 설계 결정 (질의응답 확정)

| # | 결정 | 선택 |
|---|---|---|
| Q1 | 기본 모둠 설정 | 학급 상세 > 학생 탭에 "모둠 설정". "N개 모둠 자동 배분" + 드롭다운 수동 조정. 미배정 학생은 "미배정"으로 남김. 화이트보드 페이지 생성 시 기본 모둠을 **복사**(페이지 변경이 학급 기본 모둠에 영향 없음). |
| Q2 | 다른 모둠 열람 | 기본은 자기 모둠만. 교사가 페이지별 **"다른 모둠 열람 허용"** 스위치를 켜면 학생도 모든 모둠 보드를 읽기 전용으로 전환해 볼 수 있음. 교사 격자 보기는 항상 동작. |
| Q3 | 교사 편집·잠금 | 교사는 어느 모둠 보드든 편집 가능. 보드별 **편집 잠금**과 페이지 전체 잠금 제공. |
| Q4 | 템플릿 적용 시점 | 교사가 페이지 기본 템플릿 지정 가능. 미지정이면 학생이 빈 보드를 열 때 템플릿 선택 화면. 보드 안 "템플릿" 버튼으로 언제든 추가 삽입(현재 화면 위치에 묶음으로). |
| Q5 | 템플릿 범위 | 그래픽 오거나이저 16종 + 분석 14종 + 활동 4종(장단점, 동의 또는 반대, TPS, 어느 쪽을 선택) = **34종**. 주기율표·전체 검색·슬라이드/첨부 계열 제외. |
| Q6 | 도구 UI | **Excalidraw 기본 UI 노출**(도형·텍스트·화살표·펜·이미지·색상·글꼴, 한국어). 기존 S펜·손바닥 거부 훅 유지. 상단 자체 바: 바탕색, 템플릿, 모둠 전환, 잠금 표시, 화면 맞춤. 이미지는 긴 변 1600px·1MB 이하로 축소해 `whiteboard-files` 버킷에 업로드, 보드에는 URL만 저장. |
| Q7 | 협업자 표시·작성자 | Excalidraw `collaborators`로 이름표 커서 표시. 요소에 `customData.authorId/authorName` 기록, 교사 화면에서만 작성자 확인. 격자 타일에 접속 인원·이름 표시. |
| Q8 | 캔버스 | 무한 캔버스 + 3200×1800 **발표 영역 안내선** + "화면 맞춤". 썸네일·내보내기는 발표 영역 기준, 밖에 요소가 있으면 전체 범위. |
| Q9 | 교사 관리 작업 | **초기화**(확인 후), **템플릿 재적용**(빈 보드에만), **내보내기**(PNG/PDF, 모둠 하나 또는 전체). 보드마다 **직전 저장본 1개** 보관 → "직전 상태로 되돌리기". |
| Q10 | 연결(linked) 챕터 | 보드 내용·모둠 배정·잠금·열람 허용은 **학급별 독립**(저장 단위 = 페이지 + 학급 + 모둠). 기본 템플릿만 원본 페이지 속성으로 공통. 연결 학급 교사도 자기 학급 배정·잠금·초기화 가능. |

## 데이터 모델 (Drizzle `schema.ts` + `startupMigrate.ts` idempotent DDL)

```
pages
  + page_type            text null        -- 'whiteboard' (null = 기존 이미지/영상/HTML/AI 문항)
  + whiteboard_template  text null        -- 기본 템플릿 key (null = 학생 선택)

classroom_groups                          -- 학급 기본 모둠
  id uuid pk, classroom_id fk(cascade), name text, position int, created_at
classroom_group_members
  id uuid pk, classroom_id fk(cascade), group_id fk(cascade), student_id fk(cascade)
  unique(classroom_id, student_id)        -- 학생은 학급당 한 모둠

whiteboard_page_settings                  -- 페이지 × 학급 설정
  id uuid pk, page_id fk(cascade), classroom_id fk(cascade)
  allow_cross_group_view bool default false
  locked_all bool default false
  unique(page_id, classroom_id)

whiteboard_groups                         -- 페이지 × 학급 × 모둠 = 보드 1개
  id uuid pk, page_id fk(cascade), classroom_id fk(cascade)
  name text, position int, locked bool default false
  background_color text default '#ffffff'
  excalidraw_data jsonb                   -- { elements, files: {fileId:{url,mimeType}} }
  prev_excalidraw_data jsonb              -- 직전 저장본 (되돌리기용)
  scene_version int default 0
  updated_at timestamptz
  index(page_id, classroom_id)
whiteboard_group_members
  id uuid pk, group_id fk(cascade), student_id fk(cascade)
  unique(group_id, student_id)
```

- 보드 행은 **지연 생성**: 교사/학생이 (페이지, 학급)으로 처음 접근할 때 `whiteboard_groups`가 없으면
  학급 기본 모둠을 복사해 만든다. 학급에 기본 모둠이 하나도 없으면 "1모둠"에 전원을 넣어 만든다.
- 페이지 삭제 → cascade. 학급 기본 모둠 변경은 이미 만들어진 페이지 보드에 영향 없음(Q1).
- `whiteboard_template` 변경 시 `excalidraw_data`의 요소가 0개인 보드에만 새 템플릿 삽입(Q9-b).

## 실시간 동기화 설계

### 원칙
- 서버가 보드별 **권위 있는 장면(authoritative scene)** 을 메모리에 들고, 요소 단위로 병합·브로드캐스트한다.
- 병합 규칙은 Excalidraw `reconcileElements`와 동일: 같은 id면 `version` 큰 쪽, 같으면 `versionNonce`
  작은 쪽. z-order는 요소의 fractional `index`를 그대로 신뢰(클라이언트가 정렬).
- 클라이언트는 수신 요소를 `reconcileElements(local, remote, appState)`로 합친 뒤
  `updateScene({ elements, captureUpdate: CaptureUpdateAction.NEVER })` — 원격 변경은 로컬 undo 이력에
  들어가지 않는다. (0.18에서 `commitToHistory`는 deprecated, `captureUpdate` 사용.)
- 삭제는 Excalidraw 방식의 soft delete(`isDeleted: true`)로 전파하고, 서버는 저장 시 10분 지난 삭제
  요소를 제거한다.

### Socket.IO
Room `wb:{whiteboardGroupId}`. `validateRoomAccess`에 패턴 추가:
- 교사: 보드의 `classroom_id` 소유자.
- 학생: 해당 모둠 구성원(쓰기), 또는 `allow_cross_group_view`가 켜진 페이지의 같은 학급 구성원(읽기).

| 이벤트 | 방향 | 내용 |
|---|---|---|
| `wb:join` `{boardId}` | C→S | room join 후 서버가 `wb:init {elements, files, backgroundColor, locked, sceneVersion, collaborators}` 응답 |
| `wb:elements` `{boardId, elements[]}` | C→S→room | 변경 요소만(클라이언트가 이전 브로드캐스트 이후 `version`이 바뀐 요소를 100ms 스로틀로 전송). 서버: 쓰기 권한·잠금 확인 → 병합 → 발신자 제외 브로드캐스트 → 저장 예약 |
| `wb:pointer` `{boardId, x, y, tool}` | C→S→room | volatile. 서버가 `{userId, username, role}` 덧붙여 전달 |
| `wb:background` `{boardId, color}` | C→S→room | 바탕색. 학생도 가능 |
| `wb:lock` `{boardId, locked}` / `wb:lock-all` | S→room | 교사 REST 변경 후 서버가 브로드캐스트 |
| `wb:reset` / `wb:restored` `{boardId, elements}` | S→room | 초기화·되돌리기 후 전체 장면 교체 |
| `wb:presence` `{boardId, users[]}` | S→room | 입장/퇴장 시 접속자 목록 |

서버 메모리: `Map<boardId, { elements: Map<id, El>, files, backgroundColor, dirty, saveTimer, lastSavedAt }>`.
저장은 변경 후 2초 디바운스, 최대 10초 간격, 마지막 접속자 퇴장 시 즉시. 저장 전 현재 DB 값을
`prev_excalidraw_data`로 옮긴다(단, 직전 저장이 30초 이내면 덮어쓰지 않아 "직전" 이 너무 잘게 쪼개지지
않게 한다). 메모리는 마지막 퇴장 후 5분 뒤 해제.

### 작성자 기록
클라이언트가 `wb:elements`를 보내기 전에 `customData.authorId`가 없는 요소에 `{authorId, authorName}`을
채운다. 서버는 학생이 보낸 요소의 `authorId`가 본인과 다르면 **기존 요소의 작성자를 유지**한다(위조 방지).
교사 화면에서 요소 선택 시 상단 바에 "작성: 이름" 표시.

### 이미지
- Excalidraw 이미지 요소는 `fileId`로 `files[fileId].dataURL`을 참조한다. 업로드 시 클라이언트가 캔버스로
  축소(긴 변 1600px, JPEG/PNG, 1MB 이하) → `POST /api/files/upload?bucket=whiteboard-files&directory={boardId}`
  (학생 허용 버킷에 추가, 이미지 MIME만) → 보드 `files[fileId] = {url, mimeType}` 를 `wb:files` 이벤트로 공유.
- 수신 측은 URL을 fetch → dataURL → `excalidrawAPI.addFiles` 후 요소 반영.

## 서버 REST API

| 메서드·경로 | 권한 | 설명 |
|---|---|---|
| `GET /api/classrooms/:id/groups` | 교사·학생(소속) | 기본 모둠 + 구성원 |
| `PUT /api/classrooms/:id/groups` | 교사 | `{groups:[{id?, name, position, studentIds[]}]}` 전체 교체(미포함 학생 = 미배정) |
| `POST /api/classrooms/:id/groups/auto` | 교사 | `{count}` 균등 자동 배분(가입순 셔플) |
| `POST /api/chapters/:id/pages` | 교사 | 기존 라우트 확장: `{pageType:'whiteboard', whiteboardTemplate?}` |
| `PATCH /api/pages/:id` | 교사 | 확장: `{whiteboardTemplate}` → 빈 보드에 템플릿 재적용 |
| `GET /api/whiteboards/page/:pageId?classroomId=` | 교사·학생 | 설정 + 모둠(구성원 포함, 지연 생성) + `myGroupId`(학생) + 템플릿 key |
| `PUT /api/whiteboards/page/:pageId/groups?classroomId=` | 교사 | 페이지별 배정 교체. 기존 `whiteboard_groups.id`가 유지되면 보드 내용 보존, 제거된 모둠 보드는 삭제(확인 UI) |
| `PATCH /api/whiteboards/page/:pageId/settings?classroomId=` | 교사 | `{allowCrossGroupView?, lockedAll?}` |
| `GET /api/whiteboards/groups/:gid` | 권한자 | 보드 장면(초기 타일·내보내기용) |
| `PATCH /api/whiteboards/groups/:gid` | 교사 | `{name?, locked?}` |
| `POST /api/whiteboards/groups/:gid/reset` | 교사 | 비우기(현재본을 prev로 보관) |
| `POST /api/whiteboards/groups/:gid/restore-previous` | 교사 | prev ↔ 현재 교체 |

권한 공통: 교사 = `classroomId` 소유자(연결 챕터의 학급 소유자 포함, `getPageRelatedClassroomIds` 재사용).
학생 = 그 학급 구성원. `classroomId`는 학생의 경우 URL의 `chapterId → chapters.classroomId`로 결정한다
(연결 챕터는 학생 자신의 학급 챕터 id가 URL에 오므로 자연히 학급별 분리).

서비스 파일: `services/whiteboard.service.ts`(DB), `services/classroomGroup.service.ts`,
`socket/handlers/whiteboard.ts`(메모리 장면·병합·저장), `routes/whiteboards.ts`, `routes/classrooms.ts` 확장.

## 클라이언트

### 라우트
| 경로 | 컴포넌트 | 비고 |
|---|---|---|
| `/student/study/:chapterId/page/:pageId` | `StudyPageRouter` → **`StudentWhiteboardViewer`** | `page.pageType === 'whiteboard'` 분기 |
| `/teacher/classrooms/:classroomId/chapters/:chapterId/study/page/:pageId` | `TeacherStudyPageRouter` → **`TeacherWhiteboardPage`** | 동일 분기 |
| `/teacher/classrooms/:classroomId/chapters/:chapterId/whiteboard/:pageId` | `TeacherWhiteboardPage` | 모니터·에디터에서 진입 |

모두 DashboardLayout 밖(전체 화면), 기존 뷰어와 동일한 `PageNavOverlay`로 앞뒤 페이지 이동.

### 공통 컴포넌트 `components/whiteboard/`
- `WhiteboardCanvas.jsx` — Excalidraw 기본 UI + `useWhiteboardCollab` 훅(소켓 join/emit/reconcile/pointer/
  presence/files). props: `boardId, readOnly, user, onSelectionAuthor`. `viewModeEnabled`로 읽기 전용.
  S펜 훅(`useExcalidrawTouch`, `useScribbleErase`)은 그대로 연결. 발표 영역 안내선은 잠금된 비선택 요소
  (`locked: true`, `customData.guide`)로 넣고 저장·내보내기에서 제외.
- `WhiteboardTopBar.jsx` — 바탕색(프리셋 8 + 자유 선택), 템플릿 삽입, 화면 맞춤, 잠금 배지, 접속자 아바타,
  (학생) 모둠 전환 드롭다운(열람 허용 시), (교사) 작성자 표시.
- `TemplatePickerDialog.jsx` — 카테고리 탭(오거나이저/분석/활동) + 미니 SVG 미리보기 격자. 빈 보드 최초
  진입 시 "템플릿으로 시작하거나 아무 곳이나 클릭하여 닫으세요" 오버레이.
- `WhiteboardTile.jsx` — 격자용 정적 썸네일. `exportToCanvas`로 2초 스로틀 재렌더, 접속 인원·이름 배지.
- `GroupAssignmentPanel.jsx` — 모둠 목록·이름 편집·드롭다운 배정·자동 배분. 학급 기본(학생 탭)과 페이지별
  (교사 화이트보드 설정) 두 곳에서 재사용.

### 학생 화면 `pages/Whiteboard/StudentWhiteboardViewer.jsx`
1. `GET /api/whiteboards/page/:pageId?classroomId=` → `myGroupId` 없음이면 "모둠이 배정되지 않았습니다.
   선생님께 문의하세요." 안내.
2. 자기 보드 열기. 비어 있고 기본 템플릿이 없으면 템플릿 선택 오버레이.
3. 잠금이면 `viewModeEnabled` + 상단 "선생님이 편집을 잠갔습니다" 배지.
4. 열람 허용이면 드롭다운으로 다른 모둠 보드 읽기 전용 전환.

### 교사 화면 `pages/Whiteboard/TeacherWhiteboardPage.jsx`
- 모드 토글: **단일**(드롭다운 모둠 전환, 편집 가능) / **격자**(모든 모둠 타일, 클릭 → 단일 모드 전환).
- 설정 드로어: 페이지별 모둠 배정(GroupAssignmentPanel), 다른 모둠 열람 허용, 전체 잠금, 보드별 잠금,
  기본 템플릿 변경(원본 챕터일 때만), 초기화, 직전 상태 복원, 내보내기(PNG/PDF: 현재 모둠·전체).
- 격자 모드는 모든 보드 room에 읽기 전용으로 join해 `wb:elements`를 받아 타일 장면을 갱신한다.

### 챕터 에디터 (`pages/Chapters/Editor.jsx`)
- 페이지 추가 메뉴에 "화이트보드" 추가 → `{pageType:'whiteboard'}` 생성.
- 화이트보드 페이지 선택 시 우측 미리보기 대신: 기본 템플릿 선택(없음/34종 미리보기), "학생이 선택" 안내,
  "교사 화면 열기" 버튼. 썸네일 목록에는 화이트보드 아이콘.

### 학급 상세 (`ClassroomDetail.jsx` 학생 탭)
- 교사: "모둠 설정" 카드(GroupAssignmentPanel). 학생: 자기 모둠 이름 표시.

### 모니터 (`ChapterMonitor.jsx`)
- 화이트보드 페이지는 진도 집계에서 제외하고 열 머리글에 "보드 열기" 링크.

## 템플릿 (`lib/whiteboardTemplates.js`)

데이터 구조: `{ key, name, category, build(ox, oy) → ExcalidrawElementSkeleton[] }`.
`convertToExcalidrawElements`로 요소화. 스타일 공통: `strokeColor '#1e1e1e'`, `backgroundColor 'transparent'`,
`strokeWidth 2`, `roughness 0`, `roundness null`, 텍스트 `fontFamily 1`(Virgil 대신 한글 가독성을 위해
`fontFamily: 5`(Excalifont) 또는 기본 Helvetica = 2 사용 검토), 기준 영역 3200×1800.
삽입 시 모든 요소에 공통 `groupIds: [templateInstanceId]`를 부여해 한 번에 이동/삭제된다.

| 카테고리 | key (34) |
|---|---|
| 그래픽 오거나이저 (16) | `venn`, `brainstorm-web`, `cause-effect`, `timeline`, `number-line`, `fishbone`, `cycle`, `problem-solution`, `t-chart`, `concept-map`, `flowchart`, `storyboard`, `comic`, `double-bubble`, `hierarchy`, `mood-board` |
| 분석 (14) | `scientific-method`, `story-map`, `frayer`, `character-analysis`, `plot-diagram`, `main-idea-details`, `swot`, `peel`, `compare-contrast`, `five-w`, `claim-evidence-reasoning`, `observe-respond`, `matrix-2d`, `xy-graph` |
| 활동 (4) | `pros-cons`, `agree-disagree`, `think-pair-share`, `which-side` |

## 권한 요약

| 행위 | 학생(모둠원) | 학생(같은 학급, 다른 모둠) | 교사(학급 소유) |
|---|---|---|---|
| 보드 보기 | ○ | 열람 허용 시 ○(읽기) | ○ |
| 요소 편집·바탕색 | ○ (잠금 아닐 때) | × | ○ (잠금과 무관) |
| 이미지 업로드 | ○ | × | ○ |
| 배정·잠금·초기화·복원·내보내기 | × | × | ○ |
| 기본 템플릿 변경 | × | × | 원본 챕터 소유 교사만 |

## 구현 단계

1. **DB·모둠**: schema + startupMigrate DDL, `classroomGroup.service`, 학급 모둠 REST, `GroupAssignmentPanel`,
   학생 탭 "모둠 설정".
2. **페이지 타입·템플릿**: `pages.page_type/whiteboard_template`, 페이지 생성/PATCH 확장, 에디터 "화이트보드
   추가"와 기본 템플릿 UI, `whiteboardTemplates.js` 34종 + `TemplatePickerDialog`.
3. **서버 협업 코어**: `whiteboard.service`(지연 생성·설정·배정·초기화·복원), `socket/handlers/whiteboard.ts`
   (메모리 장면·병합·저장·presence), room 권한, `routes/whiteboards.ts`, `whiteboard-files` 버킷.
4. **학생 뷰어**: `WhiteboardCanvas` + `useWhiteboardCollab`, 상단 바, 바탕색, 템플릿 삽입, 이미지, 잠금, 모둠 전환.
5. **교사 페이지**: 단일/격자 모드, 타일 썸네일, 설정 드로어, 작성자 표시, 내보내기.
6. **연결점**: StudyPageRouter/TeacherStudyPageRouter 분기, ChapterMonitor 링크, 라우트 등록,
   `PROJECT_MAP.md`·`CLAUDE.md` 갱신, `e2e-checklist.md` 항목 추가.

## 검증 계획

- 단위: 서버 병합 규칙(version/versionNonce/작성자 보존/삭제 정리), 자동 배분, 템플릿 빌더가 34종 모두
  유효한 skeleton을 만드는지.
- 수동 E2E: 학생 2명 + 교사 동시 편집(상호 덮어쓰기 없음), 잠금 중 학생 편집 거부, 열람 허용 토글,
  격자 타일 2초 내 갱신, 초기화·복원, 연결 챕터에서 학급별 보드 분리, 이미지 업로드 후 다른 접속자에 표시.
