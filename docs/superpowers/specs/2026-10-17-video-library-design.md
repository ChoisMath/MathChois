# 영상자료 라이브러리 + 학급 영상 탭 (Video Library) — 설계

작성일: 2026-10-17
상태: 설계 초안 → 질의응답으로 확정 후 구현

## 배경 / 문제

현재 챕터 페이지의 "영상"은 **YouTube 링크 임베드**만 지원한다(`pages.videoUrl`에 YouTube URL 저장).
교사가 직접 촬영·편집한 수업 영상을 플랫폼 안에 올려 두고 재사용하거나, 학급별로 골라 배포하고,
학생이 그 영상에 대해 질문(댓글)하는 흐름이 없다.

## 목표

1. 교사 워크스페이스(햄버거 사이드바)에 **[영상자료]** 메뉴를 추가한다.
2. 교사가 등록한 영상은 **시각화자료와 같이 모든 교사가 공유**한다(검색·학급 배정 가능). 수정/삭제는 소유자만.
3. 영상 파일은 **Railway Volume**에 저장하고, 메타(**제목·과목·대단원·소단원·설명**)를 함께 기록한다.
4. [미리보기] 클릭 시 **자체 플레이어**로 재생된다.
   - ↑/↓ 방향키: 볼륨 조절, ←/→ 방향키: 설정된 시간만큼 뒤로/앞으로 이동.
   - 설정(⚙) 패널: 방향키 이동 시간 **10/20/30/60초** 선택, 재생속도 **0.7×~2.5×**.
5. 학급 상세(`/teacher/classrooms/:id`, `/student/classrooms/:id`)에 **[영상] 탭**을 추가한다.
   교사는 영상자료 라이브러리에서 해당 학급에 필요한 영상을 골라 배정한다.
   학생이 클릭하면 **YouTube 시청 화면과 유사한 UI**(상단 플레이어 + 아래 댓글)로 보고 질문을 남길 수 있다.
   - 댓글에 **"교사만 확인"** 옵션 → 그 댓글 스레드(댓글+대댓글)는 작성 학생과 교사만 볼 수 있다(1:1 질의응답).
   - 재생창은 4번 기능을 모두 포함한다.

### 비목표 (Out of scope, v1)

- 서버 측 트랜스코딩/HLS 분할(브라우저가 직접 재생 가능한 mp4/webm 원본을 그대로 서빙).
- 챕터 페이지(`pages.videoUrl`)와의 통합 — 챕터 영상은 기존 YouTube 방식 유지.
- 영상 내부 편집(자르기 등). 수정은 **파일 교체 / 메타 수정**만.

## 핵심 설계 결정

| 결정 | 선택 | 비고 |
|---|---|---|
| 라이브러리 ↔ 학급 연결 | **참조(reference)** | 시각화자료는 "복사본"이지만 영상은 용량이 커서 복제 불가. `classroom_videos`가 `videos`를 FK로 참조. |
| 라이브러리 영상 삭제 시 학급 배정이 있으면 | **❓ Q1** 차단(권장) / 연쇄 삭제 | 차단: 배정된 학급 목록을 보여주고 배정 해제 후 삭제. 연쇄: 학급 탭·댓글까지 함께 삭제. |
| 업로드 방식 | **전용 스트리밍 업로드 라우트** `POST /api/videos/upload` | 기존 `/api/files/upload`는 파일 전체를 메모리 Buffer 로 모으므로 수백 MB 영상에 부적합. 디스크로 직접 pipe. |
| 업로드 한도/형식 | **❓ Q2** mp4·webm·mov, 기본 2GB | Railway Volume 용량과 프록시 타임아웃 고려. |
| 서빙 | `GET /api/files/*`를 **스트리밍 + HTTP Range(206)** 로 개선 | 현재는 전체 Buffer 읽기 → 탐색(seek) 불가·메모리 과다. Range 지원이 있어야 `<video>` 가 탐색·배속 재생 가능. 모든 버킷에 공통 적용(동작 동일, 메모리만 절감). |
| 썸네일 | **클라이언트에서 캡처** (업로드 전 `<video>`→`<canvas>` JPEG) | 서버 ffmpeg 불필요. 길이(duration)도 클라이언트가 읽어 메타로 저장. |
| 플레이어 | 자체 React 컴포넌트 `VideoPlayer` (native `<video>` + 커스텀 컨트롤) | 키보드 단축키·설정 패널·배속은 브라우저 기본 컨트롤로는 불가. 설정은 `localStorage`(`mc_video_player`)에 기기별 저장. |
| 댓글 구조 | 루트 댓글 + 1단계 대댓글 | `parentId`는 루트 댓글만 가리킨다(깊이 1). |
| "교사만 확인" 범위 | 루트 댓글의 `isPrivate` 가 스레드 전체에 적용 | 대댓글은 루트의 공개 범위를 상속. 교사는 모든 스레드를 본다. 학생은 공개 스레드 + 본인이 쓴 비공개 스레드만. |
| 댓글 권한 | **❓ Q3** | 권장: 본인 댓글 수정/삭제 가능 + 담당 교사는 모든 댓글 삭제 가능. |
| 시청 기록(이어보기/진도) | **❓ Q4** v1 제외 권장 | v1은 기기 로컬(localStorage)에 마지막 재생 위치만 저장. DB 저장 + 교사 진도 확인은 후속. |
| 실시간 | Socket.IO room `video:{classroomVideoId}` → `video-comment:changed` 이벤트 시 클라이언트 재조회 | 비공개 스레드 필터링은 서버 조회에서만 수행되므로 이벤트에는 본문을 싣지 않는다(권한 누수 방지). |
| 학급 탭 정렬 | `position` + 드래그 정렬(dnd-kit, 챕터 카드와 동일) | |

## 데이터 모델 (Drizzle `schema.ts` + `startupMigrate.ts` 멱등 DDL)

### `videos` — 영상자료 라이브러리(교사 간 공유)
| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | uuid PK | |
| `createdBy` | uuid → profiles (cascade) | 소유자 |
| `title` | text NOT NULL | |
| `subject` / `majorUnit` / `minorUnit` | text | 문제은행·시각화자료와 동일 3단계 분류 |
| `description` | text | |
| `videoUrl` | text NOT NULL | `videos` 버킷 (`/api/files/videos/library/<ts>_<name>.mp4`) |
| `thumbnailUrl` | text | `videos` 버킷 `thumbnails/` (JPEG) |
| `mimeType` | text | `video/mp4` 등 |
| `fileSize` | bigint | 바이트 |
| `durationSec` | integer | 클라이언트가 측정, 없으면 null |
| `createdAt` / `updatedAt` | timestamptz | |

인덱스: `(createdBy)`, `(subject, majorUnit, minorUnit)`.

### `classroom_videos` — 학급에 배정된 영상
| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | uuid PK | |
| `classroomId` | uuid → classrooms (cascade) | |
| `videoId` | uuid → videos (**Q1**: restrict 또는 cascade) | |
| `addedBy` | uuid → profiles (set null) | |
| `note` | text | 학급용 안내 메모(선택) |
| `position` | integer default 0 | |
| `createdAt` | timestamptz | |

unique `(classroomId, videoId)`, 인덱스 `(classroomId, position)`.

### `video_comments` — 영상 댓글/대댓글
| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | uuid PK | |
| `classroomVideoId` | uuid → classroom_videos (cascade) | 댓글은 **학급별 배정 단위**에 달린다(같은 영상이라도 학급마다 별도 댓글). |
| `authorId` | uuid → profiles (cascade) | |
| `parentId` | uuid → video_comments (cascade), null | 루트 댓글만 가리킴(깊이 1) |
| `content` | text NOT NULL | |
| `isPrivate` | boolean default false | 루트 댓글에만 의미. "교사만 확인" |
| `timestampSec` | integer null | 댓글에 첨부한 영상 시각(클릭하면 그 위치로 이동) |
| `createdAt` / `updatedAt` | timestamptz | |

인덱스 `(classroomVideoId, createdAt)`, `(parentId)`.

## 스토리지

- **새 버킷 `videos`** — 교사 전용 업로드. MIME 화이트리스트: `video/mp4`, `video/webm`, `video/quicktime`, `video/x-m4v` + 썸네일 `image/jpeg|png|webp`.
- `storage.service.ts`
  - `getMimeType`에 `.mp4/.webm/.mov/.m4v/.ogv` 추가.
  - `statFile(bucket, path)` + `createReadStream(bucket, path, {start,end})` 추가 (스트리밍 서빙용).
  - `uploadStream(bucket, directory, fileName, readable)` 추가 (디스크 직접 기록, 실패/초과 시 임시파일 정리).
- `routes/storage.ts` `GET /api/files/*`
  - `fs.stat` → `Accept-Ranges: bytes`, `Content-Length`.
  - `Range: bytes=a-b` 요청이면 206 + `Content-Range`, 잘못된 범위는 416.
  - 기존 CSP(frame-ancestors)·강제 다운로드·캐시 헤더 동작은 그대로.

## 서버 API

### 영상자료 라이브러리 — `routes/videos.ts` (모두 `authenticate` + 교사)
| 메서드 | 경로 | 권한 | 설명 |
|---|---|---|---|
| GET | `/api/videos` | 교사 | 목록. `q`(제목/설명) + `subject/majorUnit/minorUnit` + 페이지네이션. 기본 전체 공유, `mine=1` 본인만. |
| GET | `/api/videos/facets` | 교사 | 과목/단원 옵션 |
| GET | `/api/videos/:id` | 교사 | 단건 (+ `usage`: 배정 학급 수) |
| POST | `/api/videos/upload?kind=video\|thumbnail` | 교사 | **스트리밍 업로드**. 한도 초과 413. 응답 `{url, fileName, fileSize, mimeType}` |
| POST | `/api/videos` | 교사 | 등록(메타 + `videoUrl` + `thumbnailUrl` + `fileSize/mimeType/durationSec`) |
| PATCH | `/api/videos/:id` | 소유자/관리자 | 메타 수정, 파일/썸네일 교체(이전 파일 정리) |
| DELETE | `/api/videos/:id` | 소유자/관리자 | 레코드 + 파일 + 썸네일 삭제. **Q1** 배정 중이면 409 + 학급 목록 |

### 학급 영상 — `routes/classroomVideos.ts`
| 메서드 | 경로 | 권한 | 설명 |
|---|---|---|---|
| GET | `/api/classrooms/:cid/videos` | 교실 소유 교사 / 소속 학생 | 배정 목록(영상 메타 조인, 댓글 수, position 순) |
| POST | `/api/classrooms/:cid/videos` | 소유 교사 | `{videoId, note?}` 배정 (중복 409) |
| PATCH | `/api/classrooms/:cid/videos/reorder` | 소유 교사 | `{ids: []}` 순서 저장 |
| PATCH | `/api/classroom-videos/:id` | 소유 교사 | `note` 수정 |
| DELETE | `/api/classroom-videos/:id` | 소유 교사 | 배정 해제(댓글 cascade) |
| GET | `/api/classroom-videos/:id` | 소유 교사 / 소속 학생 | 시청 화면용 상세(영상 메타 + 학급 + 같은 학급의 다른 영상 목록) |
| GET | `/api/classroom-videos/:id/comments` | 소유 교사 / 소속 학생 | 스레드 목록. **학생은 공개 스레드 + 본인 비공개 스레드만** |
| POST | `/api/classroom-videos/:id/comments` | 소유 교사 / 소속 학생 | `{content, parentId?, isPrivate?, timestampSec?}`. 대댓글은 루트 스레드 접근 권한 검사 |
| PATCH | `/api/video-comments/:id` | 작성자 | `content` 수정 |
| DELETE | `/api/video-comments/:id` | 작성자 / 교실 소유 교사 | 루트 삭제 시 대댓글 cascade |

- 모든 쓰기 후 `io.to('video:{classroomVideoId}').emit('video-comment:changed', {classroomVideoId})`.
- Socket room 패턴 `video:{classroomVideoId}` 추가(`socket/index.ts` `validateRoomAccess`: 교실 소유 교사 또는 소속 학생).

### 공유 타입 — `shared/src/types/video.ts`
`Video`, `VideoListResult`, `VideoFacets`, `VideoFilters`, `ClassroomVideo`, `ClassroomVideoDetail`, `VideoComment`, `VideoCommentThread`, `VideoPlayerSettings`.

## 클라이언트

### 1) 사이드바/라우트
- `DashboardLayout.jsx` TeacherSidebar: "시각화자료" 아래 **"영상자료"** (lucide `Clapperboard`).
- `App.jsx`
  - 교사: `/teacher/videos` (라이브러리 관리), `/teacher/classrooms/:classroomId/videos/:cvId` (시청/댓글 — 교사 화면)
  - 학생: `/student/classrooms/:classroomId/videos/:cvId` (시청/댓글)
  - 모두 `DashboardLayout` 안(전체화면 필기 뷰어가 아니므로).

### 2) 라이브러리 관리 — `pages/Videos/VideosPage.jsx`
`VisualizationsPage` 패턴. 카드/표 목록(썸네일·제목·과목·단원·길이·등록자·등록일), [미리보기]/[수정]/[삭제].
상단 토글 **내 자료 / 전체 교사 자료**(공유 자료 탐색). [새 영상 등록] → `VideoForm`.

### 3) 등록 폼 — `components/videos/VideoForm.jsx`
파일 선택(video/*) → 즉시 로컬에서 `duration` 측정 + 썸네일 자동 캡처(1초 지점 프레임, 사용자가 "다른 장면" 버튼으로 재캡처 가능) →
제목/과목/대단원/소단원/설명 → [등록] 시 **업로드 진행률 바**(XHR `upload.onprogress`) → 썸네일 업로드 → 레코드 생성.
수정 모드: 메타만 또는 파일 교체.

### 4) 플레이어 — `components/videos/VideoPlayer.jsx` (+ `lib/videoPlayer.js`)
- native `<video>` + 커스텀 컨트롤 바: 재생/일시정지, 탐색 바(버퍼 표시), 현재/전체 시간, 볼륨 슬라이더+음소거, 배속 배지, ⚙ 설정, 전체화면.
- **키보드**(입력창에 포커스가 있을 때는 무시):
  - `←`/`→` : −/+ `seekStep`초 (기본 10초, 설정 10/20/30/60)
  - `↑`/`↓` : 볼륨 ±5%
  - `Space`/`K` 재생·일시정지, `M` 음소거, `F` 전체화면, `,`/`.` 배속 한 단계 내림/올림, `0~9` 해당 % 위치로 이동
- **⚙ 설정 패널**: 방향키 이동 시간(10/20/30/60초), 재생속도(0.7 0.8 0.9 1.0 1.1 1.25 1.5 1.75 2.0 2.25 2.5).
- 조작 시 화면 중앙에 1초간 피드백 오버레이("+10초", "볼륨 60%", "1.5×").
- 설정은 `localStorage['mc_video_player']`에 저장(기기별 유지). 마지막 재생 위치는 `localStorage['mc_video_pos:<id>']`(Q4 v1).
- 라이브러리 [미리보기] 모달(`VideoPreviewModal`)과 학급 시청 화면이 **같은 컴포넌트**를 쓴다.

### 5) 학급 [영상] 탭 — `components/videos/ClassroomVideoTab.jsx`
- `ClassroomDetail.jsx` 탭 배열에 `{ key:'videos', label:'영상', Icon: Clapperboard }` 추가(과제 다음).
- 카드 그리드(썸네일 16:9 + 길이 배지, 제목, 단원, 댓글 수). 클릭 → 시청 화면.
- 교사: 헤더 [영상 추가] → `VideoPickerModal`(라이브러리 검색·선택 + [새 영상 등록]) → 배정. 카드 드래그 정렬, 메모 수정, 배정 해제.

### 6) 시청 화면 — `pages/Videos/ClassroomVideoWatch.jsx`
YouTube 레이아웃: 좌측(또는 상단) 플레이어 + 제목/단원/설명/교사 메모, 우측(넓은 화면) 같은 학급의 다른 영상 목록.
아래 **댓글 영역**(`components/videos/VideoComments.jsx`):
- 작성란: textarea + [현재 시각 첨부](`timestampSec`) + 학생에게만 **☐ 교사만 확인** 체크박스.
- 스레드 목록(최신/오래된 순 토글): 작성자 이름·역할 배지(교사), 시각 배지(클릭 → 이동), 🔒 "교사만 확인" 배지, [답글]/[수정]/[삭제].
- Socket `video:{cvId}` 구독 → `video-comment:changed` 시 재조회.

## 흐름

1. **등록**: 파일 선택 → duration/썸네일 측정 → `POST /api/videos/upload?kind=video`(진행률) → `?kind=thumbnail` → `POST /api/videos`.
2. **학급 배정**: 학급 [영상] 탭 [영상 추가] → 피커에서 선택 → `POST /api/classrooms/:cid/videos`.
3. **시청/질문**: 카드 클릭 → `/…/videos/:cvId` → 플레이어 + 댓글. 학생이 "교사만 확인" 체크 후 질문 → 교사 화면에만 표시 → 교사가 답글(스레드 비공개 상속).

## 엣지케이스

- 업로드 중 한도 초과 → 임시파일 삭제, 413. 업로드 도중 이탈 → `onResponse`/stream error 에서 부분 파일 삭제.
- Range 요청이 파일 범위를 벗어나면 416. HEAD 요청 지원(일부 브라우저가 길이 확인).
- 학생이 비공개 스레드가 아닌 루트에 "교사만 확인"으로 대댓글을 달 수 없다(대댓글은 루트 설정 상속, 요청 값 무시).
- 다른 학생의 비공개 스레드에 대댓글 시도 → 403.
- 라이브러리 영상의 소유자가 아닌 교사가 자기 학급에 배정한 뒤 소유자가 영상을 삭제하려는 경우 → **Q1**.
- 교실 소유 교사가 아닌 교사(공유 교사)는 학급 영상/댓글에 접근 불가.

## 테스트

- Vitest(클라이언트): `lib/videos.test.js`(쿼리 빌드, 포맷), `lib/videoPlayer.test.js`(설정 로드/저장 클램프, 배속 단계, 시간 포맷).
- 서버: `tsc` 타입체크. Range 파서는 순수 함수로 분리(`parseRange`).
- 수동 E2E: 등록 → 미리보기(방향키/설정) → 학급 배정 → 학생 시청 → 비공개 댓글이 다른 학생에게 안 보임 → 교사 답글 → 실시간 갱신.

## 영향받는 파일 요약

**서버**: `db/schema.ts`, `db/startupMigrate.ts`, `routes/videos.ts`(신규), `routes/classroomVideos.ts`(신규), `services/video.service.ts`(신규), `services/videoComment.service.ts`(신규), `services/storage.service.ts`(스트리밍), `routes/storage.ts`(Range), `socket/index.ts`(room), `socket/handlers/videos.ts`(신규), `app.ts`.
**공유**: `shared/src/types/video.ts`(신규), `index.ts`.
**클라이언트**: `lib/videos.js`, `lib/videoPlayer.js`(+tests), `components/videos/{VideoForm,VideoPlayer,VideoPreviewModal,VideoPickerModal,ClassroomVideoTab,VideoComments}.jsx`, `pages/Videos/{VideosPage,ClassroomVideoWatch}.jsx`, `App.jsx`, `layouts/DashboardLayout.jsx`, `pages/Classrooms/ClassroomDetail.jsx`.
