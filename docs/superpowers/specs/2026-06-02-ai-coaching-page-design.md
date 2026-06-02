# 챕터 페이지 AI 수학 코칭 — 설계 문서

**날짜:** 2026-06-02
**범위:** 수학 코칭 이식 5개 하위 프로젝트 중 **#3 — 챕터 페이지에 AI 도우미(문제은행 문항) 연결 + 학생 풀이→AI 코칭 + 코칭 기록 저장**.
**참조:** MathCoach `src/components/SolveWorkspace.jsx`, `pages/Solve.jsx`, `functions/src/reviewSolution.ts`, `convertToLatex.ts`. 선행: `2026-06-02-problem-bank-and-ocr-registration-design.md`(#1+#2, 완료).

---

## 1. 배경 · 목표

교사가 챕터의 한 페이지에 문제은행 문항을 연결하면, 그 페이지를 여는 학생은 **빈 Excalidraw 캔버스에 풀이를 쓰고 AI 코칭**을 받는다. MathCoach `/solve`의 풀스크린 워크스페이스 레이아웃(좌 캔버스 / 우 문제·코칭 패널)을 이식하되, 캔버스는 ChoisClass의 Excalidraw(S-Pen·펜입력 자산)로 대체한다.

**산출물:**
- 교사: 챕터 에디터에서 "AI 코칭" 페이지 추가 → 문제은행에서 문항 선택.
- 학생: 해당 페이지에서 풀이(수식전환 → AI검토)로 스캐폴딩 코칭을 받음.
- 각 AI검토는 불변 `coaching_attempts` 1건으로 누적 저장(#4·#5 기반).

**비범위(후속):** #4 기록 조회 UI(학생 history, 교사 학생별 관리), #5 대시보드. #3은 데이터를 *생성·저장*하고 워크스페이스에서 *최신* 코칭만 표시한다.

---

## 2. 핵심 결정 (확정)

| 항목 | 결정 |
|---|---|
| 문제 표시 | 우측 사이드 패널에 LaTeX 렌더(`ProblemView`) + AI OCR(변환 풀이) + 코칭 결과. 원본이미지는 우상단 아이콘 → 모달 |
| 캔버스 | **Excalidraw**(빈 캔버스=풀이용). 기존 펜입력 훅·`DrawingToolbar` 재사용 |
| 코칭 흐름 | **2단계**: ① 수식전환(필기→LaTeX, 학생 수정 가능) → ② AI검토(정답·해설 대조 코칭) |
| 코칭 스타일 | MathCoach 스캐폴딩(오답이면 정답 통째 금지·"다음 한 걸음" 힌트; 정답이면 칭찬+다른 접근). 페이지별 모드 설정 없음(YAGNI) |
| 기록 | **검토마다 불변 `coaching_attempts` 누적** |
| 캔버스 지속 | 기존 `student_notes` 재사용(1.5초 debounce 자동저장) |
| 정답·해설 보안 | **학생 클라이언트에 절대 미전송. 서버에서만 대조** |
| 페이지 플래그 | `pages.aiProblemId IS NOT NULL` = AI 코칭 페이지(별도 enabled 플래그 없음) |

---

## 3. 데이터 모델

### 3.1 `pages` — 컬럼 1개 추가
```ts
aiProblemId: uuid('ai_problem_id').references(() => problems.id, { onDelete: 'set null' }),
```
- `aiProblemId` 설정 시 AI 코칭 페이지. 이 경우 `imageUrl/videoUrl/htmlUrl`은 null.

### 3.2 신규 테이블 `coaching_attempts`
```ts
export const coachingAttempts = pgTable('coaching_attempts', {
  id: uuid('id').defaultRandom().primaryKey(),
  pageId: uuid('page_id').notNull().references(() => pages.id, { onDelete: 'cascade' }),
  problemId: uuid('problem_id').references(() => problems.id, { onDelete: 'set null' }),
  studentId: uuid('student_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),

  workImageUrl: text('work_image_url'),        // 검토 시점 Excalidraw 필기 스냅샷 (bucket ai-coaching)
  solutionLatex: text('solution_latex'),        // 학생이 검수·수정한 변환 풀이
  isCorrect: boolean('is_correct'),
  errorTags: jsonb('error_tags').$type<string[]>().default([]).notNull(),
  conceptTags: jsonb('concept_tags').$type<string[]>().default([]).notNull(),
  strengthNotes: text('strength_notes'),
  weaknessNotes: text('weakness_notes'),
  commentMarkdown: text('comment_markdown'),    // 학생용 코칭 본문(Markdown+LaTeX)
  aiModel: text('ai_model'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('idx_coaching_attempts_student').on(t.studentId, t.createdAt),
  index('idx_coaching_attempts_page_student').on(t.pageId, t.studentId),
  index('idx_coaching_attempts_problem').on(t.problemId),
]);
```

- 마이그레이션: `db:generate` + `startupMigrate.ts` 멱등 DDL(`ADD COLUMN IF NOT EXISTS pages.ai_problem_id`, `CREATE TABLE IF NOT EXISTS coaching_attempts`).
- `student_notes`(캔버스 자동저장)는 변경 없음.

---

## 4. AI 서비스 (`services/ai.service.ts` 추가)

| 함수 | 입력 | 출력 | 프롬프트 |
|---|---|---|---|
| `convertSolutionToLatex(mime, base64)` | 학생 필기 이미지 | `{ latex }` | MathCoach `convertToLatex(kind:solution)` 이식. 그래프·도형은 본문 설명으로 보존 |
| `reviewSolution(args)` | `{ problemLatex, answer, solution, studentLatex, workMime, workBase64 }` | `{ commentMarkdown, isCorrect, errorTags[], conceptTags[], strengthNotes, weaknessNotes }` | MathCoach `reviewSolution` 스캐폴딩 코칭 이식 |

- 구조화 출력은 기존 패턴대로 `responseSchema` + `Type` enum. `errorTags` enum: `conceptual|computational|logical|notational|strategic|condition`.
- `reviewSolution`은 멀티모달: 필기이미지 + (문제·정답·해설·학생LaTeX) 텍스트를 함께 전달.
- GEMINI_API_KEY 미설정 시 기존 `client()` 가드로 503.

---

## 5. 서버 API

### 5.1 신규 `routes/coaching.ts` (DB는 `services/coaching.service.ts`)
| 메서드 | 경로 | 역할 | 권한 |
|---|---|---|---|
| `POST` | `/api/coaching/convert` | `{imageUrl}` → `{latex}` (수식전환) | authenticate |
| `POST` | `/api/coaching/review` | `{pageId, workImageUrl, solutionLatex}` → 서버가 페이지→문항→정답·해설 로드 + 코칭 + **attempt 생성** → attempt 반환 | authenticate |
| `GET` | `/api/coaching/pages/:pageId/attempts` | 본인(`req.user.sub`) attempt 목록(createdAt desc) | authenticate |

- `studentId`는 항상 `req.user.sub`(클라가 못 지정).
- 이미지 로더: `ai-coaching` 버킷 허용 헬퍼(coaching.ts 내). `urlToStoragePath` 후 `parsed.bucket === 'ai-coaching'` 검증.
- `review`는 `pageId`로 페이지 조회 → `aiProblemId`로 문항 조회(정답·해설 포함, **서버에서만**) → `reviewSolution` → attempt insert.

### 5.2 학생용 문제 조회 (정답 유출 방지)
`routes/problems.ts`에 추가:
| 메서드 | 경로 | 역할 | 권한 |
|---|---|---|---|
| `GET` | `/api/problems/:id/for-coaching` | 표시용 필드만(`id,title,problemLatex,figureNotes,figures,originalImageUrl,subject,majorUnit,minorUnit,difficulty,problemType,detailType,keywords`) — **answer/solution/markschemeImageUrl 제외** | authenticate |

### 5.3 페이지 API (`routes/pages.ts` + `page.service.ts` + shared `Page` 타입)
- `POST /api/chapters/:chapterId/pages` body에 `aiProblemId?` 추가.
- **신규 `PATCH /api/pages/:id`** `{ aiProblemId }` (연결 문항 변경). teacher 권한. (현재 pages 라우트에 update 없음 → 추가.)
- `GET` 페이지 응답에 `aiProblemId` 포함. `Page` 타입에 `aiProblemId: string | null` 추가.

### 5.4 스토리지
- 신규 버킷 `ai-coaching`(필기 스냅샷). 학생이 업로드하므로 `storage.ts`의 `STUDENT_ALLOWED_BUCKETS`에 `ai-coaching` 추가(이미지 MIME만 — 기존 `STUDENT_ALLOWED_MIMES`로 이미 제한됨).

---

## 6. 교사 편집 UX (`pages/Chapters/Editor.jsx`)

- 페이지 추가 버튼군에 **[AI 코칭]** 추가 → **`ProblemPickerModal`** 오픈.
- `ProblemPickerModal` (신규, `components/problems/ProblemPickerModal.jsx`): 검색어 입력 + facet 드롭다운(`getFacets`) + 결과 리스트(`listProblems`, 각 항목 `ProblemView` 축약) + [선택]. → `POST /api/chapters/:chapterId/pages { aiProblemId, position }`.
- 사이드바 페이지 항목: AI 페이지는 아이콘/배지(`Sparkles` 등)로 구분.
- 메인 미리보기(AI 페이지): 연결 문항을 `ProblemView`로 렌더(교사 화면이므로 정답·해설 포함 표시 가능) + **[문제 변경]**(PickerModal 재오픈 → `PATCH /api/pages/:id { aiProblemId }`).
- linked(공유) 챕터는 기존 규칙대로 페이지 추가·수정 불가(원본 챕터에서만).

---

## 7. 학생 코칭 뷰어 (`pages/Study/CoachingViewer.jsx`)

기존 학생 study 라우트에서 **`StudyViewer`가 `currentPage.aiProblemId` 존재 시 `CoachingViewer`를 렌더**(아니면 기존 흐름). 한 라우트 유지로 일반↔AI 페이지 prev/next 이동이 매끄럽다. `CoachingViewer`는 `chapterId/pages/currentPage/onNavigate`를 props로 받는다.

### 7.1 레이아웃 (풀스크린, DashboardLayout 밖)
- **헤더:** [나가기] · "문항 · {subject} · {difficulty}" · 페이지 prev/next · [그리드 토글] · **[수식전환]** · **[AI검토요청]** · 저장상태.
- **데스크탑(≥1024px):** 좌 Excalidraw 캔버스(`flex-1`) | 드래그 divider(폭 localStorage 기억, min 280px·max 60vw) | 우 패널(`overflow-y-auto`).
- **모바일:** 세로 스택 — 캔버스 `h-[55dvh]` + 패널. `100dvh` 사용(반응형 규칙).

### 7.2 우측 패널 3섹션
1. **문항** — 우상단 이미지 아이콘 → 원본이미지 **모달**(`max-h-[90dvh]`), 메타 배지, `ProblemView(latex, figures)`. 데이터: `GET /api/problems/:id/for-coaching`.
2. **변환된 풀이(수정 가능)** — `textarea` + 실시간 `ProblemView`(KaTeX) 미리보기. [수식전환]으로 채움.
3. **AI 검토** — `CoachingPanel`(신규 `components/common/CoachingPanel.jsx`): 정답/오답 배지 + errorTags·conceptTags 배지 + `commentMarkdown`(Markdown+KaTeX) + 보완점(weaknessNotes). 로드 시 `GET .../attempts`의 최신 1건 표시, 검토 후 갱신.

### 7.3 흐름 & 상태
- **수식전환(busy='convert'):** Excalidraw 사용자 요소만 추출 → `exportToBlob`(`@excalidraw/excalidraw`, 기존 `lib/pdfDownloader` 사용 패턴) → `ai-coaching` 버킷 업로드(`lib/coaching.js` 래퍼) → `POST /api/coaching/convert` → `solutionLatex` 채움.
- **AI검토요청(busy='review'):** `solutionLatex`+`workImageUrl` 필요(없으면 "먼저 수식 전환") → `POST /api/coaching/review {pageId, workImageUrl, solutionLatex}` → 반환 attempt를 `coaching`에 세팅, 목록 prepend.
- busy 표시·error 메시지(헤더). 모든 async 핸들러 try/catch 후 busy 해제.
- **캔버스 자동저장:** AI 페이지는 배경 이미지 없음(빈 캔버스+선택적 그리드). 기존 student_notes PUT 자동저장 그대로(`excalidrawData.elements`).

### 7.4 재사용 자산
- Excalidraw 입력: `hooks/useExcalidrawTouch`, `hooks/useScribbleErase`, `DrawingToolbar`, 자체 undo/redo.
- 렌더: `components/common/ProblemView`(#1+#2 산출).
- 신규 클라 모듈: `pages/Study/CoachingViewer.jsx`, `components/common/CoachingPanel.jsx`, `components/problems/ProblemPickerModal.jsx`, `lib/coaching.js`(convert/review/attempts/uploadWorkImage API 래퍼).

---

## 8. 신규/변경 파일 요약

**서버**
- `db/schema.ts` — `pages.aiProblemId` 추가, `coaching_attempts` 테이블
- `db/startupMigrate.ts` — 멱등 DDL
- `services/ai.service.ts` — `convertSolutionToLatex`, `reviewSolution`
- `services/coaching.service.ts` — attempt CRUD(생성/목록)
- `services/problem.service.ts` — 학생용 조회 헬퍼(표시 필드만)
- `services/page.service.ts` — `aiProblemId` create/update
- `routes/coaching.ts` — 신규(convert/review/attempts)
- `routes/problems.ts` — `/api/problems/:id/for-coaching`
- `routes/pages.ts` — POST body `aiProblemId`, 신규 `PATCH /api/pages/:id`
- `routes/storage.ts` — `ai-coaching` 학생 허용 버킷
- `app.ts` — coaching 라우트 등록
- 마이그레이션 파일

**클라이언트**
- `pages/Study/StudyViewer.jsx` — AI 페이지면 `CoachingViewer` 렌더 분기
- `pages/Study/CoachingViewer.jsx` — 신규(워크스페이스)
- `components/common/CoachingPanel.jsx` — 신규
- `components/problems/ProblemPickerModal.jsx` — 신규
- `pages/Chapters/Editor.jsx` — [AI 코칭] 추가 + AI 페이지 표시/변경
- `lib/coaching.js` — 신규 API 래퍼
- `lib/problems.js` — `getProblemForCoaching` 추가

**공유**
- `types/models.ts` — `Page.aiProblemId`
- `types/problem.ts`(또는 신규 coaching 타입) — `CoachingAttempt`, `CoachingResult`, `ConvertResult`

---

## 9. 위험 · 유의

- **정답 유출:** 학생 경로(`for-coaching`, 페이지 응답)에서 answer/solution/markscheme 필드가 새지 않도록 service에서 명시적으로 select 필드 제한. 코드리뷰 시 최우선 확인.
- **Excalidraw 내보내기:** AI 페이지는 배경이 없어 사용자 요소만 export. 빈 캔버스에서 [수식전환] 시 빈 이미지 → "필기 후 시도" 가드.
- **AI 지연:** convert/review 각 5~15초. busy 표시 + 버튼 비활성.
- **권한:** coaching 라우트는 authenticate만(역할 무관, studentId=sub). 교사가 미리 시도해도 본인 attempt로 기록됨(무해). page PATCH는 teacher.
- **뷰어 분기:** StudyViewer가 AI 페이지를 `CoachingViewer`로 위임 시 페이지 nav·언마운트 자동저장 흐름이 두 컴포넌트에서 일관되도록 주의.
- **`@google/genai`/`exportToBlob` 시그니처:** 구현 시 현행 확인(이전 spec에서 검증된 패턴 재사용).
