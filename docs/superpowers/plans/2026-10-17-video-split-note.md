# 영상 2분할 필기 (Video Split-Note) Implementation Plan

> **For agentic workers:** 이 계획은 Task 단위로 순서대로 구현한다. 각 Task 끝의 검증 명령이 통과해야 다음 Task 로 넘어간다. Steps use checkbox (`- [x]`) syntax for tracking.

**설계 문서:** `docs/superpowers/specs/2026-10-17-video-split-note-design.md` (질의응답으로 확정된 결정 Q1~Q4 포함)

**Goal:** 교사가 학급 [영상] 탭에서 배정 영상에 **해당 학급의 챕터 1개**를 "필기 챕터"로 연결한다. 학생은 영상 상세에서 **[2분할로 필기하며 보기]** 로 진입해 한쪽(기본 좌측)에 영상, 다른 쪽에 그 챕터의 필기 뷰어(StudyViewer ①)를 두고 필기한다. 분할선 드래그로 비율 조정, 좌우 바꾸기(왼손잡이), 반쪽 전체화면, 세로 화면에서 위/아래 자동 전환. 페이지를 넘겨도 영상은 끊기지 않는다.

**Architecture:**
- DB: `classroom_videos.chapter_id`(nullable FK → `chapters`, `ON DELETE SET NULL`) 1컬럼 추가. 서버 `PATCH /api/classroom-videos/:id` 가 `chapterId` 를 받고 **같은 학급 챕터인지 검증**(400). 조회 응답에 `chapter: {id,title} | null` (left join).
- 클라이언트 분할 화면은 **DashboardLayout 바깥** 라우트 `/student/classrooms/:classroomId/videos/:cvId/split?page=<pageId>`. 현재 페이지는 쿼리스트링(+기기 localStorage)으로만 바뀌어 영상 컴포넌트가 언마운트되지 않는다.
- `StudyViewer` 에 **임베드 모드**(props `chapterId/pageId/onNavigatePage/onExit/embedded`)를 추가한다. props 가 없으면 기존 `useParams/navigate` 동작 그대로 — 동작 불변 리팩터링.
- 레이아웃은 신규 `SplitPane`(CSS grid + 손잡이 드래그 + 드래그 중 투명 오버레이). 비율/배치는 `localStorage['mc_video_split']`.
- `VideoPlayer` 에 `fullscreenTargetRef` 를 추가해 분할 루트를 전체화면 대상으로 삼는다. `requestFullscreen` 미지원(iPhone Safari)은 CSS 폴백.
- 플레이어 단축키는 마지막으로 포인터가 닿은 패널이 영상일 때만 활성(`hotkeys={activePane === 'video'}`).

**진행 상태 (2026-10-17):** Task 1~11 완료. Task 12 는 로컬 PostgreSQL + 실제 서버 + Playwright(Chromium) 자동 스모크 23개 통과(상세 버튼 → 분할 진입 → 페이지 이동 중 `<video>` 유지·재생 유지 → 분할선 드래그/좌우 바꾸기 저장 → 단축키 게이트 → 전체화면 대상=분할 루트 → 세로 뷰포트 위/아래 → 연결 해제 시 리다이렉트/버튼 숨김 → 교사 선택/해제/재연결). 사용자 실기기 검증(2026-10-17): 안드로이드 태블릿 정상, AI 코칭 페이지 안내 표시 확인. **시청 기록 미반영 보고** → 로컬 재현에서는 저장·표시 모두 정상이었으나 다음을 보강: 언마운트 보고가 ref 해제로 누락되던 문제(스냅샷), `pagehide`/탭 숨김 keepalive 보고, `videos.durationSec` null 보강(학생 시청률 바 표시), 교사 패널 30초 자동 갱신·탭 복귀 갱신·새로고침 버튼, 좌우 바꾸기 시 플레이어 리마운트 방지(`SplitPane reverse`). **원인 확정(운영 로그)**: 기존 upsert 가 완료 기준값(길이×0.8, 예: 547초 영상 → 437.6)을 ON CONFLICT SET 절에서 정수 컬럼과 직접 비교 → PostgreSQL `invalid input syntax for type integer: "437.6"` 로 500. 로컬 테스트 영상(20초)은 기준값이 정수라 재현되지 않았음. 완료 판정을 JS 에서 계산하는 조회→갱신/삽입 방식으로 교체해 해결(커밋 856f94c). 미완: iPad·iPhone 폴백 실기기 확인.

**Tech Stack:** Fastify 5 + Drizzle ORM 0.45 + PostgreSQL + zod (server) / React 19 + React Router 7 + Tailwind 4 + Excalidraw 0.18 + lucide-react + Vitest (client). 공용 타입 `@mathchois/shared`.

> **테스트 정책:** 서버 패키지에는 테스트 러너가 없다(레포 관행) → `npx tsc -b packages/server/tsconfig.json` + 로컬 PostgreSQL 기동 후 curl E2E. 클라이언트 순수 로직(`lib/splitLayout.js`, `SplitPane` 의 비율 계산 함수)은 Vitest 로 TDD. UI 는 `npm run lint` + `vite build` + 수동 E2E(태블릿 포함). 사전 설치 Chromium(`/opt/pw-browsers/chromium`)으로 Playwright 스모크 가능(H.264 미지원 → webm 샘플).

**검증 명령 모음**
```bash
npx tsc -b packages/server/tsconfig.json          # 서버 타입체크
npm run lint                                      # 클라이언트 ESLint
npm test -w @mathchois/client                     # Vitest
npm run build -w @mathchois/client                # vite build
```

---

## File Structure

**공용**
- `packages/shared/src/types/video.ts` — 수정. `ClassroomVideo` 에 `chapterId`, `chapter`.

**서버**
- `packages/server/src/db/schema.ts` — 수정. `classroomVideos.chapterId` + 인덱스.
- `packages/server/src/db/startupMigrate.ts` — 수정. `ALTER TABLE ... ADD COLUMN IF NOT EXISTS chapter_id` + 인덱스.
- `packages/server/src/services/classroomVideo.service.ts` — 수정. select 에 `chapterId/chapter`(left join `chapters`), `updateClassroomVideo` 가 전달된 키만 set, `isChapterInClassroom`.
- `packages/server/src/routes/classroomVideos.ts` — 수정. PATCH body 에 `chapterId`, 검증 400.

**클라이언트**
- `packages/client/src/lib/splitLayout.js` (+`.test.js`) — 신규. 분할 설정 로드/저장/클램프, 마지막 페이지 기억, `ratioFromPointer`, `useOrientation`.
- `packages/client/src/components/common/SplitPane.jsx` — 신규. 2패널 분할 컨테이너.
- `packages/client/src/components/videos/VideoPlayer.jsx` — 수정. `fullscreenTargetRef`, `onPseudoFullscreenChange`.
- `packages/client/src/components/videos/ClassroomVideoTab.jsx` — 수정. 교사 "필기 챕터" 선택 + 칩(학생 카드에도 칩).
- `packages/client/src/pages/Study/StudyViewer.jsx` — 수정. 임베드 props.
- `packages/client/src/pages/Videos/ClassroomVideoSplit.jsx` — 신규. 분할 화면.
- `packages/client/src/pages/Videos/ClassroomVideoWatch.jsx` — 수정. 학생 [2분할] 버튼 / 교사 칩.
- `packages/client/src/App.jsx` — 수정. 라우트.
- `.claude/PROJECT_MAP.md` — 수정. 라우트 표·폴더 구조·데이터 모델.

---

## Task 1: 공용 타입 + DB 스키마 + 기동 마이그레이션

**Files:** Modify `packages/shared/src/types/video.ts`, `packages/server/src/db/schema.ts`, `packages/server/src/db/startupMigrate.ts`

- [x] **Step 1:** `shared/src/types/video.ts` 의 `ClassroomVideo` 에 추가:
  ```ts
  chapterId: string | null;
  /** 연결된 필기 챕터 (left join). 챕터가 삭제되면 FK SET NULL → null */
  chapter: { id: string; title: string } | null;
  ```
- [x] **Step 2:** `schema.ts` `classroomVideos` 에 컬럼·인덱스 추가. `chapters` 는 같은 파일 위쪽에 이미 선언돼 있다.
  ```ts
  chapterId: uuid('chapter_id').references(() => chapters.id, { onDelete: 'set null' }),
  // (t) => [...] 에
  index('idx_classroom_videos_chapter').on(t.chapterId),
  ```
- [x] **Step 3:** `startupMigrate.ts` 의 classroom_videos 관련 DDL 블록 뒤에 멱등 DDL 추가(프로덕션은 기동 시 DDL 이 유일한 적용 경로):
  ```ts
  await pgClient`ALTER TABLE classroom_videos ADD COLUMN IF NOT EXISTS chapter_id uuid REFERENCES chapters(id) ON DELETE SET NULL`;
  await pgClient`CREATE INDEX IF NOT EXISTS idx_classroom_videos_chapter ON classroom_videos (chapter_id)`;
  log.info('startup migration: classroom_videos.chapter_id ensured');
  ```
- [x] **Step 4:** `npx tsc -b packages/server/tsconfig.json` 통과. (service 가 아직 `chapterId` 를 select 하지 않으므로 타입 오류는 Task 2 에서 해소되거나, 이 단계에서는 shared 타입만 느슨해도 무관 — 서버는 shared 타입을 응답 타입으로 강제하지 않는다.)

## Task 2: 서비스 — 챕터 조인·갱신·검증

**Files:** Modify `packages/server/src/services/classroomVideo.service.ts`

- [x] **Step 1:** import 에 `chapters` 추가. `classroomVideoSelect` 에
  ```ts
  chapterId: classroomVideos.chapterId,
  chapter: {
    id: chapters.id,
    title: chapters.title,
  },
  ```
  Drizzle 의 중첩 select 는 left join 에서 전체가 null 이면 `chapter: null` 로 내려온다(`video` 는 inner join 이라 항상 존재). `listClassroomVideos` / `getClassroomVideoById` 두 쿼리에 `.leftJoin(chapters, eq(classroomVideos.chapterId, chapters.id))` 를 추가한다.
- [x] **Step 2:** `updateClassroomVideo` 를 "전달된 키만 set" 으로 바꾼다(현재는 호출부가 항상 `note` 를 덮어쓴다).
  ```ts
  export async function updateClassroomVideo(id: string, patch: { note?: string | null; chapterId?: string | null }) {
    const set: Partial<typeof classroomVideos.$inferInsert> = {};
    if ('note' in patch) set.note = patch.note ?? null;
    if ('chapterId' in patch) set.chapterId = patch.chapterId ?? null;
    if (Object.keys(set).length) await db.update(classroomVideos).set(set).where(eq(classroomVideos.id, id));
    return getClassroomVideoById(id);
  }
  ```
- [x] **Step 3:** 검증 헬퍼 추가:
  ```ts
  /** chapterId 가 해당 학급의 챕터인지 (다른 학급 챕터 연결 방지) */
  export async function isChapterInClassroom(chapterId: string, classroomId: string) {
    const [row] = await db.select({ id: chapters.id }).from(chapters)
      .where(and(eq(chapters.id, chapterId), eq(chapters.classroomId, classroomId))).limit(1);
    return !!row;
  }
  ```
- [x] **Step 4:** `npx tsc -b packages/server/tsconfig.json` 통과.

## Task 3: 라우트 — PATCH `chapterId`

**Files:** Modify `packages/server/src/routes/classroomVideos.ts` (현재 L87~92)

- [x] **Step 1:** PATCH 핸들러 교체:
  ```ts
  app.patch<{ Params: { id: string } }>('/api/classroom-videos/:id', teacher, async (req, reply) => {
    const cv = await loadClassroomVideoOr404(req, reply, req.params.id);
    if (!cv) return;
    const body = z.object({
      note: z.string().nullable().optional(),
      chapterId: z.string().uuid().nullable().optional(),
    }).parse(req.body);
    if (body.chapterId && !(await svc.isChapterInClassroom(body.chapterId, cv.classroomId))) {
      return reply.status(400).send({ error: '이 학급의 챕터가 아닙니다.' });
    }
    const patch: { note?: string | null; chapterId?: string | null } = {};
    if ('note' in body) patch.note = body.note ?? null;
    if ('chapterId' in body) patch.chapterId = body.chapterId ?? null;
    return svc.updateClassroomVideo(cv.id, patch);
  });
  ```
- [x] **Step 2:** `npx tsc -b packages/server/tsconfig.json` 통과.
- [x] **Step 3 (curl E2E, 로컬 PostgreSQL):** 교사 토큰으로
  - `PATCH {chapterId: <같은 학급 챕터>}` → 200, 응답 `chapter.title` 존재
  - `PATCH {chapterId: <다른 학급 챕터>}` → 400
  - `PATCH {chapterId: null}` → 200, `chapter: null`
  - `PATCH {note: "x"}` → `chapterId` 유지(덮어쓰지 않음)
  - `GET /api/classrooms/:cid/videos`, `GET /api/classroom-videos/:id` 에 `chapterId/chapter` 포함
  - 챕터 `DELETE /api/chapters/:id` 후 재조회 → `chapter: null`

## Task 4: 교사 UI — 필기 챕터 연결 (+ 칩)

**Files:** Modify `packages/client/src/components/videos/ClassroomVideoTab.jsx`

- [x] **Step 1:** `ClassroomVideoTab` 에 `chapters` state. 교사일 때 `fetchList` 와 함께 `api.get('/api/classrooms/${classroomId}/chapters')` 를 로드(`lib/api` import). 실패해도 목록은 표시(보조 정보).
- [x] **Step 2:** `handleSaveChapter(cv, chapterId)`:
  ```js
  const updated = await updateClassroomVideo(cv.id, { chapterId });
  setItems((prev) => prev.map((x) => (x.id === cv.id ? { ...x, chapterId: updated.chapterId, chapter: updated.chapter } : x)));
  ```
  실패 시 `alert`.
- [x] **Step 3:** `VideoCard` props 에 `chapters`, `onSaveChapter` 추가. 메모 영역 아래에
  - 교사: `<select>`(`BookOpen` 아이콘 라벨 "필기 챕터") — 옵션 `연결 없음` + `chapters`(position 순, 제목). `value={cv.chapterId ?? ''}`, `onChange → onSaveChapter(cv, value || null)`. 최소 터치 높이 `min-h-9`.
  - 학생(및 교사 select 아래): `cv.chapter` 있으면 칩 `필기 챕터 · {title}`(`BookOpen` h-3.5, `bg-amber-50 text-amber-800`).
- [x] **Step 4:** `npm run lint` 통과. 수동: 선택 즉시 저장·새로고침 후 유지, "연결 없음" 으로 해제.

## Task 5: `lib/splitLayout.js` (TDD)

**Files:** Create `packages/client/src/lib/splitLayout.js`, `packages/client/src/lib/splitLayout.test.js`

- [x] **Step 1 (테스트 먼저):** `splitLayout.test.js`
  - `loadSplitSettings()` 기본 `{ ratio: 0.5, videoSide: 'start' }`; 저장값 `ratio: 0.05` → `0.2`, `0.95` → `0.8`, `NaN` → `0.5`; `videoSide: 'x'` → `'start'`.
  - `saveSplitSettings({ ratio: 0.3 })` 가 기존 `videoSide` 를 유지(머지)하고 정규화된 값을 반환.
  - `ratioFromPointer({ left: 100, top: 0, width: 800, height: 600 }, 300, 0, 'horizontal', 0.2, 0.8)` → `0.25`; 세로 모드는 `top/height` 사용; 클램프 동작.
  - `loadSplitPage('cv1')` null → `saveSplitPage('cv1', 'p1')` → `'p1'`.
  `localStorage` 는 Vitest `jsdom` 환경 또는 `videoPlayer.test.js` 와 같은 방식의 스텁 사용(기존 테스트 파일의 설정을 그대로 따른다).
- [x] **Step 2 (구현):**
  ```js
  export const SPLIT_KEY = 'mc_video_split';
  export const SPLIT_PAGE_PREFIX = 'mc_video_split_page:';
  export const RATIO_MIN = 0.2, RATIO_MAX = 0.8;
  const DEFAULT = { ratio: 0.5, videoSide: 'start' }; // start = 좌측(가로) / 위(세로)
  export function clampRatio(r) { ... }               // 비정상 → 0.5
  export function normalizeSplitSettings(raw) { ... }
  export function loadSplitSettings() / saveSplitSettings(patch)   // 패턴: lib/videoPlayer.js 의 loadSettings/saveSettings
  export function loadSplitPage(cvId) / saveSplitPage(cvId, pageId)
  /** 포인터 좌표 → 첫 패널 비율 (손잡이 드래그) */
  export function ratioFromPointer(rect, clientX, clientY, orientation, min = RATIO_MIN, max = RATIO_MAX) {
    const r = orientation === 'vertical' ? (clientY - rect.top) / rect.height : (clientX - rect.left) / rect.width;
    return Math.min(max, Math.max(min, r));
  }
  ```
  `useOrientation()` 훅(React): `matchMedia('(orientation: portrait)')` → `'vertical' | 'horizontal'`, `change` 이벤트 구독. 훅은 `react-refresh` 규칙 때문에 컴포넌트 파일이 아닌 이 lib 에 두어도 되지만 테스트 대상이 아니므로 `hooks/useOrientation.js` 로 분리해도 좋다(결정: `hooks/useOrientation.js`).
- [x] **Step 3:** `npm test -w @mathchois/client` 통과.

## Task 6: `SplitPane` 컴포넌트

**Files:** Create `packages/client/src/components/common/SplitPane.jsx`

- [x] **Step 1:** props `{ orientation, ratio, onRatioChange, min, max, handleLabel, children }` (children 은 정확히 2개). 렌더:
  ```jsx
  <div ref={rootRef} className="relative h-full w-full min-h-0 min-w-0"
       style={{ display: 'grid', [vertical ? 'gridTemplateRows' : 'gridTemplateColumns']: `${ratio}fr 12px ${1 - ratio}fr` }}>
    <div className="min-w-0 min-h-0 overflow-hidden">{first}</div>
    <div role="separator" aria-orientation={vertical ? 'horizontal' : 'vertical'} aria-valuenow={Math.round(ratio*100)} tabIndex={0}
         className={`flex items-center justify-center bg-gray-200 hover:bg-blue-200 touch-none select-none ${vertical ? 'cursor-row-resize' : 'cursor-col-resize'}`}
         onPointerDown={startDrag} onKeyDown={onKey}>
      {vertical ? <GripHorizontal .../> : <GripVertical .../>}
    </div>
    <div className="min-w-0 min-h-0 overflow-hidden">{second}</div>
    {dragging && <div className={`fixed inset-0 z-[70] ${vertical ? 'cursor-row-resize' : 'cursor-col-resize'}`} />}
  </div>
  ```
- [x] **Step 2:** 드래그: `startDrag` → `e.currentTarget.setPointerCapture(e.pointerId)`, `setDragging(true)`; `pointermove` → `onRatioChange(ratioFromPointer(rootRef.current.getBoundingClientRect(), e.clientX, e.clientY, orientation, min, max))`; `pointerup/pointercancel` → `setDragging(false)`. 투명 오버레이는 `<video>`·Excalidraw·HTML 도구 iframe 이 이벤트를 먹지 않게 하는 용도(iframe 위에서는 pointermove 가 부모에 오지 않으므로 필수).
- [x] **Step 3:** 키보드: `←/↑` −0.02, `→/↓` +0.02 (클램프).
- [x] **Step 4:** `npm run lint` 통과.

## Task 7: `StudyViewer` 임베드 모드 (동작 불변 리팩터링)

**Files:** Modify `packages/client/src/pages/Study/StudyViewer.jsx`

변경 지점은 모두 라우트 결합부이며 로직은 바뀌지 않는다. 변경 전 기존 라우트(`/student/study/:chapterId/page/:pageId`)의 동작을 눈으로 확인해 두고, 변경 후 동일함을 재확인한다.

- [x] **Step 1 (L347~348):** 시그니처와 식별자 소스:
  ```js
  const StudyViewer = ({ chapterId: chapterIdProp, pageId: pageIdProp, onNavigatePage, onExit, embedded = false } = {}) => {
    const params = useParams();
    const chapterId = chapterIdProp ?? params.chapterId;
    const pageId    = pageIdProp ?? params.pageId;
  ```
- [x] **Step 2:** 이동 헬퍼 2개를 `navigate` 선언 직후에 추가:
  ```js
  const goToPage = useCallback((pid, opts) => {
    if (embedded) onNavigatePage?.(pid);
    else navigate(`/student/study/${chapterId}/page/${pid}`, opts);
  }, [embedded, onNavigatePage, navigate, chapterId]);
  const exitViewer = useCallback(() => {
    if (embedded) onExit?.();
    else navigate(`/student/classrooms/${chapter?.classroomId}`);
  }, [embedded, onExit, navigate, chapter?.classroomId]);
  ```
- [x] **Step 3:** 호출부 치환(라인은 현재 기준):
  - L539 `navigate(.../${pgs[0].id}, { replace: true })` → `goToPage(pgs[0].id, { replace: true })` (해당 effect 의 deps 에 `goToPage` 추가 또는 ref 로 읽기 — 기존 `eslint-disable` 주석이 있으면 그대로 둔다)
  - L927 뒤로가기 `onClick` → `exitViewer`
  - L1013 / L1025 이전·다음 → `goToPage(prevPage.id)` / `goToPage(nextPage.id)`
  - L1174~1175 `PageNavOverlay` → 동일
  - L1084 사이드바 `<Link to=...>` → `embedded` 일 때는 `<button type="button" onClick={() => goToPage(pg.id)}>` 로 렌더. 두 분기를 하나로 유지하려면 `const Item = embedded ? 'button' : Link;` + `{...(embedded ? { type: 'button', onClick } : { to })}` 패턴. `ref={activeSidebarItemRef}` 와 className 은 유지(`block w-full text-left` 추가).
- [x] **Step 4:** 루트 높이 L921 `style={{ height: embedded ? '100%' : '100vh' }}`, 로딩 화면 L914 `min-h-screen` → `embedded ? 'h-full' : 'min-h-screen'`.
- [x] **Step 5:** `StudyPageRouter.jsx` 는 변경 없음(라우트 전용). `TeacherNotesModal` 등 모달은 `fixed inset-0` 이므로 분할 화면 위에 전체로 뜬다 — 의도된 동작.
- [x] **Step 6:** `npm run lint` 통과. 수동 회귀: 기존 라우트에서 뒤로가기·이전/다음·사이드바 클릭·오버레이 탭·첫 페이지 리다이렉트(`/page/undefined` 같은 잘못된 id) 모두 이전과 동일.

## Task 8: `VideoPlayer.fullscreenTargetRef`

**Files:** Modify `packages/client/src/components/videos/VideoPlayer.jsx`

- [x] **Step 1:** props 에 `fullscreenTargetRef`, `onPseudoFullscreenChange` 추가(둘 다 optional). 내부 `const targetEl = () => fullscreenTargetRef?.current ?? containerRef.current;`.
- [x] **Step 2:** `toggleFullscreen`(L144~):
  ```js
  const el = targetEl(); const v = videoRef.current;
  if (document.fullscreenElement) { document.exitFullscreen?.().catch(() => {}); }
  else if (el?.requestFullscreen) { el.requestFullscreen().catch(() => {}); }
  else if (fullscreenTargetRef) { // 외부 대상인데 API 없음(iPhone Safari) → CSS 폴백은 호출측이 수행
    setPseudo((p) => { const n = !p; onPseudoFullscreenChange?.(n); return n; });
  } else if (v?.webkitEnterFullscreen) { v.webkitEnterFullscreen(); }
  ```
- [x] **Step 3:** `fullscreen` 상태: `fullscreenchange` 리스너는 `setFullscreen(document.fullscreenElement === targetEl())` 로, 아이콘/`title` 은 `fullscreen || pseudo` 기준. `Escape` 키는 pseudo 모드에서도 해제(`hotkeys` 가 false 여도 분할 화면 쪽에서 처리하므로 여기서는 생략 가능 — 결정: 분할 화면이 처리).
- [x] **Step 4:** 기존 사용처(`ClassroomVideoWatch`, `VideoPreviewModal`, `PageVideoEmbed`)는 prop 미지정 → 동작 동일. `npm run lint` 통과.

## Task 9: 분할 화면 `ClassroomVideoSplit` + 라우트

**Files:** Create `packages/client/src/pages/Videos/ClassroomVideoSplit.jsx`, `packages/client/src/hooks/useOrientation.js`; Modify `packages/client/src/App.jsx`

- [x] **Step 1 (App.jsx):** `const ClassroomVideoSplit = lazy(() => import('./pages/Videos/ClassroomVideoSplit'));` 학생 `ProtectedRoute` 안, `DashboardLayout` **밖**(L176 `StudyPageRouter` 옆):
  ```jsx
  {/* 영상 2분할 필기: 전체화면 레이아웃, DashboardLayout 제외 */}
  <Route path="/student/classrooms/:classroomId/videos/:cvId/split" element={<ClassroomVideoSplit />} />
  ```
- [x] **Step 2 (데이터 로드):** `useParams` → `classroomId, cvId`; `useSearchParams`. `Promise.all([getClassroomVideo(cvId), getVideoProgress(cvId).catch(() => null)])` → `detail.chapter` 가 없으면 `navigate('/student/classrooms/${classroomId}/videos/${cvId}', { replace: true })`. 있으면 `getCachedChapterAndPages(detail.chapterId)` 로 `pages`.
- [x] **Step 3 (현재 페이지):**
  ```js
  const pageParam = searchParams.get('page');
  const pageId = useMemo(() => {
    if (pages.some((p) => p.id === pageParam)) return pageParam;
    const remembered = loadSplitPage(cvId);
    if (pages.some((p) => p.id === remembered)) return remembered;
    return pages[0]?.id ?? null;
  }, [pages, pageParam, cvId]);
  useEffect(() => { if (pageId && pageId !== pageParam) setSearchParams({ page: pageId }, { replace: true }); }, [pageId]);
  const handleNavigatePage = (pid) => { saveSplitPage(cvId, pid); setSearchParams({ page: pid }, { replace: false }); };
  ```
  `?page=` 를 바꿔도 라우트 element 는 같으므로 `VideoPlayer` 는 유지된다.
- [x] **Step 4 (레이아웃 상태):** `const [split, setSplit] = useState(loadSplitSettings)`; `orientation = useOrientation()`; `activePane` state('video'|'notes'), 루트 `onPointerDownCapture={(e) => setActivePane(videoPaneRef.current?.contains(e.target) ? 'video' : 'notes')}`; `fullscreen`(real) + `pseudoFull` state; `rootRef`.
- [x] **Step 5 (렌더):**
  ```jsx
  <div ref={rootRef} className={`flex flex-col bg-gray-100 ${pseudoFull ? 'fixed inset-0 z-[80]' : ''}`} style={{ height: '100dvh' }}>
    {!isFull && (
      <div className="h-12 bg-white border-b flex items-center justify-between px-3 shrink-0">
        <button onClick={goBack}><ArrowLeft/> 영상으로 돌아가기</button>
        <span className="truncate font-semibold">{v.title}</span>
        <div className="flex gap-1">
          <button onClick={swapSides} title="좌우 바꾸기"><ArrowLeftRight/></button>
          <button onClick={() => playerRef.current?.toggleFullscreen()} title="전체화면"><Maximize/></button>
        </div>
      </div>
    )}
    <div className="flex-1 min-h-0">
      <SplitPane orientation={orientation} ratio={videoFirst ? split.ratio : 1 - split.ratio} onRatioChange={onRatio}>
        {videoFirst ? [videoPane, notesPane] : [notesPane, videoPane]}
      </SplitPane>
    </div>
  </div>
  ```
  - `videoFirst = split.videoSide === 'start'`. 비율은 **영상 쪽 기준**으로 저장: `onRatio = (r) => setSplitAndSave({ ratio: videoFirst ? r : 1 - r })`. `swapSides` 는 `videoSide` 만 토글.
  - `VideoPlayer` ref 에 `toggleFullscreen` 노출이 필요하면 Task 8 의 `useImperativeHandle` 에 추가(`toggleFullscreen`).
  - 전체화면 중(`isFull = fullscreen || pseudoFull`) 상단 바를 숨기고, 분할선 위 작은 플로팅 버튼(⇄, ⤢)만 남긴다. `Escape` 로 pseudo 해제(window keydown).
- [x] **Step 6 (영상 패널):**
  ```jsx
  <div ref={videoPaneRef} className="h-full flex flex-col bg-black">
    <div className="flex-1 min-h-0 flex items-center justify-center">
      <VideoPlayer ref={playerRef} src={v.videoUrl} poster={v.thumbnailUrl} title={v.title}
        storageKey={`cv:${detail.id}`} initialPosition={progress?.positionSec ?? 0} onProgress={handleProgress}
        hotkeys={activePane === 'video'} fullscreenTargetRef={rootRef} onPseudoFullscreenChange={setPseudoFull} />
    </div>
    {!isFull && (
      <div className="bg-white px-3 py-1 overflow-y-auto max-h-[45%]">
        <p className="text-sm font-semibold truncate">{v.title}</p>
        <CollapsibleSection label="댓글">
          <VideoComments classroomVideoId={detail.id} isTeacher={false} getCurrentTime={getCurrentTime} onSeek={seekTo} />
        </CollapsibleSection>
      </div>
    )}
  </div>
  ```
  `handleProgress`/`getCurrentTime`/`seekTo` 는 `ClassroomVideoWatch` 와 동일(`seekTo` 의 `window.scrollTo` 는 제거). `VideoPlayer` 컨테이너가 `aspect-video` 고정이면 패널을 꽉 채우도록 `className`/`fill` prop 이 필요할 수 있다 — 구현 시 플레이어 루트 스타일 확인 후 `fill` prop(`h-full w-full` + `<video class="object-contain">`) 추가.
- [x] **Step 7 (필기 패널):**
  ```jsx
  const page = pages.find((p) => p.id === pageId);
  page?.aiProblemId
    ? <AiPagePlaceholder to={`/student/study/${detail.chapterId}/page/${pageId}`} />   // "AI 코칭 페이지는 전체 화면에서 풀 수 있어요" + 링크 + 이전/다음 버튼
    : <StudyViewer embedded chapterId={detail.chapterId} pageId={pageId} onNavigatePage={handleNavigatePage} onExit={goBack} />
  ```
  `goBack = () => navigate('/student/classrooms/${classroomId}/videos/${cvId}')`.
- [x] **Step 8:** `npm run lint`, `npm run build -w @mathchois/client` 통과.

## Task 10: 상세 화면 진입 버튼 / 칩

**Files:** Modify `packages/client/src/pages/Videos/ClassroomVideoWatch.jsx`

- [x] **Step 1:** 제목(`<h1>`) 줄을 `flex items-start justify-between gap-2` 로 감싸고 우측에
  - 학생 & `detail.chapter`: `<Link to={`${base}/classrooms/${classroomId}/videos/${detail.id}/split${remembered ? `?page=${remembered}` : ''}`}>` (`Columns2` 아이콘, "2분할로 필기하며 보기", `bg-blue-600 text-white min-h-9`). `remembered = loadSplitPage(detail.id)`.
  - 교사 & `detail.chapter`: 칩 `연결된 챕터 · {title}`(`BookOpen`), 클릭 시 `/teacher/chapters/${chapter.id}/edit`.
- [x] **Step 2:** `npm run lint` 통과.

## Task 11: 정적 검증 + 문서

**Files:** Modify `.claude/PROJECT_MAP.md`

- [x] **Step 1:** `npx tsc -b packages/server/tsconfig.json` · `npm run lint` · `npm test -w @mathchois/client` · `npm run build -w @mathchois/client` 모두 통과.
- [x] **Step 2:** `PROJECT_MAP.md`
  - 폴더 구조: `pages/Videos` 에 `ClassroomVideoSplit`, `components/common/SplitPane`, `lib/splitLayout.js`, `hooks/useOrientation.js`.
  - 라우트 표: `/student/classrooms/:classroomId/videos/:cvId/split` (DashboardLayout 밖, `?page=`), `StudyViewer` 임베드 props 한 줄.
  - 서버 라우트 표 classroomVideos: `PATCH`(note·chapterId — 같은 학급 챕터 검증 400), 응답 `chapter`.
  - 데이터 모델 `classroom_videos`: `chapterId→chapters(set null)` "필기 챕터".
- [x] **Step 3:** 설계 문서 상태 줄을 "구현 완료(날짜)" 로 갱신.

## Task 12: 동적 검증 (로컬 E2E + 태블릿)

- [x] **Step 1 (로컬, 데스크톱 Chrome):** 교사 로그인 → 학급 [영상] 탭 → 카드 "필기 챕터" 선택 → 칩 표시 → 새로고침 유지. 학생 로그인 → 영상 상세에 버튼 → 분할 진입 → 좌 영상 재생 중 우측 페이지 이전/다음/사이드바/오버레이로 이동해도 **영상 재생 유지**(`<video>` 가 리마운트되지 않음 — DevTools Elements 로 확인) → URL `?page=` 갱신 → 새로고침 시 같은 페이지 → 필기 후 1.5초 뒤 "저장됨" → 다른 탭(교사 StudentWorkViewer)에서 코멘트 작성 시 실시간 반영.
- [x] **Step 2 (분할 조작):** 분할선 드래그(20%~80% 클램프) → 새로고침 후 비율 유지 → ⇄ 좌우 바꾸기 → 비율은 영상 기준 유지 → HTML 도구 페이지 위에서도 드래그 정상(오버레이).
- [x] **Step 3 (전체화면):** 플레이어 ⤢ → 분할 루트가 전체화면, 영상은 반쪽을 채우고 필기창 유지 → `Esc` 복귀. 상단 바 ⤢ 도 동일.
- [x] **Step 4 (단축키):** 필기창에 포인터를 둔 뒤 `Space`/`←` → 영상 변화 없음. 영상 패널 클릭 후 `Space` → 재생/정지.
- [ ] **Step 5 (예외):** 챕터 삭제 후 상세 → 버튼 사라짐, 분할 URL 직접 진입 → 상세로 replace. `?page=<다른 챕터 페이지 id>` → 첫 페이지로 교정. AI 코칭 페이지 → 안내 + 링크. 페이지 0개 챕터 → "페이지가 없습니다."
- [ ] **Step 6 (태블릿):** 갤럭시탭(Chrome, S-Pen): 펜 필기·손바닥 거부·바렐 버튼 지우기가 분할 상태에서 동일하게 동작, 분할선 손가락 드래그, 회전 시 위/아래 전환. iPad Safari: 전체화면 동작. iPhone Safari: CSS 폴백 전체화면.
- [ ] **Step 7:** 시청 기록: 분할 화면에서 본 진도가 교사 "시청 현황" 에 반영.

---

## 리스크 / 주의

- **StudyViewer 리팩터링 회귀**: 치환 대상은 7곳(L539, L927, L1013, L1025, L1084, L1174, L1175 + 높이 2곳)으로 한정. 그 외 로직은 건드리지 않는다. 기존 라우트 수동 회귀를 Task 7 안에서 반드시 수행.
- **플레이어 컨테이너 비율**: `VideoPlayer` 루트가 `aspect-video` 라면 분할 패널(세로로 긴 반쪽)에서 위아래가 비게 된다. Task 9 Step 6 의 `fill` prop 으로 해결. 기존 사용처는 기본값 유지.
- **단축키/포커스**: Excalidraw 는 자체 키 핸들러가 캔버스 포커스를 기준으로 동작하므로 변경 없음. 플레이어 쪽만 `hotkeys` 로 게이트.
- **드래그 중 iframe**: HTML 도구 페이지(별도 origin iframe)에서는 pointermove 가 부모로 오지 않는다 → 투명 오버레이 필수(Task 6).
- **DashboardLayout 바깥 라우트**: `ProtectedRoute(student)` 안에는 두어 비로그인/교사 접근은 기존 가드로 차단된다.
