# 문제은행 & AI OCR 문항등록 — 설계 문서

**날짜:** 2026-06-02
**범위:** ChoisClass에 수학 코칭 기능을 이식하기 위한 5개 하위 프로젝트 중 **#1(AI 기반 + OCR 문항등록) + #2(문제은행 DB + 검색)**.
**참조 원본:** `E:\Projects\MathCoach` (`/teacher/problems` 문항등록 & 등록된 문항 탭).

---

## 1. 배경 · 목표

MathCoach(Firebase + Firestore + Genkit/Gemini)의 문항등록·문제은행 기능을 ChoisClass
(Fastify + Drizzle/PostgreSQL + VOLUME 스토리지) 스택으로 **재구현**한다. 코드는 새로 작성하되
AI 프롬프트·데이터 흐름 설계는 MathCoach를 이식한다.

**이 spec의 산출물:**
- 교사가 수학 문제 이미지를 업로드하면 Gemini가 OCR하여 수식(LaTeX)·그림영역·분류 메타데이터를
  추출하고, 교사가 그림 슬롯에 실제 이미지를 삽입해 문항을 등록한다.
- 정답·해설은 교사 제공 마크스킴(우선) 또는 AI 생성+교사 검수로 채운다.
- 전체 교사가 공유하는 문제은행을 표로 보며 과목·단원·난이도·유형·키워드로 검색한다.

**이 spec의 비범위(후속 하위 프로젝트):**
- #3 챕터 페이지에 AI 도우미 연결 + 학생 풀이/코칭
- #4 풀이 기록(student history / teacher 학생별 관리)
- #5 대시보드

단, #3~#5가 재사용할 자산(AI 서비스 계층, `ProblemView` 렌더 컴포넌트, `problems` 테이블)은
여기서 만든다.

---

## 2. 핵심 결정 사항 (확정)

| 항목 | 결정 |
|---|---|
| AI 공급자 | **Google Gemini** (`@google/genai` SDK) |
| AI 연동 방식 | **접근 A** — 자체 `ai.service.ts` 얇은 래퍼 (Genkit 미사용), 구조화 출력은 `responseSchema` |
| 모델 | env `GEMINI_MODEL`로 교체 가능. 기본값은 현행 Gemini 비전-flash 계열(MathCoach `gemini-3.5-flash`에서 업그레이드) |
| 문제은행 범위 | **전체 공유 은행** (작성자 표시, 등록·검색·조회는 모든 teacher / 수정·삭제는 작성자 또는 isAdmin) |
| 문제 저장·표시 | **원본 이미지 + LaTeX 둘 다 저장**. 표시 기본 LaTeX 렌더, 원본 이미지 토글 가능 |
| 정답·해설 출처 | 교사 제공 마크스킴 이미지가 있으면 **우선**, 없으면 AI 생성 + 교사 검수. `solutionSource`로 출처 기록 |
| 분류 체계 | **자유 텍스트**(AI 추출, 교사 수정 가능). 고정 코드표 강제 안 함. 검색 화면에서 facet으로 집계 |
| 검색 | **서버사이드** 쿼리(`GET /api/problems?...`) + 페이지네이션 |
| 데이터 모델 | **단일 테이블 `problems`** (정답·해설을 같은 row에 보관, 1:1) |
| 등록 흐름 | 중간 OCR/생성은 **stateless**(클라 폼 상태), 최종 1회 `POST /api/problems`로 저장 |

---

## 3. 데이터 모델

`packages/server/src/db/schema.ts`에 테이블 추가.

```ts
export const problems = pgTable("problems", {
  id: uuid("id").primaryKey().defaultRandom(),

  // 본문 (OCR 결과)
  title: text("title"),                           // 교사 설정, 선택
  problemLatex: text("problem_latex").notNull(),  // Markdown + LaTeX 본문
  figureNotes: jsonb("figure_notes").$type<string[]>().default([]),
  originalImageUrl: text("original_image_url"),   // 업로드 원본 문제 이미지
  figures: jsonb("figures")
    .$type<{ idx: number; alt: string; imageUrl: string }[]>()
    .default([]),                                 // 슬롯별 삽입 이미지

  // 분류 (AI 추출, 교사 수정 가능) — 검색/필터 대상
  subject: text("subject"),
  majorUnit: text("major_unit"),
  minorUnit: text("minor_unit"),
  difficulty: text("difficulty"),                 // 상/중/하
  problemType: text("problem_type"),
  detailType: text("detail_type"),
  keywords: jsonb("keywords").$type<string[]>().default([]),

  // 정답 · 해설
  answer: text("answer"),
  solution: text("solution"),                     // Markdown + LaTeX
  solutionSource: text("solution_source"),        // teacher-markscheme | ai | ai-regenerated | teacher-verified
  markschemeImageUrl: text("markscheme_image_url"),

  // 메타
  aiModel: text("ai_model"),
  status: text("status").notNull().default("ready"), // draft | ready (비동기 생성 대비 예약)
  createdBy: uuid("created_by").references(() => profiles.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

**인덱스:** `createdAt`(목록 정렬), `subject`/`majorUnit`/`difficulty`(필터). 키워드 `q`는
`ILIKE` 기반(MVP). 필요 시 추후 GIN/full-text로 확장.

**`figures` 정렬 규약:** 본문의 `[FIGURE:n]` 플레이스홀더 ↔ `figureNotes[n-1]` ↔
`figures[].idx === n` 가 1:1 대응.

**마이그레이션:** 기존 관행대로 `db:generate`로 Drizzle 마이그레이션 생성 + `db/startupMigrate.ts`에
멱등 DDL(`CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`) 보강.

---

## 4. AI 서비스 계층

`packages/server/src/services/ai.service.ts` — `@google/genai` SDK 래퍼.

**env (`config/env.ts` zod 추가):** `GEMINI_API_KEY`(필수), `GEMINI_MODEL`(기본값 제공).

**구조화 출력:** Gemini `responseSchema`(JSON Schema)로 강제. 파싱 실패 시 1회 재시도 후 에러.

| 함수 | 입력 | 출력 | 비고 |
|---|---|---|---|
| `ocrProblem(imageDataUrl)` | 문제 이미지 base64 dataURL | `{ latex, figureNotes: string[], meta }` | `meta` = subject/majorUnit/minorUnit/difficulty/problemType/detailType/keywords |
| `ocrMarkscheme(imageDataUrl)` | 정답/마크스킴 이미지 | `{ answer, solution }` | 교사 제공 우선 경로 |
| `generateSolution(problemLatex)` | 문제 LaTeX | `{ answer, solution }` | AI 생성 경로 |

**프롬프트:** MathCoach `PROBLEM_RULE` / 해설생성 프롬프트를 이식.
**업그레이드 1건:** 그림 플레이스홀더를 `[FIGURE: 설명]`(인덱스 없음) → **`[FIGURE:1]`, `[FIGURE:2]` 번호 부여**로
변경하여 슬롯-이미지 매칭을 안정화. `figureNotes` 순서와 본문 번호, `figures[].idx` 정렬.

모델명은 결과 row의 `aiModel`에 기록(추적성).

---

## 5. 서버 API

`packages/server/src/routes/problems.ts` (DB 로직은 `services/problem.service.ts`,
`note.service.ts` 패턴 준수). `app.ts`에 라우트 등록. 입력 검증 zod.

| 메서드 | 경로 | 역할 | 권한 |
|---|---|---|---|
| `POST` | `/api/problems/ocr` | `{imageUrl}` → AI OCR 결과(저장 X) | teacher |
| `POST` | `/api/problems/markscheme-ocr` | `{imageUrl}` → `{answer,solution}` | teacher |
| `POST` | `/api/problems/generate-solution` | `{problemLatex}` → `{answer,solution}` | teacher |
| `POST` | `/api/problems` | 폼 전체 → row 생성 | teacher |
| `GET` | `/api/problems` | 검색·필터·페이지네이션 | teacher |
| `GET` | `/api/problems/facets` | 필터 드롭다운용 distinct 값 | teacher |
| `GET` | `/api/problems/:id` | 상세 | teacher |
| `PATCH` | `/api/problems/:id` | 수정 | 작성자/admin |
| `DELETE` | `/api/problems/:id` | 삭제 | 작성자/admin |

**검색 쿼리 파라미터:** `subject`, `majorUnit`, `minorUnit`, `difficulty`, `problemType`,
`q`(키워드: title/problemLatex/keywords/단원 ILIKE), `page`, `pageSize`. 정렬은 `createdAt desc`.

**이미지 저장:** 기존 `POST /api/files/upload` 재사용, 새 버킷 `problem-bank`
(원본·그림슬롯·마크스킴 이미지). `VOLUME_PATH` 규칙 준수, `/api/files/*`로 서빙.

**정답·해설 우선순위 로직(라우트/클라 공통 규약):**
1. 마크스킴 이미지 업로드됨 → `ocrMarkscheme` 결과 채움, `solutionSource='teacher-markscheme'`.
2. 아니면 교사가 `generate-solution` 호출 → `solutionSource='ai'`.
3. 교사가 내용 수정 후 저장 → `solutionSource='teacher-verified'`.
4. 저장된 문항 재생성 시 → `solutionSource='ai-regenerated'`.

---

## 6. 클라이언트 UI

### 6.1 라우트 · 진입
- 신규 페이지 `/teacher/problems` (DashboardLayout 내부). `App.jsx` 라우트 추가,
  **교사 사이드바에 "문제은행" 메뉴** 추가.
- 페이지 내 탭 2개(`?tab=register` / `?tab=list`): **문항등록 / 등록된 문항**.

### 6.2 탭 1 — 문항등록 `pages/Problems/ProblemRegister.jsx`
1. 문제 이미지 업로드(드롭/선택) → 미리보기.
2. **[AI 분석]** → `/api/problems/ocr` → 폼 자동 채움:
   - LaTeX 본문 편집기(textarea) + **실시간 KaTeX 미리보기**
   - 감지 그림 목록(`figureNotes`) → 각 항목 **그림 슬롯**(파일 삽입) → `figures[idx]`
   - 분류 필드(과목/대단원/소단원/난이도/유형/세부유형/키워드)
3. **미리보기 패널**: 본문 Markdown+KaTeX 렌더, `[FIGURE:n]` 자리에 삽입 이미지 표시.
4. 정답·해설: ⓐ 마크스킴 이미지 업로드 → `markscheme-ocr`, 또는 ⓑ **[AI 정답·해설 생성]**
   → `generate-solution`. 둘 다 편집 가능, `solutionSource` 자동 기록.
5. **[저장]** → `POST /api/problems`.

### 6.3 탭 2 — 등록된 문항 `pages/Problems/RegisteredProblems.jsx`
- **필터바**: 과목/대단원/소단원/난이도/유형 드롭다운(`/facets`) + 키워드 검색.
- **표**(반응형 규칙 준수): 래퍼 `overflow-x-auto`, `thead` sticky(배경색 지정),
  첫 열(제목) sticky-col, 모든 셀 `whitespace-nowrap`. 열: 제목·과목·대단원·소단원·난이도·유형·
  세부유형·키워드·작성자·등록일·동작(보기/수정/삭제).
- 행 클릭 → 상세 패널(렌더된 문제 + 정답·해설, 원본 이미지 토글). 수정은 등록 폼 재사용(작성자/admin).

### 6.4 공통 — 수식 렌더링 (재사용 자산)
- 클라 의존성 추가: `katex`, `react-markdown`, `remark-math`, `rehype-katex`.
- 신규 컴포넌트 `components/common/ProblemView.jsx`(Markdown+LaTeX+그림 렌더) — #3~#5 재사용.
- `lib/api.ts`에 problem 엔드포인트 래퍼 추가.

반응형·sticky·터치타깃은 구현 후 `responsive-ui-reviewer`로 점검.

---

## 7. 신규/변경 파일 요약

**서버**
- `db/schema.ts` — `problems` 테이블 추가
- `db/startupMigrate.ts` — 멱등 DDL 보강
- `config/env.ts` — `GEMINI_API_KEY`, `GEMINI_MODEL`
- `services/ai.service.ts` — 신규 (Gemini 래퍼 + 프롬프트)
- `services/problem.service.ts` — 신규 (DB 로직)
- `routes/problems.ts` — 신규 (위 API)
- `app.ts` — 라우트 등록
- 드라이즈 마이그레이션 파일

**클라이언트**
- `App.jsx` — `/teacher/problems` 라우트
- DashboardLayout 교사 사이드바 — "문제은행" 메뉴
- `pages/Problems/ProblemRegister.jsx` — 신규
- `pages/Problems/RegisteredProblems.jsx` — 신규
- `components/common/ProblemView.jsx` — 신규
- `lib/api.ts` — problem 엔드포인트
- `package.json` — katex / react-markdown / remark-math / rehype-katex

**공유**
- `packages/shared/src/types/` — problem 관련 타입

---

## 8. 위험 · 유의

- **AI 비용·지연:** OCR/생성 호출은 5~15초 소요 가능. 클라에 로딩 상태 표시, 서버는 요청 타임아웃 설정.
- **프롬프트 정확도:** 그림 번호 부여 업그레이드가 모델 출력과 어긋날 수 있음 → `responseSchema`로
  `figureNotes` 길이와 본문 번호 정합성 검증, 불일치 시 교사가 수동 보정 가능하게.
- **Volume 용량:** 원본+그림+마크스킴 이미지가 누적됨. 삭제 시 연결 파일 정리 로직 포함.
- **권한:** 모든 라우트에서 JWT + role 재검증(layout 신뢰 금지, ChoisClass 관행).
- **`@google/genai` 버전:** 구조화 출력 API 형태가 SDK 버전에 따라 다름 → 구현 시 context7로 현행 문서 확인.
```
