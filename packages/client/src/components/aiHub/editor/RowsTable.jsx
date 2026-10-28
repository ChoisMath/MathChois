/**
 * 장면표·소리 큐 탭 — 3열 표(시간(초)·장면·왜 이렇게 / 시각(초)·소리·화면 이벤트)와 건수.
 * 표는 좁은 화면에서 가로로 넘치지 않게 칸 안에서 줄을 바꾼다.
 */
export default function RowsTable({ rows, head, note, testId }) {
  return (
    <div className="ai-twrap" data-testid={testId}>
      <p className="ai-tnote">{note}</p>
      {rows.length ? (
        <table className="ai-table">
          <thead>
            <tr><th scope="col" className="ai-t">{head[0]}</th><th scope="col">{head[1]}</th><th scope="col">{head[2]}</th></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="ai-t">{r[0]}</td>
                <td>{r[1]}</td>
                <td className="ai-tw">{r[2]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="ai-tempty">아직 적힌 줄이 없어요</p>
      )}
    </div>
  );
}
