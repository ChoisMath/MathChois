# 영상자료 자막 (Video Subtitles) — 설계

작성일: 2026-10-22
상태: 질의응답으로 확정(형식 SRT+VTT · 모든 재생 화면 · 플레이어 표시만 · 접근안 A) → 구현 완료 (2026-10-23)

## 배경 / 문제

영상자료 라이브러리(`videos`, 2026-10-17 설계)는 자체 `VideoPlayer`로 재생되지만 자막이 없다.
교사는 Vrew·CapCut·Premiere 등에서 자막을 따로 만들어 두었다가, 영상 정보 화면에서 그 파일을 올려
학생이 자막과 함께 시청하게 하고 싶다. 지금은 **한국어 하나**만 올리지만, 나중에는 번역 자막(영어 등)도
같은 영상에 추가할 수 있어야 한다.

## 목표

1. 영상자료 등록/수정 폼에서 **한국어 자막 파일(.srt / .vtt)** 을 올리고, 교체하고, 삭제한다.
2. 라이브러리 영상이 재생되는 **모든 화면**에서 자막을 보여 준다.
   - 라이브러리 [미리보기] 모달(`VideoPreviewModal`)
   - 학급 시청 화면(`ClassroomVideoWatch`)
   - 영상 2분할 필기 화면(`ClassroomVideoSplit`)
   - 챕터/과제 페이지 임베드(`PageVideoEmbed`, 라이브러리 URL인 경우)
3. 플레이어에서 자막을 켜고 끄고(CC 버튼, `C` 키), 글자 크기(작게/보통/크게)를 고른다.
4. 데이터 구조는 처음부터 **영상 1개 : 자막 N개(언어별)** 로 만든다. 번역 자막을 추가할 때는 언어 목록 상수만 늘리면 된다.

### 비목표 (Out of scope)

- 자막 전체 스크립트 패널(클릭해 이동, 현재 문장 강조).
- 브라우저 안 자막 편집기, 자동 자막 생성(STT), 자동 번역.
- 번역 자막 업로드/선택 UI — 데이터·API는 다국어를 지원하지만 UI는 한국어만 노출한다.
- YouTube 페이지 영상의 자막(YouTube 자체 자막을 쓴다).
- 학급별로 다른 자막. 자막은 라이브러리 영상에 붙으며, 같은 영상이면 모든 학급에서 같다.

## 핵심 설계 결정

| 결정 | 선택 | 비고 |
|---|---|---|
| 자막의 소속 | **라이브러리 영상(`videos`)** | 학급 배정(`classroom_videos`)이 아니라 영상 원본에 붙는다. 영상 소유자가 관리한다. |
| 데이터 구조 | **별도 테이블 `video_subtitles`** (영상 × 언어) | `videos.subtitle_url` 컬럼 하나는 다국어 확장 시 재설계가 필요해서 쓰지 않는다. `unique(videoId, lang)`. |
| 입력 형식 | **.srt / .vtt** 모두 허용 | 대부분의 편집 도구가 SRT를 내보낸다. 최대 **2MB**. |
| 저장 형식 | **WebVTT로 정규화**한 파일 | 서버가 공유 파서로 읽어 VTT로 다시 써서 `videos` 버킷 `subtitles/` 에 저장한다. 원본 SRT는 보관하지 않는다. |
| 저장 위치 | 파일(`videos` 버킷) | 썸네일과 같은 방식. `/api/files/*` 공개 서빙 + immutable 캐시(파일명에 타임스탬프). |
| 파서 위치 | **`@mathchois/shared`** | 서버(업로드 검증·정규화)와 클라이언트(업로드 전 미리 확인·재생 렌더)가 같은 코드를 쓴다. Vitest로 검증. |
| 렌더링 | **플레이어가 직접 그리는 자막 오버레이** | 브라우저 기본 `<track>` 렌더링은 위치·크기를 제어하기 어렵고 커스텀 컨트롤 바와 겹친다. 오버레이는 컨트롤 바가 보이면 위로 비켜 서고, 2분할 전체화면에서도 똑같이 보인다. |
| iPhone 기본 전체화면 | 숨김 `<track>` 병행 | `webkitEnterFullscreen`(iPhone Safari)은 웹 오버레이를 보여 주지 못한다. 같은 VTT를 `<track>`으로도 달아 두고, 이 전체화면에 들어갈 때만 `mode='showing'`으로 바꾼다. |
| 자막 목록 조회 | **영상 URL로 조회** `GET /api/video-subtitles?videoUrl=` | 페이지 임베드는 영상 URL만 안다. 플레이어가 `src`로 직접 조회하므로 재생 화면 4곳의 호출부를 고치지 않는다. |
| 기본 표시 | 자막이 있으면 **켜짐** | 교사가 일부러 올린 자막이므로 기본으로 보인다. 사용자가 끄면 그 선택이 기기에 저장된다(`mc_video_player`). |
| 업로드 시점 | 폼 [저장] 시 일괄 반영 | 고른 파일은 저장 전까지 로컬 미리 확인만 한다. 새 영상은 레코드 생성 직후 자막을 올린다. |

## 공유 모듈 — `packages/shared/src/subtitles/`

`subtitles.ts` (순수 함수, 의존성 없음), `index.ts`에서 `export * from './subtitles/subtitles.js'`.

```ts
export interface SubtitleCue { start: number; end: number; text: string } // 초 단위, text 는 줄바꿈(\n) 포함 평문

export const SUBTITLE_LANGS: ReadonlyArray<{ code: string; label: string }> = [
  { code: 'ko', label: '한국어' },
];
export function isSubtitleLang(code: string): boolean;
export function subtitleLangLabel(code: string): string;

export const MAX_SUBTITLE_BYTES = 2 * 1024 * 1024;

/** SRT/VTT 텍스트 → 시작 시각 순 cue 배열. 읽을 수 없는 블록은 건너뛴다. */
export function parseSubtitles(text: string): SubtitleCue[];
/** cue 배열 → WebVTT 문서 문자열 ("WEBVTT\n\n00:00:01.000 --> 00:00:03.500\n…") */
export function toWebVtt(cues: SubtitleCue[]): string;
/** time 에 보여야 할 cue 들(겹치는 cue 는 여러 개). 앞서 시작한 긴 cue 도 잡도록 전체를 선형 필터(수천 개 × 4Hz 로 충분) */
export function activeCues(cues: SubtitleCue[], time: number): SubtitleCue[];
```

파싱 규칙:
- BOM 제거, `\r\n`/`\r` → `\n`.
- 블록은 빈 줄로 나눈다. 블록 안에서 `-->` 가 있는 첫 줄이 타임코드 줄이다. 그 앞 줄(SRT 번호·VTT cue id)은 무시하고, 뒤 줄들이 본문이다.
- 타임코드: `hh:mm:ss,mmm` / `hh:mm:ss.mmm` / `mm:ss.mmm` 허용(시 생략 가능, 밀리초 자릿수 1~3). 타임코드 뒤 VTT 설정(`align:start` 등)은 무시.
- `WEBVTT` 헤더 블록, `NOTE` / `STYLE` / `REGION` 블록은 건너뛴다.
- 본문의 **알려진** 서식 태그(`<b>`, `<i>`, `<u>`, `<c.x>`, `<v 이름>`, `<lang>`, `<ruby>`/`<rt>`, `<00:00:01.000>`, SRT `<font …>`, `{\an8}` 류 ASS 태그)만 제거하고(SRT 는 `<` `>` 를 이스케이프하지 않으므로 `x < 3`, `<a, b>` 같은 수식은 남긴다 — 최종 리뷰 반영) `&amp; &lt; &gt; &nbsp; &lrm; &rlm;` 은 문자로 되돌린다. 화면에는 React 텍스트로 넣으므로 HTML로 해석되지 않는다.
- `end <= start` 이거나 본문이 비면 버린다. 결과는 `start` 오름차순(같으면 원래 순서) 정렬.
- `toWebVtt` 는 본문 안의 빈 줄을 없애고(빈 줄은 VTT에서 cue 종료), `-->` 를 `->` 로 바꿔 문서가 깨지지 않게 한다. `&`/`<` 는 이스케이프한다.

## 데이터 모델

### `video_subtitles` (Drizzle `schema.ts` + `startupMigrate.ts` 멱등 DDL)

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | uuid PK | |
| `videoId` | uuid → videos (**cascade**) | 영상 삭제 시 행도 삭제(파일은 서비스가 먼저 정리) |
| `lang` | text NOT NULL | `SUBTITLE_LANGS` 코드(`'ko'`) |
| `label` | text NOT NULL | 표시 이름(`'한국어'`) — 업로드 시 `subtitleLangLabel(lang)` |
| `url` | text NOT NULL | `/api/files/videos/subtitles/<ts>_<videoId>_<lang>.vtt` |
| `cueCount` | integer NOT NULL default 0 | 폼 안내용 |
| `lastEndSec` | integer null | 마지막 문장 끝 시각(올림). 영상만 교체했을 때 폼이 길이 경고를 내는 데 쓴다. 컬럼 추가 전 행은 null(경고 없음) |
| `createdBy` | uuid → profiles (set null) | 올린 사람 |
| `createdAt` / `updatedAt` | timestamptz | |

`unique(videoId, lang)` (`uq_video_subtitles_video_lang`).
`videos.video_url` 조회용 인덱스 `idx_videos_video_url` 추가(URL로 자막 목록 조회).

### 스토리지

- `storage.service.ts` `getMimeType` 에 `.vtt → text/vtt`(`<track>` 은 이 MIME을 요구) 추가.
- 파일명은 타임스탬프를 포함하므로 교체 시 새 URL → 기존 immutable 캐시와 충돌하지 않는다.

## 서버 API — `routes/videoSubtitles.ts` + `services/videoSubtitle.service.ts`

| 메서드 | 경로 | 권한 | 설명 |
|---|---|---|---|
| GET | `/api/video-subtitles?videoUrl=<url>` | 로그인 사용자 | 그 URL의 라이브러리 영상 자막 목록 `[{ id, lang, label, url, cueCount, updatedAt }]` (`SUBTITLE_LANGS` 순서). 영상이 없거나 자막이 없으면 `[]`. `videoUrl` 은 절대 URL이어도 pathname 으로 비교한다. |
| POST | `/api/videos/:id/subtitles/:lang` | 영상 소유자 / 관리자 | multipart 파일 1개(.srt/.vtt, ≤ 2MB). `parseSubtitles` → 0개면 **400** "자막 문장을 찾을 수 없습니다" → `toWebVtt` 로 저장 → upsert. 이전 파일 삭제. 응답: 저장된 자막 행. |
| DELETE | `/api/videos/:id/subtitles/:lang` | 영상 소유자 / 관리자 | 행 + 파일 삭제. 204. 없으면 404. |

- `:lang` 이 `SUBTITLE_LANGS` 에 없으면 400. 영상이 없으면 404, 권한이 없으면 403(기존 `routes/videos.ts` 와 같은 메시지 규칙).
- 업로드 검증: 확장자 `.srt|.vtt`(MIME은 브라우저마다 `application/x-subrip`, `text/plain`, 빈 값 등으로 제각각이라 확장자로 판단), 크기 한도 초과 413, 본문은 UTF-8로 디코드(`TextDecoder('utf-8')`, 잘못된 바이트는 대체 문자).
- `video.service.ts` `removeVideo`: 영상 행을 지우기 전에 자막 URL 목록을 읽어 두었다가, 삭제 후 영상·썸네일과 함께 파일을 지운다.
- 자막 변경은 실시간 브로드캐스트하지 않는다(다음에 영상을 열 때 반영).

### 공유 타입 — `shared/src/types/video.ts`

```ts
export interface VideoSubtitle {
  id: string; lang: string; label: string; url: string; cueCount: number; updatedAt: string;
}
```

## 클라이언트

### 1) API — `lib/videos.js`

- `listVideoSubtitles(videoUrl)` → `GET /api/video-subtitles?videoUrl=`
- `uploadVideoSubtitle(videoId, lang, file)` → `POST` multipart (기존 `api.upload(url, formData)` 헬퍼)
- `deleteVideoSubtitle(videoId, lang)`
- 모듈 캐시 `Map<videoUrl, Promise<VideoSubtitle[]>>` 와 `Map<subtitleUrl, Promise<SubtitleCue[]>>`. `invalidateVideoSubtitles(videoUrl)` 은 업로드/삭제 후 호출.

### 2) 훅 — `hooks/useVideoSubtitles.js`

`useVideoSubtitles(src)`:
- `isLibraryVideoUrl(src)` 가 아니면 아무것도 하지 않는다(로컬 Blob 미리보기, YouTube 등).
- 자막 목록을 가져온 뒤, 선택된 언어의 VTT 파일을 `fetch` → `parseSubtitles` 로 cue 배열을 만든다.
- 반환: `{ tracks: VideoSubtitle[], cues: SubtitleCue[] | null, loading }`. 실패하면 조용히 자막 없음으로 처리한다(재생은 계속).

### 3) 플레이어 — `components/videos/VideoPlayer.jsx` (+ `lib/videoPlayer.js`)

- 설정(`mc_video_player`)에 추가: `subtitlesOn: boolean`(기본 `true`), `subtitleLang: string`(기본 `'ko'`), `subtitleSize: 'sm'|'md'|'lg'`(기본 `'md'`). `normalizeSettings` 가 잘못된 값을 기본값으로 보정한다.
- 자막 트랙이 있을 때만 컨트롤 바에 **CC 버튼**(lucide `Captions` / `CaptionsOff`)을 보여 준다. 켜짐 상태는 버튼 강조로 표시한다.
- 단축키 `C`: 자막 켜기/끄기(트랙이 있을 때만), 피드백 "자막 켜짐/꺼짐".
- ⚙ 설정 패널에 "자막" 줄 추가(트랙이 있을 때만): `끄기 / 한국어` 선택 + 글자 크기 `작게 / 보통 / 크게`. 언어 버튼은 `tracks` 로 그리므로 번역 자막이 생기면 자동으로 늘어난다. 단축키 안내 줄에 `C 자막` 추가.
- **자막 오버레이**: `activeCues(cues, currentTime)` 결과를 영상 하단 중앙에 표시한다.
  - 반투명 검정 배경 + 흰 글자, 줄바꿈 유지(`whitespace-pre-line`), 최대 폭 90%, `pointer-events-none`(탭/제스처를 막지 않는다).
  - 컨트롤 바가 보이면 그 높이만큼 위로 올라가고, 숨으면 아래로 내려온다(transition).
  - 글자 크기는 플레이어 폭에 비례한다(`clamp()` + 컨테이너 쿼리 단위 `cqw`, 플레이어 컨테이너에 `container-type: inline-size`). sm/md/lg 비율만 바꾼다.
  - 시간 갱신: 기존 `timeupdate`(약 4Hz) 기반 `currentTime` 상태로 충분하다. 탐색 직후에도 `seekTo/seekBy` 가 `currentTime` 을 즉시 갱신하므로 자막이 바로 바뀐다.
- **iPhone 기본 전체화면**: `<video>` 안에 트랙마다 `<track kind="subtitles" src srclang label>` 를 기본(`default` 없음, 즉 꺼짐) 상태로 둔다. `webkitbeginfullscreen` 에서 자막이 켜져 있으면 해당 `textTracks[i].mode = 'showing'`, `webkitendfullscreen` 에서 `'disabled'` 로 되돌린다. 일반 화면에서는 항상 오버레이만 쓴다.

### 4) 업로드 UI — `components/videos/VideoForm.jsx` (+ `components/videos/SubtitleField.jsx`)

폼 하단(설명 아래)에 **"자막 (한국어)"** 칸.
- 상태: `없음` / `등록됨(문장 N개 · 수정일)` / `새 파일 선택됨(파일명 · 문장 N개 · 마지막 mm:ss)` / `삭제 예정`.
- [파일 선택](.srt,.vtt — `FileDropZone` 재사용) → 브라우저에서 `parseSubtitles` 로 바로 읽는다.
  - 0개면 "자막 문장을 찾을 수 없습니다. SRT/VTT 파일인지 확인하세요." 오류, 선택 취소.
  - 마지막 문장 끝이 영상 길이(`durationSec`)보다 5초 넘게 길면 경고(저장은 가능): "자막이 영상보다 깁니다. 다른 영상의 자막이 아닌지 확인하세요."
  - 2MB 초과 시 오류.
- 기존 자막: [교체] / [삭제](IconButton) / [취소](선택 되돌리기).
- [저장]: 영상 생성/수정 요청이 끝난 뒤 자막 변경(업로드 또는 삭제)을 반영하고 `invalidateVideoSubtitles` 호출. 자막 단계가 실패하면 영상 저장은 유지된 채 "영상은 저장했지만 자막을 올리지 못했습니다: …" 를 보여 주고 폼을 닫지 않는다(재시도 가능).
- 진행 단계 안내(`stage`)에 "자막 올리는 중…" 추가.
- `VideosPage` 목록의 영상 행/카드에 자막이 있으면 작은 `CC` 배지. 목록·단건 API(`listVideos`, `getVideoById`)가 `subtitleLangs: string[]` 를 집계해 내려준다.

## 흐름

1. **등록**: 영상 파일 선택 → (선택) 자막 파일 선택·미리 확인 → [등록] → 영상 업로드 → 썸네일 → `POST /api/videos` → `POST /api/videos/:id/subtitles/ko`.
2. **수정**: 기존 영상 열기 → 자막 칸에 현재 상태 표시 → 교체/삭제 → [저장] → `PATCH`(바뀐 것이 있으면) → 자막 `POST` 또는 `DELETE`.
3. **시청**: 아무 재생 화면 → `VideoPlayer` 가 `src` 로 자막 목록 조회 → 켜져 있으면 VTT 를 받아 파싱 → 오버레이 표시. CC 버튼/`C` 키로 켜고 끈다.

## 엣지케이스

- 인코딩이 UTF-8이 아닌 SRT(일부 국내 도구의 CP949): 서버는 UTF-8로만 읽는다. 대체 문자(U+FFFD)가 **하나라도** 있으면(비율로 재면 번호·타임코드가 희석해 한국어가 적은 수식 자막이 통과한다 — 최종 리뷰 반영) 400 "UTF-8로 저장된 자막 파일만 올릴 수 있습니다" — 폼도 같은 검사로 미리 알린다.
- 영상 파일을 교체해도 자막은 유지된다(자막은 `videoId` 에 붙는다). 새 영상이 기존 자막(`lastEndSec`)보다 5초 넘게 짧으면 폼이 위 경고를 보여 준다.
- 다른 탭에서 먼저 지운 자막을 삭제하면(404) 성공으로 본다. 자막 단계만 실패했을 때 문구·버튼은 동작에 맞춘다("올리지/삭제하지 못했습니다", "자막 다시 올리기/삭제하기").
- 문장 사이 빈 줄이 빠진 SRT 는 타임코드 줄마다 문장으로 나눈다(다음 타임코드 바로 앞의 번호 줄은 본문에서 뺀다).
- 같은 시각에 같은 문장이 겹쳐도 오버레이 키가 겹치지 않는다(index 포함).
- 자막 cue 가 겹치면 겹친 문장을 시작 순으로 함께 보여 준다.
- 자막 파일이 지워졌거나(404) 파싱 결과가 비면: 플레이어는 자막 없이 재생하고 CC 버튼을 숨긴다.
- 로컬 Blob URL(등록 폼 미리보기), YouTube 페이지 영상: 자막 조회를 하지 않는다.
- 같은 영상을 여러 학급에서 배정: 모든 학급에서 같은 자막.
- 권한: 학생은 목록 조회만 가능(`GET`). `POST/DELETE` 는 영상 소유자/관리자만.

## 테스트

- Vitest(클라이언트에서 shared 를 import — `classroomColorShared.test.js` 패턴)
  - `lib/subtitles.test.js`: SRT(번호·쉼표 밀리초·CRLF·BOM), VTT(헤더·NOTE·STYLE·cue id·설정·시 생략), 태그 제거·엔티티 복원, 잘못된 블록 건너뛰기, `end<=start` 제거, 정렬, `toWebVtt` 왕복(parse → toWebVtt → parse 동일), 본문 빈 줄·`-->` 이스케이프, `activeCues` 경계(시작 포함·끝 제외)·겹침.
  - `lib/videoPlayer.test.js`: 새 설정 필드 보정(`subtitlesOn`, `subtitleLang`, `subtitleSize`).
- 서버: `tsc` 타입체크.
- 클라이언트: `npm run lint`, `npm run build`.
- 수동/E2E(가능한 범위): 로컬 서버에서 자막 업로드 → 미리보기 모달에서 표시·CC 토글·크기 변경 확인(Playwright 스크린샷).

## 영향 받는 파일 (요약)

- shared: `src/subtitles/subtitles.ts`(신규), `src/index.ts`, `src/types/video.ts`
- server: `db/schema.ts`, `db/startupMigrate.ts`, `services/videoSubtitle.service.ts`(신규), `routes/videoSubtitles.ts`(신규), `app.ts`(라우트 등록), `services/video.service.ts`(삭제 시 파일 정리·목록 `subtitleLangs`), `services/storage.service.ts`(`.vtt` MIME)
- client: `lib/videos.js`, `hooks/useVideoSubtitles.js`(신규), `lib/videoPlayer.js`, `components/videos/VideoPlayer.jsx`, `components/videos/SubtitleField.jsx`(신규), `components/videos/VideoForm.jsx`, `pages/Videos/VideosPage.jsx`(CC 배지)
- docs: `.claude/PROJECT_MAP.md`, `CLAUDE.md`(영상자료 문단에 자막 한 줄)
