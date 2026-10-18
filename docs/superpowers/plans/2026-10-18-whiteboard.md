# 챕터 화이트보드 (모둠 공유 보드) Implementation Plan

> **For agentic workers:** 이 계획은 Task 단위로 순서대로 구현한다. 각 Task 끝의 검증 명령이 통과해야 다음 Task 로 넘어간다. Steps use checkbox (`- [ ]`) syntax for tracking.

**설계 문서:** `docs/superpowers/specs/2026-10-18-whiteboard-design.md` (질의응답으로 확정된 결정 Q1~Q10 포함)

**Goal:** 챕터에 **화이트보드 페이지**(`pages.page_type = 'whiteboard'`)를 추가한다. 학급 **모둠(그룹)별**로 보드가 하나씩 생기고 모둠원이 **동시에** 그리고 꾸민다. 교사는 **드롭다운 단일 보기**와 **학급 전체 모둠 격자 보기**(타일 클릭 → 확대)를 쓰고, 페이지별 모둠 배정·열람 허용·잠금·초기화·복원·내보내기를 관리한다. 템플릿 34종(흰 바탕 + 검은 구분선)과 바탕색 변경을 제공한다.

**Architecture:**
- **DB:** `pages` 에 `page_type`, `whiteboard_template` 2컬럼. 신규 테이블 5개: `classroom_groups`, `classroom_group_members`(학급 기본 모둠), `whiteboard_page_settings`(페이지×학급 설정), `whiteboard_groups`(페이지×학급×모둠 = 보드 1개, 장면 JSON·직전본·잠금·바탕색), `whiteboard_group_members`. 보드 행은 (페이지, 학급) 첫 접근 시 **지연 생성**(학급 기본 모둠 복사; 없으면 "1모둠"에 전원).
- **실시간:** 기존 "알림 → 전체 재조회" 대신 서버가 보드별 **권위 있는 장면을 메모리**에 두고 **요소 단위 병합**(`version` 큰 쪽, 같으면 `versionNonce` 작은 쪽 — Excalidraw `reconcileElements` 와 동일 규칙) 후 room `wb:{boardId}` 에 브로드캐스트. 저장은 2초 디바운스/최대 10초/마지막 퇴장 시 즉시, 저장 직전 현재본을 `prev_excalidraw_data` 로 보관. 클라이언트는 `reconcileElements` + `updateScene({ captureUpdate: CaptureUpdateAction.NEVER })` 로 반영해 원격 변경이 로컬 undo 에 섞이지 않는다.
- **템플릿 적용은 클라이언트가 요소를 만들고 서버가 원자적으로 검사**: `POST /api/whiteboards/groups/:gid/apply-template` 는 보드에 살아있는 요소가 0개일 때만 받아들여 동시 진입 시 중복 삽입을 막는다. (서버는 Excalidraw 패키지를 import 하지 않는다.)
- **이미지:** 보드 JSON 에 dataURL 을 넣지 않는다. 클라이언트가 축소(긴 변 1600px, ≤1MB) → `POST /api/files/upload?bucket=whiteboard-files&directory={pageId}/{boardId}` → `files[fileId] = {id,url,mimeType}` 만 공유. 수신 측은 URL → dataURL(`fetchAsDataUrl`) → `addFiles`.
- **교사 격자 보기**는 Excalidraw 편집기를 여러 개 띄우지 않고 각 타일을 `exportToCanvas` 로 2초 스로틀 재렌더한다.
- **권한:** 교사 = 해당 `classroomId` 소유자 **그리고** 그 학급이 페이지와 관련(원본/연결 챕터, `getPageRelatedClassroomIds`). 학생 = 그 학급 구성원 + 모둠원(쓰기) / 열람 허용 시 같은 학급(읽기). 학생의 `classroomId` 는 URL 의 `chapterId → chapters.classroomId` 로 결정(연결 챕터는 학생 학급의 챕터 id 가 URL 에 오므로 학급별 분리가 자연히 성립).
- **단일 서버 인스턴스 전제**(Railway). 메모리 장면은 프로세스 로컬이며 다중 인스턴스는 v1 범위 밖.

**Tech Stack:** Fastify 5 + Drizzle ORM 0.45 + PostgreSQL + Socket.IO 4 + zod (server) / React 19 + React Router 7 + Tailwind 4 + **Excalidraw 0.18.1**(`reconcileElements`, `restoreElements`, `convertToExcalidrawElements`, `exportToCanvas`, `exportToBlob`, `CaptureUpdateAction` — 모두 0.18.0 `packages/excalidraw/index.tsx` 에서 export 확인) + lucide-react + Vitest (client). 공용 타입 `@mathchois/shared`.

> **테스트 정책:** 서버 패키지에는 테스트 러너가 없다(레포 관행) → `npx tsc -b packages/server/tsconfig.json` + 로컬 PostgreSQL 기동 후 curl/socket.io-client 스크립트 E2E. **순수 로직은 반드시 Vitest 로 TDD**: 병합 규칙과 변경 요소 추출(`lib/whiteboardSync.js`), 자동 배분(`lib/groupAssign.js`), 템플릿 빌더 34종 유효성(`lib/whiteboardTemplates.test.js`), 썸네일 범위 계산. 서버 병합 로직은 클라이언트와 **같은 순수 함수를 shared 패키지에 두어** 한 벌만 테스트한다(`packages/shared/src/whiteboard/merge.ts` — shared 는 소스 직접 export 이므로 서버·클라이언트 모두 import 가능). UI 는 `npm run lint` + `vite build` + 수동 E2E(태블릿 포함). 사전 설치 Chromium(`/opt/pw-browsers/chromium`)으로 Playwright 스모크 가능.

**검증 명령 모음**
```bash
npx tsc -b packages/server/tsconfig.json          # 서버 타입체크
npm run lint                                      # 클라이언트 ESLint
npm test -w @mathchois/client                     # Vitest (shared 의 순수 함수도 client 테스트에서 import)
npm run build -w @mathchois/client                # vite build
```

---

## File Structure

**공용 (`packages/shared/src`)**
- `types/models.ts` — 수정. `Page` 에 `pageType`, `whiteboardTemplate`. 신규 `ClassroomGroup`, `WhiteboardGroup`, `WhiteboardPageSettings`, `WhiteboardPageView`, `WhiteboardSceneData`, `WhiteboardFileRef`.
- `types/socket.ts` — 수정. `wb:*` 이벤트 페이로드 타입.
- `whiteboard/merge.ts` (+ 클라이언트 쪽 테스트) — 신규. `shouldAcceptRemote(local, remote)`, `mergeElements(map, incoming, opts)`, `diffChangedElements(elements, lastVersions)`, `pruneDeleted(elements, olderThanMs)`.
- `index.ts` — 수정. 위 export.

**서버 (`packages/server/src`)**
- `db/schema.ts` — 수정. `pages` 2컬럼 + 테이블 5개.
- `db/startupMigrate.ts` — 수정. 멱등 DDL.
- `services/pageAccess.service.ts` — 신규. `getPageRelatedClassroomIds`, `getPageRelatedTeacherIds` 를 `socket/index.ts` 에서 **이동**(socket 과 routes 가 공유).
- `services/classroomGroup.service.ts` — 신규. 기본 모둠 CRUD, 자동 배분.
- `services/whiteboard.service.ts` — 신규. 보드 지연 생성, 페이지 뷰, 배정 교체, 설정, 잠금, 초기화, 복원, 템플릿 적용, 저장.
- `socket/handlers/whiteboard.ts` — 신규. 메모리 장면, `wb:*` 이벤트, presence, 저장 스케줄러.
- `socket/index.ts` — 수정. room 패턴 `wb`, 핸들러 등록, helper import 경로 변경.
- `routes/classroomGroups.ts` — 신규. `/api/classrooms/:id/groups*`.
- `routes/whiteboards.ts` — 신규. `/api/whiteboards/*`.
- `routes/pages.ts`, `services/page.service.ts` — 수정. `pageType`/`whiteboardTemplate` 생성·수정.
- `routes/storage.ts` — 수정. `whiteboard-files` 버킷(학생 허용, 이미지 MIME 만).
- `app.ts` — 수정. 라우트 등록.

**클라이언트 (`packages/client/src`)**
- `lib/groupAssign.js` (+`.test.js`) — 신규. `distributeEvenly(studentIds, count, seed?)`, `moveStudent(groups, sid, gid)`.
- `lib/whiteboardTemplates.js` (+`.test.js`) — 신규. 템플릿 34종 skeleton 빌더 + `TEMPLATE_CATEGORIES`.
- `lib/whiteboardImage.js` (+`.test.js`) — 신규. 이미지 축소(캔버스), 파일 ref ↔ Excalidraw files 변환.
- `lib/whiteboardExport.js` — 신규. 썸네일/PNG/PDF 범위 계산(`getExportBounds`, 발표 영역 3200×1800 기준) + export 헬퍼.
- `hooks/useWhiteboardCollab.js` — 신규. 소켓 join/init/elements/pointer/presence/files/lock/scene.
- `components/whiteboard/WhiteboardCanvas.jsx` — 신규. Excalidraw + collab 훅 + S펜 훅.
- `components/whiteboard/WhiteboardTopBar.jsx` — 신규.
- `components/whiteboard/BackgroundColorPicker.jsx` — 신규.
- `components/whiteboard/TemplatePickerDialog.jsx`, `TemplateThumb.jsx` — 신규.
- `components/whiteboard/WhiteboardTile.jsx` — 신규. 격자 타일.
- `components/whiteboard/GroupAssignmentPanel.jsx` — 신규. 학급 기본/페이지별 공용.
- `components/whiteboard/WhiteboardSettingsDrawer.jsx` — 신규. 교사 설정.
- `pages/Whiteboard/StudentWhiteboardViewer.jsx` — 신규.
- `pages/Whiteboard/TeacherWhiteboardPage.jsx` — 신규.
- `pages/Study/StudyPageRouter.jsx`, `pages/Study/TeacherStudyPageRouter.jsx` — 수정. 분기.
- `pages/Chapters/Editor.jsx`, `components/common/SortablePageItem.jsx` — 수정. 화이트보드 추가·미리보기·아이콘.
- `pages/Classrooms/ClassroomDetail.jsx` — 수정. 학생 탭 "모둠 설정", 챕터 카드 썸네일 폴백.
- `pages/Monitor/ChapterMonitor.jsx` — 수정. 화이트보드 페이지 분리 + 링크.
- `App.jsx` — 수정. 라우트.
- `.claude/PROJECT_MAP.md`, `CLAUDE.md`, `docs/superpowers/e2e-checklist.md` — 수정.

---

## Task 1: 공용 타입 + DB 스키마 + 기동 마이그레이션

**Files:** Modify `packages/shared/src/types/models.ts`, `packages/shared/src/types/socket.ts`, `packages/shared/src/index.ts`, `packages/server/src/db/schema.ts`, `packages/server/src/db/startupMigrate.ts`

- [ ] **Step 1:** `models.ts` 의 `Page` 에 추가하고 신규 타입 선언:
  ```ts
  export type PageType = 'whiteboard';
  export interface Page { /* 기존 */ pageType: PageType | null; whiteboardTemplate: string | null; }

  export interface ClassroomGroup { id: string; classroomId: string; name: string; position: number; studentIds: string[]; }
  export interface WhiteboardFileRef { id: string; url: string; mimeType: string; }
  export interface WhiteboardSceneData { elements: Record<string, unknown>[]; files: Record<string, WhiteboardFileRef>; }
  export interface WhiteboardGroup {
    id: string; pageId: string; classroomId: string; name: string; position: number;
    locked: boolean; backgroundColor: string; sceneVersion: number; updatedAt: string | null;
    members: { studentId: string; name: string; avatarUrl: string | null }[];
  }
  export interface WhiteboardPageSettings { allowCrossGroupView: boolean; lockedAll: boolean; }
  /** GET /api/whiteboards/page/:pageId 응답 */
  export interface WhiteboardPageView {
    pageId: string; classroomId: string; templateKey: string | null; isSourceChapter: boolean;
    settings: WhiteboardPageSettings; groups: WhiteboardGroup[];
    myGroupId: string | null;            // 학생만
    unassigned: { studentId: string; name: string; avatarUrl: string | null }[]; // 교사만
  }
  ```
- [ ] **Step 2:** `socket.ts` 에 `wb:*` 페이로드 타입 추가(문서화 목적 — 런타임 검증은 핸들러의 zod):
  ```ts
  export interface WbJoinPayload { boardId: string }
  export interface WbInitPayload { boardId: string; elements: Record<string, unknown>[]; files: Record<string, WhiteboardFileRef>; backgroundColor: string; locked: boolean; lockedAll: boolean; readOnly: boolean; users: WbUser[] }
  export interface WbUser { socketId: string; userId: string; name: string; role: 'teacher' | 'student' }
  export interface WbElementsPayload { boardId: string; elements: Record<string, unknown>[] }
  export interface WbPointerPayload { boardId: string; x: number; y: number; tool: 'pointer' | 'laser'; button: 'up' | 'down' }
  export interface WbFilesPayload { boardId: string; files: Record<string, WhiteboardFileRef> }
  export interface WbScenePayload { boardId: string; elements: Record<string, unknown>[]; files: Record<string, WhiteboardFileRef>; reason: 'reset' | 'restore' | 'template' }
  ```
- [ ] **Step 3:** `schema.ts` — `pages` 에 `pageType: text('page_type')`, `whiteboardTemplate: text('whiteboard_template')`. 테이블 5개(설계 문서의 DDL 그대로; `whiteboard_groups.excalidrawData` 는 `jsonb('excalidraw_data').$type<WhiteboardSceneData>()`, `prevExcalidrawData` 동일). 인덱스: `idx_classroom_groups_classroom`, `uq_classroom_group_members_classroom_student`(unique), `uq_wb_settings_page_classroom`(unique), `idx_wb_groups_page_classroom`, `uq_wb_group_members_group_student`(unique).
- [ ] **Step 4:** `startupMigrate.ts` 끝에 멱등 DDL(`ALTER TABLE pages ADD COLUMN IF NOT EXISTS page_type text`, `whiteboard_template text`, `CREATE TABLE IF NOT EXISTS ...` ×5, 인덱스) + `log.info('startup migration: whiteboard tables ensured')`.
- [ ] **Step 5:** `npx tsc -b packages/server/tsconfig.json` 통과. 로컬 PostgreSQL 로 서버 기동 → 로그에 ensured 출력, `\d whiteboard_groups` 확인.

## Task 2: 공용 병합 순수 함수 (shared) — TDD

**Files:** Create `packages/shared/src/whiteboard/merge.ts`, `packages/client/src/lib/whiteboardSync.test.js`(shared 함수 테스트), Modify `packages/shared/src/index.ts`

- [ ] **Step 1:** 테스트 먼저 작성(`whiteboardSync.test.js`):
  - `shouldAcceptRemote`: 원격 version 큼 → true / 작음 → false / 같고 nonce 작음 → true / 같고 nonce 큼 → false / 로컬 없음 → true.
  - `mergeElements(map, incoming, { authorId, isStudent })`: 학생이 보낸 **신규** 요소의 `customData.authorId` 는 강제로 `authorId`; **기존** 요소의 작성자는 보존; 교사는 보낸 값 유지(없으면 본인). 반환값은 실제 반영된 요소 배열(브로드캐스트용).
  - `diffChangedElements(elements, lastVersions)`: `version` 이 기록과 다른 요소만 반환하고 기록 갱신.
  - `pruneDeleted(elements, olderThanMs, now)`: `isDeleted && updated < now - olderThanMs` 제거.
- [ ] **Step 2:** `merge.ts` 구현(순수, 의존성 없음):
  ```ts
  export type WbElement = { id: string; version: number; versionNonce: number; isDeleted?: boolean; updated?: number; customData?: Record<string, unknown> } & Record<string, unknown>;
  export function shouldAcceptRemote(local: WbElement | undefined, remote: WbElement): boolean {
    if (!local) return true;
    if (remote.version > local.version) return true;
    if (remote.version < local.version) return false;
    return remote.versionNonce < local.versionNonce;
  }
  export function mergeElements(scene: Map<string, WbElement>, incoming: WbElement[], opts: { authorId: string; authorName: string; isStudent: boolean }): WbElement[] { /* 규칙은 Step 1 */ }
  export function diffChangedElements(elements: readonly WbElement[], last: Map<string, number>): WbElement[] { ... }
  export function pruneDeleted(elements: WbElement[], olderThanMs: number, now = Date.now()): WbElement[] { ... }
  ```
- [ ] **Step 3:** `index.ts` 에 `export * from './whiteboard/merge.js'`. 클라이언트 vitest 가 shared 소스를 읽는지 확인(기존 `@mathchois/shared` alias 사용; 없으면 `vitest.config.js` `resolve.alias` 추가).
- [ ] **Step 4:** `npm test -w @mathchois/client` 통과, `npx tsc -b packages/server/tsconfig.json` 통과.

## Task 3: 학급 기본 모둠 — 서비스 + REST

**Files:** Create `packages/server/src/services/classroomGroup.service.ts`, `packages/server/src/routes/classroomGroups.ts`, `packages/client/src/lib/groupAssign.js`(+`.test.js`), Modify `packages/server/src/app.ts`

- [ ] **Step 1:** `groupAssign.js` TDD: `distributeEvenly(ids, count, rng)` — count ≤ 0 이면 `[]`, 인원이 count 보다 적으면 빈 모둠 허용, 셔플은 주입된 rng 로 결정적 테스트, 크기 차이 ≤ 1. `moveStudent(groups, studentId, targetGroupId|null)` — 다른 모둠에서 제거 후 추가(null 이면 미배정).
- [ ] **Step 2:** `classroomGroup.service.ts`:
  - `getClassroomGroups(classroomId): ClassroomGroup[]` (position 순, `studentIds` 포함).
  - `replaceClassroomGroups(classroomId, groups: {id?, name, position, studentIds}[])` — 트랜잭션: 전달된 id 는 update, 없는 id 는 insert, 누락 id 는 delete; 멤버는 전부 삭제 후 재삽입(학생이 학급 구성원인지 `classroomMembers` 로 필터). 반환 = `getClassroomGroups`.
  - `autoDistributeClassroomGroups(classroomId, count)` — 구성원 전체를 가입순 셔플(`crypto.randomInt`) 후 `N모둠` 이름으로 `replaceClassroomGroups` 호출(서버 측 셔플은 `groupAssign.js` 와 같은 규칙을 shared 로 옮겨도 되지만 v1 은 서버 자체 구현 허용).
- [ ] **Step 3:** `routes/classroomGroups.ts`:
  - `GET /api/classrooms/:id/groups` — `authenticate`; 교사는 `isClassroomOwner`, 학생은 `isClassroomMember` 아니면 403.
  - `PUT /api/classrooms/:id/groups` — teacher + owner. zod: `groups: z.array(z.object({ id: z.string().uuid().optional(), name: z.string().min(1).max(30), position: z.number().int(), studentIds: z.array(z.string().uuid()) })).max(30)`.
  - `POST /api/classrooms/:id/groups/auto` — teacher + owner. `{ count: z.number().int().min(1).max(30) }`.
- [ ] **Step 4:** `app.ts` 에 `app.register(classroomGroupRoutes)`.
- [ ] **Step 5:** `npx tsc -b packages/server/tsconfig.json`, curl 로 GET/PUT/auto 왕복(학생 토큰으로 PUT → 403).

## Task 4: `GroupAssignmentPanel` + 학급 상세 "모둠 설정"

**Files:** Create `packages/client/src/components/whiteboard/GroupAssignmentPanel.jsx`, Modify `packages/client/src/pages/Classrooms/ClassroomDetail.jsx`

- [ ] **Step 1:** `GroupAssignmentPanel` props: `{ members: {studentId,name,avatarUrl}[], groups: {id?,name,position,studentIds[]}[], onChange(groups), onAuto(count), saving, readOnly, warnOnRemove? }`. UI:
  - 상단: "모둠 수 [N] [자동 배분]" (N 기본값 = 현재 모둠 수 또는 4), "+ 모둠 추가".
  - 모둠 카드: 이름 인라인 편집(30자), 삭제(×, `warnOnRemove` 면 confirm — 페이지별 배정에서 보드 내용 삭제 경고), 구성원 칩.
  - 학생 목록 표: 이름 · 드롭다운(미배정/모둠들). `moveStudent` 로 로컬 상태 갱신 → `onChange`.
  - 미배정 수를 노란 배지로 상단에 표시(Q1).
- [ ] **Step 2:** `ClassroomDetail.jsx` 학생 탭(교사일 때)에 "모둠 설정" 카드 추가: 마운트 시 `GET /api/classrooms/:id/groups`, 변경 후 "저장" 버튼 → `PUT`, 자동 배분 → `POST .../auto` 후 재조회. 학생일 때는 자기 모둠 이름을 학생 카드 옆에 작은 칩으로 표시(`GET` 응답에서 본인 포함 모둠 찾기).
- [ ] **Step 3:** `npm run lint`, `npm run build -w @mathchois/client`, 브라우저에서 자동 배분·수동 이동·이름 변경·저장·새로고침 유지 확인.

## Task 5: 페이지 타입 `whiteboard` — 서버 + 에디터

**Files:** Modify `packages/server/src/services/page.service.ts`, `packages/server/src/routes/pages.ts`, `packages/client/src/components/common/SortablePageItem.jsx`, `packages/client/src/pages/Chapters/Editor.jsx`

- [ ] **Step 1:** `page.service.ts` `createPage` 인자에 `pageType?: 'whiteboard' | null`, `whiteboardTemplate?: string | null` 추가하고 insert 에 반영. `updatePage` patch 타입에 `whiteboardTemplate?: string | null` 추가.
- [ ] **Step 2:** `routes/pages.ts`:
  - POST 단일 삽입: body 에 `pageType`, `whiteboardTemplate` 허용. 필수값 검사에 `pageType === 'whiteboard'` 를 추가(`imageUrl/videoUrl/htmlUrl/aiProblemId/fromVisualizationId` 가 없어도 OK). `whiteboardTemplate` 은 `z.string().regex(/^[a-z0-9-]+$/).max(40).nullable().optional()`.
  - PATCH: zod 에 `whiteboardTemplate` 추가. linked 챕터의 페이지(= 다른 챕터가 source 로 쓰는 페이지도 원본이므로 OK; **linked 챕터 자체에는 페이지가 없음**)이므로 추가 검사 불필요. 템플릿 변경 시 **빈 보드 재적용은 클라이언트가 Task 13 에서 수행**.
- [ ] **Step 3:** `SortablePageItem.jsx` 에 `page.pageType === 'whiteboard'` 분기(`LayoutGrid` 아이콘 + "화이트보드" 라벨) — `htmlUrl` 분기보다 앞에.
- [ ] **Step 4:** `Editor.jsx`:
  - 헤더 버튼 추가(AI 코칭 옆): `Presentation` 아이콘, title "화이트보드 페이지 추가" → `api.post(`/api/chapters/${id}/pages`, { pageType: 'whiteboard', position })` → `invalidatePagesCache` → `fetchData`.
  - 미리보기 분기(`selectedPage.pageType === 'whiteboard'`, `htmlUrl` 분기보다 앞): 패널에 ① "기본 템플릿" 선택(현재값 표시, "변경" → `TemplatePickerDialog`(Task 6) → `PATCH /api/pages/:id { whiteboardTemplate }`), ② "없음(학생이 선택)" 버튼, ③ "교사 화면 열기" → `/teacher/classrooms/${chapter.classroomId}/chapters/${id}/whiteboard/${selectedPage.id}` (Task 12 의 라우트), ④ 안내 문구 "모둠 배정·잠금은 교사 화면에서".
  - 빈 상태 안내 문구에 "화이트보드" 추가.
- [ ] **Step 5:** `npx tsc -b packages/server/tsconfig.json`, `npm run lint`, 에디터에서 화이트보드 페이지 추가/삭제/순서 변경 확인.

## Task 6: 템플릿 라이브러리 34종 + 선택 다이얼로그 — TDD

**Files:** Create `packages/client/src/lib/whiteboardTemplates.js`, `packages/client/src/lib/whiteboardTemplates.test.js`, `packages/client/src/components/whiteboard/TemplateThumb.jsx`, `packages/client/src/components/whiteboard/TemplatePickerDialog.jsx`

- [ ] **Step 1:** 테스트: `TEMPLATES.length === 34`, key 유일, 카테고리 3개(`organizer` 16 / `analysis` 14 / `activity` 4), 각 `build(0,0)` 결과가 (a) 비어 있지 않고 (b) 모든 skeleton 이 `type ∈ {rectangle, ellipse, diamond, line, arrow, text}` (c) 숫자 좌표 (d) 3200×1800 안에 들어옴(`x+width ≤ 3200`, 텍스트는 `x ≤ 3200`) (e) `strokeColor === '#1e1e1e'`.
- [ ] **Step 2:** 빌더 헬퍼(`whiteboardTemplates.js` 내부):
  ```js
  export const BOARD_W = 3200, BOARD_H = 1800;
  const S = { strokeColor: '#1e1e1e', backgroundColor: 'transparent', strokeWidth: 2, roughness: 0, roundness: null, fillStyle: 'solid' };
  const rect = (x, y, w, h, extra) => ({ type: 'rectangle', x, y, width: w, height: h, ...S, ...extra });
  const ellipse = (x, y, w, h) => ({ type: 'ellipse', x, y, width: w, height: h, ...S });
  const line = (x1, y1, x2, y2, dashed) => ({ type: 'line', x: x1, y: y1, points: [[0, 0], [x2 - x1, y2 - y1]], ...S, strokeStyle: dashed ? 'dashed' : 'solid' });
  const arrow = (x1, y1, x2, y2) => ({ type: 'arrow', x: x1, y: y1, points: [[0, 0], [x2 - x1, y2 - y1]], ...S, endArrowhead: 'arrow' });
  const text = (x, y, t, size = 28, align = 'left') => ({ type: 'text', x, y, text: t, fontSize: size, fontFamily: 2 /* Helvetica — 한글 가독성 */, textAlign: align, strokeColor: '#1e1e1e' });
  const frame = () => rect(0, 0, BOARD_W, BOARD_H, { strokeWidth: 3 });   // 모든 템플릿 공통 외곽
  const cols = (n, labels) => [frame(), ...Array.from({ length: n - 1 }, (_, i) => line((BOARD_W / n) * (i + 1), 0, (BOARD_W / n) * (i + 1), BOARD_H)), ...labels.map((l, i) => text((BOARD_W / n) * i + 24, 20, l))];
  ```
  템플릿 데이터: `{ key, name, category, build(ox, oy) }` 로 34종. 대표 정의(나머지는 같은 헬퍼로):
  - `t-chart`: `cols(2, ['', ''])` + 상단 제목 행 line(0,80,…).
  - `venn`: `frame(), ellipse(250,150,700,600), ellipse(650,150,700,600)`.
  - `swot`: `frame(), line(1600,0,1600,1800), line(0,900,3200,900), text(48,40,'S',96)…`.
  - `frayer`: SWOT 와 같은 4분할 + 중앙 `ellipse(600,350,400,200)` + 라벨(정의/특징/예/비예).
  - `number-line`: `arrow(100,450,1500,450)` 역방향 arrow 포함, 눈금 line 11개, text(-5…5).
  - `xy-graph`: 양방향 arrow 2개 + 점선 격자(10×10, dashed).
  - `timeline`: 수평 line + 원 6개(ellipse 24×24) + 아래 라벨 칸.
  - `cycle`: 원 5개를 원형 배치 + arrow 로 연결.
  - `plot-diagram`: 꺾은선 line 5개(발단-전개-절정-하강-결말) + 라벨.
  - `five-w`: `cols(6, ['누가','언제','어디서','무엇을','왜','어떻게'])` 점선 열 구분.
  - `storyboard`/`comic`/`mood-board`: 격자 rect(2×3, 2×4).
  - `hierarchy`/`concept-map`/`brainstorm-web`/`double-bubble`/`fishbone`/`flowchart`: rect/ellipse + arrow/line.
  - `think-pair-share`: `cols(3, ['T 생각하기','P 짝과 나누기','S 공유하기'])`.
  - `pros-cons`: 2분할 + 상단 ":)" / ":(" 텍스트. `agree-disagree`: 4분할 + 중앙 rect. `which-side`: 2분할 + 점선 + 상단 제목 rect.
  삽입 시 `convertToExcalidrawElements(skeletons.map(offset(ox, oy)), { regenerateIds: true })` 후 모든 요소에 `groupIds: [instanceId]` 부여하는 `buildTemplateElements(key, ox, oy)` export.
- [ ] **Step 3:** `TemplateThumb.jsx` — skeleton 을 **그대로 SVG 로** 그림(rect/ellipse/line/arrow/text 각각 `<rect>/<ellipse>/<line>/<text>`), `viewBox="0 0 3200 1800"`, 폭 120px. 템플릿마다 PNG 를 두지 않아도 되고 템플릿 추가 시 자동 반영.
- [ ] **Step 4:** `TemplatePickerDialog.jsx` props `{ onSelect(key), onClose, allowNone, title }` — 카테고리 탭(그래픽 오거나이저/분석/활동) + 썸네일 격자 + 이름. `allowNone` 이면 "없음(학생이 선택)" 항목. 바깥 클릭/ESC 로 닫기. 학생 최초 진입용 오버레이 모드(`variant="overlay"`): 상단 문구 "템플릿으로 시작하거나 아무 곳이나 클릭하여 닫으세요…".
- [ ] **Step 5:** `npm test -w @mathchois/client`, `npm run lint`. Task 5 의 에디터 "변경" 버튼에 다이얼로그 연결 후 PATCH 저장 확인.

## Task 7: 서버 — `whiteboard.service.ts` + 페이지 접근 헬퍼

**Files:** Create `packages/server/src/services/pageAccess.service.ts`, `packages/server/src/services/whiteboard.service.ts`, Modify `packages/server/src/socket/index.ts`(import 만)

- [ ] **Step 1:** `pageAccess.service.ts` — `socket/index.ts` 의 `getPageRelatedClassroomIds`, `getPageRelatedTeacherIds` 를 그대로 옮기고 export. 추가:
  ```ts
  export async function canTeacherAccessPageClassroom(teacherId, pageId, classroomId): Promise<boolean>  // owner && related
  export async function canStudentAccessPageClassroom(studentId, pageId, classroomId): Promise<boolean>  // member && related
  export async function isPageSourceOwnedBy(teacherId, pageId): Promise<boolean>  // 원본 챕터 교실 소유자(템플릿 변경 권한)
  ```
  `socket/index.ts` 는 새 파일에서 import 하도록 바꾸고 동작 불변.
- [ ] **Step 2:** `whiteboard.service.ts`:
  - `ensurePageBoards(pageId, classroomId)` — 트랜잭션. settings 행 upsert(없으면 생성). `whiteboard_groups` 가 0개면 `classroom_groups` 복사(이름·position·구성원), 그것도 0개면 `{name:'1모둠', position:0}` 에 `classroomMembers` 전원. 반환 없음.
  - `getPageView(pageId, classroomId, viewer: {sub, role})`: `WhiteboardPageView`. `templateKey` = `pages.whiteboardTemplate`, `isSourceChapter` = `isPageSourceOwnedBy`. 교사면 `unassigned` 계산, 학생이면 `myGroupId`. 보드 목록에 `excalidrawData` 는 **포함하지 않음**(장면은 소켓/`GET groups/:gid`).
  - `replacePageGroups(pageId, classroomId, groups)` — Task 3 과 같은 규칙. 삭제되는 보드 id 목록을 반환(핸들러가 메모리 장면 폐기 + room 에 `wb:removed` 알림).
  - `updatePageSettings(pageId, classroomId, patch)`, `updateGroup(gid, {name?, locked?, backgroundColor?})`.
  - `getBoardScene(gid): { scene: WhiteboardSceneData, backgroundColor, locked, sceneVersion }`.
  - `saveBoardScene(gid, scene, sceneVersion, { keepPrevIfRecent: 30_000 })` — `prev_excalidraw_data = excalidraw_data` 는 `updated_at < now() - 30s` 일 때만 갱신(단일 UPDATE 의 CASE 식).
  - `resetBoard(gid)` → prev 에 현재본 보관 후 `{elements:[], files:{}}`. `restorePrevious(gid)` → 두 컬럼 swap. 둘 다 새 장면 반환.
  - `applyTemplateIfEmpty(gid, elements)` — DB 기준 검사는 핸들러의 메모리 장면이 우선이므로 **서비스는 저장만**; 원자성은 Task 8 의 메모리 장면 단에서 처리.
  - `getBoardAccess(gid, user)`: `{ classroomId, pageId, canWrite, canRead, locked, lockedAll }` — 교사: `canTeacherAccessPageClassroom`; 학생: 모둠원이면 read+write(잠금 시 write=false), 아니면 `allowCrossGroupView && isClassroomMember` 일 때 read 만.
- [ ] **Step 3:** `npx tsc -b packages/server/tsconfig.json` 통과.

## Task 8: 서버 — Socket 핸들러 `whiteboard.ts` + room 권한

**Files:** Create `packages/server/src/socket/handlers/whiteboard.ts`, Modify `packages/server/src/socket/index.ts`

- [ ] **Step 1:** 메모리 구조(모듈 스코프):
  ```ts
  type BoardState = { elements: Map<string, WbElement>; files: Record<string, WhiteboardFileRef>; backgroundColor: string; locked: boolean; lockedAll: boolean; classroomId: string; pageId: string; dirty: boolean; saveTimer: NodeJS.Timeout | null; firstDirtyAt: number; users: Map<string /*socketId*/, WbUser>; evictTimer: NodeJS.Timeout | null; sceneVersion: number };
  const boards = new Map<string, BoardState>();
  const socketBoards = new Map<string, Set<string>>(); // socketId → boardIds (disconnect 정리)
  async function loadBoard(boardId): Promise<BoardState>  // 없으면 DB 에서 적재(getBoardScene + settings)
  function scheduleSave(boardId)  // 2초 디바운스, firstDirtyAt 기준 10초 상한, saveBoardScene(pruneDeleted(…, 10분))
  function scheduleEvict(boardId) // users.size===0 → 5분 후 flush 후 삭제
  ```
- [ ] **Step 2:** 이벤트(모두 zod 로 payload 검증, 실패 시 `socket.emit('error', {message})`):
  - `wb:join {boardId}` → `getBoardAccess` 로 read 불가면 거부. `socket.join('wb:'+id)`, users 등록, `wb:init` 을 **발신자에게**(elements = `Array.from(map.values())`, `readOnly = !canWrite || locked || lockedAll`), `wb:presence` 를 room 전체에.
  - `wb:leave {boardId}` / `disconnect` → users 제거, `wb:presence`, 비면 `scheduleEvict` + 즉시 flush.
  - `wb:elements {boardId, elements}` → access 재검증(30초 TTL 캐시, `socket.data`), `canWrite` 아니면 무시 + `wb:rejected {boardId, reason:'locked'|'forbidden'}`. `mergeElements(map, incoming, {authorId: user.sub, authorName, isStudent})` → 반영된 요소가 있으면 `socket.to(room).emit('wb:elements', {boardId, elements: accepted})`, `dirty=true`, `sceneVersion++`, `scheduleSave`. 요소 1개당 크기 상한(예: 200KB) 과 배치 상한(500개) 초과 시 거부.
  - `wb:pointer` → `socket.to(room).volatile.emit('wb:pointer', {...payload, socketId, userId, name, role})`.
  - `wb:background {boardId, color}` → `canWrite` 필요(학생도 OK). `/^#[0-9a-f]{6}$/i` 검증. 메모리 갱신 + room 브로드캐스트 + `updateGroup(gid, {backgroundColor})` 즉시 저장.
  - `wb:files {boardId, files}` → `canWrite`. url 은 `/api/files/whiteboard-files/` 로 시작해야 함. 병합 후 room 브로드캐스트, dirty.
  - 서버 내부 export(라우트에서 호출): `emitBoardScene(boardId, scene, reason)`(메모리 교체 + `wb:scene`), `emitBoardLock(boardId, locked)`, `emitPageLockAll(pageId, classroomId, lockedAll)`(해당 페이지의 모든 보드 state 갱신 + 각 room 에 `wb:lock`), `dropBoards(ids)`(메모리 삭제 + `wb:removed`), `applyTemplateAtomic(boardId, elements): boolean`(메모리 장면의 살아있는 요소 0개일 때만 삽입 → true; 이미 있으면 false), `getBoardUsers(boardId)`.
- [ ] **Step 3:** `socket/index.ts` — `ROOM_PATTERNS.wb = /^wb:([\w-]+)$/` 와 `validateRoomAccess` 분기(`getBoardAccess(...).canRead`), `registerWhiteboardHandlers(io, socket, user)` 등록. 단, 화이트보드는 `join-room` 이 아니라 `wb:join` 으로만 join 하므로 `validateRoomAccess` 분기는 방어용.
- [ ] **Step 4:** `npx tsc -b packages/server/tsconfig.json`. 로컬 스모크: `scripts/wb-smoke.mjs`(socket.io-client 2개 연결 → 같은 보드 join → A 가 요소 전송 → B 수신 → B 가 같은 id 더 높은 version 전송 → A 수신 → 3초 후 DB `excalidraw_data` 에 최종본) — 스크립트는 `packages/server/scripts/` 에 두고 커밋.

## Task 9: 서버 — REST `routes/whiteboards.ts` + 저장소 버킷

**Files:** Create `packages/server/src/routes/whiteboards.ts`, Modify `packages/server/src/routes/storage.ts`, `packages/server/src/app.ts`

- [ ] **Step 1:** 공통 preHandler `resolveClassroomAccess`: 쿼리 `classroomId`(uuid) 필수 → 교사 `canTeacherAccessPageClassroom` / 학생 `canStudentAccessPageClassroom` 아니면 403.
  - `GET /api/whiteboards/page/:pageId` → `ensurePageBoards` 후 `getPageView`.
  - `PUT /api/whiteboards/page/:pageId/groups` (teacher) → `replacePageGroups` → 삭제된 보드 `dropBoards` → 새 view 반환.
  - `PATCH /api/whiteboards/page/:pageId/settings` (teacher) → 저장 후 `lockedAll` 바뀌면 `emitPageLockAll`; `allowCrossGroupView` 바뀌면 각 room 에 `wb:settings`.
  - `GET /api/whiteboards/groups/:gid` → `getBoardAccess.canRead` → 메모리 장면이 있으면 그것, 없으면 DB.
  - `PATCH /api/whiteboards/groups/:gid` (teacher) `{name?, locked?}` → `emitBoardLock`.
  - `POST /api/whiteboards/groups/:gid/reset` / `restore-previous` (teacher) → 서비스 → `emitBoardScene`.
  - `POST /api/whiteboards/groups/:gid/apply-template` (canWrite) body `{ elements: z.array(z.record(z.unknown())).max(400) }` → `applyTemplateAtomic` → `{ applied: boolean }`. 적용 시 `scheduleSave` 와 `wb:scene(reason:'template')`.
- [ ] **Step 2:** `storage.ts` — `STUDENT_ALLOWED_BUCKETS` 에 `'whiteboard-files'`; 이 버킷은 `INLINE_SAFE_IMAGE_RE` 를 만족하는 MIME 만 허용(교사 포함). 파일 크기 상한 2MB(멀티파트 limits 는 전역이므로 핸들러에서 `data.length` 검사).
- [ ] **Step 3:** `app.ts` 등록. `npx tsc -b`. curl: 교사 토큰으로 page view(지연 생성 확인) → 학생 토큰 view(`myGroupId`) → 다른 학급 교사 403.

## Task 10: 클라이언트 — `useWhiteboardCollab` + 이미지/내보내기 유틸 — TDD

**Files:** Create `packages/client/src/hooks/useWhiteboardCollab.js`, `packages/client/src/lib/whiteboardImage.js`(+`.test.js`), `packages/client/src/lib/whiteboardExport.js`(+`.test.js`)

- [ ] **Step 1:** `whiteboardExport.js` TDD: `getExportBounds(elements)` — 요소 없음 → 발표 영역 `{x:0,y:0,w:3200,h:1800}`; 영역 안 → 영역; 밖으로 나가면 합집합(+ 40px 여백). 안내선 요소(`customData.guide`) 는 제외.
- [ ] **Step 2:** `whiteboardImage.js` TDD(순수 부분): `fileRefsToExcalidrawFiles(refs, dataUrlLoader)`, `pickNewFiles(files, knownIds)`; 축소는 `downscaleImage(file|dataURL, {maxEdge:1600, maxBytes:1_000_000})`(canvas, 브라우저 전용 — 테스트 제외, 품질 0.85 부터 0.1 씩 낮춰 상한 맞춤).
- [ ] **Step 3:** `useWhiteboardCollab({ boardId, user, enabled, onInit, onRemoteElements, onScene, onLock, onPresence, onPointer, onFiles, onRejected })`:
  - `connectSocket()` 보장 → `wb:join` emit, 이벤트 바인딩, cleanup 에 `wb:leave` + off. 재연결(`socket.on('connect')`) 시 `wb:join` 재전송(기존 `joinRoom` 셋을 쓰지 않으므로 훅이 직접 처리).
  - 반환: `sendElements(elements)`(내부 `diffChangedElements` + 100ms 스로틀 + 미전송 누적), `markKnown(elements)`(init/scene 수신 시 lastVersions 채움), `sendPointer(x,y,tool,button)`(50ms 스로틀, volatile), `sendBackground(color)`, `sendFiles(refs)`, `readOnly`, `users`, `collaborators`(Map<socketId, Collaborator>) 상태.
  - `collaborators` 는 `wb:pointer` 로 갱신하고 `wb:presence` 에 없는 socketId 는 제거; 30초 무응답도 제거.
- [ ] **Step 4:** `npm test -w @mathchois/client`, `npm run lint`.

## Task 11: 클라이언트 — `WhiteboardCanvas` + 상단 바 + 바탕색/템플릿 삽입

**Files:** Create `packages/client/src/components/whiteboard/WhiteboardCanvas.jsx`, `WhiteboardTopBar.jsx`, `BackgroundColorPicker.jsx`

- [ ] **Step 1:** `WhiteboardCanvas` props `{ boardId, user, isTeacher, readOnly(외부 강제), onAuthorChange?, onPresence?, topBarExtras?(교사 모둠 드롭다운 등), showStartTemplatePicker, onInitEmpty? }`:
  - `<Excalidraw langCode="ko-KR" excalidrawAPI={setApi} viewModeEnabled={readOnly || collab.readOnly} initialData={{ appState: { viewBackgroundColor: '#ffffff' } }} onChange={handleChange} onPointerUpdate={handlePointer} isCollaborating UIOptions={WB_UI_OPTIONS} renderTopRightUI={() => <WhiteboardTopBar …/>} />`. `WB_UI_OPTIONS = { canvasActions: { loadScene: false, saveToActiveFile: false, toggleTheme: false, clearCanvas: false, changeViewBackgroundColor: false /* 자체 피커 */ }, tools: { image: true } }`. 기존 `ALWAYS_HIDE_CSS` 는 **주입하지 않는다**(기본 UI 노출).
  - `wb:init` → `restoreElements(elements, null)` + files 로드(`fetchAsDataUrl` → `addFiles`) → `updateScene({ elements, appState:{ viewBackgroundColor }, captureUpdate: CaptureUpdateAction.NEVER })` + `markKnown`. 안내선 요소(3200×1800 점선 rect, `locked:true`, `customData:{guide:true}`, `opacity:30`) 를 **로컬에만** 추가하고 `sendElements` 에서 제외.
  - `handleChange(elements, appState, files)` → readOnly 면 무시; `sendElements(elements.filter(not guide))`; 새 파일 감지 → `downscaleImage` → `api.upload` → `sendFiles`.
  - `wb:elements` 수신 → `reconcileElements(api.getSceneElementsIncludingDeleted(), remote, api.getAppState())` → `updateScene({ elements, captureUpdate: CaptureUpdateAction.NEVER })` → `markKnown(remote)`. 수신 요소의 `fileId` 가 미보유면 `files` 에서 ref 를 찾아 로드.
  - `wb:scene` → 전체 교체(안내선 유지). `wb:lock` → `setLocked`. `wb:pointer` → `updateScene({ collaborators })`(Map<socketId, {pointer:{x,y,tool}, button, username, color}>).
  - S펜: `useExcalidrawTouch({ excalidrawAPIRef, containerRef, screenLockedRef: {current:false}, baseStrokeWidthRef: {current:2} })` + `useScribbleErase({ excalidrawAPIRef, excludePrefixes: [] })` 를 **옵션 prop `penTouchHandling`(기본 true)** 으로 장착. 기본 툴바와 충돌(손가락 팬이 선택 도구와 겹침)이 확인되면 기본값을 false 로 내리고 Excalidraw `penMode` 자동 감지로 대체 — 이 판단은 Task 15 수동 E2E 에서.
  - 작성자: `onChange` 의 `appState.selectedElementIds` 1개면 해당 요소 `customData.authorName` 을 `onAuthorChange` 로 보고(교사만).
- [ ] **Step 2:** `WhiteboardTopBar` — 바탕색 버튼(`BackgroundColorPicker`: 프리셋 `#ffffff #fff9db #e7f5ff #f1f3f5 #fff0f6 #ebfbee #fff4e6 #1e1e1e` + `<input type="color">`), 템플릿 버튼(`TemplatePickerDialog` → `buildTemplateElements(key, viewportCenterX-1600, viewportCenterY-900)` → `updateScene({ elements:[...current, ...tpl], captureUpdate: IMMEDIATELY })`), 화면 맞춤(`api.scrollToContent(guideEl, { fitToViewport: true })`), 잠금 배지, 접속자 아바타(최대 5 + "+N"), `topBarExtras` 슬롯.
- [ ] **Step 3:** `showStartTemplatePicker` 가 true 이고 init 장면이 비어 있으면 오버레이 피커 → 선택 시 `POST apply-template` → `applied:false` 면 조용히 닫기(다른 사람이 먼저 적용).
- [ ] **Step 4:** `npm run lint`, `npm run build -w @mathchois/client`. (화면 확인은 Task 12 에서.)

## Task 12: 학생 화면 + 라우터 분기

**Files:** Create `packages/client/src/pages/Whiteboard/StudentWhiteboardViewer.jsx`, Modify `packages/client/src/pages/Study/StudyPageRouter.jsx`

- [ ] **Step 1:** `StudyPageRouter` — `getCachedChapterAndPages` 결과의 `chapter` 도 state 에 보관. `state.page?.pageType === 'whiteboard'` → `<StudentWhiteboardViewer chapterId pages currentPage classroomId={chapter.classroomId} />`.
- [ ] **Step 2:** `StudentWhiteboardViewer`:
  - `GET /api/whiteboards/page/:pageId?classroomId=` → `view`. `myGroupId` 없으면 전체 화면 안내("모둠이 배정되지 않았습니다. 선생님께 문의하세요.") + 뒤로.
  - 상단 좌측: 나가기(`/student/classrooms/:classroomId`), 모둠 이름, (열람 허용 시) 모둠 드롭다운(자기 모둠 외 선택 시 `readOnly`), 페이지 인덱스. `PageNavOverlay` 로 앞뒤 페이지 이동(`/student/study/:chapterId/page/:id`).
  - `<WhiteboardCanvas boardId={selectedGroupId} readOnly={selectedGroupId !== myGroupId} showStartTemplatePicker={selectedGroupId === myGroupId && !view.templateKey} />`. 기본 템플릿이 있고 보드가 비어 있으면 자동으로 `apply-template`(클라이언트가 빌드) — 중복은 서버가 막음.
  - `wb:settings` 수신 시 `allowCrossGroupView` 갱신(드롭다운 표시/숨김, 꺼지면 자기 모둠으로 복귀).
- [ ] **Step 3:** `npm run lint`, `npm run build`. 수동: 학생 2명 같은 모둠 동시 편집(두 창), 다른 모둠 학생은 열람 허용 전 드롭다운 없음.

## Task 13: 교사 화면(단일/격자) + 설정 드로어 + 라우트

**Files:** Create `packages/client/src/pages/Whiteboard/TeacherWhiteboardPage.jsx`, `packages/client/src/components/whiteboard/WhiteboardTile.jsx`, `WhiteboardSettingsDrawer.jsx`, Modify `packages/client/src/pages/Study/TeacherStudyPageRouter.jsx`, `packages/client/src/App.jsx`, `packages/client/src/pages/Monitor/ChapterMonitor.jsx`

- [ ] **Step 1:** `App.jsx` — lazy `TeacherWhiteboardPage`; 전체화면 라우트 `/teacher/classrooms/:classroomId/chapters/:chapterId/whiteboard/:pageId`. `TeacherStudyPageRouter` 에 `pageType === 'whiteboard'` → `<TeacherWhiteboardPage …/>` 분기(페이지 네비게이션 공유).
- [ ] **Step 2:** `WhiteboardTile` props `{ board, scene, users, onClick }` — `exportToCanvas({ elements, files, appState:{ viewBackgroundColor }, exportPadding: 20, getDimensions: () => ({ width: 480, height: 270, scale: 1 }) })` 를 2초 스로틀(+ 마지막 변경 후 1회 보장) 로 `<canvas>` 에 복사. 범위는 `getExportBounds` → `appState.scrollX/scrollY/zoom` 계산(또는 `exportToCanvas` 가 모든 요소를 맞추므로 안내선 rect 를 포함시켜 발표 영역 기준 유지). 헤더: 모둠명, 잠금 아이콘, "접속 N명" + 이름 툴팁.
- [ ] **Step 3:** `TeacherWhiteboardPage`:
  - 로드: `GET /api/whiteboards/page/:pageId?classroomId=` → `view`. 모드 state `'grid' | 'single'`(localStorage 기억), `selectedGroupId`.
  - **격자 모드**: 모든 보드에 대해 `useWhiteboardCollab` 을 쓰기 어려우므로 보드 수만큼 훅을 돌리지 않고 **`WhiteboardGridSync` 내부 모듈**이 소켓 하나로 `wb:join` 을 N 개 보내고 `boardId` 별 장면 Map 을 state 로 유지(`wb:init/elements/scene/presence` 를 boardId 로 분배). 타일 클릭 → `single` + 해당 모둠.
  - **단일 모드**: `<WhiteboardCanvas boardId isTeacher topBarExtras={<모둠 드롭다운/>} onAuthorChange={setAuthor} />`, 상단에 "작성: 이름".
  - 설정 드로어(톱니): `GroupAssignmentPanel`(members = 학급 구성원, groups = view.groups, 저장 → `PUT groups`, 삭제되는 모둠 있으면 confirm "보드 내용이 삭제됩니다"), "다른 모둠 열람 허용" 토글, "전체 잠금" 토글, 모둠별 잠금 토글, 기본 템플릿(`isSourceChapter` 일 때만 활성; 변경 시 `PATCH /api/pages/:id` 후 **빈 보드마다** `apply-template`), 초기화(confirm) / 직전 상태로 되돌리기, 내보내기(현재 모둠 PNG, 전체 PDF — Task 14).
  - 페이지 이동: `PageNavOverlay` + `/teacher/classrooms/:cid/chapters/:chid/study/page/:id`(라우터가 분기). 나가기 → 모니터.
- [ ] **Step 4:** `ChapterMonitor` — `pages` 를 `normalPages`(진도 집계) 와 `whiteboardPages` 로 나누고, 헤더 아래 "화이트보드" 칩 목록(페이지 번호 + "열기" → 교사 화이트보드 라우트).
- [ ] **Step 5:** `npm run lint`, `npm run build`. 수동: 격자에서 학생 편집이 2초 내 타일에 반영, 타일 클릭 → 단일 편집, 잠금 시 학생 화면 즉시 읽기 전용, 열람 허용 토글 즉시 반영, 배정 변경 후 학생 새 모둠 보드로.

## Task 14: 내보내기(PNG/PDF) + 초기화/복원/템플릿 재적용 마무리

**Files:** Modify `packages/client/src/lib/whiteboardExport.js`, `WhiteboardSettingsDrawer.jsx`, `TeacherWhiteboardPage.jsx`

- [ ] **Step 1:** `exportBoardPng(scene, backgroundColor, fileName)` — `exportToBlob({ elements, files(dataURL 변환), appState:{ viewBackgroundColor, exportBackground:true }, mimeType:'image/png', exportPadding: 40 })` → `<a download>`.
- [ ] **Step 2:** `exportBoardsPdf(title, boards)` — 각 보드 장면을 `fileRefsToExcalidrawFiles` 로 변환해 기존 `usePdfDownloader().downloadMultiplePages(title, [{ elements, files }])` 호출(배경 이미지 없음). 가로 보드이므로 `downloadMultiplePages` 가 세로 A4 고정이면 `orientation` 인자를 추가하는 최소 수정(기존 호출부 기본값 유지).
- [ ] **Step 3:** 초기화·복원 버튼 → REST → 응답 장면은 소켓 `wb:scene` 으로 모두에게 도달(교사 자신 포함). 복원은 `prevExcalidrawData` 가 없으면 비활성(`view.groups[i].hasPrevious` 를 Task 7 view 에 추가).
- [ ] **Step 4:** 템플릿 재적용 — 드로어에서 템플릿 변경 시 `view.groups` 중 `sceneVersion === 0 || elementCount === 0`(view 에 `elementCount` 추가) 인 보드에 `apply-template` 순차 호출, 결과 토스트 "N개 빈 보드에 적용".
- [ ] **Step 5:** `npm run lint`, `npm run build`. 수동: PNG/PDF 파일 열어 확인, 초기화 후 복원으로 되돌아옴.

## Task 15: 문서·점검·수동 E2E

**Files:** Modify `.claude/PROJECT_MAP.md`, `CLAUDE.md`, `docs/superpowers/e2e-checklist.md`, `docs/superpowers/specs/2026-10-18-whiteboard-design.md`(상태 갱신)

- [ ] **Step 1:** `PROJECT_MAP.md` — 폴더 구조(`components/whiteboard/`, `pages/Whiteboard/`, `hooks/useWhiteboardCollab.js`, `lib/whiteboard*.js`, `services/whiteboard.service.ts`, `classroomGroup.service.ts`, `pageAccess.service.ts`, `socket/handlers/whiteboard.ts`, `routes/whiteboards.ts`, `classroomGroups.ts`), 라우트 표(클라이언트 2 + 서버 전부), 데이터 모델(테이블 5 + pages 컬럼), Socket room `wb:{boardId}` 와 이벤트 표. `CLAUDE.md` 의 Core feature 표 아래에 "⑥ 화이트보드(모둠 공유, 요소 단위 실시간 병합)" 한 단락과 Gotcha(서버 메모리 장면, 단일 인스턴스 전제, 템플릿 원자 적용).
- [ ] **Step 2:** `e2e-checklist.md` 에 화이트보드 항목 추가(설계 문서 "검증 계획" 그대로).
- [ ] **Step 3:** 최종 검증: `npx tsc -b packages/server/tsconfig.json && npm run lint && npm test -w @mathchois/client && npm run build -w @mathchois/client`.
- [ ] **Step 4:** 수동 E2E(로컬 PostgreSQL + `npm run dev`, Chromium 창 3개: 교사·학생A·학생B 같은 모둠, 학생C 다른 모둠):
  1. 교사 모둠 설정 자동 배분 → 화이트보드 페이지 추가(기본 템플릿 SWOT) → 교사 화면 격자에 모둠 수만큼 타일, 각 보드에 SWOT 1회만 삽입(학생 둘이 동시에 열어도 중복 없음).
  2. A·B 동시 그리기 → 서로 덮어쓰기 없음, 커서 이름표 표시, 새로고침 후 유지.
  3. 바탕색 변경 → 상대 화면·교사 타일 반영.
  4. 이미지 붙여넣기 → 상대 화면 표시, DB `excalidraw_data.files` 에 dataURL 없음.
  5. 잠금 → A·B 즉시 읽기 전용, 교사는 편집 가능. 해제 후 복구.
  6. 열람 허용 → C 가 A 모둠 보드 읽기 전용 열람, 편집 시도 거부(`wb:rejected`).
  7. 초기화 → 복원 → 내보내기 PNG/PDF.
  8. 챕터를 다른 학급에 연결(내보내기) → 그 학급에서 보드가 별도 생성, 템플릿만 동일.
  9. 태블릿(S펜): 펜 그리기, 손가락 팬/줌, 배럴 지우개 — 충돌 시 Task 11 의 `penTouchHandling` 기본값 조정.
- [ ] **Step 5:** 설계 문서 상태를 "구현 완료(날짜)" 로 갱신하고 커밋·푸시.

---

## 구현 순서와 의존성 요약

| 순서 | Task | 의존 |
|---|---|---|
| 1 | 1 타입·스키마 | — |
| 2 | 2 병합 순수 함수 | 1 |
| 3 | 3 기본 모둠 서버 → 4 모둠 설정 UI | 1 |
| 4 | 5 페이지 타입 → 6 템플릿 | 1 |
| 5 | 7 서비스 → 8 소켓 → 9 REST | 1, 2 |
| 6 | 10 collab 훅 → 11 캔버스 | 2, 9 |
| 7 | 12 학생 화면 | 6, 11 |
| 8 | 13 교사 화면 → 14 내보내기 등 | 4, 11, 12 |
| 9 | 15 문서·E2E | 전부 |

Task 3/4 와 Task 5/6 은 서로 독립이므로 병렬 진행 가능. Task 8 의 스모크 스크립트는 Task 10 이전에 서버 병합이 맞는지 확인하는 안전장치다.

## 리스크와 대응

- **Excalidraw 기본 툴바 ↔ 자체 S펜 훅 충돌**: 훅은 1손가락 팬·핀치를 가로채므로 선택 도구에서 손가락 드래그 선택이 안 될 수 있음 → `penTouchHandling` 옵션으로 격리, E2E 에서 결정.
- **대용량 보드**: 요소 수천 개 + 격자 타일 N 개 `exportToCanvas` 가 교사 기기에서 무거움 → 타일 해상도 480×270 고정, 2초 스로틀, 화면에 보이는 타일만 렌더(IntersectionObserver).
- **재연결 중 유실**: 소켓 끊김 동안의 로컬 변경은 `lastVersions` 와 어긋나므로 재연결 시 `wb:init` 을 받은 뒤 로컬 장면 전체를 `diffChangedElements` 로 다시 비교해 미전송분을 보낸다(서버 병합 규칙이 중복/역행을 걸러 줌).
- **서버 재시작**: 메모리 장면은 2초 내 저장되므로 최대 2~10초 손실. 종료 훅(`SIGTERM`)에서 전체 flush 를 시도한다(Task 8 의 `flushAll` export, `index.ts` 종료 처리에 연결).
