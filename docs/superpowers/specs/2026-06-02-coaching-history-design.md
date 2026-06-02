# AI 코칭 풀이 기록 조회 — 설계 문서

**날짜:** 2026-06-02
**범위:** 수학 코칭 이식 5개 하위 프로젝트 중 **#4 — 풀이(코칭) 기록 조회**: 학생 본인 history + 교사 학생별 관리, 기간 필터 포함.
**선행 완료:** #1+#2(문제은행), #3(`coaching_attempts` 생성·저장). 본 문서는 #3가 쌓은 데이터를 *조회*만 한다.

---

## 1. 배경 · 목표

#3에서 학생의 AI 코칭 시도가 `coaching_attempts`에 불변 누적된다. #4는 이를 두 화면에서 조회한다:
- **학생 본인** — 자신의 모든 코칭 기록(모든 클래스)을 기간 필터로 열람.
- **교사** — ClassroomDetail '학생' 탭에서 학생 선택 → 그 학생의 코칭 기록을 **해당 클래스의 챕터 범위**로 열람.

**기간 필터(사용자 요구사항):** 기본 **최근 1주일**, 프리셋(1주/1개월/전체) 및 시작·종료 날짜 직접 지정 검색.

**비범위:** #5 대시보드(통계·집계). #4는 개별 기록 목록·상세 조회까지.

---

## 2. 핵심 결정 (확정)

| 항목 | 결정 |
|---|---|
| 접근 | **A** — 엔드포인트 2개(본인용/교사용)가 공용 쿼리 빌더 공유, 클라는 공용 `CoachingHistoryView` 컴포넌트를 fetch 함수만 바꿔 재사용 |
| 스키마 | **변경 없음**(읽기 전용 조인) |
| 교사 진입 | **ClassroomDetail '학생' 탭**(기존 미렌더 스텁 구현) → 학생 → 코칭 기록 페이지 |
| 교사 조회 범위 | **해당 클래스의 챕터 기록만**(`page→chapter→classroomId` 필터). 타 교사 콘텐츠 미노출 |
| 학생 조회 범위 | 본인 **전체** 기록(모든 클래스) |
| 목록 표현 | **카드 리스트 + 인라인 펼침**(표 아님 — 행마다 수식·코칭 렌더가 풍부) |
| 기간 필터 | 기본 최근 7일, 프리셋(1주/1개월/전체) + 시작·종료 `<input type="date">` |
| 정답 보안 | problem 조인은 **표시필드만**(answer/solution 미포함). #3 불변식 유지 |

---

## 3. 데이터 · API

### 3.1 공유 타입 (`packages/shared/src/types/coaching.ts` 추가)
```ts
export interface CoachingAttemptView {
  // coaching_attempts 전체
  id: string;
  pageId: string;
  problemId: string | null;
  studentId: string;
  workImageUrl: string | null;
  solutionLatex: string | null;
  isCorrect: boolean | null;
  errorTags: string[];
  conceptTags: string[];
  strengthNotes: string | null;
  weaknessNotes: string | null;
  commentMarkdown: string | null;
  aiModel: string | null;
  createdAt: string;
  // problem 표시필드(조인) — answer/solution 제외
  problemTitle: string | null;
  subject: string | null;
  majorUnit: string | null;
  difficulty: string | null;
  problemLatex: string | null;
  figures: { idx: number; alt: string; imageUrl: string }[];
  figureNotes: string[];
  // page→chapter(조인)
  chapterTitle: string | null;
}

export interface CoachingHistoryResult {
  items: CoachingAttemptView[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CoachingHistoryFilters {
  from?: string;   // ISO date (YYYY-MM-DD), 포함
  to?: string;     // ISO date, 종료일 포함
  page?: number;
  pageSize?: number;
}
```

### 3.2 서비스 (`services/coaching.service.ts` 추가)
공용 조인 빌더 + 두 진입 함수:
- LEFT JOIN `problems`(표시필드만 select), LEFT JOIN `pages`→`chapters`(chapterTitle, chapters.classroomId).
- 날짜: `createdAt >= from` AND `createdAt < to + 1일`(종료일 포함). 미지정 시 해당 경계 무시.
- 정렬 `coachingAttempts.createdAt desc`, `limit/offset` 페이지네이션, `count(*)::int` total.

```ts
export interface HistoryQuery { from?: string; to?: string; page?: number; pageSize?: number; }

export async function listStudentHistory(studentId: string, q: HistoryQuery): Promise<CoachingHistoryResult>;
// where: studentId = $studentId  (+ 날짜)

export async function listClassroomStudentHistory(
  classroomId: string, studentId: string, q: HistoryQuery,
): Promise<CoachingHistoryResult>;
// where: studentId = $studentId AND chapters.classroomId = $classroomId  (+ 날짜)
```
page 클램프 ≥1, pageSize 클램프 1..100(기본 20). 날짜 파싱 실패/NaN 방어.

### 3.3 API (`routes/coaching.ts` 추가)
| 메서드 | 경로 | 역할 | 권한 |
|---|---|---|---|
| `GET` | `/api/coaching/history` | 본인 기록(studentId=`req.user.sub`) | authenticate |
| `GET` | `/api/coaching/classrooms/:classroomId/students/:studentId/history` | 교사용, 클래스 챕터 한정 | authenticate + `requireRole('teacher')` + `isClassroomOwner(classroomId, sub)` && `isClassroomMember(classroomId, studentId)` (실패 시 403) |

- 쿼리 파라미터: `from`, `to`(YYYY-MM-DD), `page`, `pageSize`.
- 응답 `CoachingHistoryResult`.
- `isClassroomOwner`/`isClassroomMember`는 기존 `services/classroom.service.ts` 재사용.
- 🔒 problem 조인 select에 answer/solution/solutionSource/markschemeImageUrl **미포함**.

---

## 4. 공용 컴포넌트 · 학생 UI

### 4.1 공용 컴포넌트 `components/coaching/CoachingHistoryView.jsx`
Props: `{ fetchHistory, showTeacherNotes = false }`. `fetchHistory(params)` → `CoachingHistoryResult`.

- **기간 필터 바:** 프리셋 버튼(최근 1주 / 최근 1개월 / 전체) + `시작`·`종료` `<input type="date">`. 기본값 최근 7일(오늘-7 ~ 오늘). 변경 시 page=1 재조회. 프리셋 클릭 시 날짜 입력도 동기화('전체'는 from/to 비움).
- **카드 리스트:** 각 attempt = 카드.
  - 헤더(클릭 영역, `whitespace-nowrap`): 날짜(`createdAt` YYYY-MM-DD) · 문제 제목 · 과목·난이도 배지 · 챕터명 · 정답/오답 배지 · 오류태그(한국어 라벨).
  - **인라인 펼침**: `ProblemView`(problemLatex+figures) → "변환된 풀이" `ProblemView`(solutionLatex) → `CoachingPanel`(attempt, `showTeacherNotes` 전달) → 원본 필기 토글(`workImageUrl` `<img>`).
- **페이지네이션**(이전/다음 + 현재/총페이지), 로딩·빈상태("기록이 없습니다").
- 반응형: 카드 세로 스택, 필터 바 `flex-wrap`, 버튼 `min-h-11`, 컨테이너 `max-h`/스크롤은 페이지가 관리, `dvh` 사용.

### 4.2 학생 페이지 `pages/History/MyCoachingHistory.jsx` (DashboardLayout)
- 제목 "내 풀이 기록" + `<CoachingHistoryView fetchHistory={getMyHistory} />`.
- 라우트 `/student/coaching-history` (App.jsx 학생 DashboardLayout 블록).
- **StudentSidebar에 "내 풀이 기록" 링크**(lucide `History` 아이콘), 활성 스타일은 기존 메뉴 패턴 준수.

### 4.3 클라 API 래퍼 (`lib/coaching.js` 추가)
```js
export const getMyHistory = (params) => api.get(`/api/coaching/history${qs(params)}`);
export const getStudentHistory = (classroomId, studentId, params) =>
  api.get(`/api/coaching/classrooms/${classroomId}/students/${studentId}/history${qs(params)}`);
```
`qs(params)`는 from/to/page/pageSize 중 빈 값 생략한 쿼리스트링.

---

## 5. 교사 UI

### 5.1 ClassroomDetail '학생' 탭 (`pages/Classrooms/ClassroomDetail.jsx`)
- 기존 `activeTab` union의 `'students'` 분기를 구현. 탭 클릭 시 `GET /api/classrooms/:id/members`로 멤버 조회.
- 멤버 행/카드: 이름(없으면 '(이름 없음)')·이메일·가입일 + **[코칭 기록]** 버튼.
- 버튼 → `navigate('/teacher/classrooms/${classroomId}/students/${studentId}/coaching-history', { state: { studentName } })`.

### 5.2 교사 페이지 `pages/Monitor/StudentCoachingHistory.jsx` (DashboardLayout, teacher)
- 헤더: "‹studentName›님의 코칭 기록"(`location.state?.studentName` 우선, 없으면 '학생') + 뒤로가기.
- `<CoachingHistoryView fetchHistory={(p) => getStudentHistory(classroomId, studentId, p)} showTeacherNotes />`.
- 라우트 `/teacher/classrooms/:classroomId/students/:studentId/coaching-history` (App.jsx 교사 DashboardLayout 블록).

### 5.3 CoachingPanel 확장
`CoachingPanel`에 `showTeacherNotes` prop 추가: true일 때 `strengthNotes`(교사용 강점 메모)를 `weaknessNotes`와 함께 표시. 기본 false(학생 화면엔 미표시 — 기존 동작 유지).

---

## 6. 신규/변경 파일 요약

**서버**
- `services/coaching.service.ts` — `listStudentHistory`, `listClassroomStudentHistory` + 공용 조인 빌더
- `routes/coaching.ts` — `/api/coaching/history`, `/api/coaching/classrooms/:classroomId/students/:studentId/history`

**클라이언트**
- `components/coaching/CoachingHistoryView.jsx` — 신규(공용)
- `components/common/CoachingPanel.jsx` — `showTeacherNotes` prop 추가
- `pages/History/MyCoachingHistory.jsx` — 신규(학생)
- `pages/Monitor/StudentCoachingHistory.jsx` — 신규(교사)
- `pages/Classrooms/ClassroomDetail.jsx` — '학생' 탭 구현
- `layouts/DashboardLayout.jsx` — StudentSidebar "내 풀이 기록" 메뉴
- `App.jsx` — 학생/교사 라우트 2개
- `lib/coaching.js` — `getMyHistory`, `getStudentHistory`

**공유**
- `types/coaching.ts` — `CoachingAttemptView`, `CoachingHistoryResult`, `CoachingHistoryFilters`

---

## 7. 위험 · 유의

- **정답 유출:** history problem 조인 select에서 answer/solution 류 제외(학생 경로에 특히). 코드리뷰 최우선 확인.
- **교사 범위 격리:** 교사 쿼리는 반드시 `chapters.classroomId = :classroomId` 조인 조건 포함 + 라우트에서 owner/member 이중 검증. 누락 시 타 클래스 기록 유출.
- **날짜 경계:** 종료일 포함을 위해 `< to + 1일` 사용. 잘못된 날짜 문자열은 무시(무경계)하고 500 대신 정상 응답.
- **null 방어:** `problemId`가 null(문항 삭제 시 set null)이면 problem 조인 필드 null → 카드에서 '(삭제된 문항)' 등 표기. `profiles.name` null 폴백.
- **페이로드 크기:** 행에 problemLatex/figures 포함 → pageSize 기본 20으로 제한. 과도하면 추후 상세 lazy-load로 분리(YAGNI, 지금은 포함).
- **멤버 엔드포인트:** `GET /api/classrooms/:id/members` 응답 형태를 구현 시 확인(이름/이메일/joinedAt/studentId 필드명).
