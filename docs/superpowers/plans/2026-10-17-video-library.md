# 영상자료 라이브러리 + 학급 영상 탭 (Video Library) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**설계 문서:** `docs/superpowers/specs/2026-10-17-video-library-design.md` (질의응답으로 확정된 결정 Q1~Q4 포함)

**Goal:** 교사가 mp4/webm/mov 영상을 Railway Volume에 올리고 메타(제목/과목/대단원/소단원/설명)와 함께 **모든 교사가 공유**하는 [영상자료] 라이브러리를 만든다. 학급 상세에 [영상] 탭을 추가해 라이브러리 영상을 학급에 배정하고, 학생은 YouTube 식 시청 화면에서 댓글/대댓글로 질문한다("교사만 확인" 비공개 스레드 포함). 플레이어는 ←/→ 설정 초 이동(10/20/30/60), ↑/↓ 볼륨, 배속 0.7~2.5× 설정을 제공한다.

**Architecture:**
- 신규 테이블 3개: `videos`(라이브러리), `classroom_videos`(학급 배정 — 라이브러리를 **참조**, FK restrict), `video_comments`(루트+대댓글 깊이 1, `isPrivate`는 루트에만).
- 업로드는 **전용 스트리밍 라우트** `POST /api/videos/upload`(디스크 직접 기록). 기존 `/api/files/upload`는 전체 Buffer 적재라 사용하지 않는다.
- 파일 서빙 `GET /api/files/*`를 **스트리밍 + HTTP Range(206/416) + HEAD**로 교체(`<video>` 탐색·배속의 전제).
- 댓글 가시성 필터는 **서버 조회에서만** 수행. Socket room `video:{classroomVideoId}`의 `video-comment:changed` 이벤트는 본문 없이 재조회 트리거만.
- 플레이어는 native `<video>` + 커스텀 컨트롤(React). 설정은 `localStorage['mc_video_player']`, 이어보기 위치는 `mc_video_pos:<key>`(v1 로컬만).

**Tech Stack:** Fastify 5 + @fastify/multipart(busboy) + Drizzle ORM 0.44 + PostgreSQL + Socket.IO 4 + zod (server) / React 19 + React Router 7 + Tailwind 4 + dnd-kit + lucide-react + Vitest + Playwright (client). 공용 타입은 `@mathchois/shared`.

> **테스트 정책:** 서버 패키지에는 테스트 러너가 없다(레포 관행) → `npx tsc -b packages/server/tsconfig.json` + 로컬 PostgreSQL 기동 후 curl E2E. 클라이언트 순수 로직(`lib/videos.js`, `lib/videoPlayer.js`)은 Vitest로 TDD. UI 흐름은 Playwright 스모크(사전 설치 Chromium `/opt/pw-browsers/chromium`, H.264 미지원이라 **webm 샘플** 사용).

**진행 상태 (2026-10-17):** Task 1~12 완료(커밋 `04a56c9`). Task 14 중 4개 항목을 subagent 병렬 구현으로 완료(커밋 `9102ebd` + 미읽음 배지 커밋). Task 13(배포 검증)과 Task 14의 트랜스코딩/HLS 만 미완.

---

## File Structure

**공용**
- `packages/shared/src/types/video.ts` — 신규. `Video`, `VideoListResult`, `VideoFacets`, `VideoFilters`, `VideoUsage`, `VideoUploadResult`, `ClassroomVideo`, `ClassroomVideoDetail`, `VideoComment`, `VideoCommentThread`, `VideoPlayerSettings`, `SeekStep`.
- `packages/shared/src/index.ts` — 수정. re-export.

**서버**
- `packages/server/src/db/schema.ts` — 수정. `videos`, `classroomVideos`, `videoComments` (+ `bigint` import).
- `packages/server/src/db/startupMigrate.ts` — 수정. 3개 테이블·인덱스 멱등 DDL.
- `packages/server/src/services/storage.service.ts` — 수정. `uploadStream`, `statFile`, `openFileStream`, 영상 MIME.
- `packages/server/src/routes/storage.ts` — 수정. `parseRange` + 스트리밍/Range/HEAD 서빙, `sanitizeFileName` export, `buildFrameAncestors`.
- `packages/server/src/services/video.service.ts` — 신규. 라이브러리 CRUD/list/facets/usage, 삭제 차단(409), 파일 정리.
- `packages/server/src/services/classroomVideo.service.ts` — 신규. 배정 list/add/reorder/update/remove + 댓글 threads/create/update/remove.
- `packages/server/src/routes/videos.ts` — 신규. 스트리밍 업로드 + 라이브러리 REST.
- `packages/server/src/routes/classroomVideos.ts` — 신규. 학급 배정 + 댓글 REST(권한 가드).
- `packages/server/src/socket/handlers/videos.ts` — 신규. `emitVideoCommentChanged`.
- `packages/server/src/socket/index.ts` — 수정. room 패턴 `video:` 검증.
- `packages/server/src/app.ts` — 수정. 라우트 등록.

**클라이언트**
- `packages/client/src/lib/videoPlayer.js` (+`.test.js`) — 신규. 설정 상수/정규화/저장, `stepRate`, `formatTime`, 이어보기, `isTypingTarget`.
- `packages/client/src/lib/videos.js` (+`.test.js`) — 신규. API 래퍼, `buildVideoQuery`, `formatBytes/Duration`, XHR 업로드(진행률), `probeVideoDuration`, `captureVideoThumbnail`.
- `packages/client/src/components/videos/VideoPlayer.jsx` — 신규. 플레이어.
- `packages/client/src/components/videos/VideoPreviewModal.jsx` — 신규. 라이브러리 미리보기.
- `packages/client/src/components/videos/VideoForm.jsx` — 신규. 등록/수정 폼.
- `packages/client/src/components/videos/VideoPickerModal.jsx` — 신규. 학급 배정용 선택/등록 모달.
- `packages/client/src/components/videos/ClassroomVideoTab.jsx` — 신규. 학급 [영상] 탭.
- `packages/client/src/components/videos/VideoComments.jsx` — 신규. 댓글/대댓글.
- `packages/client/src/pages/Videos/VideosPage.jsx` — 신규. `/teacher/videos`.
- `packages/client/src/pages/Videos/ClassroomVideoWatch.jsx` — 신규. 시청 화면.
- `packages/client/src/App.jsx`, `layouts/DashboardLayout.jsx`, `pages/Classrooms/ClassroomDetail.jsx` — 수정. 라우트/사이드바/탭.
- `.claude/PROJECT_MAP.md`, `CLAUDE.md` — 수정.

---

## Task 1: 공용 타입 정의

**Files:** Create `packages/shared/src/types/video.ts`, Modify `packages/shared/src/index.ts`

- [x] **Step 1:** 설계서의 데이터 모델을 그대로 인터페이스로 옮긴다. `Video.createdByName?`(목록 조인용), `ClassroomVideo.video` + `commentCount`, `ClassroomVideoDetail.classroom/siblings`, `VideoComment.author{id,name,avatarUrl,role}`, `VideoCommentThread.replies`.
- [x] **Step 2:** `index.ts`에 `export * from './types/video.js';` 추가.
- [x] **Step 3:** `npx tsc -b packages/server/tsconfig.json` 통과 확인.

## Task 2: DB 스키마 + 기동 마이그레이션

**Files:** Modify `schema.ts`, `startupMigrate.ts`

- [x] **Step 1:** `videos`(fileSize는 `bigint(..., { mode: 'number' })`), `classroomVideos`(`videoId` → `onDelete: 'restrict'`, unique `(classroomId, videoId)`, index `(classroomId, position)`), `videoComments`(`parentId` self-FK cascade, index `(classroomVideoId, createdAt)`/`(parentId)`).
- [x] **Step 2:** `startupMigrate.ts` 끝에 `CREATE TABLE IF NOT EXISTS` ×3 + `CREATE (UNIQUE) INDEX IF NOT EXISTS`. 프로덕션은 내부 전용 DATABASE_URL 이라 기동 시 DDL 이 유일한 적용 경로다.
- [x] **Step 3:** 로컬 PostgreSQL(`initdb` + `drizzle-kit push`)에서 기동 로그 `startup migration: videos / classroom_videos / video_comments ensured` 확인.

## Task 3: 스토리지 스트리밍 (업로드/서빙/Range)

**Files:** Modify `storage.service.ts`, `routes/storage.ts`

- [x] **Step 1:** `uploadStream(bucket, dir, fileName, readable, isTruncated?)` — `pipeline(source, createWriteStream)` 후 `isTruncated()` 가 true 면 413 throw + 부분 파일 `unlink`. busboy 는 한도 초과 시 오류 없이 `file.truncated=true` 로 스트림을 끝내므로 **pipeline 완료 후** 검사한다.
- [x] **Step 2:** `statFile`(size+mime), `openFileStream(bucket, path, {start,end}?)`, `getMimeType`에 `.mp4/.m4v/.webm/.mov/.ogv/.mp3`.
- [x] **Step 3:** `parseRange(header, size)` 순수 함수 — 단일 `bytes=a-b` / `bytes=a-` / `bytes=-N`, 범위 밖이면 `'unsatisfiable'`.
- [x] **Step 4:** `GET /api/files/*` 를 `serveFile` 로 교체: `Accept-Ranges: bytes`, `Content-Length`, Range 면 206 + `Content-Range`, 416 시 `Content-Range: bytes */size`. 기존 CSP/강제 다운로드/캐시 헤더 로직 유지.
- [x] **Step 5:** HEAD — Fastify 자동 HEAD(`exposeHeadRoutes`)는 payload 가 `undefined` 면 `Content-Length` 를 0 으로 덮어쓴다 → `reply.send(Readable.from([]))` 로 빈 스트림 전송(명시적 `app.head` 등록은 중복 선언 오류). 
- [x] **Step 6:** curl 검증 — 200 전체 / 206 100바이트 일치 / 416 / suffix / HEAD 길이 / HTML 도구 `frame-ancestors https://class.chois.pro`.

## Task 4: 라이브러리 서비스 + 라우트

**Files:** Create `services/video.service.ts`, `routes/videos.ts`; Modify `app.ts`

- [x] **Step 1:** 서비스 — `profiles` leftJoin 으로 `createdByName`, `listVideos`(q ilike title/description + 3단계 필터 + 페이지네이션 + count), `getVideoFacets`, `getVideoUsage`(classroom_videos ⨝ classrooms), `removeVideo`(usage 있으면 `{statusCode:409, usage}` throw, 아니면 레코드→파일·썸네일 삭제), `removeVideoFiles`.
- [x] **Step 2:** 업로드 라우트 `POST /api/videos/upload?kind=video|thumbnail` — `req.file({ limits: { fileSize } })`(영상 2GB/썸네일 5MB), MIME 화이트리스트(+확장자 fallback `.mp4/.m4v/.webm/.mov`), 거부 시 `part.file.resume()` 후 400, `uploadStream` → `{url,fileName,fileSize,mimeType}`, 413 메시지.
- [x] **Step 3:** CRUD — zod `videoBody`, `videoUrl/thumbnailUrl` 은 `videos` 버킷만 허용(400), PATCH 시 교체된 이전 파일 정리, DELETE 409 응답에 `usage` 포함.
- [x] **Step 4:** `app.ts` 에 `videoRoutes` 등록. `/api/videos/facets` 가 `/:id` 보다 먼저 매칭되는지(정적 > 파라미터) 확인.

## Task 5: 학급 배정 + 댓글 서비스/라우트 + 소켓

**Files:** Create `services/classroomVideo.service.ts`, `routes/classroomVideos.ts`, `socket/handlers/videos.ts`; Modify `socket/index.ts`, `app.ts`

- [x] **Step 1:** 서비스 — `classroomVideoSelect`(videos ⨝ + 서브쿼리 `commentCount` = 루트 댓글 수), `addClassroomVideo`(max position+1, unique 위반 → 409; drizzle 0.44 는 `DrizzleQueryError` 로 감싸므로 `err.cause?.code === '23505'` 도 검사), `reorderClassroomVideos`(트랜잭션), `getClassroomVideoDetail`(classroom + siblings).
- [x] **Step 2:** 댓글 — `listCommentThreads(cvId, viewer)`: 루트 desc 조회 → 학생이면 `!isPrivate || authorId === viewer.id` 필터 → 대댓글 `inArray(parentId, rootIds)` 묶기. `createComment/updateComment/removeComment`.
- [x] **Step 3:** 라우트 가드 `canAccessClassroom`(교사=소유자, 학생=구성원). 댓글 POST: `isPrivate = !isTeacher && body.isPrivate`; `parentId` 있으면 같은 cv 인지, 루트인지(대댓글의 대댓글 400), 타인 비공개 스레드면 403, 공개 범위 상속. PATCH 작성자만, DELETE 작성자 또는 교실 소유 교사.
- [x] **Step 4:** 소켓 — `ROOM_PATTERNS.video = /^video:([\w-]+)$/`, `validateRoomAccess` 에 classroom_videos → 교실 소유/구성원 검사. 쓰기 후 `emitVideoCommentChanged(io, cvId)`(`getIO()` 실패는 무시).
- [x] **Step 5:** curl E2E 55개 통과(권한·가시성·cascade·파일 삭제 포함). `scratchpad/e2e/run.sh` 참조.

## Task 6: 클라이언트 순수 로직 (TDD)

**Files:** Create `lib/videoPlayer.js(+test)`, `lib/videos.js(+test)`

- [x] **Step 1:** 실패 테스트 작성 — SEEK_STEPS `[10,20,30,60]`, PLAYBACK_RATES 0.7~2.5(11단계), `normalizeSettings` 클램프, localStorage 라운드트립/손상 복구, `stepRate` 경계, `formatTime`(h:mm:ss), 이어보기 저장/끝부분 제거, `isTypingTarget`; `buildVideoQuery`, `formatBytes`, `formatDuration`.
- [x] **Step 2:** 구현 후 `npx vitest run` 통과(신규 11개, 전체 67개).
- [x] **Step 3:** `videos.js` — API 래퍼(라이브러리/배정/댓글), `uploadVideoFile(file, kind, onProgress)`(XHR `upload.onprogress`, 401 시 `refreshToken()` 후 1회 재시도), `probeVideoDuration`, `captureVideoThumbnail(file, atSec?)`(`<video>`→`<canvas>` JPEG 0.85, 폭 640 축소).

## Task 7: VideoPlayer 컴포넌트

**Files:** Create `components/videos/VideoPlayer.jsx`

- [x] **Step 1:** 상태 — settings(localStorage), playing/currentTime/duration/buffered, showSettings, controlsVisible(2.5초 자동 숨김), fullscreen, flash(0.9초 피드백), error.
- [x] **Step 2:** 조작 — `togglePlay/seekBy/seekTo/changeVolume/toggleMute/changeRate/toggleFullscreen`(iOS `webkitEnterFullscreen` fallback). 설정 갱신은 `settingsRef` 미러를 통해 동기적으로(렌더 중 ref 쓰기 금지 — react-hooks v7 `refs` 규칙).
- [x] **Step 3:** window `keydown`: `←/→` ±seekStep, `↑/↓` ±5% 볼륨, Space/K, M, F, `,`/`.` 배속, `0~9` %, Esc 설정 닫기. `isTypingTarget` 이면 무시, Ctrl/Meta/Alt 조합 무시.
- [x] **Step 4:** UI — 탐색 바(buffered/progress + range input), 뒤로/앞으로(설정 초 표기), 볼륨 슬라이더, 시간, 배속 배지, ⚙ 패널(이동 시간 4개 / 배속 11개 / 단축키 안내), 전체화면. `ref` 로 `getCurrentTime/seekTo/pause` 노출.
- [x] **Step 5:** `loadedmetadata` 시 설정 적용 + 이어보기(마지막 5초 이내면 제외), `timeupdate` 5초 간격 저장, pause/ended/unmount 저장.

## Task 8: 라이브러리 UI

**Files:** Create `VideoPreviewModal.jsx`, `VideoForm.jsx`, `VideoPickerModal.jsx`, `pages/Videos/VideosPage.jsx`

- [x] **Step 1:** `VideoForm` — 파일 선택 시 2GB 클라이언트 선검사, `probeVideoDuration` + `captureVideoThumbnail` 병렬, 제목 비어 있으면 파일명 자동 채움, [다른 장면으로] 재캡처, 업로드 단계 안내 + 진행률 바, 수정 모드(파일 교체 선택).
- [x] **Step 2:** `VideosPage` — `VisualizationsPage` 패턴 + 썸네일 열 + 길이/용량/등록자 + **내 자료/전체 교사 자료** 토글. 수정/삭제 버튼은 `createdBy === user.id || isAdmin` 만 노출(서버도 403). 삭제 409 메시지(배정 학급 안내) alert.
- [x] **Step 3:** `VideoPreviewModal` — 같은 `VideoPlayer`(`storageKey=lib:<id>`, autoPlay), Esc 닫기.
- [x] **Step 4:** `VideoPickerModal` — 전체 교사 자료 검색/필터 + "내 자료만" + 이미 배정된 항목 [배정됨] 비활성 + [새 영상 등록] → `VideoForm` → `onSelect`.

## Task 9: 학급 [영상] 탭 + 시청 화면 + 댓글

**Files:** Create `ClassroomVideoTab.jsx`, `VideoComments.jsx`, `pages/Videos/ClassroomVideoWatch.jsx`

- [x] **Step 1:** `ClassroomVideoTab` — 카드 그리드(썸네일 16:9 + 길이 배지 + 댓글 수), 교사: [영상 추가]→피커, dnd-kit `rectSortingStrategy` 드래그 정렬 → `reorder`, 메모 편집, 배정 해제(confirm: 댓글도 삭제됨 안내). 클릭 → `/{role}/classrooms/:cid/videos/:cvId`.
- [x] **Step 2:** `VideoComments` — 작성란(학생에게만 ☐ 교사만 확인, [현재 시각 첨부]), 최신/오래된순, 스레드(비공개는 amber 배경 + 🔒 배지, 교사 배지, 시각 배지 클릭 → `onSeek`), 답글/수정(본인)/삭제(본인 또는 교사). `subscribeToRoom('video:<cvId>','video-comment:changed')` 로 재조회.
- [x] **Step 3:** `ClassroomVideoWatch` — 데이터 로드는 `useCallback(load)` + effect(effect 본문에서 직접 setState 금지 — `set-state-in-effect` 규칙), 플레이어(`storageKey=cv:<id>`), 제목/단원/길이, 교사 메모(선생님 안내), 설명, 댓글, 우측(xl↑) 같은 학급 다른 영상 목록.

## Task 10: 라우팅·사이드바·탭 연결

**Files:** Modify `App.jsx`, `DashboardLayout.jsx`, `ClassroomDetail.jsx`

- [x] **Step 1:** `App.jsx` — lazy `VideosPage`/`ClassroomVideoWatch`, 교사 `/teacher/videos` + `/teacher/classrooms/:classroomId/videos/:cvId`, 학생 `/student/classrooms/:classroomId/videos/:cvId` (모두 DashboardLayout 안).
- [x] **Step 2:** TeacherSidebar "시각화자료" 아래 "영상자료"(`Clapperboard`).
- [x] **Step 3:** ClassroomDetail 탭 배열에 `{ key:'videos', label:'영상', Icon: Clapperboard }`(과제 다음) + `<ClassroomVideoTab classroomId isTeacher />` Suspense 렌더.

## Task 11: 정적 검증

- [x] `npx tsc -b packages/server/tsconfig.json` 0 오류.
- [x] `npx eslint <신규/수정 파일>` 0 오류(레포 기존 경고 35건은 별건).
- [x] `npx vitest run` 67 통과.
- [x] `npx vite build` 성공.

## Task 12: 동적 검증 (로컬 E2E)

- [x] **Step 1:** 로컬 PostgreSQL(`/usr/lib/postgresql/16`, `/tmp/pgdata`, 포트 5433) + `drizzle-kit push` + `seed:test` 계정 + 서버 `tsx --env-file=.env`.
- [x] **Step 2:** curl E2E 55/55 — 업로드 거부(형식/학생)·한글 파일명, Range/HEAD/416, CSP 도메인, 라이브러리 CRUD/검색/facets, 배정 중복 409, 삭제 차단 409 + usage, 비구성원 403, 댓글 공개/비공개 가시성·상속·권한, 배정 해제 cascade, 파일 삭제 404.
- [x] **Step 3:** Playwright 스모크 13/13 — 등록(썸네일 캡처·제목 자동) → 미리보기 단축키(+10초/볼륨/배속 1.1 적용) → 설정 패널(30초·2.5× localStorage) → 학급 배정 → 교사 댓글(비공개 체크박스 없음) → 학생 비공개 댓글+시각 첨부 → 교사 실시간 수신·답글 → 학생 실시간 수신 → 제3 학생에게 비공개 미노출. 스크린샷 `scratchpad/e2e/0*.png`.
- [x] **Step 4:** 문서 갱신 — `PROJECT_MAP.md`(구조/라우트/모델/주의사항), `CLAUDE.md`, 설계서 상태.

## Task 13: 배포 후 검증 (미완)

- [ ] **Step 1:** Railway 배포 후 기동 로그에 `videos / classroom_videos / video_comments ensured` 확인.
- [ ] **Step 2:** 시각화자료 미리보기가 다시 보이는지(CSP `frame-ancestors https://class.chois.pro`) 확인. 여전히 목록이 비면 `railway variables`(`VOLUME_PATH`, `VITE_TOOLS_ORIGIN`)·`railway ssh` 로 `$VOLUME_PATH/visualizations/library` 확인.
- [ ] **Step 3:** 실제 수업 영상(수백 MB~1.5GB) 업로드로 Railway 프록시 타임아웃/본문 한도 실측. 실패 시 `MAX_VIDEO_BYTES` 하향 또는 분할 업로드 검토.
- [ ] **Step 4:** 태블릿(Galaxy Tab/iPad) 에서 전체화면·배속·키보드(블루투스) 동작 확인. iPad Safari 는 `webkitEnterFullscreen` 경로.
- [ ] **Step 5:** Volume 용량 모니터링(영상은 삭제 전까지 보존 — 라이브러리 페이지의 용량 열로 정리 유도).

## Task 14: 후속 과제 (subagent 병렬 구현 — 2026-10-17)

> 진행 방식: 공통 스키마(`video_progress`, `video_comment_reads`)와 공유 타입을 먼저 커밋(`6c0f34c`)한 뒤, 파일 소유 범위를 나눈 3개 subagent(시청 기록 / 배정 해제 후 삭제 / 챕터 페이지 영상 삽입)를 병렬로 돌리고, 겹치는 파일이 많은 미읽음 배지는 머지 후 4번째 subagent 로 구현했다. 각 agent 는 커밋하지 않고 tsc/eslint/vitest + 로컬 curl 로 자체 검증, 호출자가 합쳐진 트리에서 재검증(tsc·lint·vitest·vite build·curl E2E 55·Playwright 13) 후 커밋.

- [x] **학생별 시청 기록 + 교사 시청률** — `PUT/GET /api/classroom-videos/:id/progress`(학생), `GET …/progress/summary`(교사), `GET /api/classrooms/:cid/videos/progress`(학생: 본인 맵 / 교사: 통계 맵). `VideoPlayer` `onProgress`(10초 간격 + pause/ended/unmount)·`initialPosition`. 시청 화면 교사용 "시청 현황" 패널, 학급 탭 카드에 진도 바(학생)/시청·완료 수(교사). 완료 기준 90%.
- [x] **배정 해제 후 삭제 원클릭** — `DELETE /api/videos/:id?force=1`(트랜잭션으로 모든 학급 배정 해제 후 삭제). 409 응답의 `usage` 를 클라이언트 `ApiError.body` 로 전달해 confirm 후 force 재호출.
- [x] **챕터/과제 페이지에 라이브러리 영상 삽입** — 편집기 영상 버튼이 "YouTube 링크 / 영상자료에서 선택" 선택 모달. `components/videos/PageVideo.jsx`(`PageVideoEmbed`/`PageVideoThumb`)가 YouTube iframe 또는 `VideoPlayer`(hotkeys off — 필기 도구와 키 충돌 방지)를 렌더하며 뷰어 7곳 + `SortablePageItem` 에 적용. 서버 `utils/videoUrl.ts` 로 `videoUrl` 검증(YouTube 또는 `/api/files/videos/library/` 만, 아니면 400).
- [x] **댓글 미읽음 배지** — `video_comment_reads`(lastSeenAt). `POST /api/classroom-videos/:id/seen`, `GET /api/classrooms/:cid/videos/unread`, `GET /api/videos/unread`. 카운트는 `listCommentThreads` 와 동일한 가시성 규칙(학생: 공개 스레드 + 본인 비공개 스레드의 교사 답글)으로 SQL 1회 집계. 시청 화면 진입/갱신 시 읽음 처리 → 학급 탭 카드·'영상' 탭·사이드바(학급별 + 교사 "영상자료" 총합) 배지.
- [x] (부수) zod 검증 실패를 500 → 400 으로 매핑(`app.ts` setErrorHandler).
- [ ] 서버 측 썸네일/트랜스코딩(ffmpeg)·HLS — 브라우저가 mov(H.264 외 코덱)를 못 여는 경우 대비. Docker 이미지에 ffmpeg 추가가 필요해 보류.
