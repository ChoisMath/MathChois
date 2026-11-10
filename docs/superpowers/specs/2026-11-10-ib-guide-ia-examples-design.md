# IB교육과정 안내 허브 · IA작성예시 (보호 열람) — 설계

작성일: 2026-11-10
상태: 질의응답으로 확정 (열람 허가 = 학급 스위치, 보호 = 페이지 이미지 + 서버 합성 워터마크, 올리기 = PC 스크립트) → 스펙 검토 대기

## 배경 / 문제

IB 수학 수업에서 학생에게 IA(내부평가, 수학 탐구 보고서) 작성 예시를 보여 주려 한다. 자료는 교사 PC의
`COMMON_1-29` 폴더에 있고, 예시 하나마다 PDF가 최대 세 종류다.

```
COMMON_1-29__ex26_student.pdf     학생 보고서 원본        (약 17MB)
COMMON_1-29__ex26_annotated.pdf   채점자 주석이 달린 사본   (약 17MB)
COMMON_1-29__ex26_comments.pdf    기준별 채점 코멘트       (약 30KB)
```

이 자료는 **허가된 사람만 화면으로 보고, 파일로는 가져갈 수 없어야** 한다. 지금 앱의 파일 경로
`GET /api/files/*`는 인증 없이 열려 있고(모든 버킷), 기존 PDF 뷰어는 PDF 파일을 통째로 브라우저에 내려받는다.
둘 다 이 자료에는 쓸 수 없다.

## 목표

1. AI활용 허브(`/ai/*`)와 같은 모양의 독립 허브 **IB교육과정 안내**(`/ib/*`)를 만든다. 첫 페이지는
   **IA작성예시**이고, 나중에 페이지를 더 붙일 수 있다.
2. 예시별로 **[학생 보고서] [주석본] [채점 코멘트]** 탭을 바꿔 가며 본다.
3. 교사·관리자는 항상, 학생은 **교사가 스위치를 켠 학급**에 속할 때만 본다.
4. **PDF 파일은 서버에 올라가지 않는다.** 서버에는 쪽별 이미지만 있고, 그 이미지는 로그인 + 허가를 확인한
   요청에만, **보는 사람의 이름·이메일·날짜가 이미지 안에 합성된 상태로** 나간다.
5. 자료는 교사 PC에서 스크립트 한 줄(`npm run ib:push`)로 올린다.

### 비목표 (v1)

- 웹 관리 화면에서 자료 올리기·지우기 (스크립트로만 한다).
- 글자 선택·검색·복사. 쪽 이미지만 보여 준다.
- 학생 개인별 허가·차단. 학급 단위로만 연다.
- 예시 위에 필기·댓글. 열람 전용이다.
- 스크린샷·화면 촬영 차단. 기술적으로 불가능하다 (아래 "한계").

### 한계 (합의된 내용)

- 화면에 보이는 것은 스크린샷과 카메라로 찍을 수 있다. 워터마크는 이를 **막지 않고 추적 가능하게** 한다.
- 워터마크는 서버가 이미지 픽셀에 구워 넣으므로, 개발자도구로 응답을 꺼내도 이름이 남는다.
- PDF 원본은 서버에 없으므로 어떤 경로로도 내려받을 수 없다.

## 용어

| 말 | 뜻 |
|---|---|
| 예시(example) | `ex01`~`ex29` 하나. id는 `ex` + 두 자리 수 |
| 문서 종류(doc) | `student` · `annotated` · `comments` |
| 쪽 이미지 | 문서의 한 쪽을 WebP로 바꾼 것. 워터마크 없이 Volume에 저장 |
| 목록(manifest) | `manifest/ia.json`. 어떤 예시·문서·쪽이 올라가 있는지 |

## 구조

```
교사 PC                                서버 (Railway)                          브라우저
────────                              ──────────────                          ────────
COMMON_1-29/*.pdf                      Volume: ib-guide/
   │ npm run ib:push                     ia/ex26/student/001.webp  (워터마크 없음)
   │  ① PDF → 쪽별 WebP                  manifest/ia.json
   │  ② 토큰 인증 업로드 ─────────▶ PUT /api/ib/media
   ▼
.ib-out/ (변환 결과 보관)              GET /api/ib/ia/:exId/:doc/pages/:n
                                        ① 로그인 확인  ② 허가 확인
                                        ③ 쪽 이미지 + 워터마크 합성 (sharp) ──▶ canvas에 그림
                                       /api/files/ib-guide/*  → 항상 404
```

DB에는 `classrooms.ib_guide_enabled` 컬럼 하나만 추가한다. 목록은 Volume의 manifest가 맡는다.

## 1. 접근 규칙

`packages/shared/src/ib-guide/access.ts` — 서버 미들웨어와 클라이언트 가드가 같은 함수를 쓴다.

```ts
export type IbGuideAccessInput = {
  role: 'teacher' | 'student' | null;
  isAdmin: boolean;
  allowedClassroomCount: number; // 학생이 속한 학급 중 ib_guide_enabled 인 학급 수
};
export function canUseIbGuide(a: IbGuideAccessInput): boolean {
  if (a.isAdmin || a.role === 'teacher') return true;
  return a.role === 'student' && a.allowedClassroomCount > 0;
}
```

- 서버: `services/ibGuideAccess.service.ts`(학급 수 세기), `middleware/ibGuide.ts`의 `requireIbGuide`
  (authenticate 뒤에 사용, 불허면 403). AI활용의 `aiHubAccess.service` / `requireAiHub`와 같은 모양.
- 허가는 **요청마다** DB에서 다시 확인한다. 교사가 스위치를 끄면 다음 쪽 요청부터 403이다.
- 학급 스위치: `PATCH /api/classrooms/:id`가 `ibGuideEnabled`(boolean)를 받는다. 학급 조회 응답에
  `ibGuideEnabled`를 싣는다.
- `classrooms.ib_guide_enabled boolean NOT NULL DEFAULT false` — `db/schema.ts` + `db/startupMigrate.ts`
  (`ADD COLUMN IF NOT EXISTS`).

## 2. 저장소 (`ib-guide` 버킷)

허용 경로 — `packages/shared/src/ib-guide/paths.ts`:

```
ia/ex\d{2}/(student|annotated|comments)/\d{3}\.webp     쪽 이미지 (001부터)
manifest/ia.json                                        목록
```

- **읽기**: `GET /api/files/ib-guide/*`는 **무조건 404**. `routes/storage.ts`의 `serveFile`에서
  ai-hub와 같은 방식(해석된 실제 경로로 판정 — `x/../ib-guide` 우회 차단)으로 막는다. ai-hub와 달리
  공개 허용 파일이 하나도 없다.
- **쓰기·지우기**: 일반 `/api/files/upload`·delete, `storage.service`의 `removeFile` /
  `removeDirectoryIfEmpty`가 이 버킷을 거부한다 (ai-hub와 같은 규칙).
- 쪽 이미지는 **워터마크 없이** 저장한다. 그래서 이 버킷은 아래 3번 라우트 말고는 어디로도 나가지 않는다.

### manifest (`manifest/ia.json`)

```json
{
  "version": 1,
  "examples": [
    { "id": "ex26", "no": 26, "title": "", "note": "",
      "docs": { "student": { "pages": 24 }, "annotated": { "pages": 24 }, "comments": { "pages": 2 } } }
  ],
  "files": { "ia/ex26/student/001.webp": { "sha256": "…", "size": 183211 } }
}
```

- `examples`는 화면 목록의 근거, `files`는 스크립트가 "이미 올라간 파일"을 건너뛰는 근거다.
- 서버는 manifest를 올릴 때 검증한다: 경로가 허용 목록인지, `docs.*.pages`만큼의 파일이 `files`에 모두 있는지.
- `title`·`note`는 선택. 비어 있으면 화면은 "예시 26"으로만 표시한다.

## 3. 서버 API (`routes/ibGuide.ts`)

| 메서드 · 경로 | 인증 | 하는 일 |
|---|---|---|
| `GET /api/ib/access` | 로그인 | `{ allowed }` |
| `GET /api/ib/ia` | 로그인 + 허가 | 예시 목록 (manifest의 `examples`. `files`는 내보내지 않는다) |
| `GET /api/ib/ia/:exId/:doc/pages/:n` | 로그인 + 허가 | 워터마크가 합성된 쪽 이미지 (WebP) |
| `PUT /api/ib/media?path=` | 업로드 토큰 | 쪽 이미지·manifest 업로드 |
| `GET /api/ib/media/manifest` | 업로드 토큰 | 현재 manifest (없으면 `{}`) |

### 쪽 이미지 라우트

1. `exId`(`ex\d{2}`)·`doc`(세 값 중 하나)·`n`(1 이상 정수)을 검증하고, **manifest에 있는 쪽인지** 확인한다
   (manifest에 없는 파일은 Volume에 남아 있어도 404).
2. Volume에서 쪽 이미지를 읽어 `services/ibWatermark.service.ts`로 워터마크를 합성한다.
3. 응답 헤더:
   - `Content-Type: image/webp`, `Content-Disposition: inline`
   - `Cache-Control: private, no-store` (브라우저·중간 캐시에 남기지 않는다)
   - `X-Content-Type-Options: nosniff`, `X-Robots-Tag: noindex`, `Cross-Origin-Resource-Policy: same-origin`
4. 열람 기록: `request.log.info({ userId, exId, doc, page }, 'ib-guide page view')`.

인증은 기존과 같이 `Authorization` 헤더의 JWT다. 쿠키로는 열리지 않으므로 주소를 새 탭에 붙여 넣어도
401이다.

### 워터마크 (`services/ibWatermark.service.ts`)

- 글: `이름 · 이메일 · 2026-11-10` (날짜는 한국 시간, 일 단위).
- 사용자·날짜별 **타일 한 장**을 만든다: `sharp({ text: { text, fontfile, rgba: true, dpi } })`로 글 이미지를
  만들고 약 −30° 기울여 투명 여백을 둔다. 타일은 메모리에 작게 캐시한다 (사용자·날짜 키, 최대 200개).
- 쪽 이미지에 `composite([{ input: tile, tile: true }])`로 전면에 반복 합성한 뒤 WebP로 다시 인코딩한다.
  글은 읽는 데 방해되지 않을 만큼 옅게(불투명도 약 12~15%) 하되, 잘라내도 한 조각은 남도록 촘촘히 깐다.
- **글꼴**: 배포 이미지(`node:22-slim`)에는 글꼴이 없어 한글 이름이 깨진다. OFL 한글 글꼴 파일 하나를
  `packages/server/assets/fonts/`에 넣고 `text.fontfile`(절대 경로)로 지정한다. 글꼴 파일을 읽지 못하면
  **워터마크 없이 내보내지 않고 500으로 실패**한다 (보호가 조용히 꺼지지 않게).
- 합성 결과는 캐시하지 않는다 (사용자마다 다르고, 저장해 둘 이유가 없다).

### 토큰 업로드

- 환경 변수 `IB_MEDIA_UPLOAD_TOKEN` (32자 이상, 비어 있으면 업로드 503). `AI_MEDIA_UPLOAD_TOKEN`과 같은
  검증 규칙을 `config/env.ts`에 추가한다. AI활용 토큰과 **따로** 둔다 (한쪽이 새도 다른 쪽은 안전).
- `aiHubUpload.service.ts`의 `saveUpload`(임시 파일에 쓰며 sha256·크기 확인 후 rename)를 **버킷 루트와
  경로 검사 함수를 인자로 받게** 일반화해 두 허브가 함께 쓴다. AI활용 쪽 동작은 바뀌지 않는다.
- 파일 하나의 한도는 10MB (쪽 이미지는 보통 100~400KB).

## 4. 자료 올리기 스크립트 (`scripts/ib-guide/`)

```bash
npm run ib:push -- --dir "G:\내 드라이브\…\COMMON_1-29"
```

환경 변수: `IB_PUSH_URL`(예: `https://class.chois.pro`), `IB_MEDIA_UPLOAD_TOKEN`.

1. **파일 찾기**: 폴더에서 `…__ex<번호>_(student|annotated|comments)….pdf`를 찾는다. 이름 뒤의
   ` (1)` 같은 꼬리표와 대소문자는 무시한다. 한 예시·종류에 파일이 둘이면 멈추고 어느 파일인지 알린다.
   규칙에 안 맞는 PDF는 목록으로 보여 주고 건너뛴다. (파일명 해석은 `shared/src/ib-guide/fileName.ts`의
   순수 함수 — 단위 테스트 대상)
2. **변환**: PDF 쪽마다 가로 1600px WebP(품질 80)로 그려 `.ib-out/ia/ex26/student/001.webp`에 쓴다.
   A4 기준 약 190DPI로 본문·수식이 화면 폭 100%에서 선명하다. 원본 PDF의 sha256이 지난번과 같으면
   변환을 건너뛴다. 변환에는 저장소에 이미 있는 `pdfjs-dist`(legacy 빌드)와 `@napi-rs/canvas`를 쓴다.
3. **설명(선택)**: 폴더에 `examples.json`이 있으면 `{ "ex26": { "title": "…", "note": "…" } }`를 읽어
   manifest에 싣는다.
4. **올리기**: 서버 manifest를 받아 sha256이 다른 파일만 올리고, 마지막에 manifest를 올린다.
   다시 실행해도 안전하다.
5. **빼기**: 폴더에서 PDF를 지우고 다시 실행하면 manifest에서 빠져 화면에서 사라진다 (Volume의 파일은
   남지만 3번 라우트가 manifest에 없는 쪽을 내보내지 않는다).

옵션: `--dry-run`(올리지 않고 무엇을 할지만 출력), `--only ex26`(한 예시만 변환·올리기).
`.ib-out/`은 `.gitignore`에 넣는다. PDF와 쪽 이미지는 **절대 git에 넣지 않는다.**

## 5. 클라이언트

### 경로 (`App.jsx`, DashboardLayout 밖)

```
<IbGuideRoute>                    가드 + 데이터 공급자 (useIbGuideData)
  <IbGuideLayout>                 상단 바: ← 돌아가기 · "IB교육과정 안내" · 탭 [IA작성예시]
    /ib            → /ib/ia
    /ib/ia         IaListPage
  /ib/ia/:exId     IaViewerPage   (전체 화면)
```

- `IbGuideRoute`: 비로그인 → `/`, 허가 없음 → `/{role}/classrooms`. 화면을 옮길 때마다
  `/api/ib/access`를 다시 확인한다 (`AiHubRoute`와 같은 흐름).
- 진입: 학급 상세(ClassroomDetail) 머리의 **AI활용** 버튼 옆에 **IB안내** 버튼
  (`IconButton`, 교사·관리자이거나 `classroom.ibGuideEnabled`일 때만 보임).
- 스위치: 학급 `#` 패널의 "학생에게 AI활용 열기" 아래에 **"학생에게 IB 안내 열기"**.

### 목록 (`pages/IbGuide/IaListPage.jsx`)

예시 카드 격자. 카드에는 "예시 26", 제목(있으면), 보유 문서 배지(학생 · 주석 · 코멘트)와 쪽수.
썸네일은 두지 않는다 (목록만으로 워터마크 합성 요청이 수십 건 생기지 않게).

### 뷰어 (`pages/IbGuide/IaViewerPage.jsx`)

- 주소: `/ib/ia/ex26?doc=student|annotated|comments` (기본 `student`). 없는 문서의 탭은 비활성.
- 상단: ← 목록 · "예시 26" · 탭 세 개 · 이전/다음 예시 · 확대/축소(50~200%, 기본 폭 맞춤) · 쪽 표시 `3 / 24`.
- 본문: 세로 스크롤. 쪽마다 자리(비율 고정 상자)를 먼저 잡고, 보이는 쪽과 앞뒤 2쪽만 불러온다
  (IntersectionObserver, 동시 요청 3개). 화면에서 멀어진 쪽은 캔버스를 비워 메모리를 돌려준다.
- **탭 전환 시 쪽 위치 유지**: 학생본 ↔ 주석본은 같은 쪽 번호로 옮겨 가 바로 비교할 수 있다.
  코멘트 탭은 1쪽에서 시작하고, 돌아오면 보던 쪽으로 복귀한다.
- 쪽 그리기 (`components/ibGuide/ProtectedPage.jsx`): 인증 헤더로 받아 → `createImageBitmap` →
  `<canvas>`에 그림 → 비트맵 해제. `<img>`와 blob URL을 만들지 않는다 (이미지 저장·새 탭 열기 대상이 없음).
- 억제 장치 (막는 것이 아니라 번거롭게 하는 것): 우클릭 메뉴·드래그·길게 누르기·글자 선택 끔,
  `@media print`에서 본문 숨기고 "인쇄할 수 없는 자료입니다" 표시, Ctrl/⌘+P·S 기본 동작 취소.
  다운로드·인쇄 버튼은 없다.
- 오류: 쪽 하나가 실패하면 그 자리에 "다시 시도" 버튼. 403이면 (스위치가 꺼짐) 학급 목록으로 보낸다.

## 6. 배포

- **sharp 설치**: sharp의 네이티브 바이너리는 `optionalDependencies`(`@img/sharp-linux-x64` 등)로 배포된다.
  지금 Dockerfile의 production 단계는 `npm ci --omit=dev --omit=optional --ignore-scripts`라 그대로 두면
  **sharp가 실행되지 않는다.** production 단계에서 linux-x64(glibc)용 sharp 바이너리가 설치되도록
  Dockerfile을 고치고, **실제로 이미지를 빌드해 컨테이너 안에서 워터마크 합성이 되는지 확인**한다.
  (`@napi-rs/canvas`는 서버에서 계속 빠져 있어야 한다 — 변환은 PC 스크립트만 한다.)
- 글꼴 파일(`packages/server/assets/fonts/`)을 production 이미지로 복사한다.
- Railway 환경 변수에 `IB_MEDIA_UPLOAD_TOKEN` 추가 (`openssl rand -hex 32`).
- sharp 버전은 구현 시점의 최신 안정판(현재 0.35.x, Node ≥ 20.9)을 공식 문서로 확인하고 고정한다.

## 7. 오류 처리 요약

| 상황 | 결과 |
|---|---|
| 비로그인으로 `/api/ib/*` | 401 |
| 허가 없는 학생 | 403 → 클라이언트가 학급 목록으로 |
| manifest에 없는 예시·문서·쪽 | 404 |
| `/api/files/ib-guide/…` (어떤 경로든) | 404 |
| 글꼴·합성 실패 | 500 (워터마크 없는 이미지는 절대 내보내지 않음) |
| 업로드 토큰 미설정 / 불일치 | 503 / 401 |
| manifest가 아직 없음 | 목록이 비어 있고 "아직 올라온 예시가 없어요" 표시 |

## 8. 테스트

- **단위 (vitest)**
  - `canUseIbGuide` 결정표 (교사 · 관리자 · 학생 0/1학급 · 역할 없음).
  - 파일명 해석: 정상, ` (1)` 꼬리표, 대소문자, 규칙 밖 이름, 한 예시에 같은 종류 두 개.
  - 허용 경로 정규식과 `..`·앞 슬래시·쿼리 거부, manifest 검증(쪽 수와 파일 불일치).
  - 워터마크: 합성 결과가 원본과 같은 크기의 WebP이고 픽셀이 달라졌는지, 글꼴 경로가 틀리면 던지는지.
- **서버 라우트**: 401 / 403 / 200(+ `no-store` 헤더) / manifest 밖 404, `/api/files/ib-guide/*` 404,
  일반 업로드·삭제 거부, 토큰 업로드 성공·sha 불일치 422.
- **브라우저 (Playwright)**: 스위치를 켠 학급의 학생으로 버튼 → 목록 → 뷰어 → 탭 전환(쪽 유지) 확인,
  화면 캡처에서 워터마크에 그 학생 이름이 보이는지 확인. 스위치가 꺼진 학급의 학생은 버튼이 없고
  `/ib/ia` 직접 접속도 학급 목록으로 돌아가는지 확인. 네트워크 기록에 `.pdf` 응답이 없는지 확인.
- **배포 확인**: Docker 이미지를 빌드해 컨테이너에서 쪽 이미지 라우트가 한글 이름 워터마크와 함께
  200을 내는지 확인.

## 9. 문서

- `CLAUDE.md` · `.claude/PROJECT_MAP.md`: IB 허브, `ib-guide` 버킷, 환경 변수, `ib:push`.
- `scripts/ib-guide/README.md`: 처음 올리는 순서, 예시 추가·빼기, `examples.json` 형식.

## 손대는 파일 (요약)

| 영역 | 새 파일 | 고치는 파일 |
|---|---|---|
| shared | `ib-guide/{access,paths,fileName,manifest,index}.ts` | `index.ts` |
| server | `routes/ibGuide.ts`, `middleware/ibGuide.ts`, `services/{ibGuideAccess,ibGuide,ibWatermark}.service.ts`, `assets/fonts/*` | `app.ts`(라우트 등록), `config/env.ts`, `db/schema.ts`, `db/startupMigrate.ts`, `routes/storage.ts`, `routes/classrooms.ts`, `services/{classroom,storage,aiHubUpload}.service.ts`, `Dockerfile`, `package.json` |
| client | `pages/IbGuide/{IbGuideRoute,IbGuideLayout,IaListPage,IaViewerPage}.jsx`, `components/ibGuide/ProtectedPage.jsx`, `hooks/useIbGuideData.js`, `lib/ibGuide/guard.js` | `App.jsx`, `pages/Classrooms/ClassroomDetail.jsx` |
| scripts | `scripts/ib-guide/{push,render,README.md}` | 루트 `package.json`(`ib:push`), `.gitignore` |
