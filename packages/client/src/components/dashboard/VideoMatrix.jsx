import { Check } from 'lucide-react';
import Meter from './Meter';
import { watchPercent, classRowForVideo } from '../../lib/dashboardViews';

/** 영상별: 행=학생, 열=영상. 셀 = 시청률 막대 + 완료 체크. 맨 아래 반 전체(시청/완료 수). */
export default function VideoMatrix({ students, videos }) {
  if (videos.length === 0) return <p className="dash-empty">이 단원에 영상이 없습니다.</p>;
  if (students.length === 0) return <p className="dash-empty">학생이 없습니다.</p>;
  return (
    <div className="ledger-wrap">
      <table className="ledger matrix">
        <thead>
          <tr>
            <th scope="col">학생</th>
            {videos.map((v) => (
              <th scope="col" key={v.id} className="matrix-col" title={v.title}>
                <span className="matrix-col-title">{v.title}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {students.map((s) => (
            <tr key={s.studentId}>
              <th scope="row">{s.name || '(이름 없음)'}</th>
              {videos.map((v) => {
                const c = s.videoCells?.[v.id];
                if (!c) return <td key={v.id} className="matrix-cell matrix-cell--none">–</td>;
                const pct = watchPercent(c.maxPositionSec, v.durationSec);
                return (
                  <td key={v.id} className="matrix-cell">
                    <Meter
                      value={pct} done={c.completed}
                      text={pct == null ? undefined : `${pct}%`}
                      label={`${pct == null ? '시청함' : `시청률 ${pct}%`}${c.completed ? ', 완료' : ''}`}
                    />
                    {c.completed && <Check className="h-3.5 w-3.5 matrix-done" aria-hidden="true" />}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">반 전체</th>
            {videos.map((v) => {
              const r = classRowForVideo(students, v);
              return (
                <td key={v.id} className="matrix-cell matrix-cell--sum num">
                  시청 {r.watched} · 완료 {r.completed}
                </td>
              );
            })}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
