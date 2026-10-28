# AI 활용 자료 이전·추가 스크립트

저장소 루트에서 실행한다(`.media-out/` 은 현재 폴더 기준). 환경 변수는 셸에서 `export` 한다.
`.media-out/` 은 `.gitignore` — **지우지 말고 Mac 에 남긴다**(원천 백업).

## 명령

| 명령 | 하는 일 |
|---|---|
| `npm run ai:pull` | **1회성 이전.** me.chois.pro 에서 manifest 3개·파일 전부·비공개 프롬프트를 `.media-out/` 으로 내려받는다. sha256 대조(실패 시 3회 재시도), 같은 sha 는 건너뜀. `-- --dry-run` 은 받을 개수만, `-- --set motion` 은 한 묶음만 |
| `npm run ai:push -- --set motion\|slide\|brand` | 서버 manifest 와 sha 를 비교해 바뀐 파일만 올리고(동시 4개, 429 는 기다렸다 재시도), 프롬프트 JSON 을 보내고, 마지막에 manifest 를 올린다. `--dry-run` 은 올릴 목록만 |
| `npm run ai:prepare` | 새 모션 렌더 mp4 → `video.mp4`·`preview.mp4`·`poster.webp` + manifest (`MOTION_SRC`, ffmpeg·cwebp 필요) |
| `npm run ai:motion:import` | 원천 JSON → `packages/shared/src/ai-hub/motion.data.ts`(git) + `.media-out/prompts/motion.json` |
| `npm run ai:slide:import` | 학교 덱 PDF·오빠두 원본 그림 → `slide.data.ts`(git) + `.media-out/ai-hub/slide/…` + `prompts/slide.json` + manifest (`pdftoppm`·`cwebp` 필요) |
| `npm run ai:brand:import` | 브랜드 사본 → `.media-out/ai-hub/brand/…` + manifest |

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

1. me.chois.pro 쪽 `GET /api/media/file` 이 배포돼 있는지 확인(프롬프트를 받는 데 필요).
2. `export ME_MEDIA_UPLOAD_TOKEN=…` → `npm run ai:pull -- --dry-run` 으로 개수 확인 → `npm run ai:pull`
   (끝에 `set motion: 150 files, 288 MB, 0 failed …` 처럼 묶음마다 요약이 나온다. failed 가 있으면 다시 실행하면 된다)
3. `export AI_PUSH_URL=https://class.chois.pro AI_MEDIA_UPLOAD_TOKEN=…`
4. `npm run ai:push -- --set motion` → `--set slide` → `--set brand`
   (다시 실행하면 `0 changed of N`)
5. class.chois.pro 의 AI활용 화면에서 확인 → (별도 작업) me.chois.pro 정리.
