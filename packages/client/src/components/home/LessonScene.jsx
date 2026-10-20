import { useState } from 'react';

/**
 * 첫 화면 오른쪽의 수업 한 장면 — 문제 카드(학생 손글씨 답 + 교사 빨간 펜) + 모눈 좌표평면(오답/수정 그래프) + 교사 포스트잇.
 *
 * 좌표계: viewBox 1단위 = 모눈 1칸. 장면 너비는 20칸이고, Home 이 페이지 모눈을 이 칸 크기·위치에 맞춰 그린다.
 * 그래프 1 = 모눈 2칸, 원점은 (6, 19)칸.
 * play 이면 필기 장면을 한 번 재생한다(home.css 의 .lesson[data-play]). 기본 상태는 완성된 그림.
 * 장식용이라 스크린 리더에서는 숨긴다.
 */

export const SCENE_COLS = 20;
const SCENE_ROWS = 23;
const OX = 6, OY = 19, UNIT = 2;
const X = (x) => r(OX + UNIT * x);
const Y = (y) => r(OY - UNIT * y);
function r(v) { return Math.round(v * 100) / 100; }

function curve(f, from, to, wobble, steps = 40) {
  const pts = [];
  for (let i = 0; i <= steps; i += 1) {
    const x = from + ((to - from) * i) / steps;
    pts.push(`${X(x)},${r(Y(f(x)) + wobble * Math.sin(i * 1.7))}`);
  }
  return `M${pts.join(' L')}`;
}

const Y_TOP = 4.3;
// 학생: x² − 4x + 3 을 (x − 2)² + 3 으로 잘못 바꿔(−4 누락) 꼭짓점을 (2, 3)에 그림
const STUDENT_CURVE = curve((x) => (x - 2) ** 2 + 3, 2 - Math.sqrt(Y_TOP - 3), 2 + Math.sqrt(Y_TOP - 3), 0.045);
// 교사: 올바른 y = (x − 2)² − 1
const TEACHER_CURVE = curve((x) => (x - 2) ** 2 - 1, 2 - Math.sqrt(Y_TOP + 1), 2 + Math.sqrt(Y_TOP + 1), 0.02);
const VX = X(2), STUDENT_VY = Y(3), TEACHER_VY = Y(-1);
const X_TICKS = [-1, 1, 2, 3, 4, 5];
const Y_TICKS = [-1, 1, 2, 3, 4];
const minus = (n) => (n < 0 ? `−${-n}` : String(n));

const VERTEX_CIRCLE =
  `M${r(VX - 0.73)} ${r(TEACHER_VY - 0.59)}C${r(VX - 1.18)} ${r(TEACHER_VY + 0.64)},${r(VX + 1.27)} ${r(TEACHER_VY + 1)},${r(VX + 0.91)} ${r(TEACHER_VY - 0.27)}` +
  `C${r(VX + 0.64)} ${r(TEACHER_VY - 1.09)},${r(VX - 0.64)} ${r(TEACHER_VY - 1)},${r(VX - 0.86)} ${r(TEACHER_VY - 0.09)}`;

const LessonScene = ({ play = false }) => {
  // C 모션: 꼭짓점을 누르면 선생님의 빨간 동그라미를 다시 그린다
  const [circleRun, setCircleRun] = useState(0);

  return (
    <div className="lesson" data-play={play ? '' : undefined} aria-hidden="true">
      <svg className="lesson-plane" viewBox={`0 0 ${SCENE_COLS} ${SCENE_ROWS}`} preserveAspectRatio="none">
        <g className="axes">
          <path d={`M${X(-1.6)} ${OY}H${X(5.6)}`} />
          <path d={`M${OX} ${Y(-1.7)}V${Y(4.5)}`} />
          <path d={`M${r(X(5.6) - 0.45)} ${r(OY - 0.32)}L${X(5.6)} ${OY}L${r(X(5.6) - 0.45)} ${r(OY + 0.32)}M${r(OX - 0.32)} ${r(Y(4.5) + 0.45)}L${OX} ${Y(4.5)}L${r(OX + 0.32)} ${r(Y(4.5) + 0.45)}`} />
          {X_TICKS.map((x) => (
            <g key={`x${x}`}>
              <path d={`M${X(x)} ${r(OY - 0.22)}V${r(OY + 0.22)}`} />
              <text x={X(x)} y={r(OY + 0.95)} textAnchor="middle">{minus(x)}</text>
            </g>
          ))}
          {Y_TICKS.map((y) => (
            <g key={`y${y}`}>
              <path d={`M${r(OX - 0.22)} ${Y(y)}H${r(OX + 0.22)}`} />
              <text x={r(OX - 0.45)} y={r(Y(y) + 0.2)} textAnchor="end">{minus(y)}</text>
            </g>
          ))}
          <text className="lbl" x={r(X(5.6) + 0.2)} y={r(OY + 0.9)}>x</text>
          <text className="lbl" x={r(OX + 0.35)} y={r(Y(4.5) + 0.25)}>y</text>
          <text className="lbl" x={r(OX - 0.45)} y={r(OY + 0.95)} textAnchor="end">O</text>
        </g>

        <g className="student s-graph">
          <path className="dash fade" d={`M${VX} ${Y(Y_TOP)}V${Y(-1.6)}`} />
          <path className="draw" pathLength="1" d={STUDENT_CURVE} />
          <circle className="pop" cx={VX} cy={STUDENT_VY} r="0.25" />
          <text className="pop" x={r(VX + 0.55)} y={r(STUDENT_VY + 0.27)}>(2, 3)</text>
        </g>

        <g className="teacher t-graph">
          <path className="draw strike" pathLength="1" d={`M${r(VX + 0.45)} ${r(STUDENT_VY + 0.59)}L${r(VX + 3.35)} ${r(STUDENT_VY - 0.55)}`} />
          <path className="draw curve" pathLength="1" d={TEACHER_CURVE} />
          <circle className="dot pop" cx={VX} cy={TEACHER_VY} r="0.27" />
          <path key={circleRun} className={circleRun ? 'draw vertex replay' : 'draw vertex'} pathLength="1" d={VERTEX_CIRCLE} />
          <text className="pop" x={r(VX + 1.35)} y={r(TEACHER_VY + 0.86)}>꼭짓점 (2, −1)</text>
          <circle className="hit" cx={VX} cy={TEACHER_VY} r="1.3" onPointerDown={() => setCircleRun((n) => n + 1)} />
        </g>
      </svg>

      <div className="lesson-card">
        <div className="lesson-tag">예제 1</div>
        <p className="lesson-q">이차함수 y = x² − 4x + 3 의 그래프를 그리고, 꼭짓점과 대칭축을 구하시오.</p>
        <svg className="lesson-ink" viewBox="0 0 300 104">
          <g className="student">
            <text className="write" style={{ '--d': '.1s', '--dur': '.35s' }} x="150" y="28" fontSize="26" textAnchor="end">y = (x − 2)²</text>
            <text className="write" style={{ '--d': '.45s', '--dur': '.15s' }} x="159" y="28" fontSize="26">+ 3</text>
            <text className="write" style={{ '--d': '.65s', '--dur': '.2s' }} x="76" y="62" fontSize="23" textAnchor="end">꼭짓점</text>
            <text className="write" style={{ '--d': '.85s', '--dur': '.2s' }} x="84" y="62" fontSize="23">(2, 3)</text>
            <text className="write" style={{ '--d': '1.05s', '--dur': '.25s' }} x="6" y="96" fontSize="23">축 x = 2</text>
          </g>
          <g className="teacher">
            <path className="draw" pathLength="1" style={{ '--d': '1.95s', '--dur': '.15s' }} d="M156 31 L192 15" strokeWidth="2.6" />
            <text className="write" style={{ '--d': '2.07s', '--dur': '.2s' }} x="200" y="18" fontSize="22">− 1</text>
            <path className="draw" pathLength="1" style={{ '--d': '2.27s', '--dur': '.25s' }} d="M86 47 C 74 42, 76 74, 112 74 C 152 74, 156 46, 118 44 C 102 43, 90 47, 86 54" strokeWidth="2.2" />
            <text className="write" style={{ '--d': '2.5s', '--dur': '.25s' }} x="158" y="66" fontSize="22">→ (2, −1)</text>
            <path className="draw" pathLength="1" style={{ '--d': '2.6s', '--dur': '.15s' }} d="M132 86 l8 10 l17 -22" strokeWidth="2.8" />
          </g>
        </svg>
      </div>

      <div className="lesson-sticky"><small>선생님</small>−4를 빠뜨렸어요! 그래프 꼭짓점도 다시 보자</div>
    </div>
  );
};

export default LessonScene;
