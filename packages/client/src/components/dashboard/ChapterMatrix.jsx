import AccuracyChip from './AccuracyChip';
import Meter from './Meter';
import { classRowForChapter } from '../../lib/dashboardViews';

/** 챕터별: 행=학생, 열=챕터. 셀 = 필기 n/m 막대 + 정답률 칩. 맨 아래 반 전체. */
export default function ChapterMatrix({ students, chapters }) {
  if (chapters.length === 0) return <p className="dash-empty">이 단원에 챕터가 없습니다.</p>;
  if (students.length === 0) return <p className="dash-empty">학생이 없습니다.</p>;
  return (
    <div className="ledger-wrap">
      <table className="ledger matrix">
        <thead>
          <tr>
            <th scope="col">학생</th>
            {chapters.map((ch) => (
              <th scope="col" key={ch.id} className="matrix-col" title={ch.title}>
                <span className="matrix-col-title">{ch.title}</span>
                <span className="matrix-col-sub num">{ch.totalPages}쪽</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {students.map((s) => (
            <tr key={s.studentId}>
              <th scope="row">{s.name || '(이름 없음)'}</th>
              {chapters.map((ch) => {
                const c = s.cells?.[ch.id];
                const noted = c?.notedPages ?? 0;
                const total = ch.totalPages ?? 0;
                return (
                  <td key={ch.id} className="matrix-cell">
                    <Meter
                      value={total > 0 ? Math.round((noted / total) * 100) : null}
                      text={`${noted}/${total}`}
                      label={`필기 ${noted}/${total}쪽`}
                    />
                    <AccuracyChip correct={c?.correct ?? 0} attempts={c?.attempts ?? 0} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">반 전체</th>
            {chapters.map((ch) => {
              const row = classRowForChapter(students, ch);
              return (
                <td key={ch.id} className="matrix-cell">
                  <Meter value={row.notedRate} text={row.notedRate == null ? undefined : `${row.notedRate}%`} label={row.notedRate == null ? '필기 없음' : `반 필기율 ${row.notedRate}%`} />
                  <span className={`acc acc--${row.accuracy == null ? 'none' : row.accuracy >= 70 ? 'good' : row.accuracy >= 40 ? 'mid' : 'low'}`}>
                    {row.accuracy == null ? '–' : `${row.accuracy}%`}
                  </span>
                </td>
              );
            })}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
