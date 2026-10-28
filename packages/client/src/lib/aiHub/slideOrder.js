// 슬라이드 갤러리의 순서·주소 규칙 — 주소(?f= ?s= ?v=)가 거르기·정렬·보기의 유일한 진실 공급원이다.
// 화면과 분리한 순수 함수라 slideOrder.test.js 로 검증한다.

const SORTS = ['pop', 'no', 'new'];

/** 주소 쿼리 → { family, sort, view }. 모르는 값·목록에 없는 분류는 기본값으로 떨어뜨린다. */
export function parseQuery(params, present) {
  const f = params.get('f');
  const s = params.get('s') ?? '';
  return {
    family: f && present.includes(f) ? f : null,
    sort: SORTS.includes(s) ? s : 'pop',
    view: params.get('v') === 'body' ? 'body' : 'cover',
  };
}

/** { family, sort, view } → '?f=…' (기본값은 생략해 주소를 짧게 둔다). */
export function toSearch(q) {
  const p = new URLSearchParams();
  if (q.family) p.set('f', q.family);
  if (q.sort !== 'pop') p.set('s', q.sort);
  if (q.view !== 'cover') p.set('v', q.view);
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** pop 은 카탈로그 배열 순서 그대로다. 같은 날 올린 스타일은 번호가 큰 쪽을 최신으로 본다. */
export function arrange(items, q) {
  const shown = q.family ? items.filter((i) => i.family === q.family) : [...items];
  if (q.sort === 'no') shown.sort((a, b) => a.no - b.no);
  if (q.sort === 'new') shown.sort((a, b) => b.added.localeCompare(a.added) || b.no - a.no);
  return shown;
}

/** #번호로 연 스타일이 지금 거르기에 없으면, 상세 창을 닫을 때까지 거르기를 무시한 순서로 넘긴다. */
export function opensOutsideFilter(items, q, id) {
  return items.some((i) => i.id === id) && !arrange(items, q).some((i) => i.id === id);
}

/** 장 넘김 — 덱 끝에서 다음(이전) 스타일로 넘어가고, 처음과 끝은 이어 붙는다. counts[i] = i번째 스타일의 장 수. */
export function stepSlide(pos, dir, counts) {
  const next = pos.slide + dir;
  if (next >= 0 && next < (counts[pos.style] ?? 1)) return { style: pos.style, slide: next };
  const style = (pos.style + dir + counts.length) % counts.length;
  return { style, slide: dir === 1 ? 0 : (counts[style] ?? 1) - 1 };
}

/** 스타일 넘김 — 항상 첫 장으로. */
export function stepStyle(pos, dir, n) {
  return { style: (pos.style + dir + n) % n, slide: 0 };
}
