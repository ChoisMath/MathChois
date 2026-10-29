# AI활용 허브 오빠두 동기화 (AI Hub Oppadu Sync) — 2단계 설계

작성일: 2026-10-29
상태: 질의응답으로 확정 (Mac 에서 가끔 수동 실행 · 회원 자료는 북마클릿 · 웹에서 고친 원본은 갱신하지 않음 ·
오빠두에서 사라진 스타일은 남기고 알림 · 접근 방식 A)
선행: `2026-10-28-ai-hub-migration-design.md`(1단계, main 반영 완료)

## 배경 / 문제

1단계로 me.chois.pro 의 AI활용 허브(모션·슬라이드·브랜드)가 class.chois.pro `/ai/*` 로 옮겨졌다. 목록(카탈로그)은
git(`packages/shared/src/ai-hub/{motion,slide}.data.ts`), 프롬프트는 Postgres(`ai_motion_prompts`·`ai_slide_prompts`),
미디어는 Volume 버킷 `ai-hub/` 에 있고, 자료는 Mac 의 `.media-out/` 에서 `npm run ai:push` 로 올린다.

오빠두엑셀(oppadu.com/ai)은 모션 스타일·슬라이드 스타일·브랜드 룩북을 계속 늘리고 고친다(2026-10-28 메일로 출처
표시 조건의 전부 사용 허락). 새로 올라온 것은 **변형본(Chois 모션·학교 슬라이드)이 있으면 변형본, 없으면 원본을
출처와 함께** 싣는다. 그런데 1단계의 추가 스크립트(`ai:motion:import`·`ai:slide:import`)는 SD 카드에 있던 원천
폴더(`chois-gallery.json`, 학교 덱 PDF, 오빠두 스크랩)를 읽어 카탈로그를 **통째로 다시 쓰는** 구조이고, 그 원천은
2026-10-28 SD 카드 손상으로 사라졌다. 오빠두 원본 수집 스크립트(`download-oppadu-v2.cjs`·`build-oppadu-v2.cjs`,
브랜드 `build.cjs`)도 일부만 복원됐다.

2026-10-29 공개 자료 대조: 모션 오빠두 109편 / 카탈로그 106편(chois 50·oppadu 56) — 새 편 3(120–122), 사라진 편 0.
슬라이드 748 / 748(school 118·oppadu 630) — 차이 없음. 브랜드 293개(`generated_at` 2026-10-14).

## 목표

1. Mac 에서 북마클릿 2번 + `npm run ai:oppadu` 한 번으로 오빠두 세 갤러리의 새·바뀐 자료를 모은다.
2. git 카탈로그에 **증분 병합**한다 — 새 id 추가, 원본(`oppadu`) 항목 갱신, 변형본(`chois`·`school`)은 그대로,
   오빠두에서 사라진 id 는 남김. 사라진 원천 폴더 없이 동작한다.
3. 원본 모션 프롬프트를 **v2 틀 원문**으로 저장해 편집기가 오빠두와 같은 옵션으로 동작하게 한다.
4. 프롬프트는 **웹에서 고치지 않은 원본 행만** 갱신한다(새 서버 동기화 모드). 덮어쓴 행은 이전 내용을 백업한다.
5. 매 실행마다 사람이 읽는 보고서(추가·갱신·건너뜀·사라짐·엔진 변경)를 남긴다.
6. 받은 원본을 날짜별로 보관해 다시 원천을 잃지 않는다.

### 비목표 (Out of scope)

- 정기 자동 수집(서버 cron·GitHub Actions). 가끔 Mac 에서 수동으로 돌린다.
- 서버가 오빠두에 직접 접속하는 수집, 카탈로그의 DB 이전(접근 방식 B — 채택하지 않음).
- 변형본 제작(Chois 렌더·학교 덱) 자동화. 변형본은 1단계 `ai:motion:import`·`ai:slide:import` 그대로.
- 슬라이드 태그(`OPD_SLS_TAGS`)·모션 썸네일(`t/`)·효과음 mp3 의 화면 반영. 원본 보관에만 둔다.
- 사라진 오빠두 항목의 자동 삭제.

## 핵심 설계 결정

| 결정 | 선택 | 이유 |
|---|---|---|
| 실행 주기 | Mac 에서 가끔 수동 | 회원 프롬프트가 로그인 Chrome 에서만 나온다. 변경 검토(git diff)를 사람이 한다. |
| 회원 자료 받기 | 북마클릿 → 파일 다운로드(Blob) → 스크립트가 읽음 | https 페이지에서 127.0.0.1 로 보내기는 막힌다(Local Network Access, 2026-10-12 메모). 확장 프로그램 출력 잘림 문제도 없다. |
| 접근 방식 | **A** — Mac 스크립트가 수집·병합, 기존 `ai:push` 로 올림 | 1단계 구조(카탈로그 git · 프롬프트 DB · 파일 Volume · 토큰 업로드 · sha 비교) 유지. 서버 변경 최소. |
| 병합 기준 | git 카탈로그 + 오빠두 수집본, id 로 맞춤 | 원천 폴더 없이 동작. 카탈로그 변경이 git diff 로 보인다. |
| 변형본 | 있으면 건드리지 않음 | 사용자 원칙(변형본 우선, 원본은 출처와 함께, 이후 순차 교체). |
| 오빠두에서 사라진 항목 | 모션·슬라이드는 남기고 보고 / 브랜드는 오빠두 목록을 따르고 보고 | 이미 쓰는 자료를 지우지 않는다. 브랜드는 목록 JSON 이 화면을 그려 파일만 남겨도 보이지 않는다. |
| 원본 모션 프롬프트 | v2 틀 원문(`v2.en`·`v2.ko`) 저장 | 편집기의 방식·길이·화면·렌더링·언어 옵션이 오빠두와 같게 동작. |
| 프롬프트 갱신 | 웹에서 고치지 않은 행만(`edited_at IS NULL`), 이전 내용 백업 | 관리자의 웹 편집을 보존하면서 오빠두 수정은 따라간다. |
| 애매한 입력 | 아무것도 쓰지 않고 멈춤 | 처음 보는 분류·12장 초과·경로 규칙 위반은 코드에서 목록을 넓혀야 하는 일. |

## 흐름

```
[로그인 Chrome]  모션 페이지 ── 북마클릿 ──▶ ~/Downloads/oppadu-motion-YYYY-MM-DD.json
                 슬라이드 페이지 ─ 북마클릿 ─▶ ~/Downloads/oppadu-slide-YYYY-MM-DD.json
[Mac] npm run ai:oppadu
        ├─ 입력 확인(북마클릿 JSON 형태·전문 개수)
        ├─ 공개 자료 내려받기 → .oppadu/cache/ (URL+버전 같으면 재사용)
        ├─ 원본 보관 → .oppadu/YYYY-MM-DD/
        ├─ 병합(순수 함수, shared oppaduSync.ts) — 실패 시 여기서 멈춤, 아무것도 안 씀
        └─ 쓰기: *.data.ts · .media-out/ai-hub/{motion,slide,brand}/… · manifest · prompts/<set>.oppadu.json · 보고서
[Mac] npm run ai:push -- --set motion --sync-prompts   (slide 도 같게, brand 는 --sync-prompts 없이)
        └─ 파일 → PUT /api/ai/prompts/:set?mode=sync → manifest   (백업·결과를 보고서에 덧붙임)
[Mac] 카탈로그 커밋 → main → Railway 배포
```

## ① 수집

### 북마클릿 — `scripts/ai-hub/oppadu/bookmarklets/`

소스는 git 에 두고 `npm run ai:oppadu -- --bookmarklets` 가 `javascript:` URL 로 묶어 `.oppadu/bookmarklets.html`
(즐겨찾기 막대로 끌어 놓는 링크 둘)을 만든다. 점검 로직은 순수 함수(`checkMotionBundle`·`checkSlideBundle`)로 떼어
shared 에 두고 테스트하며, 북마클릿 빌드가 그 함수를 함께 묶는다.

**모션 [오빠두 모션 받기]** — `https://www.oppadu.com/ai/motion-styles/` 에서:
- `window.OPD_MOTION_L`(설정)을 읽는다. `member` 가 거짓이거나 `rest`·`nonce` 가 없으면 "로그인·멤버십 확인" 알림 후 끝.
- 오빠두 화면(`light.js`)과 같은 방식으로 회원 전문을 받는다:
  `fetch(rest, { credentials: 'same-origin', headers: { 'X-WP-Nonce': nonce } })` → `{ items: { <id>: { prompt, ko, v2: { en, ko }, shots, cues } } }`.
- 묶음 `{ kind: 'oppadu-motion', fetchedAt, page: location.href, config: { a, mv, data, member, add, groups }, gallery: { items, v2opts }, full }` 을
  저장한다. `window.GALLERY.items` 는 화면 스크립트가 `add` 를 이미 이어 붙였을 수 있으므로 id 로 중복을 없앤다.
- 점검: 모든 편(`gallery.items` ∪ `add`)에 `full.items[id].v2.en/ko`·`shots`·`cues` 가 있어야 한다. 빠지면
  "N편의 전문이 없습니다 — 로그인·멤버십 확인" 알림, 저장하지 않음.

**슬라이드 [오빠두 슬라이드 받기]** — `https://www.oppadu.com/ai/slide-styles/` 에서:
- `window.OPD_SLIDE_STYLES`(`img`·`styles` …)와 `window.OPD_SLS_TAGS` 를 `{ kind: 'oppadu-slide', fetchedAt, page, img, styles, tags }` 로 저장.
- 점검: 모든 `styles[i].prompt` 가 비지 않은 문자열이어야 한다(손님 화면에는 `prompt` 가 없다). 빠지면 알림, 저장하지 않음.

저장은 `Blob` + `<a download>` 로 받은 파일 폴더에 `oppadu-{motion|slide}-YYYY-MM-DD.json`.

### 스크립트 — `npm run ai:oppadu` (`scripts/ai-hub/oppadu/*.ts`)

인자: `--set motion|slide|brand`(생략 시 셋 다) · `--motion <파일>` · `--slide <파일>`(생략 시 `~/Downloads` 의
가장 최근 `oppadu-{motion,slide}-*.json`) · `--dry-run`(보고서만, 쓰기 없음) · `--bookmarklets`.
브랜드는 북마클릿이 필요 없다. 모션·슬라이드 묶음 파일이 없는 set 은 이유를 알리고 그 set 만 건너뛴다(`--set` 으로 명시했으면 실패).

**전제**: 1단계 첫 이전으로 만든 `.media-out/ai-hub/manifest/{motion,slide,brand}.json` 이 있어야 한다(Chois·학교
파일도 담고 있음). 없으면 "먼저 `npm run ai:pull`" 을 알리고 멈춘다.

**공개 자료** (스크립트가 직접 받음):

| 묶음 | 받는 것 | 출처 |
|---|---|---|
| 모션 | `gallery-data.js`·`ms-prompt.js` | `config.data`(`…/_motion-styles-assets/gallery-data.js?ver=…`) · `${config.a}js/ms-prompt.js`(1단계 이식 출처, 모션 페이지의 `<script src>` 로 확인) |
| 모션 | 원본 편마다 `v/<id>.mp4`(소리)·`c/<id>.mp4`(무음)·`p/<id>.webp`(포스터) | `${config.a}{v,c,p}/<id>.{mp4,webp}?v=${config.mv}` |
| 슬라이드 | `img/{id}-{k}.webp`(k=1…slides) · `img/s/{id}-{k}.webp` · `img/t/{id}-{k}.webp`(k ∈ {cover, body}) | 묶음의 `img` |
| 브랜드 | 목록 페이지(`/ai/design-systems-site/`) · 상세 틀(`/tools/design-systems-site/brand/`) · `assets/*` · `data/brands-index.json` · 브랜드마다 `data/hero/<slug>.json`·`data/detail/<slug>.json` | `OPD_DSG.base` = `https://www.oppadu.com/tools/design-systems-site/` |

- 동시 4개, 실패 시 3회 재시도(1단계 `retryDelayMs`), `.part` 로 받고 끝나면 이름 바꿈.
- 캐시 `.oppadu/cache/<호스트 경로>` — URL(쿼리 `v` 포함)이 같고 파일이 있으면 다시 받지 않는다. 슬라이드 그림처럼
  버전 쿼리가 없는 것은 `--refresh-media` 로만 다시 받는다(기본은 캐시 재사용).
- **엔진 변경 감지**: 받은 `ms-prompt.js` 의 sha256 을 1단계 이식본 기준값과 비교한다. 기준값은
  `scripts/ai-hub/oppadu/engine.ts` 의 상수(`b7a04f1a21e395c6ccc5363bd42f28e2e62697a702cfe64f64004b1a896f1086`, 2026-10-28 받은 판).
  다르면 보고서에 경고만 남기고 병합은 계속한다(엔진 갱신은 사람이 `promptEngine.ts` 를 보고 결정).

**원본 보관** `.oppadu/YYYY-MM-DD/`(git 제외): 북마클릿 묶음 둘 사본, `gallery-data.js`, `ms-prompt.js`,
`brands-index.json`, 보고서, `replaced-prompts-<set>.json`(push 때). 미디어는 캐시에만 둔다.

**브랜드 사본 만들기** — 옛 `build.cjs` 는 유실됐으므로 새 빌더(`oppadu/brand-build.ts`)가 받은 자료로 1단계
`ai:brand:import` 의 원천(`BRAND_SRC`) 모양 폴더 `.oppadu/YYYY-MM-DD/brand-site/` 를 만든다: `index.html`(목록),
`brand/<slug>.html`(상세 틀 페이지를 slug 마다), `assets/…`, `data/…`. 그 다음 `brand-import` 의 바꿔 넣기 로직을
`BRAND_SRC` 만 바꿔 그대로 부른다. 빌더 규칙(구현 때 확정·테스트):
- 페이지 설정 `OPD_DSG` 의 `base` 를 사본 기준 상대 경로로, `member: true`(회원 잠금은 화면만이고 자료는 공개 JSON — 2026-10-13 메모).
- 목록 페이지의 `<body>` 는 허브 틀 `div.aih` 하나만 남긴다(오빠두 사이트 머리글 `pcf-*`·푸터·모바일 메뉴 제외).
- **남기는 자산(keep list)** — 그 밖의 `<script>`·스타일시트·광고·분석·채팅·알림은 뺀다:
  스크립트 `shell.js`·`ai-hub-static.js`·`app.js`·`pcf-resources.js`, 스타일 `shell.css`·`tokens.css`·`app.css`·`ai-hub.css`·
  `pcf-resources.css`·`pcf-ui.css`, 글꼴 `PretendardVariable.woff2`, 인라인 `#oppadu-dsg-js-before`·`#oppadu-pcf-resources-js-before`·
  `script[data-otl-help-data]`. 2026-10-29 오빠두 목록 화면의 색 탭(`pcfrs-dsg-bar`)·찾기 칸(`pcf-listq`)은 `pcf-resources.js/.css`·
  `pcf-ui.css` 가 그리므로 1단계 사본(2026-10-13)보다 셋이 늘었다 → `paths.ts` 의 `BRAND_FILE` 과 `brand-import` 의 자산 목록을
  shared 상수 `BRAND_ASSETS` 하나로 맞춰 넓힌다.
- **구조 검증**: 결과 파일 목록이 `BRAND_FILE` 를 모두 통과하고, 지금 사본(`.media-out/ai-hub/brand/`, `ai:pull` 결과)과
  같은 종류의 파일을 갖추는지(목록·상세·`BRAND_ASSETS`·data) 확인한다. 어긋나면 멈춘다. 마지막으로 Playwright 로 사본을 열어 카드 293장·색 탭 거르기·찾기·상세 열기가 동작하는지 본다.

## ② 병합 규칙 — `packages/shared/src/ai-hub/oppaduSync.ts` (순수 함수)

```ts
mergeMotion(catalog: MotionPublic[], bundle: OppaduMotionBundle): {
  list: MotionPublic[];                       // 새 카탈로그
  prompts: MotionAdminRow[];                  // 동기화 대상(원본만) — prompt/ko = v2 틀 원문
  media: { id: string; files: { rel: string; url: string }[] }[];   // 받을 원본 미디어
  report: SetReport;
}
mergeSlide(catalog: SlidePublic[], bundle: OppaduSlideBundle): { list; prompts: {id, prompt}[]; media; report }
diffBrandIndex(prev: BrandIndex | null, next: BrandIndex): { added: string[]; removed: string[]; total: number; generatedAt: string }
```

공통:
- **id 로 맞춘다.** 카탈로그 항목의 `source` 가 변형본(`chois`·`school`)이면 목록 정보·프롬프트·미디어 모두 건드리지
  않고 `report.keptRemake` 에 센다.
- 원본(`oppadu`)이고 오빠두에 있으면 아래 필드를 오빠두 값으로 갱신, 바뀐 필드 이름을 `report.updated[id]` 에 적는다.
- 카탈로그에 없는 오빠두 id → `oppadu` 로 추가(`report.added`). 출처 배지·문구는 1단계 화면이 `source` 로 붙인다.
- 카탈로그에 있고 오빠두에 없는 id → 그대로 둔다(`report.gone`).
- 결과는 `validateMotionCatalog`·`validateSlideCatalog` 를 통과해야 한다. 아래면 **던진다**(스크립트는 아무것도 쓰지 않고 멈춤):
  처음 보는 모션 분류(`MOTION_GROUPS` 9종 밖) · 슬라이드 분류(`SLIDE_FAMILIES` 7종 밖) · 슬라이드 `slides > 12` ·
  id 가 `MOTION_FILE`/`SLIDE_FILE` 경로 규칙에 맞지 않음 · `cover`/`body` 범위 밖.
- 카탈로그 파일은 1단계 생성기 `formatCatalogSource` 로 다시 쓴다.

### 모션

- **순서**: `chois` 항목은 지금 순서 그대로 앞에. 그 뒤 원본 묶음 = 오빠두 화면 순서(`GALLERY.items` 다음 `add`)에서
  변형본이 아닌 id, 그 뒤 오빠두에서 사라진 원본. `featured` 는 바꾸지 않는다(새 항목은 `false`).
- **갱신 필드**: `no`(숫자로)·`group`(`g`)·`name`·`en`·`use`·`concept`·`kind`·`kindLabel`(`kind_label`)·`secs`.
- **프롬프트**: `{ id, prompt: v2.en, ko: v2.ko, shots, cues }`. 완성본(`final`)을 만들지 않는다. `validateTemplate` 를
  통과해야 한다(실패하면 그 id 와 오류를 담아 던짐).
- **미디어**(원본 편만): `v/<id>.mp4` → `motion/<id>/video.mp4`, `c/<id>.mp4` → `preview.mp4`, `p/<id>.webp` → `poster.webp`.
  다시 인코딩하지 않는다.

### 슬라이드

- **순서**: 오빠두 인기순(`styles` 순서). 각 자리에 학교 덱이 있으면 학교 덱(1단계 `buildSlideData` 와 같은 규칙).
  오빠두 목록에 없는 학교 덱은 지금 순서대로 그 뒤, 오빠두에서 사라진 원본은 맨 끝.
- **갱신 필드**: `no`·`family`·`name`·`look`·`use`·`slides`·`cover`·`body`·`added`. 프롬프트는 `prompt.trim()` 원문.
- **미디어**: `img/{id}-{k}.webp` → `slide/<id>/<k>.webp`, `img/s/…` → `slide/<id>/s/<k>.webp`(모든 장),
  `img/t/…` → `slide/<id>/t/<k>.webp`(표지·본문만).

### 브랜드

변형본이 없어 오빠두 목록을 그대로 따른다. 이전 `brands-index.json`(`.media-out`)과 비교해 추가·사라진 slug 를 보고한다.

### 쓰기 (모든 내려받기·병합·검증이 끝난 뒤에만)

1. 원본 편·스타일의 미디어를 캐시에서 `.media-out/ai-hub/{motion,slide}/<id>/…` 로 복사(내용이 같으면 그대로).
2. `manifest/{motion,slide}.json` 갱신 — 1단계 `writeManifest` 로 폴더 전체를 다시 계산(Chois·학교 항목 포함).
3. 브랜드 바꿔 넣기(1단계 로직) + `manifest/brand.json`.
4. `.media-out/prompts/{motion,slide}.oppadu.json` — 동기화 대상 원본 행만. 1단계의 `<set>.json`(전체 행)과 따로 둔다.
5. `motion.data.ts`·`slide.data.ts`.
6. 보고서.

중간에 실패하면 다시 실행해 같은 결과로 수렴한다(경로 기반 복사·manifest 재계산·파일 통째 쓰기). `--dry-run` 은 6만 한다.

## ③ 서버 — 웹 편집 표시와 동기화 모드

### `ai_motion_prompts.edited_at` (컬럼 추가)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `edited_at` | timestamptz NULL | 관리자가 웹 편집기에서 저장한 시각. NULL = 오빠두·파일 내용 그대로 |

- Drizzle 스키마 + `startupMigrate` 의 `ALTER TABLE ai_motion_prompts ADD COLUMN IF NOT EXISTS edited_at timestamptz`.
- `PUT /api/ai/motion/:id/prompt`(관리자 저장) → `edited_at = now()`.
- 일괄 가져오기 기본 모드(없는 id 만 넣기)는 건드리지 않음. `?overwrite=1` 은 `edited_at = NULL` 로 되돌린다(내용이 파일과 같아짐).
- 슬라이드는 웹 편집기가 없어 컬럼을 두지 않는다.
- **한계**: 이 컬럼 이전에 웹에서 고친 행은 구분할 수 없어 NULL 로 시작한다. 1단계 배포 직후이고 첫 이전 전이라 없을
  가능성이 크며, 있더라도 아래 백업으로 되살린다.

### `PUT /api/ai/prompts/:set?mode=sync` (토큰, 새 모드)

기존 기본 모드·`?overwrite=1` 은 그대로. `mode=sync` 와 `overwrite=1` 을 함께 주면 400.
한 트랜잭션에서 보낸 id 들의 현재 행을 `SELECT … FOR UPDATE` 로 읽고, 행별 결정은 shared 순수 함수
`decidePromptSync(existing, incoming)` 가 한다:

| 서버 현재 행 | 결정 | 결과 |
|---|---|---|
| 없음 | 넣기 | `inserted` |
| 있음 · `edited_at` 있음(모션) | 건드리지 않음 | `skippedEdited: id[]` |
| 있음 · 내용 같음 | 건드리지 않음 | `unchanged` |
| 있음 · 내용 다름 | 바꾸기(`updated_at = now()`, `edited_at` 은 NULL 유지) | `updated` |

- 응답: `{ ok, mode: 'sync', count, inserted, updated, unchanged, skippedEdited, replaced: [{ id, before }] }` —
  `before` 는 바꾸기 전 행 내용(모션 `{en, ko, shots, cues}`, 슬라이드 `prompt`).
- **변형본 보호**: 배포된 `MOTION_CATALOG`/`SLIDE_CATALOG` 에서 `source` 가 `chois`/`school` 인 id 가 하나라도 있으면
  요청 전체를 400(`{ error: 'remake ids in sync', ids }`). 카탈로그에 아직 없는 id(배포 전 새 항목)는 받는다.
- 본문 검증은 1단계 `motionImport`/`slideImport` zod 스키마 그대로. 모션은 `validateTemplate` 도 통과해야 한다.

### 편집기 표시·되돌리기

- `GET /api/ai/motion` 의 `prompt` 에 `editedAt`(ISO 또는 null)을 더한다.
- 편집기(`MotionEditorPage`)는 관리자 + `source: 'oppadu'` + `editedAt` 일 때 머리에
  "웹에서 고친 원본 · 오빠두 동기화에서 제외됨" 과 단추 **[다음 동기화에서 오빠두 원본 받기]** 를 보인다.
- 단추 → `DELETE /api/ai/motion/:id/edited`(authenticate + requireAdmin) → `edited_at = NULL`, 내용은 그대로.
  다음 `ai:push --sync-prompts` 에서 오빠두 원문으로 바뀐다. 없는 id 는 404.

### 상세 [프롬프트 복사] (클라이언트)

`PromptCopy` 는 v2 틀이고 원본(`source: 'oppadu'`)이면 **「예시 그대로」(방식 a) + 그 편의 길이(`secs`)** 로 완성한다
(`finalPrompt({ tpl, st: state({ style: 'a', len: item.secs }), … })`). 방식 b 는 주제 칸이 비어 `[이름]` 으로 남기 때문이며,
옛 수집 스크립트(`build-oppadu-v2.cjs`)도 같은 이유로 a 를 썼다. Chois 판·옛 틀은 지금 동작 그대로.

## ④ 올리기·보고서·실행 순서

### `ai:push --sync-prompts`

- `--set motion|slide` 에서만 허용. `.media-out/prompts/<set>.oppadu.json` 을 `?mode=sync` 로 보낸다(1단계 순서 그대로:
  파일 → 프롬프트 → manifest). `--overwrite-prompts`·`--no-prompts` 와 함께 쓰면 오류.
- 응답의 `replaced` 를 `.oppadu/YYYY-MM-DD/replaced-prompts-<set>.json` 에 저장하고, 결과 줄
  `넣음 N · 바뀜 N · 같음 N · 웹에서 고쳐 건너뜀 N (id…)` 과 백업 경로를 그날 보고서에 덧붙인다.

### 실행 순서 (README 에 적음)

1. 로그인 Chrome 에서 북마클릿 둘.
2. `npm run ai:oppadu` → 보고서·`git diff packages/shared/src/ai-hub/*.data.ts` 확인.
3. `npm run ai:push -- --set motion --sync-prompts` → `--set slide --sync-prompts` → `--set brand`.
4. 카탈로그 커밋 → main 반영 → Railway 배포.

3 과 4 는 순서가 바뀌어도 안전하다 — 목록에는 카탈로그와 manifest 에 모두 있는 항목만 나온다. 3 을 먼저 하면 배포가
끝나는 순간 새 항목이 미디어와 함께 보인다(추천).

### 보고서 `.oppadu/YYYY-MM-DD/report.md` (화면에는 요약)

```
모션    추가 3 (120-…, 121-…, 122-…) · 갱신 2 (57-…: name·secs) · 변형본이라 건너뜀 50
        오빠두에서 사라진 0 · 미디어 새로/바뀜 9
슬라이드 추가 0 · 갱신 0 · 변형본이라 건너뜀 118 · 사라진 0 · 그림 새로/바뀜 0
브랜드   293개 (오빠두 생성 2026-10-14) · 추가 0 · 사라진 0
⚠ 오빠두 프롬프트 엔진이 바뀌었습니다 — promptEngine.ts 확인 필요        (해시가 다를 때만)
다음 할 일: npm run ai:push -- --set motion --sync-prompts …
── push 결과(덧붙임) ──
motion  넣음 3 · 바뀜 56 · 같음 0 · 웹에서 고쳐 건너뜀 0 · 백업 .oppadu/…/replaced-prompts-motion.json
```

## 오류 처리

| 상황 | 동작 |
|---|---|
| 북마클릿: 비로그인·전문 누락 | 알림, 파일 저장 안 함 |
| 묶음 파일 없음 | 그 set 건너뜀(명시한 set 이면 종료 코드 1) |
| `.media-out` manifest 없음 | "먼저 `npm run ai:pull`" 후 종료 코드 1 |
| 내려받기 3회 실패 | 실패 URL 목록과 함께 종료 코드 1, 아무것도 쓰지 않음(캐시는 남아 다음 실행이 빠름) |
| 처음 보는 분류·12장 초과·경로 규칙 위반·틀 검증 실패 | 이유와 id 를 알리고 종료 코드 1, 아무것도 쓰지 않음 |
| 브랜드 빌더 구조 검증 실패 | 종료 코드 1, 기존 사본 유지 |
| 엔진 해시 다름 | 보고서 경고, 계속 |
| sync 요청에 변형본 id | 400, 아무것도 바꾸지 않음 |
| push 중단 | manifest 를 마지막에 올리므로 화면은 이전 상태. 다시 실행하면 바뀐 것만 |

## 테스트

- **shared(클라이언트 Vitest)**: `oppaduSync.test.js` — 변형본 우선(건드리지 않음), 새 id 추가, 갱신 필드 기록,
  사라진 id 의 위치(모션 원본 묶음 끝·슬라이드 맨 끝), 학교 덱 자리 바꿈, 순서, 처음 보는 분류·12장 초과·잘못된 id 에서
  던지기, 미디어 경로 매핑, v2 틀 저장; `decidePromptSync` 결정표 4행; `checkMotionBundle`/`checkSlideBundle`(전문 누락·비회원);
  `diffBrandIndex`.
- **스크립트**: 브랜드 빌더 — 픽스처 페이지에서 `OPD_DSG` 고침·외부 스크립트 제거·`BRAND_FILE` 통과.
- **서버**: `tsc -b` 통과, 로컬 DB 로 `?mode=sync` 수동 확인(넣기·같음·바꾸기·웹 편집 건너뜀·변형본 400).
- **브라우저**: 1단계 스모크(`ai-hub-e2e-setup.ts` + `ai-hub.smoke.mjs`)에 원본 편 상세 복사(방식 a) 확인과
  편집기 "웹에서 고친 원본" 표시·되돌리기 단추를 더한다.

## 문서

`.gitignore` 에 `.oppadu/`. `scripts/ai-hub/README.md` 에 「오빠두 새 자료 반영」 절차. `CLAUDE.md`·`.claude/PROJECT_MAP.md` 에
`ai:oppadu`·`edited_at`·`?mode=sync`·`DELETE /api/ai/motion/:id/edited`.

## 가정

- 오빠두 회원 REST 응답 모양 `{ items: { id: { prompt, ko, v2, shots, cues } } }` 은 2026-10-28 `light.js` 169–180행과
  복원한 `build-oppadu-v2.cjs` 로 확인했다. 실제 응답은 첫 실행 때 북마클릿 점검이 다시 확인한다.
- 사용자는 위캔두 멤버십 회원이라 모든 편의 전문을 받는다.
- 오빠두 공개 경로(`_motion-styles-assets/{v,c,p}`, `_slide-styles-assets/img/{,s/,t/}`, `design-systems-site/data/…`)는
  2026-10-29 확인 기준이다. 바뀌면 내려받기가 실패하며 멈춘다.
- 1단계 첫 이전(`ai:pull` → `ai:push`)이 2단계 첫 실행 전에 끝나 있다.
