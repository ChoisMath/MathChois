# 영상자료 자막 (Video Subtitles) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 영상자료 라이브러리 영상에 언어별 자막(.srt/.vtt → WebVTT)을 올리고, 모든 라이브러리 영상 재생 화면에서 자막을 표시한다.

**Architecture:** `@mathchois/shared` 의 순수 파서(`parseSubtitles`/`toWebVtt`/`activeCues`)를 서버(업로드 검증·정규화)와 클라이언트(업로드 전 확인·재생 렌더)가 함께 쓴다. 서버는 `video_subtitles` 테이블 + `videos` 버킷 `subtitles/` 파일로 저장하고, `VideoPlayer` 는 `src`(라이브러리 URL)로 자막 목록을 직접 조회해 자체 오버레이로 그린다.

**Tech Stack:** Fastify 5 + `@fastify/multipart`, Drizzle ORM 0.45 (PostgreSQL), React 19 + Tailwind 4, lucide-react 0.575, Vitest 2.

**Spec:** `docs/superpowers/specs/2026-10-22-video-subtitles-design.md`

## Global Constraints

- 입력 형식 `.srt` / `.vtt`, 최대 **2MB** (`MAX_SUBTITLE_BYTES = 2 * 1024 * 1024`). 확장자로 판단(MIME 은 브라우저마다 제각각).
- 저장 형식은 WebVTT(`text/vtt`), 경로 `/api/files/videos/subtitles/<Date.now()>_<videoId>_<lang>.vtt`.
- 언어 목록 `SUBTITLE_LANGS = [{ code: 'ko', label: '한국어' }]` — 언어 확장은 이 상수만 바꾼다. UI 는 한국어만.
- 인코딩: UTF-8 만. 대체 문자(`�`)가 공백 아닌 글자의 **5% 이상**이면 거부: "UTF-8로 저장된 자막 파일만 올릴 수 있습니다".
- 0문장이면 거부: "자막 문장을 찾을 수 없습니다" (폼: "자막 문장을 찾을 수 없습니다. SRT/VTT 파일인지 확인하세요.").
- 마지막 문장 끝이 영상 길이보다 **5초 넘게** 길면 경고(저장 가능): "자막이 영상보다 깁니다. 다른 영상의 자막이 아닌지 확인하세요."
- 권한: 조회는 로그인 사용자 누구나, 올리기/삭제는 영상 소유자 또는 `isAdmin`. 오류 문구는 `routes/videos.ts` 와 같은 규칙("영상자료를 찾을 수 없습니다", "수정 권한이 없습니다").
- 플레이어 설정(`mc_video_player`) 기본값: `subtitlesOn: true`, `subtitleLang: 'ko'`, `subtitleSize: 'md'` (`'sm'|'md'|'lg'`).
- 단축키 `C` = 자막 켜기/끄기(트랙이 있을 때만), 피드백 "자막 켜짐" / "자막 꺼짐".
- 아이콘 버튼은 `components/common/IconButton.jsx` 를 쓴다(플레이어 컨트롤 바는 기존 자체 버튼 스타일 유지).
- 라이브러리 사용 전 설치된 버전의 문서를 확인한다(`node_modules/<pkg>/README.md` 또는 타입 정의). 특히 `@fastify/multipart` 크기 초과 동작, Drizzle `onConflictDoUpdate` 복합 target.

## Review Focus

1. **CP949 로 저장된 SRT**(국내 도구 기본값) — 깨진 자막이 저장되지 않고 폼과 서버 모두 UTF-8 안내를 보여야 한다. → Task 1 `isLikelyMisdecoded` 테스트, Task 4 `inspectSubtitleText` 테스트.
2. **마지막 빈 줄이 없는 SRT / CRLF / BOM** — 마지막 문장이 빠지지 않아야 한다. → Task 1 테스트.
3. **앞서 시작한 긴 문장과 겹치는 문장** — 둘 다 보여야 한다(시작 시각만 보는 탐색은 앞의 긴 문장을 놓친다). → Task 1 `activeCues` 테스트.
4. **새 영상 등록 중 자막 업로드만 실패한 뒤 다시 저장** — 영상이 두 번 등록되면 안 된다. → Task 5 재시도 상태(`savedVideo`)와 수동 검증 단계.
5. **한글 파일명 영상의 URL 로 자막 조회**(저장값은 원문, 브라우저가 넘기는 절대 URL 은 퍼센트 인코딩) — 자막이 조회되어야 한다. → Task 2 `videoUrlCandidates` 와 Task 4 `subtitleQueryUrl`.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `packages/shared/src/subtitles/subtitles.ts` (신규) | 파싱·VTT 직렬화·활성 문장·언어 목록·인코딩 검사 (순수 함수) |
| `packages/shared/src/types/video.ts` | `VideoSubtitle` 타입, `Video.subtitleLangs` |
| `packages/server/src/services/videoSubtitle.service.ts` (신규) | `video_subtitles` CRUD + 파일 기록/정리 |
| `packages/server/src/routes/videoSubtitles.ts` (신규) | GET/POST/DELETE 라우트 |
| `packages/client/src/lib/subtitleFile.js` (신규) | 업로드 전 로컬 검사 `inspectSubtitleText` |
| `packages/client/src/hooks/useVideoSubtitles.js` (신규) | 재생 화면용 자막 목록·문장 로딩 |
| `packages/client/src/components/videos/SubtitleOverlay.jsx` (신규) | 자막 표시(오버레이) |
| `packages/client/src/components/videos/SubtitleField.jsx` (신규) | 폼의 "자막 (한국어)" 칸 |

---

### Task 1: 공유 자막 파서

**Files:**
- Create: `packages/shared/src/subtitles/subtitles.ts`
- Modify: `packages/shared/src/index.ts` (export 추가), `packages/shared/src/types/video.ts`
- Test: `packages/client/src/lib/subtitles.test.js` (shared 를 `@mathchois/shared` 로 import — `classroomColorShared.test.js` 패턴)

**Interfaces:**
- Produces (all exported from `@mathchois/shared`):
  - `interface SubtitleCue { start: number; end: number; text: string }` (초, `text` 는 `\n` 포함 평문)
  - `SUBTITLE_LANGS: ReadonlyArray<{ code: string; label: string }>`, `isSubtitleLang(code: string): boolean`, `subtitleLangLabel(code: string): string` (모르는 코드는 코드 그대로)
  - `MAX_SUBTITLE_BYTES = 2097152`, `SUBTITLE_EXT_RE = /\.(srt|vtt)$/i`
  - `parseSubtitles(text: string): SubtitleCue[]`
  - `toWebVtt(cues: SubtitleCue[]): string`
  - `activeCues(cues: SubtitleCue[], time: number): SubtitleCue[]`
  - `isLikelyMisdecoded(text: string): boolean`
  - `interface VideoSubtitle { id: string; lang: string; label: string; url: string; cueCount: number; updatedAt: string }`; `Video` 에 `subtitleLangs?: string[]` 추가

- [ ] **Step 1: Write the failing tests** — `describe('parseSubtitles')`, `describe('toWebVtt')`, `describe('activeCues')`, `describe('isLikelyMisdecoded')`, `describe('SUBTITLE_LANGS')`:

```js
const SRT = '﻿1\r\n00:00:01,000 --> 00:00:03,500\r\n안녕하세요\r\n<i>수학</i> 시간\r\n\r\n2\r\n00:00:04,000 --> 00:00:05,000\r\n마지막';
it('SRT: BOM·CRLF·번호·태그, 마지막 빈 줄 없음', () => {
  expect(parseSubtitles(SRT)).toEqual([
    { start: 1, end: 3.5, text: '안녕하세요\n수학 시간' },
    { start: 4, end: 5, text: '마지막' },
  ]);
});
it('VTT: 헤더·NOTE·STYLE·cue id·설정·시 생략·밀리초 1~3자리', () => {
  const vtt = 'WEBVTT - 제목\n\nNOTE 메모\n줄\n\nSTYLE\n::cue { color: red }\n\nintro\n01:02.5 --> 01:04.25 align:start line:0\n<v 선생님>a &amp; b&nbsp;c</v>\n';
  expect(parseSubtitles(vtt)).toEqual([{ start: 62.5, end: 64.25, text: 'a & b c' }]);
});
it('태그 제거: <c.x>, 인라인 타임스탬프, <font>, {\\an8}', () => {
  const t = '1\n00:00:00,000 --> 00:00:01,000\n{\\an8}<font color="#fff"><c.yellow>가</c><00:00:00.500>나</font>\n';
  expect(parseSubtitles(t)[0].text).toBe('가나');
});
it('잘못된 블록·end<=start·빈 본문은 버리고 시작 순으로 정렬(같으면 원래 순서)', () => {
  const t = '00:00:05.000 --> 00:00:06.000\nB\n\n쓰레기\n\n00:00:02.000 --> 00:00:02.000\n0길이\n\n00:00:03.000 --> 00:00:04.000\n\n\n00:00:01.000 --> 00:00:02.000\nA1\n\n00:00:01.000 --> 00:00:09.000\nA2\n';
  expect(parseSubtitles(t).map((c) => c.text)).toEqual(['A1', 'A2', 'B']);
});
it('빈 문자열·자막 아닌 텍스트 → []', () => {
  expect(parseSubtitles('')).toEqual([]);
  expect(parseSubtitles('그냥 메모입니다')).toEqual([]);
});
it('toWebVtt: 헤더·hh:mm:ss.mmm·이스케이프, 왕복 동일', () => {
  const cues = [{ start: 3661.5, end: 3662, text: 'a < b & c\n둘째 줄' }];
  const out = toWebVtt(cues);
  expect(out.startsWith('WEBVTT\n\n01:01:01.500 --> 01:01:02.000\na &lt; b &amp; c\n둘째 줄\n')).toBe(true);
  expect(parseSubtitles(out)).toEqual(cues);
  expect(parseSubtitles(toWebVtt(parseSubtitles(SRT)))).toEqual(parseSubtitles(SRT));
});
it('toWebVtt: 본문 안 빈 줄과 --> 가 문서를 깨지 않는다', () => {
  const out = toWebVtt([{ start: 0, end: 1, text: 'a\n\nb --> c' }]);
  expect(parseSubtitles(out)).toEqual([{ start: 0, end: 1, text: 'a\nb -> c' }]);
});
it('activeCues: 시작 포함·끝 제외, 앞서 시작한 긴 문장과 겹침', () => {
  const cues = [{ start: 0, end: 100, text: '긴' }, { start: 10, end: 12, text: '짧' }, { start: 12, end: 13, text: '다음' }];
  expect(activeCues(cues, 11).map((c) => c.text)).toEqual(['긴', '짧']);
  expect(activeCues(cues, 12).map((c) => c.text)).toEqual(['긴', '다음']);
  expect(activeCues(cues, 100)).toEqual([]);
  expect(activeCues([], 5)).toEqual([]);
});
it('isLikelyMisdecoded: 대체 문자 5% 이상', () => {
  expect(isLikelyMisdecoded('정상 자막 텍스트')).toBe(false);
  expect(isLikelyMisdecoded('��� abc')).toBe(true);
  expect(isLikelyMisdecoded('a'.repeat(99) + '�')).toBe(false); // 1%
});
it('SUBTITLE_LANGS', () => {
  expect(isSubtitleLang('ko')).toBe(true);
  expect(isSubtitleLang('xx')).toBe(false);
  expect(subtitleLangLabel('ko')).toBe('한국어');
});
```

- [ ] **Step 2: Run to verify failure** — `npm test -w @mathchois/client -- subtitles.test` → FAIL (exports not found).

- [ ] **Step 3: Implement `packages/shared/src/subtitles/subtitles.ts`** per spec "파싱 규칙". Approach: normalize newlines → split on `/\n{2,}/` → per block find first line containing `-->`; timecode regex `/^(?:(\d+):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})$/` on each side (ms right-padded: `.5` → 500); skip blocks whose first line starts with `WEBVTT`, `NOTE`, `STYLE`, `REGION`. Tag strip: `/<[^>]*>/g` then `/\{\\[^}]*\}/g`; entities `&lt; &gt; &nbsp;(→ space) &lrm; &rlm;(→ '')` and **`&amp;` last** (so `&amp;lt;` → `&lt;`, not `<`); trim each line, drop empty lines. `toWebVtt` drops empty lines inside a cue's text, replaces `-->` with `->`, escapes `&` then `<` then `>`, times as `hh:mm:ss.mmm` via `Math.round(sec * 1000)`. `activeCues` is a linear `filter(c => c.start <= t && t < c.end)` (문장 수천 개 × 4Hz 는 충분히 싸고, 겹치는 긴 문장을 정확히 잡는다). `isLikelyMisdecoded`: `�` 개수 / 공백 아닌 글자 수 `>= 0.05`. Add `export * from './subtitles/subtitles.js';` to `index.ts`; add types to `types/video.ts`.

- [ ] **Step 4: Run tests** — `npm test -w @mathchois/client -- subtitles.test` → PASS; `npm run typecheck -w @mathchois/shared` → no errors.

- [ ] **Step 5: Commit** — `git commit -m "feat(shared): 자막(SRT/VTT) 파서와 WebVTT 변환"`

---

### Task 2: 서버 — 테이블·서비스·라우트

**Files:**
- Modify: `packages/server/src/db/schema.ts` (videos 블록 뒤에 `videoSubtitles`), `packages/server/src/db/startupMigrate.ts` (videos 블록 log 직전), `packages/server/src/services/storage.service.ts` (`getMimeType` 에 `'.vtt': 'text/vtt'`), `packages/server/src/services/video.service.ts`, `packages/server/src/app.ts` (`app.register(videoSubtitleRoutes)` — `videoRoutes` 다음)
- Create: `packages/server/src/services/videoSubtitle.service.ts`, `packages/server/src/routes/videoSubtitles.ts`

**Interfaces:**
- Consumes: Task 1 `parseSubtitles`, `toWebVtt`, `isSubtitleLang`, `subtitleLangLabel`, `isLikelyMisdecoded`, `MAX_SUBTITLE_BYTES`, `SUBTITLE_EXT_RE`, `SUBTITLE_LANGS`, `VideoSubtitle`; `video.service.getVideoById` (라우트에서만); `storage.service.uploadFile/removeFile/urlToStoragePath`.
- Produces:
  - Drizzle `videoSubtitles` (columns per spec; `unique('uq_video_subtitles_video_lang').on(t.videoId, t.lang)`)
  - `videoUrlCandidates(input: string): string[]` (service, exported) — pathname of `new URL(input, 'http://local')`, plus its `decodeURIComponent` form, deduped; invalid → `[]`
  - `listSubtitlesByVideoUrl(videoUrl: string): Promise<VideoSubtitle[]>` (`SUBTITLE_LANGS` 순서)
  - `saveSubtitle(p: { videoId: string; lang: string; vtt: string; cueCount: number; createdBy: string }): Promise<VideoSubtitle>`
  - `removeSubtitle(videoId: string, lang: string): Promise<boolean>`
  - `subtitleUrlsForVideo(videoId: string): Promise<string[]>`
  - HTTP: `GET /api/video-subtitles?videoUrl=` → `VideoSubtitle[]`; `POST /api/videos/:id/subtitles/:lang` (multipart) → `VideoSubtitle` (201); `DELETE /api/videos/:id/subtitles/:lang` → 204
  - `listVideos` / `getVideoById` 응답에 `subtitleLangs: string[]`

- [ ] **Step 1: Check installed docs** — read `node_modules/@fastify/multipart/README.md` (`req.file({ limits })`, `toBuffer()` 이 한도 초과 시 던지는 오류 코드 — `FST_REQ_FILE_TOO_LARGE` 인지 확인) and Drizzle `onConflictDoUpdate({ target: [a, b], set })` in `node_modules/drizzle-orm/pg-core/query-builders/insert.d.ts`. 확인 결과에 맞춰 Step 4 를 쓴다.

- [ ] **Step 2: Schema + startup DDL**

```sql
CREATE TABLE IF NOT EXISTS video_subtitles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  lang text NOT NULL,
  label text NOT NULL,
  url text NOT NULL,
  cue_count integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_video_subtitles_video_lang ON video_subtitles (video_id, lang);
CREATE INDEX IF NOT EXISTS idx_videos_video_url ON videos (video_url);
```
log 문구를 `'startup migration: videos / classroom_videos / video_comments / video_subtitles ensured'` 로 바꾼다. Drizzle 정의에도 `index('idx_videos_video_url').on(t.videoUrl)` 추가.

- [ ] **Step 3: Service `videoSubtitle.service.ts`** — 버킷은 `const SUBTITLE_BUCKET = 'videos'; // routes/videos.ts VIDEO_BUCKET 과 같음` 로 둔다(`routes/videos.ts` → `video.service.ts` → 이 서비스 순서로 import 되므로 라우트를 import 하면 순환). `saveSubtitle`: `uploadFile(SUBTITLE_BUCKET, 'subtitles', \`${Date.now()}_${videoId}_${lang}.vtt\`, Buffer.from(vtt, 'utf8'))` → 기존 행 조회 → upsert(`label: subtitleLangLabel(lang)`, `updatedAt: new Date()`) → 기존 파일이 있고 URL 이 다르면 `removeFile`(실패 무시). `removeSubtitle`: 행 삭제(returning) 후 파일 삭제. `listSubtitlesByVideoUrl`: `videos.videoUrl IN candidates` inner join, `updatedAt` 은 ISO 문자열. In `video.service.ts`: `videoColumns` 에 `subtitleLangs: sql<string[]>\`coalesce((select array_agg(s.lang order by s.lang) from video_subtitles s where s.video_id = ${videos.id}), '{}')\``; `removeVideo` 는 삭제 전 `subtitleUrlsForVideo(id)`(videoSubtitle.service 에서 import)를 읽어 두고, 영상·썸네일 파일 정리 뒤 같은 방식(`urlToStoragePath` → `removeFile`, 실패 무시)으로 지운다.

- [ ] **Step 4: Routes `videoSubtitles.ts`** — `export async function videoSubtitleRoutes(app: FastifyInstance)`.
  - GET: `preHandler: [authenticate]`; `videoUrl` 없으면 `[]`.
  - POST/DELETE: `preHandler: [authenticate, requireRole('teacher')]`; 순서: `isSubtitleLang` 아니면 400 "지원하지 않는 자막 언어입니다" → `getVideoById` 없으면 404 → 소유자/관리자 아니면 403 → (POST) `req.file({ limits: { fileSize: MAX_SUBTITLE_BYTES } })`, 없으면 400 "파일이 없습니다." → 확장자 아니면 `part.file.resume()` 후 400 "SRT 또는 VTT 자막 파일만 올릴 수 있습니다." → `toBuffer()` 한도 초과 413 "자막 파일이 너무 큽니다. 최대 2MB 까지 올릴 수 있습니다." → `new TextDecoder('utf-8').decode(buf)` → `isLikelyMisdecoded` 400 → `parseSubtitles` 0개 400 → `saveSubtitle` → 201.
  - DELETE: `removeSubtitle` false → 404 "자막을 찾을 수 없습니다", true → 204.

- [ ] **Step 5: Typecheck** — `npx tsc --noEmit -p packages/server` (repo root) → no errors.

- [ ] **Step 6: Smoke test (DB 가 있으면)** — `packages/server/.env` 와 PostgreSQL 이 있을 때만: 서버를 띄우고 교사 토큰으로 `curl -F file=@sample.srt -X POST .../api/videos/<id>/subtitles/ko` → 201, `GET /api/video-subtitles?videoUrl=<url>` → 1건, 받은 `url` 을 `curl -I` → `Content-Type: text/vtt`, DELETE → 204. DB 가 없으면 건너뛰고 보고서에 명시.

- [ ] **Step 7: Commit** — `git commit -m "feat(server): 영상 자막 테이블·업로드/조회/삭제 API"`

---

### Task 3: 플레이어 설정 필드

**Files:**
- Modify: `packages/client/src/lib/videoPlayer.js`
- Test: `packages/client/src/lib/videoPlayer.test.js`

**Interfaces:**
- Produces: `SUBTITLE_SIZES = ['sm', 'md', 'lg']`; `DEFAULT_SETTINGS` 에 `subtitlesOn: true, subtitleLang: 'ko', subtitleSize: 'md'`; `normalizeSettings` 가 세 필드를 보정; `pickSubtitleTrack(tracks: VideoSubtitle[], lang: string): VideoSubtitle | null` (같은 lang → 없으면 첫 트랙 → 빈 배열이면 null)

- [ ] **Step 1: Failing tests**

```js
it('자막 설정 기본값과 보정', () => {
  expect(normalizeSettings(null)).toMatchObject({ subtitlesOn: true, subtitleLang: 'ko', subtitleSize: 'md' });
  expect(normalizeSettings({ subtitlesOn: false, subtitleLang: 'en', subtitleSize: 'lg' }))
    .toMatchObject({ subtitlesOn: false, subtitleLang: 'en', subtitleSize: 'lg' });
  expect(normalizeSettings({ subtitlesOn: 'x', subtitleLang: 3, subtitleSize: 'huge' }))
    .toMatchObject({ subtitlesOn: true, subtitleLang: 'ko', subtitleSize: 'md' });
});
it('pickSubtitleTrack', () => {
  const ko = { lang: 'ko' }; const en = { lang: 'en' };
  expect(pickSubtitleTrack([en, ko], 'ko')).toBe(ko);
  expect(pickSubtitleTrack([en], 'ko')).toBe(en);
  expect(pickSubtitleTrack([], 'ko')).toBeNull();
});
```
(`subtitlesOn` 은 boolean 일 때만 반영, 그 외 기본값. `subtitleLang` 은 비어 있지 않은 string 일 때만 반영 — 나중 언어를 위해 `SUBTITLE_LANGS` 로 제한하지 않는다.) 기존 `normalizeSettings` 테스트가 `toEqual` 로 전체 객체를 비교한다면 새 필드를 기대값에 추가한다.

- [ ] **Step 2: Run → FAIL**, **Step 3: implement**, **Step 4: Run → PASS** — `npm test -w @mathchois/client -- videoPlayer.test`

- [ ] **Step 5: Commit** — `git commit -m "feat(videos): 플레이어 자막 설정(켜짐·언어·글자 크기)"`

---

### Task 4: 클라이언트 자막 API·캐시·로컬 검사·훅

**Files:**
- Modify: `packages/client/src/lib/videos.js`
- Create: `packages/client/src/lib/subtitleFile.js`, `packages/client/src/hooks/useVideoSubtitles.js`
- Test: `packages/client/src/lib/subtitleFile.test.js`, `packages/client/src/lib/videos.test.js`

**Interfaces:**
- Consumes: Task 1 exports, Task 2 HTTP API, `isLibraryVideoUrl` (`lib/pageVideoUrl.js`).
- Produces:
  - `videos.js`: `subtitleQueryUrl(videoUrl: string): string` (→ `/api/video-subtitles?videoUrl=<encodeURIComponent(videoUrl)>`), `listVideoSubtitles(videoUrl)`, `uploadVideoSubtitle(videoId, lang, file)` (`api.upload` POST, FormData 필드명 `file`), `deleteVideoSubtitle(videoId, lang)`, `getVideoSubtitlesCached(videoUrl): Promise<VideoSubtitle[]>` (실패 시 `[]` 로 resolve, 실패 결과는 캐시하지 않음), `getSubtitleCuesCached(url): Promise<SubtitleCue[]>` (`fetch` → `text()` → `parseSubtitles`; 실패 시 `[]`, 캐시하지 않음), `invalidateVideoSubtitles(): void` (두 캐시 모두 비움)
  - `subtitleFile.js`: `inspectSubtitleText(text: string, durationSec: number | null): { ok: boolean; error?: string; cueCount: number; lastEnd: number; warning?: string }`, `readSubtitleFile(file: File): Promise<ReturnType<typeof inspectSubtitleText>>` (크기·확장자 검사 후 `file.text()`)
  - `useVideoSubtitles(src: string | undefined, { enabled: boolean, lang: string }): { tracks: VideoSubtitle[]; track: VideoSubtitle | null; cues: SubtitleCue[] | null }` — `isLibraryVideoUrl(src)` 가 아니면 `{ tracks: [], track: null, cues: null }`; `enabled` 가 false 면 cue 를 받지 않는다(트랙 목록은 받는다 — CC 버튼 표시용). `track = pickSubtitleTrack(tracks, lang)`. 언마운트/`src` 변경 시 늦게 온 응답은 무시.

- [ ] **Step 1: Failing tests**

```js
// subtitleFile.test.js
const ok = '1\n00:00:01,000 --> 00:01:05,000\n가\n';
it('정상: 문장 수와 마지막 끝', () => {
  expect(inspectSubtitleText(ok, 120)).toEqual({ ok: true, cueCount: 1, lastEnd: 65 });
});
it('영상보다 5초 넘게 길면 경고(저장 가능)', () => {
  expect(inspectSubtitleText(ok, 59).warning).toBe('자막이 영상보다 깁니다. 다른 영상의 자막이 아닌지 확인하세요.');
  expect(inspectSubtitleText(ok, 60).warning).toBeUndefined(); // 정확히 5초는 허용
  expect(inspectSubtitleText(ok, null).warning).toBeUndefined();
});
it('문장 없음 / 깨진 인코딩', () => {
  expect(inspectSubtitleText('메모', 10)).toMatchObject({ ok: false, error: '자막 문장을 찾을 수 없습니다. SRT/VTT 파일인지 확인하세요.' });
  expect(inspectSubtitleText('��\n00:00:01,000 --> 00:00:02,000\n��', 10))
    .toMatchObject({ ok: false, error: 'UTF-8로 저장된 자막 파일만 올릴 수 있습니다.' });
});
// videos.test.js
it('subtitleQueryUrl 은 한글·공백 URL 을 인코딩', () => {
  expect(subtitleQueryUrl('/api/files/videos/library/1_이차 함수.mp4'))
    .toBe('/api/video-subtitles?videoUrl=%2Fapi%2Ffiles%2Fvideos%2Flibrary%2F1_%EC%9D%B4%EC%B0%A8%20%ED%95%A8%EC%88%98.mp4');
});
```

- [ ] **Step 2: Run → FAIL** — `npm test -w @mathchois/client -- subtitleFile.test videos.test`

- [ ] **Step 3: Implement** the three files per Interfaces. `inspectSubtitleText` 검사 순서: `isLikelyMisdecoded` → `parseSubtitles` 0개 → 길이 경고(`durationSec != null && lastEnd > durationSec + 5`). (`readSubtitleFile` `readSubtitleFile` 오류 문구: 확장자 → "SRT 또는 VTT 자막 파일만 올릴 수 있습니다.", 크기 → "자막 파일이 너무 큽니다. 최대 2MB 까지 올릴 수 있습니다.").

- [ ] **Step 4: Run → PASS**

- [ ] **Step 5: Commit** — `git commit -m "feat(videos): 자막 API·캐시·업로드 전 검사·useVideoSubtitles 훅"`

---

### Task 5: 플레이어 자막 표시

**Files:**
- Create: `packages/client/src/components/videos/SubtitleOverlay.jsx`
- Modify: `packages/client/src/components/videos/VideoPlayer.jsx`

**Interfaces:**
- Consumes: Task 3 settings + `pickSubtitleTrack`/`SUBTITLE_SIZES`, Task 4 `useVideoSubtitles`, Task 1 `activeCues`.
- Produces: `SubtitleOverlay({ cues: SubtitleCue[] | null, time: number, size: 'sm'|'md'|'lg', raised: boolean })` — 표시할 문장이 없으면 `null`.

- [ ] **Step 1: `SubtitleOverlay`** — `activeCues(cues, time)` 를 하단 중앙에 표시: 래퍼 `pointer-events-none absolute inset-x-0 flex justify-center px-[5%] transition-[bottom]`, `bottom` 은 `raised` 면 `4.5rem`, 아니면 `0.75rem`; 문장 `<span>` 은 `bg-black/75 text-white rounded px-2 py-0.5 whitespace-pre-line text-center leading-snug max-w-[90%]`, 문장마다 줄을 나눈다. 글자 크기 `font-size`: sm `clamp(12px, 2.6cqw, 22px)`, md `clamp(14px, 3.4cqw, 30px)`, lg `clamp(16px, 4.4cqw, 40px)`. `aria-live="off"`(스크린리더 소음 방지).
- [ ] **Step 2: Wire into `VideoPlayer`**:
  - 컨테이너 `style` 에 `containerType: 'inline-size'`(cqw 기준).
  - `const { tracks, track, cues } = useVideoSubtitles(src, { enabled: settings.subtitlesOn, lang: settings.subtitleLang })`; `hasSubs = tracks.length > 0`.
  - 오버레이: `{hasSubs && settings.subtitlesOn && <SubtitleOverlay cues={cues} time={currentTime} size={settings.subtitleSize} raised={controlsVisible} />}` — 피드백/제스처 오버레이보다 앞(아래 층)에 렌더, `error` 일 때 숨김.
  - `toggleSubtitles` 콜백: `updateSettings({ subtitlesOn: !on })` + `showFlash('자막 켜짐' | '자막 꺼짐')` + `revealControls()`; `onKey` 에 `case 'c': case 'C':` (hasSubs 일 때만, 의존성 배열 갱신).
  - 컨트롤 바: 배속 버튼 왼쪽에 `hasSubs` 일 때만 `<button aria-label="자막" aria-pressed={on} title="자막 (C)">` + `Captions`/`CaptionsOff` 아이콘(켜짐 시 `bg-white/20`).
  - 설정 패널: `hasSubs` 일 때만 "자막" 섹션 — `끄기` + `tracks.map(t => t.label)` 버튼(선택 시 `subtitlesOn: true, subtitleLang: t.lang`), "글자 크기" `작게/보통/크게` (`SUBTITLE_SIZES`). 단축키 안내 문구에 ` · C 자막` 추가.
  - iPhone: `<video>` 자식으로 `tracks.map(t => <track key={t.id} kind="subtitles" src={t.url} srcLang={t.lang} label={t.label} />)`; `useEffect` 로 `webkitbeginfullscreen` → 켜져 있으면 `track` 과 같은 `srclang` 의 `textTracks[i].mode = 'showing'`, `webkitendfullscreen` → 모두 `'disabled'`.
- [ ] **Step 3: Verify** — `npm run lint` (repo root) → 0 errors; `npm run build` → success.
- [ ] **Step 4: Browser check** — dev 서버를 띄울 수 있으면(DB 필요) Playwright 로 자막 있는 영상 미리보기를 열어 문장 표시, CC 토글, `C` 키, 크기 변경, 컨트롤 바 숨김 시 자막이 내려오는지 스크린샷으로 확인. DB 가 없으면 `SubtitleOverlay` 를 임시 페이지 없이 검증할 수 없으므로 건너뛰고 보고서에 명시.
- [ ] **Step 5: Commit** — `git commit -m "feat(videos): 플레이어 자막 오버레이·CC 버튼·C 단축키·글자 크기"`

---

### Task 6: 등록/수정 폼 자막 칸 + 목록 CC 배지 + 문서

**Files:**
- Create: `packages/client/src/components/videos/SubtitleField.jsx`
- Modify: `packages/client/src/components/videos/VideoForm.jsx`, `packages/client/src/pages/Videos/VideosPage.jsx`, `.claude/PROJECT_MAP.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: Task 4 `readSubtitleFile`, `listVideoSubtitles`, `uploadVideoSubtitle`, `deleteVideoSubtitle`, `invalidateVideoSubtitles`, `getVideo`; `FileDropZone`, `IconButton`.
- Produces: `SubtitleField({ current: VideoSubtitle | null, value: SubtitleChange, onChange(next: SubtitleChange), durationSec: number | null, disabled: boolean })` where `SubtitleChange = null | { action: 'upload', file: File, info: { cueCount, lastEnd, warning? } } | { action: 'delete' }`.

- [ ] **Step 1: `SubtitleField`** — 제목 "자막 (한국어)". `FileDropZone`(`accept=".srt,.vtt"`, `maxBytes=MAX_SUBTITLE_BYTES`, icon `Captions`)으로 파일을 받으면 `readSubtitleFile` → `ok:false` 면 오류 문구를 칸 안에 보이고 `onChange(null)`; `ok` 면 `onChange({ action: 'upload', file, info })`. 상태 문구: 없음 → "자막 없음 — .srt / .vtt 파일(UTF-8, 2MB 이하)을 올릴 수 있습니다", 등록됨 → "등록됨 · 문장 {cueCount}개 · {updatedAt 날짜}", 새 파일 → "{파일명} · 문장 {n}개 · 마지막 {formatDuration(lastEnd)}" + `warning`(amber), 삭제 예정 → "저장하면 자막이 삭제됩니다". 버튼: 기존 자막이 있고 변경 없음 → [교체](open)·[삭제](`Trash2`, danger → `{action:'delete'}`), 변경 있음 → [되돌리기](`Undo2` → `null`). `durationSec` 이 바뀌면(영상 교체) 선택된 파일의 경고를 다시 계산한다.
- [ ] **Step 2: `VideoForm` 연결**
  - 수정 모드 마운트 시 `listVideoSubtitles(initial.videoUrl)` → `ko` 행을 `currentSubtitle` 로(실패 시 null).
  - 상태 `subtitleChange`, `savedVideo`(영상 저장은 됐지만 자막 단계가 실패한 경우의 저장 결과).
  - `applySubtitleChange(videoId)`: upload → `setStage('자막 올리는 중…')` + `uploadVideoSubtitle(videoId, 'ko', file)`; delete → `deleteVideoSubtitle(videoId, 'ko')`; 그 뒤 `invalidateVideoSubtitles()`.
  - `submit`: `savedVideo` 가 있으면 영상 단계를 건너뛰고 `applySubtitleChange(savedVideo.id)` → 성공 시 `onSaved(await getVideo(savedVideo.id))`. 없으면 기존 흐름 → `saved` 후 `subtitleChange` 가 있으면 `applySubtitleChange(saved.id)`; 이 단계가 실패하면 `setSavedVideo(saved)` + 오류 "영상은 저장했지만 자막을 올리지 못했습니다: {message}" 를 보이고 폼을 닫지 않는다. 성공하면 `onSaved(subtitleChange ? await getVideo(saved.id) : saved)` (목록의 `subtitleLangs` 갱신).
  - `savedVideo` 가 있을 때: 제출 버튼 label "자막 다시 올리기", 영상/썸네일/메타 입력 `disabled`, [취소] 는 `onSaved(savedVideo)` 를 호출(이미 저장된 영상이 목록에 반영되도록).
  - 설명 textarea 아래에 `<SubtitleField … durationSec={durationSec} disabled={saving} />`.
- [ ] **Step 3: `VideosPage` CC 배지** — 제목 칸에서 `v.subtitleLangs?.length > 0` 이면 제목 뒤에 `<span title="자막 있음" aria-label="자막 있음" className="ml-1 rounded border border-gray-300 px-1 text-[10px] font-semibold text-gray-600">CC</span>`.
- [ ] **Step 4: Docs** — `CLAUDE.md` 영상자료 문장에 "+ 언어별 자막(`video_subtitles`, .srt/.vtt → WebVTT; `docs/superpowers/specs/2026-10-22-video-subtitles-design.md`)" 추가, Data model 표 목록에 `video_subtitles` 추가. `.claude/PROJECT_MAP.md` 의 서버 라우트 표·클라이언트 구성·테이블 목록에 새 파일/라우트/테이블 반영. 스펙 상태 줄을 "→ 구현 완료 (2026-10-23)" 로 갱신.
- [ ] **Step 5: Verify** — `npm test -w @mathchois/client` 전체 PASS, `npm run lint` 0 errors, `npm run build` 성공. DB 가 있으면 수동: 새 영상 + 자막 등록 → 목록 CC 배지 → 수정에서 교체/삭제 → 자막 서버를 일부러 막고(예: 잘못된 파일 대신 DevTools 로 POST 차단) 저장 → "자막 다시 올리기" 로 재시도 시 영상이 하나만 남는지 확인.
- [ ] **Step 6: Commit** — `git commit -m "feat(videos): 영상 등록/수정 폼 자막 칸·목록 CC 배지·문서"`

---

## 최종 확인

- [ ] `npm test -w @mathchois/client`, `npm run typecheck -w @mathchois/shared`, `npx tsc --noEmit -p packages/server`, `npm run lint`, `npm run build` 모두 통과.
- [ ] `git push -u origin ccr-70f780d4-qqkr8o`
