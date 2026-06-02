const FIGURE_RE = /\[FIGURE:(\d+)\]/g;

/** 본문을 text/figure 세그먼트 배열로 분해 */
export function splitFigureSegments(latex) {
  const segments = [];
  let lastIndex = 0;
  let m;
  FIGURE_RE.lastIndex = 0;
  while ((m = FIGURE_RE.exec(latex)) !== null) {
    if (m.index > lastIndex) {
      segments.push({ type: 'text', value: latex.slice(lastIndex, m.index) });
    }
    segments.push({ type: 'figure', idx: parseInt(m[1], 10) });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < latex.length) {
    segments.push({ type: 'text', value: latex.slice(lastIndex) });
  }
  return segments.length ? segments : [{ type: 'text', value: latex }];
}

/** 본문 [FIGURE:n] 개수와 figureNotes 길이 정합성 검증 */
export function validateFigures(latex, figureNotes) {
  FIGURE_RE.lastIndex = 0;
  const count = (latex.match(FIGURE_RE) || []).length;
  if (count !== figureNotes.length) {
    return { ok: false, message: `본문의 그림 표시(${count}개)와 그림 설명(${figureNotes.length}개) 개수가 일치하지 않습니다.` };
  }
  return { ok: true };
}
