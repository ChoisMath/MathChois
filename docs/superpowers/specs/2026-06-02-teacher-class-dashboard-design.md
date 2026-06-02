# 교사용 클래스 대시보드 — 설계 문서

**날짜:** 2026-06-02
**범위:** 수학 코칭 이식 5개 하위 프로젝트 중 **#5 — 교사용 클래스 대시보드** (학생 × 챕터 코칭 정답률 + 필기 진도를 한눈에).
**선행 완료:** #1+#2(문제은행), #3(`coaching_attempts`), #4(기록 조회). 본 문서는 기존 데이터를 *집계*만 한다(스키마 변경 없음).

---

## 1. 배경 · 목표

교사가 자신의 클래스에서 학생들의 **챕터별 AI 코칭 수행도(정답률)** 와 **학습 진도(필기)** 를 한 화면에서 파악한다. 차트 라이브러리 없이 CSS 칩·막대·색으로 구현(의존성 추가 없음).

**대상·우선순위:** 5개 관점(교사/학생/관리자) 중 **교사용을 먼저** 구현. 범위 단위는 **클래스별**(한 클래스 = 학생들 × 챕터). 학생용·관리자용 대시보드는 후속 확장(본 spec 비범위).

**비범위:** 학생용/관리자용 대시보드, 칩 단위 드릴다운(챕터 필터), 시계열 추이 차트, AI 학습스타일 요약 생성. 모두 후속.

---

## 2. 핵심 결정 (확정)

| 항목 | 결정 |
|---|---|
| 대상 | 교사용 (먼저) |
| 범위 단위 | 클래스별 — ClassroomDetail '대시보드' 탭 |
| 레이아웃 | **시안 B** — 학생 카드 + 챕터 칩 (모바일 친화) |
| 셀(칩) 지표 | **코칭 정답률**(색) + **필기 진도**(막대) |
| 시각화 | 차트 라이브러리 없음 — 순수 CSS 칩/막대/색 |
| 색 임계값 | 초록 ≥70% · 주황 40–69% · 빨강 <40% · 회색 = 시도 없음 (#4와 일관) |
| 드릴다운 | 학생 카드 클릭 → #4 교사 풀이기록 페이지 |
| 데이터 | 집계 전용(스키마 변경 없음). 정답·해설 미포함 |
| 권한 | teacher + `isClassroomOwner` |

---

## 3. 지표 정의

**학생 × 챕터 (칩):**
- **코칭 정답률** = 해당 챕터의 AI 페이지 코칭 시도에 대한 `correct / total` (`coaching_attempts` → `pages`→`chapters` 집계). 시도 0 → `null`(회색 `–` 칩).
- **필기 진도** = 해당 챕터에서 학생이 필기한 distinct 페이지 수 / 챕터 전체 페이지 수 (`student_notes` → `pages`→`chapters`). 모든 페이지 타입 포함(학습 참여도).

**학생 종합:** 클래스 내 전 챕터 누적 `correct / total` 정답률.

**요약(상단 카드 4):** 반 평균 정답률(클래스 전체 `correct/total`) · 총 코칭 시도 · 활동 학생 수(시도 ≥1) · 챕터 수.

정답률 % 환산·분모 0 처리는 클라이언트에서 수행(서버는 raw count 반환).

---

## 4. 서버 — 집계 · API

### 4.1 서비스 `services/dashboard.service.ts` (신규)
`getClassroomDashboard(classroomId)`:
1. **챕터 + 페이지 수:** 클래스의 챕터(`position` 순) + 각 챕터 `totalPages`(pages count). (linked 챕터는 §7 한계 참조 — `chapters.classroomId = classroomId` 기준.)
2. **코칭 집계:** `coaching_attempts` JOIN `pages`(pageId) JOIN `chapters`(chapterId), `where chapters.classroomId = classroomId`, group by `(studentId, chapterId)` → `{ attempts: count(*), correct: count(is_correct = true) }`.
3. **필기 집계:** `student_notes` JOIN `pages` JOIN `chapters`, `where chapters.classroomId = classroomId`, group by `(studentId, chapterId)` → `{ notedPages: count(distinct page_id) }`.
4. **멤버:** `getClassroomMembers(classroomId)` (이름).
5. 서버에서 매트릭스 조립 + summary 계산.

### 4.2 라우트 `routes/dashboard.ts` (신규, `app.ts` 등록)
| 메서드 | 경로 | 권한 |
|---|---|---|
| `GET` | `/api/dashboard/classrooms/:classroomId` | `authenticate` + `requireRole('teacher')` + `isClassroomOwner(classroomId, sub)` (실패 403) |

응답:
```jsonc
{
  "chapters": [{ "id": "...", "title": "...", "totalPages": 5 }],
  "students": [{
    "studentId": "...", "name": "...",
    "overall": { "attempts": 12, "correct": 8 },
    "cells": { "<chapterId>": { "attempts": 4, "correct": 3, "notedPages": 5 } }
  }],
  "summary": { "avgAccuracy": 68, "totalAttempts": 142, "activeStudents": 3, "chapterCount": 3 }
}
```
- `cells`는 시도·필기가 있는 (student,chapter)만 포함(없으면 키 부재 → 클라에서 회색 칩).
- `avgAccuracy`는 서버에서 정수%로 계산(클래스 전체 correct/total, total 0 → 0).

### 4.3 공유 타입 `types/dashboard.ts` (신규)
```ts
export interface DashboardChapter { id: string; title: string; totalPages: number; }
export interface DashboardCell { attempts: number; correct: number; notedPages: number; }
export interface DashboardStudent {
  studentId: string;
  name: string | null;
  overall: { attempts: number; correct: number };
  cells: Record<string, DashboardCell>;
}
export interface ClassroomDashboard {
  chapters: DashboardChapter[];
  students: DashboardStudent[];
  summary: { avgAccuracy: number; totalAttempts: number; activeStudents: number; chapterCount: number };
}
```

---

## 5. 클라이언트 — UI

### 5.1 진입: ClassroomDetail '대시보드' 탭
- `activeTab` union에 `'dashboard'` 추가. 탭 네비에 '대시보드' 항목(아이콘 예: lucide `BarChart3`) **교사 전용**(`isTeacher` 일 때만 탭 노출).
- `activeTab === 'dashboard'` → `<ClassroomDashboard classroomId={id} />` 렌더.

### 5.2 컴포넌트 `components/dashboard/ClassroomDashboard.jsx` (신규)
- 마운트 시 `getClassroomDashboard(classroomId)` 호출. 로딩·에러·빈 상태 처리.
- **요약 카드 4개**(`flex-wrap`): 반 평균 정답률 · 총 코칭 시도 · 활동 학생 · 챕터 수.
- **학생 카드 리스트**(세로 스택):
  - 카드 헤더: 학생 이름(`name || '(이름 없음)'`) + **종합 정답률 배지**(색=`accuracyColor`).
  - **챕터 칩**(가로 `flex-wrap`): 각 칩 = `정답률%`(색 배경) + 챕터명(작게) + 하단 얇은 **진도 막대**(`notedPages/totalPages`). `cells[chapterId]` 없거나 attempts=0 → 회색 `–` 칩(진도 막대는 notedPages 있으면 표시).
  - 카드 전체 클릭 → `navigate('/teacher/classrooms/${classroomId}/students/${studentId}/coaching-history', { state: { studentName: name } })`.
- 빈 상태: 멤버 없음 / 코칭 기록 전무 시 안내.

### 5.3 공용 헬퍼
- `accuracyColor(pct)` (또는 클래스 매핑): ≥70 초록 / 40–69 주황 / <40 빨강 / null 회색. #4 배지 색과 일관 — 가능하면 작은 공용 유틸로 추출(`lib/accuracy.js`)해 CoachingHistoryView/CoachingPanel과 공유(선택; 중복 3회 미만이면 인라인 허용).

### 5.4 `lib/dashboard.js` (신규)
```js
import { api } from './api';
export const getClassroomDashboard = (classroomId) => api.get(`/api/dashboard/classrooms/${classroomId}`);
```

### 5.5 반응형
- 요약 카드 `flex-wrap`, 학생 카드 세로 스택, 챕터 칩 `flex-wrap`. 카드/버튼 터치 타깃 충분(`min-h-11` 상당). `whitespace-nowrap`(칩 라벨·배지). 모바일 가로 스크롤 불필요(칩 줄바꿈).

---

## 6. 신규/변경 파일 요약

**서버**
- `services/dashboard.service.ts` — 신규(집계)
- `routes/dashboard.ts` — 신규(GET, teacher+owner)
- `app.ts` — dashboard 라우트 등록

**클라이언트**
- `components/dashboard/ClassroomDashboard.jsx` — 신규
- `lib/dashboard.js` — 신규
- `pages/Classrooms/ClassroomDetail.jsx` — '대시보드' 탭 추가(교사 전용)
- (선택) `lib/accuracy.js` — 정답률 색 공용 헬퍼

**공유**
- `types/dashboard.ts` — `ClassroomDashboard` 등 응답 타입

---

## 7. 위험 · 유의

- **linked(공유) 챕터:** 코칭 시도는 원본 챕터의 `classroomId`로 집계되어, 이 대시보드(`chapters.classroomId = classroomId` 기준)엔 안 잡힐 수 있음. #4와 동일한 수용된 한계. MVP 이대로, 추후 보완.
- **집계 성능:** group-by 3개 쿼리. 기존 인덱스(`coaching_attempts (studentId, createdAt)`, `(pageId, studentId)`)로 충분. 클래스 규모가 커지면 추후 캐싱 고려(현재 불필요).
- **권한:** 라우트에서 owner 검증 필수. 학생은 탭 자체 미노출 + 라우트 teacher 가드.
- **분모 0:** 시도 0(정답률), 페이지 0(진도) → 클라에서 회색/`–`/0% 안전 처리.
- **정답 유출 무관:** 집계 수치만 반환(문제 본문·정답·해설 미포함).
- **차트 라이브러리 미도입:** 칩·막대·색은 CSS로. 추후 추이 차트가 필요하면 그때 도입 결정.
