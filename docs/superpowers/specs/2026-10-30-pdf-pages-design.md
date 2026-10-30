# PDF 교재 페이지 (벡터 배경 필기) — 설계

작성일: 2026-10-30
상태: 질의응답으로 확정 (Q1~Q3, 설계 3개 섹션 승인) → 구현 계획 대기

## 배경 / 문제

챕터·과제 페이지는 교사가 **이미지를 한 장씩 올려** 만들고, 5개 필기 뷰어는 그 이미지를 Excalidraw
**이미지 요소**(`__bg_image__`, DataURL)로 캔버스 안에 넣는다. 확대 품질이 업로드한 이미지의 픽셀
해상도에 묶여 있어, 학생이 작은 글씨를 확대하면 깨진다. 교사는 교재가 PDF로 있어도 쪽마다 이미지로
변환해 올려야 한다.

삼성노트·굿노트처럼 **PDF 파일 하나를 등록하면 쪽마다 페이지가 생기고**, 어느 배율로 확대해도 글자가
선명하게 보이는 **벡터 배경** 위에 필기할 수 있어야 한다.

## 목표

1. 챕터 편집기와 과제 편집기에서 PDF 파일을 등록하면 PDF 쪽수만큼 페이지가 생성된다. 기존 이미지
   페이지와 섞여 공존하고 자유롭게 재정렬된다.
2. 5개 필기 뷰어(①학생 필기 ②교사 필기 ③교사 코멘트 ④과제 필기 ⑤과제 코멘트) 모두에서 PDF 쪽이
   **벡터로 렌더**되어 어느 배율에서도 선명하다.
3. 필기·코멘트·실시간 동기화·PDF 내보내기 등 기존 기능이 PDF 페이지에서도 그대로 동작한다.
4. 기존 노트 데이터 계약(`excalidraw_data.bgPosition`)을 바꾸지 않는다.

### 비목표 (v1)

- 서버 측 PDF 파싱·래스터화 (서버는 PDF를 열지 않는다).
- PDF 안의 텍스트 선택·검색·링크·폼. 렌더만 한다.
- PDF 쪽 범위 선택 등록, 쪽 회전·자르기. 전체 쪽을 순서대로 넣는다.
- 문제은행·AI 코칭의 `imageUrl`, 화이트보드 내보내기 — 별개 기능이라 손대지 않는다.
- 기존 이미지 페이지를 PDF로 바꾸는 마이그레이션.

## 핵심 설계 결정 (질의응답 확정)

| # | 결정 | 선택 |
|---|---|---|
| Q1 | 렌더 방식 | **벡터 PDF 레이어**(굿노트식). 업로드 시 고해상 이미지로 변환하는 안은 확대 한도(약 3~4배)가 남아 제외. |
| Q2 | 적용 범위 | **챕터 + 과제, 5개 뷰어 전부**. `assignment_pages`에도 PDF 컬럼을 추가. |
| Q3 | 구현 접근 | **순수 벡터** — Excalidraw 아래에 뷰포트를 따라가는 pdf.js 캔버스. `imageUrl`은 비워 두고 썸네일·내보내기도 pdf.js로 구현(래스터 보관 없음). 적응형 배경 image element 안은 모바일 캔버스 한도(약 1,600만 px)에 걸려 제외. |

## 데이터 모델 (Drizzle `schema.ts` + `startupMigrate.ts` idempotent DDL)

```
pages
  + pdf_url   text    null   -- 원본 PDF 파일 URL (/api/files/chapter-pdfs/…). 같은 PDF의 N쪽은 같은 값
  + pdf_page  integer null   -- 1부터 시작하는 PDF 쪽 번호

assignment_pages
  + pdf_url   text    null
  + pdf_page  integer null
```

- 종류 판별은 기존 관례(`page_type`이 null이면 URL 필드로 판별)를 따른다. `pdfUrl`이 있으면 PDF
  페이지다. `page_type`은 건드리지 않는다. 두 컬럼은 항상 함께 채워지거나 함께 null이다.
- `@mathchois/shared` `Page`, `AssignmentPage`에 `pdfUrl: string | null`, `pdfPage: number | null` 추가.
  `shared/src/page/kind.ts`에 `isPdfPage(page)` 한 함수를 둔다(클라이언트·서버 공용).
- `startupMigrate`가 두 테이블에 `ALTER TABLE … ADD COLUMN IF NOT EXISTS`로 컬럼을 보장한다.
- 연결(linked) 챕터는 원본 행을 그대로 돌려주므로(`getResolvedPagesByChapter`) `pdfUrl`이 자동으로 따라간다.

## 저장 (Volume 버킷)

- 새 버킷 **`chapter-pdfs`**. 교사 전용(`STUDENT_ALLOWED_BUCKETS`에 넣지 않음). 디렉터리는
  `chapters/{chapterId}` 또는 `assignments/{assignmentId}`.
- `routes/storage.ts` 업로드 정책: `chapter-pdfs`는 `application/pdf`만 허용하고(HTML 전용 버킷과 같은
  방식, `PDF_ONLY_BUCKETS`), **100MB 상한**(`PDF_MAX_BYTES`)을 둔다. 위반 시 각각 400 / 413.
  정책 판정은 순수 함수 `utils/uploadPolicy.ts`의 `checkUploadPolicy(bucket, mimetype, size)`로 뽑아내
  테스트한다(기존 HTML 전용·화이트보드 규칙도 이 함수로 옮긴다).
- 업로드는 기존 `POST /api/files/upload`(전체 버퍼링)를 그대로 쓴다. 100MB 상한 안에서는 허용 범위다.
- 서빙은 기존 `GET/HEAD /api/files/*`를 그대로 쓴다. 이미 `Accept-Ranges: bytes`와 Range 206을
  지원하므로 pdf.js가 **필요한 바이트 범위만** 요청한다. 같은 origin이라 쿠키 인증이 그대로 붙는다.
- 삭제:
  - 페이지 삭제(편집기 `handleDeletePage`): 같은 `pdfUrl`을 참조하는 다른 페이지가 챕터(과제)에 남아
    있으면 PDF 파일은 지우지 않는다. 판정은 순수 함수 `lib/pageStorage.js`의
    `isLastReferenceToFile(pages, deletedPage)`.
  - 챕터 삭제 정리(`routes/chapters.ts` → `getPageImageUrls`/`findSharedImageUrls`): PDF URL도 함께
    반환·중복 제거하도록 넓힌다. 과제 삭제도 같은 방식.

## 등록 흐름 (챕터 편집기 `pages/Chapters/Editor.jsx` · 과제 편집기 `pages/Assignment/AssignmentEditor.jsx`)

1. 파일 입력의 `accept`를 `image/*,application/pdf`로 넓힌다. 이미지는 지금 경로 그대로.
2. PDF는 공통 모듈 `lib/pdfImport.js`의 `inspectPdf(file)`로 브라우저에서 pdf.js로 연다.
   - 암호 PDF → "암호가 걸린 PDF는 등록할 수 없습니다."
   - 손상·비PDF → "PDF를 읽을 수 없습니다."
   - 쪽수 > **500** → "PDF는 500쪽 이하만 등록할 수 있습니다."
   - 100MB 초과 → 서버 왕복 없이 "PDF는 100MB 이하만 등록할 수 있습니다."
3. 통과하면 PDF를 `chapter-pdfs`에 **한 번** 업로드한다.
4. 쪽수만큼 페이지 행을 **배치 생성**한다. 챕터는 기존 `POST /api/chapters/:id/pages`의
   `{ pages: [{ pdfUrl, pdfPage, position }] }` 형식을 쓴다(서버는 `pdfUrl`/`pdfPage`를 받아 저장; `pdfUrl`이
   있으면 `pdfPage`는 1 이상 정수여야 하고, 아니면 400). 과제 `POST /api/assignments/:id/pages`에 같은
   배치 형식을 추가한다(`createAssignmentPages`).
5. 여러 파일을 섞어 고르면 파일명 순(기존 `localeCompare numeric`)으로 처리하고, PDF 한 파일이 차지하는
   `position` 범위는 쪽수만큼 이어진다. 업로드 진행 표시는 "파일 n/m"에 더해 PDF는 "쪽 생성 중"을 보인다.
6. 서버는 PDF 내용을 검증하지 않는다(쪽수는 클라이언트가 보냄). 잘못된 쪽 번호는 뷰어에서 "쪽을 불러오지
   못했습니다"로 드러난다.

## 의존성

- 클라이언트에 **`pdfjs-dist` 6.4.299**(작성일 기준 최신, ESM) 추가. 설치 전 `dependency-vetting`.
- 워커: `GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)`
  (Vite가 번들). 설정은 `lib/pdfjs.js` 한 곳에서만 하고, 나머지는 이 모듈을 통해 pdf.js를 쓴다.
- 폰트가 내장되지 않은 PDF를 위해 `pdfjs-dist/cmaps`와 `pdfjs-dist/standard_fonts`를 `dist/pdfjs/`로
  복사하는 작은 Vite 플러그인 `pdfjsAssets()`를 `vite.config.js`에 추가한다(빌드 `closeBundle` 복사 +
  dev `configureServer` 정적 서빙). `getDocument`에 `cMapUrl: '/pdfjs/cmaps/'`, `cMapPacked: true`,
  `standardFontDataUrl: '/pdfjs/standard_fonts/'`를 넘긴다. Dockerfile은 `npm ci --ignore-scripts`라
  postinstall에 의존하지 않는다.
- 수동 청크: `vite.config.js` `manualChunks`에 `pdfjs-dist` → `vendor-pdfjs`를 추가해 뷰어 외 화면이
  pdf.js를 내려받지 않게 한다(동적 `import()`로 지연 로드).

## 뷰어 벡터 레이어

### 부품

| 파일 | 역할 |
|---|---|
| `components/study/PdfPageLayer.jsx` | Excalidraw 컨테이너 **아래** `<canvas>` 한 장. `pointer-events: none`. 명령형 핸들 `setViewport({ scrollX, scrollY, zoom })`, `rerender()`. 로드 실패 시 "PDF를 불러오지 못했습니다" + 다시 시도. |
| `hooks/usePdfDocument.js` | `pdfUrl` → `PDFDocumentProxy` 모듈 LRU 캐시(최근 **2개**, 밀려나면 `destroy()`). `getPage(n)` 결과도 문서별로 캐시. `prefetchPages(pdfUrl, [n-1, n+1])`. |
| `hooks/usePdfBackground.js` | 뷰어 공통 훅. 종이 사각형 계산·`bgPositionRef` 갱신·레이어 props·`onViewport` 콜백 제공. |
| `lib/pdfLayerMath.js` | 순수 함수: 장면→화면 변환, 종이∩화면 교집합, 렌더 배율, 재렌더 필요 판정, 캔버스 픽셀 예산. |
| `lib/pdfjs.js` | pdf.js 지연 로드 + 워커·cMap 설정 단일 지점. |

### 렌더 규칙

- **즉시 반응**: 뷰어 `onChange`가 넘기는 `appState.scrollX/scrollY/zoom`을 `setViewport`로 전달한다.
  레이어는 마지막 렌더 결과(비트맵)를 CSS transform으로 옮기거나 키운다. 비용은 숫자 비교 몇 번.
  기존 `onChange`의 "제스처 중 조기 반환"(`isGesturingRef`)보다 **앞**에 둔다.
- **정밀 렌더**: 뷰포트가 **120ms** 동안 멈추면 현재 `zoom × DPR`(DPR 상한 **3**) 배율로 **종이 중 화면에
  보이는 부분만** 그린다. `page.getViewport({ scale, offsetX, offsetY })`에 음수 오프셋으로 보이는 영역을
  잘라내고, 캔버스 크기는 항상 `컨테이너 × DPR` 이하다. 배율이 얼마든 메모리는 일정하다.
- 진행 중인 `RenderTask`는 새 요청이 오면 `cancel()`한다. `RenderingCancelledException`은 무시한다.
- 종이 바탕(흰색)과 바깥 작업 영역(회색)은 레이어가 칠한다. Excalidraw는
  `viewBackgroundColor: 'transparent'`.
- 컨테이너 크기 변경(`ResizeObserver`)은 재렌더를 유발한다.

### 좌표 계약 (기존과 동일)

- 종이 사각형 = 지금의 `bgPosition`. 첫 열람 시 PDF 쪽 크기(pt, `page.getViewport({scale:1})`)로
  `calculateBgPosition(W, H, ptW, ptH)`를 계산해 노트의 `bgPosition`에 저장하고, 이후엔 저장값을 쓴다.
- 배경 image element(`__bg_image__`)는 만들지 않는다. `BG_FILE_ID`/`BG_ELEMENT_ID` 필터는 그대로 두어
  무해하다.
- 학생 필기 위 교사 코멘트(③⑤), 실시간 동기화, PDF 내보내기가 모두 `bgPosition`을 쓰므로 데이터
  계약이 바뀌지 않는다.

### 5개 뷰어 통합

각 뷰어(`StudyViewer`, `TeacherStudyViewer`, `StudentWorkViewer`, `AssignmentStudyViewer`,
`AssignmentWorkViewer`)는 세 곳만 바뀐다.

1. 배경 로드 `useEffect`에 `isPdfPage(page)` 분기: 이미지 fetch·`addFiles`·bg element 대신
   `usePdfBackground`가 종이 사각형을 정한다. 노트 파일(`addFiles`)은 지금처럼 넣는다.
2. `onChange` 첫 줄에 `pdfBackground.onViewport(appState)` 호출.
3. 렌더 트리에서 `<PdfPageLayer …/>`를 Excalidraw 컨테이너 아래(형제, z-index 낮음)에 배치.

부수 변경:
- `DrawingToolbar`의 "이미지 이동" 버튼은 PDF 페이지에서 숨긴다(`htmlMode`처럼 `pdfMode` prop).
  "이미지 다시 불러오기"는 `layer.rerender()`로 연결.
- `prefetchImages([prev.imageUrl, next.imageUrl])` 자리에서 PDF 페이지는 `prefetchPages`로 예열.
- 화면 잠금, 줌 독립 펜 두께, 문지르기 지우개, 웻잉크, 영상 2분할은 그대로.
- StudyViewer의 교사 필기 모달(`TeacherNotesModal`, 읽기 전용 Excalidraw)도 같은 레이어를 쓴다.

## 썸네일

- `components/common/PageThumb.jsx`: 페이지 객체를 받아 이미지면 `<img>`, PDF면 `PdfPageThumb`.
- `PdfPageThumb`: 보일 때만(`IntersectionObserver`) pdf.js로 너비 약 **240px** 캔버스를 렌더하고
  DataURL을 모듈 LRU 캐시(`pdfUrl#page` 키, 최근 200개)에 둔다. `width` prop으로 편집기 미리보기는
  컨테이너 너비에 맞춰 크게 렌더하고 `ResizeObserver`로 갱신한다.
- 교체 지점 8곳: `SortablePageItem`, 챕터 편집기 선택 미리보기, 5개 뷰어의 페이지 띠, 교사 필기 모달.
  과제 편집기 목록도 `SortablePageItem`을 쓰므로 포함된다.

## PDF 내보내기 (`lib/pdfDownloader.jsx`)

- 배경 인자를 문자열 `bgUrl` 대신 **서술자** `{ imageUrl } | { pdfUrl, pdfPage }`로 받는다. 문자열도
  계속 받아(=`{ imageUrl }`) 기존 호출을 깨지 않는다. 정규화는 순수 함수 `resolveBackground(input)`.
- PDF면 pdf.js로 긴 변 `PDF_MAX_DIMENSION`(1754px)로 래스터한 DataURL을 만들고, 지금과 같은
  `createBgElement` + `BG_FILE_ID` 경로로 합친다. 이미지 경로와 코드가 갈라지는 지점은 "배경 DataURL과
  자연 크기를 얻는" 한 함수(`loadBackgroundBitmap`)뿐이다.
- 호출처 9곳(`ChapterMonitor`, `AssignmentMonitor`, `ClassroomDetail`, `AssignmentTab`, 뷰어 5)은
  `bgUrl: p.imageUrl` 대신 페이지 객체(또는 `{ imageUrl, pdfUrl, pdfPage }`)를 넘긴다.

## 오류 처리

| 단계 | 상황 | 처리 |
|---|---|---|
| 등록 | 암호 PDF / 손상 / 500쪽 초과 / 100MB 초과 | 클라이언트에서 거부, 메시지 표시, 다른 파일은 계속 진행 |
| 등록 | 버킷 MIME 불일치, 용량 초과 | 서버 400 / 413 |
| 등록 | 업로드는 됐지만 페이지 생성 실패 | 메시지 표시. 고아 파일은 챕터 삭제 정리에 맡긴다(v1) |
| 열람 | 문서 로드 실패(404, 네트워크) | 레이어에 안내 + 다시 시도. 필기·저장은 계속 가능 |
| 열람 | 쪽 번호 범위 밖 | "쪽을 불러오지 못했습니다" |
| 열람 | 렌더 취소 | 무시 |
| 열람 | 메모리 | 문서 캐시 2개, 캔버스 픽셀 예산 고정, DPR 상한 3 |

## 테스트

- **Vitest(클라이언트, 순수 함수)**: `pdfLayerMath`(장면↔화면 변환, 교집합, 배율, 재렌더 판정, 픽셀
  예산), `shared/page/kind`, `pdfDownloader`의 `resolveBackground`, `pageStorage.isLastReferenceToFile`,
  `pdfImport`의 결과 분류(쪽수 한도·오류 분류 — pdf.js 호출은 주입).
- **Vitest(서버)**: 서버에는 테스트 러너가 없으므로 `packages/server`에 vitest를 devDependency로
  추가하고 `test` 스크립트를 만든다. 대상은 `utils/uploadPolicy.checkUploadPolicy`(PDF 전용 버킷 MIME·
  용량, 기존 HTML·화이트보드 규칙 회귀)와 페이지 배치 생성 body 검증(`pdfUrl`↔`pdfPage` 짝 규칙).
- **Playwright E2E 1건**: 2쪽짜리 PDF 픽스처를 챕터 편집기에 올리면 페이지 2개가 생기고, 학생 뷰어에서
  레이어 캔버스가 그려지며(캔버스 픽셀이 흰색만이 아님) 필기가 저장되는지 확인.
- 실기기(태블릿) 확인 항목: 핀치 줌 중 끊김 없음, 멈춘 뒤 선명해짐, 20쪽 PDF 연속 넘김 시 메모리 안정.

## 문서 갱신

- `.claude/PROJECT_MAP.md`: 버킷 목록(`chapter-pdfs`), `pages`/`assignment_pages` 컬럼, 새 컴포넌트·훅·
  lib, 뷰어 통합 메모.
- `CLAUDE.md`: 버킷 목록과 "PDF 페이지는 배경 image element가 없고 레이어가 뷰포트를 따라간다"는
  gotcha 한 줄.
