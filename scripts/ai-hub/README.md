# AI 활용 자료 이전·추가 스크립트

저장소 루트에서 실행한다(`.media-out/` 은 현재 폴더 기준). 환경 변수는 셸에서 `export` 한다.
`.media-out/` 은 `.gitignore` — **지우지 말고 Mac 에 남긴다**(원천 백업).

## 명령

| 명령 | 하는 일 |
|---|---|
| `npm run ai:pull` | **1회성 이전.** me.chois.pro 에서 manifest 3개·파일 전부·비공개 프롬프트를 `.media-out/` 으로 내려받는다. sha256 대조(실패 시 3회 재시도), 같은 sha 는 건너뜀. `-- --dry-run` 은 받을 개수만, `-- --set motion` 은 한 묶음만. 모션·슬라이드 파일은 공개 `/media/…`, **브랜드 파일과 프롬프트는 토큰 경로 `/api/media/file?path=…`**(공개 `/ai/brand/site` 는 HTML 을 가공해 sha 가 어긋남). 묶음의 manifest 가 비었거나 프롬프트(`private/*-admin.json`)가 200 이 아니면 실패(종료 코드 1) |
| `npm run ai:push -- --set motion\|slide\|brand` | 서버 manifest 와 sha 를 비교해 바뀐 파일만 올리고(동시 4개, 429 는 기다렸다 재시도), 프롬프트 JSON 을 보내고, 마지막에 manifest 를 올린다. `--dry-run` 은 올릴 목록만. motion·slide 는 `.media-out/prompts/<set>.json` 이 없으면 아무것도 올리기 전에 멈춘다 — 미디어만 올릴 때만 `--no-prompts`. 프롬프트는 **서버에 없는 id 만 넣는다**(끝에 `N inserted, M skipped`) — 관리자가 웹 편집기(`/ai/motion/:id/edit`)에서 고친 원본 템플릿은 다시 push 해도 그대로다. 파일 내용으로 덮어써야 할 때만 `--overwrite-prompts`(`N inserted, M updated`). **2단계 이후 주의:** `--overwrite-prompts` 는 오빠두 원본 프롬프트까지 모두 1단계 `<set>.json` 내용으로 되돌리고 보낸 모션 행의 웹 편집 표시(`edited_at`)를 모두 지운다 — 일부러 그럴 때만 쓴다(오빠두 원본 갱신은 `--sync-prompts`) |
| `npm run ai:push -- --set motion\|slide --sync-prompts` | **`ai:oppadu` 뒤에 쓴다.** `.media-out/prompts/<set>.oppadu.json` 을 `PUT /api/ai/prompts/:set?mode=sync` 로 보낸다. 서버는 원본(`source: oppadu`) 행만 맞춘다 — 바뀐 행은 갱신, 같은 행은 그대로, **웹에서 고친 행(`edited_at`)은 건너뜀**(`skippedEdited`). 갱신된 행의 이전 내용은 `.oppadu/<날짜>/replaced-prompts-<set>.json` 에 백업(같은 날 여러 번 push 해도 합쳐 쌓임)하고, 결과 줄은 그날 `report.md` 끝에 덧붙인다. 변형본(`chois`·`school`) id 가 섞여 있으면 요청 전체가 400. `--overwrite-prompts`·`--no-prompts` 와는 함께 못 쓴다 |
| `npm run ai:oppadu` | **오빠두 새 자료 반영.** 북마클릿 수집본·오빠두 공개 페이지에서 새·바뀐 모션·슬라이드·브랜드를 모아 카탈로그(`*.data.ts`, git)·`.media-out/`·보고서에 증분 반영한다. 아래 「오빠두 새 자료 반영」 참고 |
| `npm run ai:prepare` | 새 모션 렌더 mp4 → `video.mp4`·`preview.mp4`·`poster.webp` + manifest (`MOTION_SRC`, ffmpeg·cwebp 필요) |
| `npm run ai:motion:import` | 원천 JSON → `packages/shared/src/ai-hub/motion.data.ts`(git) + `.media-out/prompts/motion.json` |
| `npm run ai:slide:import` | 학교 덱 PDF·오빠두 원본 그림 → `slide.data.ts`(git) + `.media-out/ai-hub/slide/…` + `prompts/slide.json` + manifest (`pdftoppm`·`cwebp` 필요) |
| `npm run ai:brand:import` | 브랜드 사본 → `.media-out/ai-hub/brand/…` + manifest. 복사할 원천을 모두 확인한 뒤 임시 폴더(`.media-out/.brand-import-new`)에 만들어 바꿔 넣으므로, 원천이 빠졌으면 기존 사본은 그대로 남는다 |

`*:import` 는 카탈로그 파일을 통째로 다시 쓴다. 오빠두 원본 원천(`MOTION_SRC/data/oppadu-v2/gallery.json`,
`OPPADU_SLIDE_SRC/data/styles.json`)이 없으면 기존 원본 항목이 사라지므로 멈춘다 — 일부러 그럴 때만
`--chois-only`(모션) / `--school-only`(슬라이드)를 붙인다. 바뀐 카탈로그는 `git diff` 로 확인하고 커밋한다.

## 환경 변수

| 이름 | 쓰는 곳 | 기본값 |
|---|---|---|
| `AI_PUSH_URL` | push | `http://localhost:3001` (운영: `https://class.chois.pro`) |
| `AI_MEDIA_UPLOAD_TOKEN` | push | 필수 — 서버 `packages/server/.env`/Railway 의 같은 이름(32자 이상) |
| `ME_PULL_URL` | pull | `https://me.chois.pro` |
| `ME_MEDIA_UPLOAD_TOKEN` | pull | 필수 — me.chois.pro 의 `MEDIA_UPLOAD_TOKEN` |
| `MOTION_SRC` | prepare, motion:import | `/Volumes/Chois_SD2/dev/motion` |
| `SLIDE_SRC` | slide:import | `/Volumes/Chois_SD2/dev/motion/slide/school` |
| `OPPADU_SLIDE_SRC` | slide:import | `SLIDE_SRC` 의 상위 폴더 |
| `BRAND_SRC` | brand:import | `/Volumes/Chois_SD2/dev/motion/brand` |

## 폴더 배치

```
.media-out/
  ai-hub/                 # 서버 <VOLUME_PATH>/ai-hub/ 와 같은 구조
    motion/<id>/{video.mp4,preview.mp4,poster.webp}
    slide/<id>/[s/|t/]<k>.webp
    brand/…
    manifest/{motion,slide,brand}.json
  prompts/{motion,slide}.json     # PUT /api/ai/prompts/:set 본문(DB 로 감)
```

## 첫 이전 순서 (Mac)

SD 카드의 원천 폴더가 없으므로 `ai:pull` + `ai:push` 가 기본 경로다(`*:import`·`prepare` 는 앞으로 자료를 더할 때).

0. Railway ChoisClass 서비스에 `AI_MEDIA_UPLOAD_TOKEN`(`openssl rand -hex 32`)을 추가하고 배포가 끝났는지 확인
   (비어 있으면 서버가 업로드를 503 으로 거절한다). 이 값을 3 번의 `AI_MEDIA_UPLOAD_TOKEN` 으로 쓴다.
1. me.chois.pro 쪽 `GET /api/media/file`(토큰 경로, 프롬프트·브랜드 파일을 받는 데 필요)이 배포돼 있는지 확인한다.
   형제 저장소 **`ChoisMath/my-introduction`** 의 브랜치 `claude/focused-gates-3ixrhl` 커밋 **`465a894`** 가 그 저장소 `main` 에
   머지되고 me.chois.pro 에 배포까지 끝나 있어야 한다. 확인:
   `curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $ME_MEDIA_UPLOAD_TOKEN" 'https://me.chois.pro/api/media/file?path=private%2Fmotion-admin.json'`
   이 `200` 이어야 한다(배포 전이면 2 번의 pull 이 프롬프트·브랜드에서 `is GET /api/media/file deployed there?` 로 실패한다).
2. `export ME_MEDIA_UPLOAD_TOKEN=…` → `npm run ai:pull -- --dry-run` 으로 개수 확인 → `npm run ai:pull`
   (끝에 `set motion: 150 files, 288 MB, 0 failed …` 처럼 묶음마다 요약이 나온다. failed 가 있으면 다시 실행하면 된다)
3. `export AI_PUSH_URL=https://class.chois.pro AI_MEDIA_UPLOAD_TOKEN=…`
4. `npm run ai:push -- --set motion` → `--set slide` → `--set brand`
   (다시 실행하면 `0 changed of N`). 이때 DB 는 비어 있으므로 기본 동작(없는 id 만 넣기)으로 프롬프트가 모두 들어간다
   (`N inserted, 0 skipped`). 이후의 push 는 웹에서 고친 프롬프트를 절대 덮어쓰지 않는다 — `--overwrite-prompts` 를 줄 때만 덮어쓴다.
5. class.chois.pro 에 교사로 로그인해 `/ai/motion`(50편)·`/ai/slide`(113종)·`/ai/brand`(룩북)를 확인한다.
   `.media-out/` 은 지우지 않는다(원천 백업). me.chois.pro `/ai` 정리는 별도 작업.

## 오빠두 새 자료 반영 (`ai:oppadu`)

오빠두(oppadu.com/ai)에 새 모션·슬라이드·브랜드가 올라오면 아래 순서로 한다. 변형본(`chois`·`school`)의 목록 정보·프롬프트·미디어는
어떤 경로로도 바뀌지 않고, 오빠두에서 사라진 id 는 카탈로그에 남긴다(보고서에 알리기만 한다). 설계: `docs/superpowers/specs/2026-10-29-ai-hub-oppadu-sync-design.md`.

사전 조건: 1단계 첫 이전(`ai:pull` → `ai:push` 셋)이 끝나 `.media-out/ai-hub/manifest/*.json` 이 있어야 한다(없으면 멈춘다).

> **처음 한 번은 배포가 먼저다.** 첫 `ai:oppadu`·`--sync-prompts` 전에 이 2단계 코드를 main 에 합쳐 Railway 배포까지 끝낸다.
> 서버에 `edited_at` 열·`?mode=sync`·새 브랜드 파일 허용 목록(`BRAND_FILE`)이 있어야 하기 때문이다. 배포 전 서버에 `--sync-prompts` 를 보내면
> `server does not support ?mode=sync — deploy stage 2 (merge to main) first` 로 멈추고(종료 코드 1, 백업·manifest 안 씀) 바뀐 원본은 반영되지 않는다.
> 그 뒤부터는 아래 5(push) → 6(배포) 순서로 해도 된다. 첫 실행은 `npm run ai:oppadu -- --dry-run` 으로 보고서부터 보는 것을 권한다.

1. **북마클릿 설치(처음 한 번)** — `npm run ai:oppadu -- --bookmarklets` 가 `.oppadu/bookmarklets.html` 을 만든다. Chrome 으로 열어 링크 둘
   (모션·슬라이드)을 즐겨찾기 막대로 끌어다 놓는다.
2. **자료 받기** — 오빠두에 로그인한 Chrome 에서 모션 페이지를 열고 모션 북마클릿, 슬라이드 페이지를 열고 슬라이드 북마클릿을 누른다.
   점검을 통과하면 `oppadu-motion-YYYY-MM-DD.json` · `oppadu-slide-YYYY-MM-DD.json` 이 `~/Downloads` 에 저장된다.
3. **`npm run ai:oppadu`** — 가장 최근 수집본을 읽어 병합·내려받기·검증을 모두 마친 뒤에만 쓴다(실패하면 종료 코드 1, `.media-out/`·카탈로그 그대로).
   끝에 요약이 나오고 `.oppadu/<날짜>/report.md` 가 남는다. 먼저 `-- --dry-run` 으로 보고서만 볼 수도 있다.
4. **확인** — 보고서와 `git diff`(`packages/shared/src/ai-hub/{motion,slide}.data.ts`)를 본다. 새 편 번호·분류·사라진 id·브랜드 변동을 확인한다.
5. **서버에 올리기**(`export AI_PUSH_URL=https://class.chois.pro AI_MEDIA_UPLOAD_TOKEN=…`) —
   `npm run ai:push -- --set motion --sync-prompts` → `-- --set slide --sync-prompts` → `-- --set brand`.
   **`ai:oppadu` 를 돌린 뒤에는 늘 이 push 를 한다.**
6. **커밋·main** — 카탈로그 변경을 커밋하고 main 에 합쳐 배포한 뒤 `/ai/motion`·`/ai/slide` 에서 새 편이 보이는지 확인한다.

> 보고서 첫 줄 `변경 없음` 은 **카탈로그·미디어·브랜드 slug 의 변경이 없다**는 뜻이다. 프롬프트 글만 바뀐 경우는 여기에 잡히지 않으므로,
> `변경 없음` 이라도 5 번의 `ai:push --sync-prompts` 는 꼭 실행한다(서버가 같은 행은 `unchanged` 로 건너뛴다).
>
> Claude 클라우드 세션에서 실행할 때는 Node 의 fetch 가 프록시를 쓰도록 `NODE_USE_ENV_PROXY=1` 을 붙인다
> (`NODE_USE_ENV_PROXY=1 npm run ai:oppadu`). Mac 에서는 필요 없다.

### 인자

| 인자 | 뜻 |
|---|---|
| `--set motion\|slide\|brand` | 한 묶음만 처리. 생략하면 셋 다(모션·슬라이드는 수집본이 없으면 그 묶음만 건너뜀) |
| `--motion <파일>` · `--slide <파일>` | 북마클릿 수집본을 직접 지정. 생략하면 `~/Downloads` 의 가장 최근 `oppadu-{motion,slide}-YYYY-MM-DD.json` |
| `--dry-run` | 보고서만 찍고 아무것도 쓰지 않는다 |
| `--refresh-media` | 버전 쿼리가 없는 슬라이드 그림도 다시 받는다(기본은 `.oppadu/cache` 재사용) |
| `--bookmarklets` | `.oppadu/bookmarklets.html` 만 만들고 끝낸다 |

### 웹에서 고친 원본

관리자가 편집기(`/ai/motion/:id/edit`)에서 오빠두 원본 모션의 틀을 고치면 그 행에 `edited_at` 이 찍혀 「웹에서 고친 원본 · 오빠두 동기화에서
제외됨」 이 표시되고, `--sync-prompts` 가 건너뛴다. 다시 오빠두 원본을 받으려면 같은 자리의 「다음 동기화에서 오빠두 원본 받기」
(`DELETE /api/ai/motion/:id/edited`)를 누르고 다음 `--sync-prompts` 를 실행한다.

### 만들어지는 것

```
.oppadu/                        # .gitignore
  bookmarklets.html
  cache/                        # 내려받기 캐시(<호스트><경로>[@버전])
  <날짜>/                       # 실행 보관본: 수집본 둘·gallery-data.js·ms-prompt.js·brands-index.json·report.md,
                                #   push 뒤 replaced-prompts-<set>.json
.media-out/prompts/{motion,slide}.oppadu.json            # --sync-prompts 본문
```
