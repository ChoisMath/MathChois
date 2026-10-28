import { Link } from 'react-router-dom';
import { BookOpen, Check, Clapperboard, History } from 'lucide-react';
import AccuracyChip from './AccuracyChip';
import Meter from './Meter';
import { studentSummary, watchPercent, accuracy } from '../../lib/dashboardViews';

/**
 * 학생 한 명의 기록 — 요약 3칸 + 단원별 영상·챕터 줄.
 * groups: groupByUnit() 결과. chapters/videos: 학급 전체(요약 분모).
 */
export default function StudentReport({ student, groups, chapters, videos, classroomId }) {
  if (!student) return <p className="dash-empty">학생이 없습니다.</p>;
  const sum = studentSummary(student, chapters, videos);
  const hasAny = sum.videosCompleted > 0 || sum.notedPages > 0 || sum.attempts > 0
    || Object.keys(student.videoCells ?? {}).length > 0;
  const acc = accuracy(sum.correct, sum.attempts);

  return (
    <div className="report">
      <header className="report-head">
        {student.avatarUrl ? (
          <img src={student.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <span className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center text-base text-gray-500 font-medium" aria-hidden="true">
            {student.name?.charAt(0)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="report-name">{student.name || '(이름 없음)'}</h3>
          {student.email && <p className="report-email">{student.email}</p>}
        </div>
        <Link
          to={`/teacher/classrooms/${classroomId}/students/${student.studentId}/coaching-history`}
          state={{ studentName: student.name }}
          className="report-link"
          aria-label="코칭 기록 보기"
        >
          <History className="h-4 w-4" aria-hidden="true" /><span>코칭 기록 보기</span>
        </Link>
      </header>

      <dl className="tiles">
        <div className="tile">
          <dt>영상 완료</dt>
          <dd className="num">{sum.videosCompleted}<span className="tile-of">/{sum.videosTotal}</span></dd>
        </div>
        <div className="tile">
          <dt>필기 페이지</dt>
          <dd className="num">{sum.notedPages}<span className="tile-of">/{sum.totalPages}</span></dd>
        </div>
        <div className="tile">
          <dt>AI 풀이</dt>
          <dd className="num">{sum.attempts}회<span className="tile-of"> · 정답률 {acc == null ? '–' : `${acc}%`}</span></dd>
        </div>
      </dl>

      {!hasAny ? (
        <p className="dash-empty">이 학생의 기록이 아직 없습니다.</p>
      ) : (
        groups.map((g) => (
          <section key={g.unit?.id ?? 'none'} className="report-unit">
            <h4 className="report-unit-title">{g.unit ? g.unit.title : '단원 미지정'}</h4>
            <ul className="report-rows">
              {g.videos.map((v) => {
                const c = student.videoCells?.[v.id];
                const pct = c ? watchPercent(c.maxPositionSec, v.durationSec) : null;
                return (
                  <li key={v.id} className="report-row">
                    <Clapperboard className="h-4 w-4 report-icon" aria-hidden="true" />
                    <span className="report-title">{v.title}</span>
                    <span className="report-meta">
                      {c ? (
                        <Meter value={pct} done={c.completed} text={pct == null ? '시청' : `${pct}%`} label={`시청률 ${pct ?? '–'}%`} />
                      ) : (
                        <span className="num text-gray-400">안 봄</span>
                      )}
                      {c?.completed && <Check className="h-3.5 w-3.5 matrix-done" aria-label="완료" />}
                    </span>
                  </li>
                );
              })}
              {g.chapters.map((ch) => {
                const c = student.cells?.[ch.id];
                const noted = c?.notedPages ?? 0;
                const total = ch.totalPages ?? 0;
                return (
                  <li key={ch.id} className="report-row">
                    <BookOpen className="h-4 w-4 report-icon" aria-hidden="true" />
                    <span className="report-title">{ch.title}</span>
                    <span className="report-meta">
                      <Meter value={total > 0 ? Math.round((noted / total) * 100) : null} text={`필기 ${noted}/${total}`} label={`필기 ${noted}/${total}쪽`} />
                      <AccuracyChip correct={c?.correct ?? 0} attempts={c?.attempts ?? 0} />
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
