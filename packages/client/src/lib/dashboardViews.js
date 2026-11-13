/**
 * 학급 대시보드 — 보기(챕터별·영상별·학생별) 계산. 서버 응답(ClassroomDashboard)을 받아 화면에 맞게 자른다.
 * 모두 순수 함수.
 *
 * unitParam: null/undefined = 전체, 'none' = 단원 미지정, 그 외 = 단원 id (챕터·영상 탭의 ?unit= 과 같은 뜻)
 */

export const DASHBOARD_VIEWS = ['chapters', 'videos', 'students'];

/** 정답률 % (시도 0 → null) */
export function accuracy(correct, attempts) {
  if (!attempts) return null;
  return Math.round((correct / attempts) * 100);
}

/** 시청률 % — 도달한 최대 위치 ÷ 길이, 100 상한. 길이를 모르면 null */
export function watchPercent(maxPositionSec, durationSec) {
  if (!durationSec || durationSec <= 0) return null;
  return Math.min(100, Math.round(((maxPositionSec ?? 0) / durationSec) * 100));
}

/** 단원 선택에 맞는 항목(챕터·영상 공용, unitId 필드 기준) */
export function itemsForUnit(items, unitParam) {
  if (unitParam == null) return items;
  if (unitParam === 'none') return items.filter((it) => it.unitId == null);
  return items.filter((it) => it.unitId === unitParam);
}

/** 단원별 묶음: [{ unit|null, chapters, videos }] — 단원 position 순, 미지정은 마지막, 둘 다 비면 생략 */
export function groupByUnit(units, chapters, videos) {
  const sorted = [...units].sort((a, b) => a.position - b.position);
  const out = [];
  for (const unit of [...sorted, null]) {
    const key = unit ? unit.id : 'none';
    const ch = itemsForUnit(chapters, key);
    const vd = itemsForUnit(videos, key);
    if (ch.length === 0 && vd.length === 0) continue;
    out.push({ unit, chapters: ch, videos: vd });
  }
  return out;
}

/** 학생 한 명의 요약 숫자 */
export function studentSummary(student, chapters, videos) {
  const cells = student.cells ?? {};
  const vcells = student.videoCells ?? {};
  let notedPages = 0;
  let totalPages = 0;
  for (const c of chapters) {
    totalPages += c.totalPages ?? 0;
    notedPages += cells[c.id]?.notedPages ?? 0;
  }
  let videosCompleted = 0;
  for (const v of videos) if (vcells[v.id]?.completed) videosCompleted += 1;
  return {
    videosCompleted,
    videosTotal: videos.length,
    notedPages,
    totalPages,
    attempts: student.overall?.attempts ?? 0,
    correct: student.overall?.correct ?? 0,
  };
}

/** 반 전체 행(챕터): 필기율 = Σ필기 페이지 / (학생 수 × 페이지 수), 정답률 = Σ정답 / Σ시도 */
export function classRowForChapter(students, chapter) {
  let noted = 0;
  let attempts = 0;
  let correct = 0;
  for (const s of students) {
    const c = s.cells?.[chapter.id];
    if (!c) continue;
    noted += c.notedPages ?? 0;
    attempts += c.attempts ?? 0;
    correct += c.correct ?? 0;
  }
  const denom = students.length * (chapter.totalPages ?? 0);
  return {
    notedRate: denom > 0 ? Math.round((noted / denom) * 100) : null,
    accuracy: accuracy(correct, attempts),
  };
}

/** 반 전체 행(영상): 기록이 있는 학생 수, 완료 학생 수 */
export function classRowForVideo(students, video) {
  let watched = 0;
  let completed = 0;
  for (const s of students) {
    const c = s.videoCells?.[video.id];
    if (!c) continue;
    watched += 1;
    if (c.completed) completed += 1;
  }
  return { watched, completed };
}

/**
 * 주소의 선택값을 목록에 맞춰 바로잡는다. changed 가 true 면 주소를 고쳐 써야 한다(replace).
 * - view: 셋 중 아니면 'chapters'
 * - unit: 'none' 또는 있는 단원 id 면 유지, 아니면 null(전체)
 * - student: 학생별 보기에서만 검사 — 없거나 명렬에 없으면 첫 학생(학생 0명이면 null)
 */
export function resolveDashboardSelection({ view, unit, student }, { units, students }) {
  const nextView = DASHBOARD_VIEWS.includes(view) ? view : 'chapters';
  const unitOk = unit == null || unit === 'none' || units.some((u) => u.id === unit);
  const nextUnit = unitOk ? (unit ?? null) : null;
  let nextStudent = student ?? null;
  if (nextView === 'students') {
    const exists = nextStudent != null && students.some((s) => s.studentId === nextStudent);
    if (!exists) nextStudent = students[0]?.studentId ?? null;
  }
  // view 가 없으면 chapters 로 보되 주소는 손대지 않는다(첫 방문마다 주소를 고쳐 쓰지 않게)
  const changed = nextView !== (view ?? 'chapters') || nextUnit !== (unit ?? null) || nextStudent !== (student ?? null);
  return { view: nextView, unit: nextUnit, student: nextStudent, changed };
}
