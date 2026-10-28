# AI 활용 자료 이전·추가 스크립트

저장소 루트에서 실행한다(`.media-out/` 은 현재 폴더 기준). 환경 변수는 셸에서 `export` 한다.
`.media-out/` 은 `.gitignore` — **지우지 말고 Mac 에 남긴다**(원천 백업).

## 명령

| 명령 | 하는 일 |
|---|---|
| `npm run ai:pull` | **1회성 이전.** me.chois.pro 에서 manifest 3개·파일 전부·비공개 프롬프트를 `.media-out/` 으로 내려받는다. sha256 대조(실패 시 3회 재시도), 같은 sha 는 건너뜀. `-- --dry-run` 은 받을 개수만, `-- --set motion` 은 한 묶음만. 모션·슬라이드 파일은 공개 `/media/…`, **브랜드 파일과 프롬프트는 토큰 경로 `/api/media/file?path=…`**(공개 `/ai/brand/site` 는 HTML 을 가공해 sha 가 어긋남). 묶음의 manifest 가 비었거나 프롬프트(`private/*-admin.json`)가 200 이 아니면 실패(종료 코드 1) |
| `npm run ai:push -- --set motion\|slide\|brand` | 서버 manifest 와 sha 를 비교해 바뀐 파일만 올리고(동시 4개, 429 는 기다렸다 재시도), 프롬프트 JSON 을 보내고, 마지막에 manifest 를 올린다. `--dry-run` 은 올릴 목록만. motion·slide 는 `.media-out/prompts/<set>.json` 이 없으면 아무것도 올리기 전에 멈춘다 — 미디어만 올릴 때만 `--no-prompts`. 프롬프트는 **서버에 없는 id 만 넣는다**(끝에 `N inserted, M skipped`) — 관리자가 웹 편집기(`/ai/motion/:id/edit`)에서 고친 원본 템플릿은 다시 push 해도 그대로다. 파일 내용으로 덮어써야 할 때만 `--overwrite-prompts`(`N inserted, M updated`) |
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
