# AI활용 허브 이전 (AI Hub Migration) — 1단계 설계

작성일: 2026-10-28
상태: 질의응답으로 확정 (완전 이전 · 편집기 포함(원본은 관리자, 빈칸은 교사) · 학급별 토글 하나 · 2단계 분리)

## 배경 / 문제

me.chois.pro 의 AI활용 허브(`/ai/motion/`, `/ai/slide/`, `/ai/brand/`)는 오빠두엑셀(oppadu.com/ai) 자료를
바탕으로 만든 세 갤러리다 — 모션 그래픽 프롬프트(Chois 가 HyperFrames 로 다시 만든 영상 50편), 슬라이드
디자인 프롬프트(학교 상황으로 다시 만든 덱 113종), 브랜드 룩북(디자인 시스템 290개 사본). 오빠두엑셀은
2026-10-28 메일로 **출처만 밝히면 웹페이지 자료 전부를 써도 된다**고 허락했다.

me.chois.pro 의 `/ai` 와 그 Railway Volume 은 곧 없앤다. 세 갤러리와 자료를 **class.chois.pro(MathChois)로
완전히 옮기고**, 학급에서 교사가 허용했을 때 학생이 볼 수 있게 한다.

2026-10-28 에 원천 폴더가 있던 SD 카드(`Chois_SD2`)가 손상되어 오빠두 원본 미디어·회원 프롬프트 전문·변형
PDF 원본은 유실됐다. 남은 것은 (1) me.chois.pro Volume 의 자료 전부, (2) GitHub `my-introduction` 브랜치
`feat/ai-oppadu-originals`(모션 106·슬라이드 748 목록, `source` 병합 로직, 출처 표시 컴포넌트, 메모리),
(3) 이 세션에서 복원한 오빠두 수집 스크립트 둘(`download-oppadu-v2.cjs`, `build-oppadu-v2.cjs`)이다.

## 목표 (1단계)

1. `class.chois.pro/ai/motion`, `/ai/motion/:id`, `/ai/slide`, `/ai/brand` 가 me.chois.pro 와 같은 내용·동작으로
   열린다. 접근은 **로그인한 교사·관리자는 항상**, **학생은 소속 학급 중 하나라도 허용이면**.
2. 교사가 학급 상세에서 **"학생에게 AI활용 열기"** 를 켜고 끈다. 켜진 학급의 헤더에 학생용 **AI활용** 단추가 보인다.
3. 모션 프롬프트 **편집기**(`/ai/motion/:id/edit`)를 오빠두의 현재 구성(v2 엔진 `ms-prompt.js`)대로 만든다.
   빈칸 채우기·옵션·복사는 교사 누구나, **원본 틀·장면표·소리 큐 편집은 관리자(`isAdmin`)만**.
4. me.chois.pro Volume 의 자료(모션 50·슬라이드 113·브랜드 사본·프롬프트·manifest)를 MathChois Volume 과
   Postgres 로 옮긴다. 자료 추가 스크립트(import/prepare/push)도 MathChois 저장소로 옮긴다.
5. 데이터 모델에 처음부터 항목별 **출처 구분**(`source`)과 출처 표시(배지·링크·푸터 문구)를 둔다. 2단계에서
   오빠두 원본을 채울 때 화면을 다시 고치지 않는다.

### 비목표 (Out of scope — 2단계로)

- 오빠두 원본(모션 51번 이후·슬라이드 630종·브랜드 갱신분)의 **재수집·병합 파이프라인**. 별도 명세(「AI활용 허브
  오빠두 동기화」)로 쓴다. 1단계 화면은 `source: 'oppadu'` 항목의 미디어가 하나도 없어도 동작한다.
- me.chois.pro 쪽 회원 체계(가입 신청·승인·회원 관리)의 이전. MathChois 의 교사/학생/관리자 계정으로 대체한다.
- me.chois.pro `/ai/*` 의 삭제·리다이렉트(`/ai/* → class.chois.pro/ai/*`). 이전이 끝난 뒤 별도 작업.
- 슬라이드 프롬프트의 화면 편집기. 슬라이드는 복사만 한다(프롬프트 수정은 import 로).
- 목록 메타(이름·분류·컨셉 등)의 화면 편집. import 스크립트로만 바꾼다.
- 페이지별(모션/슬라이드/브랜드) 세부 허용. 학급 토글 하나로 셋을 묶는다.

## 핵심 설계 결정

| 결정 | 선택 | 비고 |
|---|---|---|
| 자료 원본 | **MathChois 로 완전 이전** | me.chois.pro 와 그 Volume 은 없앤다. 프록시·iframe 임베드는 쓰지 않는다. |
| 허용 단위 | **학급별 토글 하나** `classrooms.ai_hub_enabled` | 페이지별 세부 허용은 YAGNI. |
| 접근 판정 | 서버 preHandler `requireAiHub` + 클라이언트 가드 `AiHubRoute` | 단추를 숨기는 것만으로는 주소 직접 입력을 못 막는다. |
| 영상·이미지 서빙 | 기존 `/api/files/ai-hub/...`(공개, Range 지원) | 다른 버킷(챕터 이미지)과 같은 공개 수준. 허락받은 자료라 허용. |
| 브랜드 룩북 | 전용 라우트 `/api/ai/brand/site/*`(공개) + `frame-ancestors` CSP | iframe 은 Authorization 헤더를 못 보낸다. 사본은 상대 주소로 서로를 읽는다. |
| 프롬프트 저장 | **Postgres** `ai_motion_prompts`, `ai_slide_prompts` | 관리자 편집기가 고치고 import 도 같은 API 로 upsert. 저장소가 한 곳. |
| 목록(카탈로그) | **저장소** `packages/shared/src/ai-hub/` | import 가 파일을 다시 쓴다. 지금 `content/*/public.json` 커밋 흐름과 같다. |
| 프롬프트 엔진 | 오빠두 `ms-prompt.js` 를 TS 로 그대로 이식 | 옛 틀(01–50)과 v2 틀을 한 엔진으로. 화면·복사·검증이 같은 함수를 쓴다. |
| 편집기 권한 | 빈칸·옵션·복사 = 교사 누구나(브라우저 저장) · 원본 편집 = 관리자 | 원본은 모든 학급이 함께 보는 전역 자료. |
| 업로드 | `PUT /api/ai/media?path=` Bearer `AI_MEDIA_UPLOAD_TOKEN` | me.chois.pro `media-push` 프로토콜 그대로(sha256·임시 파일·허용 경로). |
| 첫 이전 | Mac 에서 `ai:pull`(me.chois.pro → `.media-out/`) → `ai:push`(→ class.chois.pro) | Mac 에 사본이 남는다(SD 카드 유실 교훈). |
| 화면 틀 | `AiHubLayout`(Navbar + 허브 머리글), `DashboardLayout` 밖 | 전체 폭 갤러리. 겉모습은 MathChois 토큰. |
| 테스트 | 순수 함수는 `packages/shared` 에 두고 클라이언트 Vitest 로 | `classroomColorShared.test.js` 패턴. 서버 패키지에 테스트 러너를 새로 들이지 않는다. |

## 데이터 모델

### `classrooms` (컬럼 추가)

```sql
ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS ai_hub_enabled boolean NOT NULL DEFAULT false;
```

`schema.ts` 에 `aiHubEnabled: boolean('ai_hub_enabled').notNull().default(false)`. 학급 목록·상세 응답에 `aiHubEnabled` 를 싣는다.

### `ai_motion_prompts` (새 테이블)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | text PK | 모션 id (`01-pixel`, `51-pop-poster`) — 카탈로그와 같은 값 |
| `prompt_en` | text | 영문 틀(옛 문법 또는 v2 문법) |
| `prompt_ko` | text | 국문 틀 |
| `shots` | jsonb | `[시간, 장면, 왜][]` |
| `cues` | jsonb | `[시각, 소리, 화면 이벤트][]` |
| `updated_at` | timestamptz | |

### `ai_slide_prompts` (새 테이블)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | text PK | 슬라이드 id (`24`, `426`) |
| `prompt` | text | 스타일 프롬프트 |
| `updated_at` | timestamptz | |

둘 다 `startupMigrate.ts` 의 `CREATE TABLE IF NOT EXISTS` 로 만든다. 카탈로그에 있지만 프롬프트 행이 없는 항목은
화면에서 "프롬프트 데이터 준비 중"으로 보인다(지금 me.chois.pro 와 같음).

### 카탈로그 — `packages/shared/src/ai-hub/`

me.chois.pro `content/motion`·`content/slide` 와 복구 브랜치의 `source` 필드를 합친 것. zod 는 shared 에 없으므로
**타입 + 순수 검증 함수**로 둔다(zod 검증은 서버·스크립트에서).

```ts
// motion.ts
export const MOTION_GROUPS = ['게임·만화', '종이·공예', '손그림·노트', '그림·일러스트', '포스터·인쇄', '네온·레트로 컴퓨터', '입체·3D', '무대·영화', '한국'] as const;
export const MOTION_SOURCES = ['chois', 'oppadu'] as const;   // chois = 다시 만든 판, oppadu = 원본+출처
export type MotionPublic = { id: string; no: number; group: MotionGroup; name: string; en: string; use: string; concept: string; featured: boolean; source: MotionSource;
  kind?: string; kindLabel?: string; secs?: number };          // v2 원본에만 있는 종류·길이(없으면 10초 인트로)
export const MOTION_CATALOG: readonly MotionPublic[];         // motion.data.ts — import 스크립트가 다시 쓴다

// slide.ts
export const SLIDE_FAMILIES = [{ key: 'work', label: '업무·보고' }, …] as const;   // 7개, 지금과 같음
export const SLIDE_SOURCES = ['school', 'oppadu'] as const;
export type SlidePublic = { id: string; no: number; family: SlideFamily; name: string; look: string; use: string; topic?: string; slides: number; cover: number; body: number; added: string; source: SlideSource };
export const SLIDE_CATALOG: readonly SlidePublic[];           // slide.data.ts

// source.ts — 출처 표시 문구·링크(화면과 푸터가 함께 쓴다)
export const OPPADU = { motion: 'https://www.oppadu.com/ai/motion-styles/', slide: 'https://www.oppadu.com/ai/slide-styles/', brand: 'https://www.oppadu.com/ai/design-systems-site/' };
export function creditLine(tab: 'motion' | 'slide' | 'brand'): string;   // 푸터 한 줄
```

카탈로그 규칙(복구 브랜치와 같음): id 중복 없음, no 중복 없음, 슬라이드 `cover/body ≤ slides`, 모션 id `^\d{2,3}-[a-z0-9-]+$`,
슬라이드 id `^\d{2,3}$`. 순서 = 화면의 기본 순서(인기순). `topic` 은 학교 덱에만 있다.

### 프롬프트 엔진 — `packages/shared/src/ai-hub/promptEngine.ts`

오빠두 `ms-prompt.js`(UMD `MSP`, 2026-10-25 판)를 함수 단위로 그대로 옮긴다. 공개 API:

```ts
export const DEF = { style: 'b', logo: true, sound: true, music: false, render: 'hf', len: 10, ratio: '16:9', lang: 'ko' } as const;
export const LEN = { min: 3, max: 90, long: 30 };
export const RATIOS: Record<Ratio, [number, number]>;        // 16:9 9:16 1:1 4:5 4:3 3:4 (30fps 고정)
export const LANGS: readonly Lang[];                          // ko en ja zh-Hans zh-Hant es fr de vi th id
export type PromptState = { style: 'a' | 'b'; logo: boolean; sound: boolean; music: boolean; render: 'hf' | 'remotion'; len: number; ratio: Ratio; lang: Lang };
export function state(partial?: Partial<PromptState> | null): PromptState;   // 기본값 보정·범위 보정
export function blanks(tpl: string, st?: PromptState): Blank[];              // { name, def, opt, on } — 남는 줄의 칸만
export function hasStyle(tpl: string): boolean;                              // {{#b}} 가 있으면 두 판(방식 고르기)
export function rows(tpl: string, ctx: { st?: PromptState; off?: Record<string, boolean>; L?: OptTexts; lang: 'en' | 'ko' }): Segment[][];
export function text(rows: Segment[][], val: (name: string) => string): string;
export function opt(key: string, st: PromptState, L: OptTexts, lang: 'en' | 'ko'): string;
export function isV2(tpl: string): boolean;                                   // /\{\{[@#]/ 가 있으면 v2
export function validateTemplate(tpl: string): string[];                      // 관리자 저장 전 검사 — 알 수 없는 {{#조건}}, 닫히지 않은 {{, 줄 가운데 {{#
export function tablesMarkdown(item: { shots; cues }, lang: 'en' | 'ko'): string;   // 장면표·소리 큐를 마크다운 표로 (me.chois.pro 와 같음)
export function finalPrompt(tpl, st, values, off, L, lang, withTables, tables): string;   // 화면·복사·공개 상세가 같은 함수를 쓴다
```

틀 문법(엔진 머리 주석 그대로): `{{이름=기본값}}` · `{{?이름=기본값}}`(선택, 기본 켬) · `{{-이름=기본값}}`(선택, 기본 끔) ·
`{{@키}}`(체크·고르기 칸이 넣는 숨은 글) · 줄 맨 앞 `{{#조건}}`(sound·compose·logo·a·b·hf·remotion, `!` 부정, 여럿 가능) ·
`## N.` 절 번호 재매김 · `\{{` 글자 그대로. 옛 틀(01–50)은 `@`·`#` 이 없을 뿐 같은 규칙이다.

옵션 문구표(`v2opts`: `labels` + `en`/`ko` 의 hookOn·logo·compose·musicFile·renderHf… 24키)는 오빠두 공개 자료
`gallery-data.js` 에서 옮겨 `packages/shared/src/ai-hub/motionOpts.ts` 상수로 둔다.

## 접근 규칙

| 사용자 | `/ai/*` 화면 | `GET /api/ai/motion`·`/slide` | 편집기 빈칸·복사 | 원본 저장 `PUT …/prompt` | 학급 토글 PATCH |
|---|---|---|---|---|---|
| 비로그인 | `/` 로 이동 | 401 | — | — | — |
| 역할 없음 | `/choose-role` | 403 | — | — | — |
| 학생(허용 학급 있음) | 열람 | 200 | 편집기 링크 안 보임, 주소 직접 입력은 403 | 403 | — |
| 학생(허용 학급 없음) | 자기 학급 목록으로 | 403 | 403 | 403 | — |
| 교사 | 열람 | 200 | 가능 | 403 | 자기 학급만 |
| 관리자(`isAdmin`, 어느 역할이든) | 열람 | 200 | 가능 | 200 | 자기 학급만(교사일 때) |

- 서버 `middleware/aiHub.ts` 의 `requireAiHub`: `teacher` 또는 `isAdmin` 이면 통과, `student` 면
  `classroom_members ⋈ classrooms WHERE student_id = me AND ai_hub_enabled` 가 1건 이상이면 통과, 아니면 403.
  판정 자체는 `shared/src/ai-hub/access.ts` 의 순수 함수 `canUseAiHub({ role, isAdmin, allowedClassrooms })` 로 빼서 테스트한다.
- `GET /api/ai/access` → `{ allowed: boolean, canEdit: boolean(교사·관리자), canEditOriginal: boolean(관리자) }`.
- 영상·이미지(`/api/files/ai-hub/*`)와 브랜드 사본(`/api/ai/brand/site/*`)은 인증 없이 나간다(결정표 참고).

## 서버

### 라우트 — `routes/aiHub.ts`

| 메서드·경로 | 권한 | 동작 |
|---|---|---|
| `GET /api/ai/access` | authenticate | 위 접근 결과 |
| `GET /api/ai/motion` | authenticate + requireAiHub | 카탈로그 × manifest → 렌더된 항목만 `{ …MotionPublic, video, poster, preview, prompt? }`. `prompt` = DB 행 `{ en, ko, shots, cues, v2 }` 또는 null |
| `GET /api/ai/slide` | authenticate + requireAiHub | `{ …SlidePublic, images[], thumbs[], coverCard, bodyCard, prompt? }` — 그림이 하나라도 없는 스타일은 뺀다(지금과 같음) |
| `PUT /api/ai/motion/:id/prompt` | authenticate + requireAdmin | `{ en, ko, shots, cues }` 검증(`validateTemplate`, 표 3열, 길이 상한) 후 upsert. 응답 = 저장된 행 |
| `GET /api/ai/brand/site/*` | 공개 | 허용 목록 정규식 밖 404. HTML 은 셸 숨김 스타일 삽입(`embedBrandHtml`), `Content-Security-Policy: frame-ancestors …`(`routes/storage.ts` 의 `buildFrameAncestors` 재사용), `X-Frame-Options`·`Origin-Agent-Cluster` 제거(`reply.raw.removeHeader`), `X-Robots-Tag: noindex`, `Cache-Control: private, no-cache`(HTML) / `private, max-age=600` |
| `PUT /api/ai/media?path=<rel>` | Bearer `AI_MEDIA_UPLOAD_TOKEN` | 스트리밍 저장(임시 → rename), `x-content-sha256` 대조, 100 MB 상한, 허용 경로 정규식, manifest JSON 은 스키마 검증 |
| `GET /api/ai/media/manifest?set=motion|slide|brand` | Bearer 토큰 | Volume 의 manifest(없으면 `{}`) |
| `PUT /api/ai/prompts/:set` | Bearer 토큰 | `set=motion`: `MotionAdmin[]` → `ai_motion_prompts` 전체 upsert · `set=slide`: `SlideAdmin[]` → `ai_slide_prompts` |

토큰 비교는 `timingSafeEqual`. 토큰 env 가 없으면 업로드 라우트 셋은 모두 503(`upload disabled`).

### Volume 배치 — 버킷 `ai-hub/`

```
ai-hub/motion/<id>/{video.mp4, preview.mp4, poster.webp}
ai-hub/slide/<id>/{k}.webp · <id>/s/{k}.webp(240×134) · <id>/t/{k}.webp(760×424, 표지·본문만)
ai-hub/brand/{index.html, brand/<slug>.html, assets/{app,ai-hub-static,shell}.js, assets/{app,ai-hub,shell,tokens}.css, assets/fonts/PretendardVariable.woff2, data/brands-index.json, data/{hero,detail}/<slug>.json}
ai-hub/manifest/{motion,slide,brand}.json      // { "<rel>": { size, sha256, updatedAt } }
```

허용 경로(업로드·서빙 공통, `shared/src/ai-hub/paths.ts`):

```ts
export const MOTION_FILE = /^motion\/\d{2,3}-[a-z0-9-]+\/(video\.mp4|preview\.mp4|poster\.webp)$/;
export const SLIDE_FILE  = /^slide\/\d{2,3}\/(?:[st]\/)?\d{1,2}\.webp$/;
export const BRAND_FILE  = /^brand\/(?:index\.html|brand\/[a-z0-9-]+\.html|assets\/(?:app|ai-hub-static|shell)\.js|assets\/(?:app|ai-hub|shell|tokens)\.css|assets\/fonts\/PretendardVariable\.woff2|data\/brands-index\.json|data\/(?:hero|detail)\/[a-z0-9-]+\.json)$/;
export const MANIFEST_FILE = /^manifest\/(motion|slide|brand)\.json$/;
```

미디어 주소는 `/api/files/ai-hub/<rel>?v=<sha256 앞 8자>` — manifest 의 sha 로 버전을 붙여 캐시가 안전하게 오래 간다.
`routes/storage.ts` 는 `ai-hub` 버킷의 `?v=` 요청에 `Cache-Control: public, max-age=31536000, immutable` 을 붙인다(그 외 버킷은 지금 그대로).

### 환경 변수 (`config/env.ts`)

- `AI_MEDIA_UPLOAD_TOKEN` (선택, ≥ 32자) — 없으면 업로드 비활성.
- 기존 `FRAME_ANCESTORS`·`APP_URL` 을 브랜드 라우트도 그대로 쓴다.

## 클라이언트

### 라우트 (`App.jsx`)

```
<Route element={<AiHubRoute />}>            // 로그인·역할·allowed 판정
  <Route element={<AiHubLayout />}>
    <Route path="/ai" element={<Navigate to="/ai/motion" replace />} />
    <Route path="/ai/motion" element={<MotionGalleryPage />} />
    <Route path="/ai/motion/:id" element={<MotionDetailPage />} />
    <Route path="/ai/slide" element={<SlideGalleryPage />} />
    <Route path="/ai/brand" element={<BrandPage />} />
  </Route>
  <Route path="/ai/motion/:id/edit" element={<MotionEditorPage />} />   // 전체 화면(레이아웃 밖), 교사·관리자
</Route>
```

파일: `pages/AiHub/{AiHubLayout,AiHubRoute,MotionGalleryPage,MotionDetailPage,SlideGalleryPage,BrandPage,MotionEditorPage}.jsx`,
구성 요소 `components/aiHub/{AiTabs,AiIntro,FilterPicker,MotionCard,MotionGallery,PromptCopy,OriginalBadge,OriginalCredit,SlideCard,SlideGallery,SlideSortMenu,SlideViewer,SlidePrompt,KeyNav}.jsx`,
편집기 `components/aiHub/editor/{PromptPane,BlankRow,OptionRows,PromptPreview,RowsTable,OriginalEditor}.jsx`,
순수 로직 `lib/aiHub/{slideOrder.js, slideHash.js, editorStore.js}` (+ `.test.js`), 데이터 훅 `hooks/useAiHubData.js`(`lib/dataCache.js` 로 캐시).

### `AiHubRoute`

`useAuth()` 로 로그인·역할을 보고, `GET /api/ai/access` 를 한 번 불러 `allowed` 를 컨텍스트로 내린다.
비로그인 → `/`, 역할 없음 → `/choose-role`, `allowed=false` → `/{role}/classrooms`. 로딩 중에는 `ProtectedRoute` 와 같은 "로딩 중…" 화면.

### `AiHubLayout`

`Navbar` + 머리글(제목 "AI활용", 탭 칩 모션·슬라이드·브랜드, 탭별 소개 한 줄 — 모바일은 접힘, 오른쪽 "학급으로" 링크) + `<Outlet/>` + 푸터 한 줄(`creditLine(tab)`).
"학급으로"는 `location.state.from`(학급 상세가 `navigate('/ai', { state: { from } })` 로 넘김)이 있으면 그 주소, 없으면 `/{role}/classrooms`.

### 학급 상세 (`ClassroomDetail.jsx`)

- 헤더 오른쪽 단추 묶음에 `IconButton`(Sparkles, label "AI활용") — 교사·관리자는 항상, 학생은 `classroom.aiHubEnabled` 일 때. 누르면 `/ai` 로 이동(state.from = 현재 주소).
- 교사의 `#` 패널(참여 코드·표지 색)에 스위치 한 줄 **"학생에게 AI활용 열기"**. 바꾸면 즉시 `PATCH /api/classrooms/:id { aiHubEnabled }`; 실패하면 `colorError` 자리에 "AI활용 설정을 저장하지 못했어요" 와 함께 스위치를 되돌린다.
- `PATCH /api/classrooms/:id` 는 `aiHubEnabled` 가 boolean 이 아니면 400.

### 모션 갤러리 `/ai/motion`

- 분류 거르기 `?g=`(모바일 `<select>`, 데스크톱 칩 — `FilterPicker`), 2~6열 카드 격자, 카드 호버 시 무음 미리보기(터치 기기는 바로 상세), `source: 'oppadu'` 카드에 「원본」 배지.
- 자료 없음(manifest 없음·항목 0) → "예시를 준비하고 있어요" (관리자에게는 `npm run ai:push` 안내 한 줄 추가).

### 모션 상세 `/ai/motion/:id`

왼쪽 영상(`controls`, 포스터), 오른쪽 번호·이름·영문·쓰임·컨셉, 원본이면 출처 줄(`OriginalCredit`: "출처 오빠두엑셀 「모션 스타일 갤러리」 원본 예시·프롬프트" 링크).
**프롬프트 복사(영문)/(국문)** — `finalPrompt(틀, state(null), {}, {}, L, lang, true, tables)` 즉 기본 상태(방식 b·길이 10·16:9·ko…)로 완성한 글 + 장면표·소리 큐 표.
교사·관리자에게만 **빈칸 편집·장면표** 링크. 이전/목록/다음 단추와 ←/→ 키(`KeyNav`: 입력 중·영상 포커스면 무시).

### 슬라이드 갤러리 `/ai/slide`

- `?f=`(분류) `?s=`(pop|no|new, 기본 pop) `?v=`(cover|body) — 주소가 유일한 진실 공급원(`slideOrder.js` 의 `parseQuery/toSearch/arrange`).
- 카드: 표지↔본문 호버 교차, 「원본」 배지(`source: 'oppadu'`).
- 상세 창은 `#<id>` 해시(`slideHash.js`)로 여는 전체 화면 `<dialog>`: 큰 그림 + 썸네일 줄 + 장/스타일 이동(←/→, 스와이프 40px, 전체 화면 단추는 `document.fullscreenEnabled` 일 때만), 오른쪽 분류·번호·이름·분위기(look)·"이럴 때 좋아요"·"예시 주제"(topic 있을 때만)·출처 줄(원본) + **스타일 프롬프트 복사**(없으면 "프롬프트 데이터 준비 중").
- 거르기 밖 스타일을 해시로 열면 닫을 때까지 거르기를 무시한 전체 순서로 넘긴다(`opensOutsideFilter`).

### 브랜드 `/ai/brand`

`<iframe src="/api/ai/brand/site/" title="브랜드 룩북" allow="clipboard-write">` 하나. 높이 = `100dvh − 머리글 − 푸터`.
외부 링크 새 창 열기는 사본에 심어 둔 스크립트가 맡는다(`brand-import` 가 넣음).

### 편집기 `/ai/motion/:id/edit` — `MotionEditorPage`

오빠두 상세 창(`#msl-d`) 구성 그대로. 전체 화면(어두운 배경), `DashboardLayout`·`AiHubLayout` 밖.

- **머리**: 닫기(Esc → 상세로), 이전/다음(←/→, 갤러리 순서), "n / N", `분류 › 이름`, **소리 켜기** 토글(`aria-pressed`; 영상은 무음 자동재생·루프, 토글 상태는 `localStorage`).
- **왼쪽**: 영상(포스터), 번호·종류(kindLabel 있으면 "종류 · 분류")·이름·영문·쓰임·컨셉. 렌더 안 된 원본은 "아직 렌더하지 않은 스타일입니다".
- **오른쪽 탭** `프롬프트 | 장면표 | 소리 큐`(키 1·2·3). 프롬프트 행이 없으면 "프롬프트 데이터가 없습니다 — `npm run ai:push` 를 실행하세요".
- **프롬프트 탭** (위에서 아래로):
  1. 안내문 "빈칸을 내 채널로 바꾸면 프롬프트가 완성돼요. 바꾼 값은 다른 스타일로 넘어가도 그대로예요."
  2. v2 틀이고 두 판이면(`hasStyle`) **방식** 세그먼트 「내 주제에 맞게 | 예시 그대로」(기본 b).
  3. 빈칸 줄 목록(`BlankRow`): 「이름 알약 : 입력칸」. 선택 칸(`opt`)은 알약 안 체크로 켜고 끄며, 끄면 그 줄이 프롬프트에서 빠진다. 80자 넘는 기본값은 `textarea`(Enter 막음, 자동 높이).
     - **내 주제에 맞게**(b): 입력칸 비움·자리표시 없음, 빈 칸은 완성 글에 `[칸 이름]`.
     - **예시 그대로**(a): 예시 값으로 채우고 자리표시도 예시.
     - 옛 틀(01–50, v2 아님): 주 칸(`채널 이름·브랜드 이름·한 줄 소개·주제·숫자`)만 위에, 나머지는 **「세부 설정 · n가지 중 m가지 사용」** 접이식(`<details>`). v2 는 모두 한 목록.
  4. v2 만: **길이**(초, `number`, 3–90, 범위 밖이면 안내문 "최대 90초까지 만들 수 있어요"/"3초보다 짧게는 만들지 않아요", 항목 기본값은 그 편의 `secs`), **화면**(비율 6종 세그먼트, "30fps" 표시), **렌더링** 「HyperFrames | Remotion」+ (i) 라이선스 안내·링크, **화면 글자**(언어 11 `<select>`), **옵션** 제목 + 3열 체크 「로고 파일 있음 · 사운드트랙 만들기 · 배경 음악 있음」(음악은 사운드트랙 켤 때만 활성) + (i) 설명 셋.
  5. 행동 줄: 영문/국문 세그먼트, **기본값으로**(값·끈 칸·옵션이 기본과 다를 때만 보임), **프롬프트 복사**(주 단추), **장면표·소리 큐 포함** 토글(기본 켬; me.chois.pro 기능 유지).
  6. **완성 프롬프트**: `rows()` 결과를 줄 단위로 — 머리(`## `)·목록(`- `)·`**굵게**`·`` `코드` `` 만 가볍게 렌더, 채운 값은 `<mark>`(내가 바꾼 값은 강조, 빈 값은 `[칸 이름]` 흐리게), 글자 수, 복사 미니 단추. 복사 글자는 마크다운 기호를 그대로 둔다.
- **장면표·소리 큐 탭**: 3열 표(시간(초)·장면·왜 이렇게 / 시각(초)·소리·화면 이벤트) + "n개 장면 · N초"/"n개 큐".
- **상태 저장**(`lib/aiHub/editorStore.js`, `localStorage`): `aiHub.fill`(`{ v: {칸: 값}, off: {칸: true} }`), `aiHub.opt`(`PromptState`), `aiHub.lang`, `aiHub.lenOwn`(길이를 직접 정했는지 — 아니면 편마다 `secs` 를 따라감), `aiHub.sound`, `aiHub.withTables`. 모든 스타일에 공통. 칸 이름은 영문 틀 기준이고 국문 틀의 같은 자리 칸과 짝지어(`blanksOf` 의 `key`) 한 값으로 둔다.
- **복사**: Clipboard API → 실패 시 숨은 `textarea` 선택 + `execCommand('copy')`. 성공하면 단추가 1.5초 "복사됨".
- **원본 편집**(관리자만 보이는 머리 스위치 **원본 편집**): 오른쪽 패널이 편집 모드 — 영문·국문 틀 `textarea`(위에 문법 요약 6줄), 장면표·소리 큐는 행 추가·삭제·순서 유지되는 3열 표 편집, **저장**(`PUT /api/ai/motion/:id/prompt`), **되돌리기**. 저장 전 `validateTemplate` 오류를 줄 번호와 함께 보여 주고 막는다. 저장하면 캐시를 갱신해 미리보기가 바로 바뀐다. 편집 모드로 들어가면 ←/→·1·2·3 키는 끈다(입력 중).

## 자료 이전과 추가 — `scripts/ai-hub/`

MathChois 루트에 `scripts/ai-hub/` 를 두고 루트 `package.json` 에 `tsx`·`zod` 를 devDependency 로, 스크립트를 추가한다.
`.media-out/` 은 `.gitignore`.

| 명령 | 스크립트 | 동작 |
|---|---|---|
| `npm run ai:pull` | `pull.ts` | **1회성 이전.** me.chois.pro 에서 `.media-out/` 으로 전부 내려받는다: manifest 3개(`GET /api/media/manifest?set=`, 토큰) → 각 파일(`/media/<rel>` 공개, 브랜드는 `/ai/brand/site/<rel>` 공개) → `private/motion-admin.json`·`private/slide-admin.json`(my-introduction 에 새로 두는 토큰 보호 `GET /api/media/file?path=`). sha256 대조, 재실행 시 같은 sha 는 건너뜀. 끝나면 MathChois 배치(`ai-hub/…`)로 이름을 바꿔 둔다 |
| `npm run ai:motion:import` | `motion-import.ts` | 원천 JSON(Chois 판 `chois-gallery.json` + 2단계의 원본 `gallery.json`)을 읽어 `packages/shared/src/ai-hub/motion.data.ts` 와 `.media-out/prompts/motion.json` 을 쓴다. 복구 브랜치의 `splitGallery`(변형본 우선·없으면 원본) 그대로 |
| `npm run ai:slide:import` | `slide-import.ts` | 학교 덱 `manifest.json` + `deck.pdf`(pdftoppm·cwebp, PDF sha 스탬프로 건너뜀) + 2단계의 원본 그림 복사 → `slide.data.ts`, `.media-out/ai-hub/slide/…`, `.media-out/prompts/slide.json`. 복구 브랜치의 `buildSlideData` 그대로 |
| `npm run ai:brand:import` | `brand-import.ts` | 브랜드 사본(원천 폴더)을 `.media-out/ai-hub/brand/` 로. 외부 링크 새 창 스크립트 삽입·형제 링크 원본으로 되돌리기(지금과 같음) |
| `npm run ai:prepare` | `media-prepare.ts` | 렌더 mp4 → `video.mp4`(H.264 crf 23)·`preview.mp4`(640×360 무음)·`poster.webp`(9초 프레임), manifest 생성 |
| `npm run ai:push -- --set motion\|slide\|brand` | `media-push.ts` | 원격 manifest 와 sha 를 비교해 바뀐 파일만 `PUT /api/ai/media`, 프롬프트 JSON 은 `PUT /api/ai/prompts/:set`, 마지막에 manifest. env `AI_PUSH_URL`(기본 `http://localhost:3001`)·`AI_MEDIA_UPLOAD_TOKEN` |

첫 이전 순서(Mac): `ai:pull` → `ai:push --set motion` → `--set slide` → `--set brand` → class.chois.pro 에서 확인 → (별도 작업) me.chois.pro 정리.
`.media-out/` 은 지우지 말고 Mac 에 남긴다(원천 백업).

my-introduction 쪽 변경은 하나다: `GET /api/media/file?path=<rel>`(토큰, `isUploadablePath` 안의 경로만) 추가. 이 저장소의
`feat/ai-oppadu-originals` 브랜치는 2단계의 원천이므로 병합하지 않고 둔다.

## 출처 표시

- 카드: `source` 가 `oppadu` 면 「원본」 배지(모서리, `whitespace-nowrap`).
- 상세·슬라이드 창: "출처 오빠두엑셀 「모션 스타일 갤러리」 원본 예시·프롬프트" — 조각마다 `nowrap`, 조각 사이 공백에서만 줄바꿈(복구 브랜치의 `OriginalSource.tsx` 교정판).
- 푸터: 모션·슬라이드 "© oppadu.com/ai 의 자료를 가공하거나 출처를 밝혀 옮긴 것입니다." · 브랜드 "© oppadu.com/ai 에서 옮겨온 자료입니다."
- 카탈로그는 복구 브랜치의 106·748 목록을 그대로 쓴다. 1단계에는 `oppadu` 항목의 미디어가 없어 목록에서 빠지므로 화면에는
  50·113(모두 `chois`/`school`)만 보이고 배지·출처 줄은 나오지 않지만, 코드와 테스트는 넣는다.

## 오류 처리

| 상황 | 동작 |
|---|---|
| manifest 없음 / Volume 비어 있음 | 목록 API 는 `[]`, 화면은 빈 상태 문구 |
| 프롬프트 행 없음 | 복사 단추 비활성 + "프롬프트 데이터 준비 중", 편집기 패널에 안내 |
| 학생이 `/ai` 직접 입력(허용 학급 없음) | 가드가 학급 목록으로 보냄, API 는 403 |
| 토글 PATCH 실패 | 스위치 되돌림 + 오류 문구 |
| 업로드 sha 불일치 / 경로 불허 / 너무 큼 | 422 / 400 / 413, 임시 파일 삭제 |
| 관리자 저장 틀 오류 | 400 + `{ errors: string[] }`, 화면에 줄 번호와 함께 표시 |
| 브랜드 사본 파일 없음 | 404(iframe 안에 브라우저 기본 404) — 푸터 아래 "자료 준비 중" 문구는 두지 않는다 |
| 클립보드 막힘 | textarea 선택 폴백, 안내 "선택된 글을 직접 복사하세요" |

## 테스트

- **shared(클라이언트 Vitest 로 실행)**: `promptEngine.test.js` — 옛 틀 빈칸·선택 칸 끔·줄 제거, v2 `{{#}}` 조건(a/b·sound·compose·logo·hf/remotion·`!`)과 절 번호 재매김, `{{@}}` 옵션 글(hook·files 의 and/, 쉼표·render·format·shape·lang), 길이 30 초과 시 「긴 영상」 줄, `\{{` 글자 그대로, `blanks(st)` 가 조건 밖 칸을 빼는지, `validateTemplate` 오류, `tablesMarkdown`·`finalPrompt`; `access.test.js` — 결정표 6행; `catalog.test.js` — id/no 중복·cover/body 범위·정렬 유지; `paths.test.js` — 허용 경로.
- **client**: `slideOrder.test.js`, `slideHash.test.js`(me.chois.pro 테스트 이식), `editorStore.test.js`(채널 이름→브랜드 이름 이전, lenOwn), `classroomTabs` 패턴의 가드 판정.
- **server**: 서버 패키지에는 러너가 없으므로 순수 로직은 shared 로 뺀다. 업로드 핸들러의 sha·경로·크기 분기는 수동 검증 절차를 계획서에 둔다(curl 3건).
- **Playwright(클라이언트 e2e)**: 교사 로그인 → 학급 토글 켬 → 학생 로그인 → 헤더 AI활용 → 세 탭 열림 → 모션 상세 복사 단추 활성(프롬프트 행 있을 때) → 편집기 길이 바꾸면 미리보기 글자 수 변함.

## 2단계 예고 (별도 명세)

오빠두 원본 재수집·병합: `download-oppadu-v2.cjs`(공개 미디어)·회원 REST(`oppadu-tools/v1/motion-styles/prompts`, Mac 로그인 Chrome)·
`build-oppadu-v2.cjs`(완성 프롬프트) → `ai:motion:import` 의 `originals` 입력; 슬라이드 `OPD_SLIDE_STYLES` 748+ 와 `img/` 내려받기 → `ai:slide:import` 의 `originals`;
브랜드 `data/*.json` 재수집. 1단계의 `source` 필드·배지·출처 줄·엔진이 그대로 받는다.

## 가정

- 오빠두엑셀의 허락은 **출처 표기 조건의 공개 사용**이다. 미디어 파일 주소가 인증 없이 열리는 것은 이 범위 안으로 본다.
- MathChois 는 단일 인스턴스로 배포된다(Volume 파일 서빙·업로드 모두 한 서버).
- me.chois.pro 의 프롬프트(`private/*.json`)는 웹에서 편집된 적이 없어 2026-10-28 `.media-out` 과 같다. `ai:pull` 은 Volume 쪽을 원본으로 본다.
- Railway Volume 두 개 모두 50 GB 라 용량은 문제가 아니다.
