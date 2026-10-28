import { useEffect, useState } from 'react';
import { getClassroomDashboard } from '../../lib/dashboard';
import { resolveDashboardSelection, itemsForUnit, groupByUnit } from '../../lib/dashboardViews';
import DashboardControls from './DashboardControls';
import ChapterMatrix from './ChapterMatrix';
import VideoMatrix from './VideoMatrix';
import StudentReport from './StudentReport';

/**
 * 교사 대시보드 — 보기(챕터별·영상별·학생별) × 대상(단원/학생).
 * selection: { view, unit, student } (주소 쿼리에서 옴). onSelectionChange(patch, { replace }).
 */
export default function ClassroomDashboard({ classroomId, selection, onSelectionChange }) {
  // 결과에 classroomId 를 붙여 두고 현재 반과 다르면 로딩 중으로 본다 (effect 안 동기 setState 방지)
  const [result, setResult] = useState({ classroomId: null, data: null, error: '' });
  const [attempt, setAttempt] = useState(0);
  const loading = result.classroomId !== classroomId;
  const { data, error } = result;

  useEffect(() => {
    let alive = true;
    getClassroomDashboard(classroomId)
      .then((d) => { if (alive) setResult({ classroomId, data: d, error: '' }); })
      .catch((err) => { if (alive) setResult({ classroomId, data: null, error: err.message }); });
    return () => { alive = false; };
  }, [classroomId, attempt]);

  /* 주소의 선택값이 목록과 안 맞으면(삭제된 단원·탈퇴 학생·잘못된 view) 바로잡아 주소를 고쳐 쓴다 */
  const resolved = data ? resolveDashboardSelection(selection, data) : null;
  useEffect(() => {
    if (resolved?.changed) onSelectionChange({ view: resolved.view, unit: resolved.unit, student: resolved.student }, { replace: true });
  }, [resolved?.changed, resolved?.view, resolved?.unit, resolved?.student, onSelectionChange]);

  if (loading) return <p className="text-gray-500 text-sm">불러오는 중…</p>;
  if (error) {
    return (
      <p className="text-rose-600 text-sm flex items-center gap-3">
        {error}
        <button type="button" onClick={() => setAttempt((n) => n + 1)} className="underline text-gray-700 min-h-11 px-2">다시 시도</button>
      </p>
    );
  }
  if (!data || !resolved) return null;

  const { units, chapters, videos, students } = data;
  const { view, unit, student } = resolved;
  const current = view === 'students' ? students.find((s) => s.studentId === student) ?? null : null;

  return (
    <div className="flex flex-col gap-4">
      <DashboardControls
        view={view} unitParam={unit} studentId={student}
        units={units} students={students}
        onChange={(patch) => onSelectionChange(patch, { replace: true })}
      />
      {view === 'chapters' && <ChapterMatrix students={students} chapters={itemsForUnit(chapters, unit)} />}
      {view === 'videos' && <VideoMatrix students={students} videos={itemsForUnit(videos, unit)} />}
      {view === 'students' && (
        <StudentReport
          student={current}
          groups={groupByUnit(units, chapters, videos)}
          chapters={chapters} videos={videos}
          classroomId={classroomId}
        />
      )}
    </div>
  );
}
