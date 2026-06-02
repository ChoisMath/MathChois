import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getClassroomDashboard } from '../../lib/dashboard';

/** 정답률 → 색 클래스 (null = 시도 없음 회색) */
function accColor(pct) {
  if (pct == null) return 'bg-gray-300 text-gray-600';
  if (pct >= 70) return 'bg-emerald-600 text-white';
  if (pct >= 40) return 'bg-amber-600 text-white';
  return 'bg-rose-600 text-white';
}
const acc = (correct, attempts) => (attempts > 0 ? Math.round((correct / attempts) * 100) : null);

export default function ClassroomDashboard({ classroomId }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true); setError('');
    getClassroomDashboard(classroomId)
      .then((d) => { if (alive) setData(d); })
      .catch((err) => { if (alive) setError(err.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [classroomId]);

  if (loading) return <p className="text-gray-500 text-sm">불러오는 중…</p>;
  if (error) return <p className="text-rose-600 text-sm">{error}</p>;
  if (!data) return null;

  const { chapters, students, summary } = data;

  const goStudent = (s) =>
    navigate(`/teacher/classrooms/${classroomId}/students/${s.studentId}/coaching-history`,
      { state: { studentName: s.name } });

  return (
    <div className="flex flex-col gap-4">
      {/* 요약 카드 */}
      <div className="flex flex-wrap gap-2">
        {[
          ['반 평균 정답률', `${summary.avgAccuracy}%`],
          ['총 코칭 시도', summary.totalAttempts],
          ['활동 학생', summary.activeStudents],
          ['챕터 수', summary.chapterCount],
        ].map(([label, val]) => (
          <div key={label} className="flex-1 min-w-24 border rounded-xl p-3 bg-white">
            <div className="text-xl font-extrabold text-gray-900">{val}</div>
            <div className="text-xs text-gray-500 whitespace-nowrap">{label}</div>
          </div>
        ))}
      </div>

      {/* 학생 카드 */}
      {students.length === 0 ? (
        <div className="border-2 border-dashed border-gray-200 rounded-xl h-32 flex items-center justify-center text-gray-400 text-sm">
          학생이 없습니다.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {students.map((s) => {
            const overallPct = acc(s.overall.correct, s.overall.attempts);
            return (
              <button key={s.studentId} onClick={() => goStudent(s)}
                className="w-full text-left border rounded-xl bg-white p-3 hover:bg-blue-50 transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium whitespace-nowrap truncate">{s.name || '(이름 없음)'}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap ${accColor(overallPct)}`}>
                    종합 {overallPct == null ? '–' : `${overallPct}%`}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {chapters.map((ch) => {
                    const c = s.cells[ch.id];
                    const pct = c ? acc(c.correct, c.attempts) : null;
                    const noted = c?.notedPages ?? 0;
                    const progPct = ch.totalPages > 0 ? Math.round((noted / ch.totalPages) * 100) : 0;
                    return (
                      <div key={ch.id} className="rounded-lg overflow-hidden w-16 text-center">
                        <div className={`px-1 py-1 text-xs font-bold whitespace-nowrap ${accColor(pct)}`}>
                          {pct == null ? '–' : `${pct}%`}
                        </div>
                        <div className="text-[10px] text-gray-500 whitespace-nowrap truncate px-0.5" title={ch.title}>
                          {ch.title}
                        </div>
                        <div className="h-1 bg-gray-200">
                          <div className="h-full bg-blue-500" style={{ width: `${progPct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
