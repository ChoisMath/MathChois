// 변형본(chois) 모션 틀을 오빠두가 새로 낸 판의 구성으로 올린다 — `npm run ai:remake-upgrade` 가 쓰는 순수 함수.
//
// 세 판을 줄 단위로 맞춘다(3-way):
//   base   = 오빠두 옛 틀(변형본을 만들 때 출발한 판, 수집본 full.items[id].prompt / .ko)
//   remake = 우리 변형본 틀(base 에서 채널·이야기·모티프 줄을 고친 것)
//   next   = 오빠두 새 틀(full.items[id].v2.en / .ko — {{@…}} 옵션·{{#…}} 조건 줄, 「예시 그대로(a) / 내 주제에 맞게(b)」)
// 결과는 next 의 줄 구성을 그대로 따르고, 변형본이 고친 내용을 「예시 그대로」 쪽에 옮긴다.
//   - next 가 base 줄을 그대로 둔 자리: 변형본이 고쳤으면 {{#a}} 줄은 변형본 글로, 공통 줄은 {{#a}} 변형본 + {{#b}} next 로 나눈다.
//     {{#b}} 줄(내 주제에 맞게)은 주제를 비워 둔 일반 글이라 그대로 둔다.
//   - next 가 base 줄을 고쳐 쓴 자리: 같은 굵은 이름표(- **세계:** 등)의 base 줄을 찾아 낱말 단위 3-way 병합으로 두 쪽 고침을 모두 넣는다.
//     겹쳐서 병합이 안 되면 첫 문장(역할 소개 — 변형본 고침은 조사 오타뿐)은 next, 나머지는 변형본 글을 「예시 그대로」에 쓴다.
//   - 사용자가 고치는 칸({{이름=기본값}})이 든 줄은 next 글을 쓰고 기본값(과 변형본이 바꾼 ?/- 표시)만 변형본 것으로 바꾼다.
//   - 변형본이 덧붙인 「장면표와 큐 시트가 붙어 있으면…」 줄은 뺀다(새 판은 표를 붙일 때 같은 안내를 함께 붙인다 — tablesMarkdown).
// 옮기지 못한 변형본 고침(next 가 옵션 칸으로 바꾼 로고 줄, 10초 기준 시각을 뺀 「첫 1초」 줄 등)은 `unplaced` 로 돌려준다.

export type RemakeUpgradeResult = { text: string; unplaced: string[] };

const PREFIX = /^((?:\{\{#!?[a-z]+\}\})*)(.*)$/s;
const TABLE_NOTE = /^- (아래에 장면표와 큐 시트가 붙어 있으면|If (?:a|the) shot list and (?:a )?(?:sound )?cue sheet are attached below)/;
const INTRO = /^(너는 |You are )/;
const BLANK = /\{\{([?-]?)([^=}\n@#]+)=([^}\n]*)\}\}/g;
const HAS_BLANK = /\{\{[?-]?[^=}\n@#]+=/;
const labelOf = (line: string): string | null => /^- \*\*([^*]+)\*\*/.exec(line)?.[1] ?? null;

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

/** 두 글의 글자 쌍 겹침(Dice, 0–1). */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const A = bigrams(a), B = bigrams(b);
  let inter = 0;
  for (const [g, n] of A) inter += Math.min(n, B.get(g) ?? 0);
  return (2 * inter) / (a.length - 1 + b.length - 1);
}

type Op = { t: 'eq' | 'del' | 'ins'; a?: number; b?: number };

/** 최장 공통 부분열로 a → b 편집 순서를 만든다(같은 길이 우선 지움). */
function diffOps<T>(a: readonly T[], b: readonly T[]): Op[] {
  const n = a.length, m = b.length;
  const L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) L[i]![j] = a[i] === b[j] ? L[i + 1]![j + 1]! + 1 : Math.max(L[i + 1]![j]!, L[i]![j + 1]!);
  }
  const ops: Op[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) ops.push({ t: 'eq', a: i++, b: j++ });
    else if (L[i + 1]![j]! >= L[i]![j + 1]!) ops.push({ t: 'del', a: i++ });
    else ops.push({ t: 'ins', b: j++ });
  }
  while (i < n) ops.push({ t: 'del', a: i++ });
  while (j < m) ops.push({ t: 'ins', b: j++ });
  return ops;
}

type Hunk = { start: number; end: number; with: string[] };

function hunks(base: readonly string[], other: readonly string[]): Hunk[] {
  const out: Hunk[] = [];
  let cur: Hunk | null = null;
  let pos = 0;
  for (const op of diffOps(base, other)) {
    if (op.t === 'eq') {
      if (cur) { out.push(cur); cur = null; }
      pos = op.a! + 1;
      continue;
    }
    cur ??= { start: pos, end: pos, with: [] };
    if (op.t === 'del') { cur.end = op.a! + 1; pos = op.a! + 1; } else cur.with.push(other[op.b!]!);
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * 낱말 단위 3-way 병합: base → ours 고침과 base → theirs 고침을 함께 적용한다. 두 고침이 겹치거나 맞닿으면(git merge-file 처럼) null.
 */
export function mergeWords(base: string, ours: string, theirs: string): string | null {
  const tok = (s: string) => s.split(/(\s+)/).filter((x) => x !== '');
  const B = tok(base);
  const all = [...hunks(B, tok(ours)), ...hunks(B, tok(theirs))].sort((x, y) => x.start - y.start || x.end - y.end);
  const picked: Hunk[] = [];
  for (const h of all) {
    const prev = picked[picked.length - 1];
    if (prev && h.start <= prev.end) {
      // 같은 고침을 두 쪽이 똑같이 했으면 하나로 본다
      if (h.start === prev.start && h.end === prev.end && h.with.join('') === prev.with.join('')) continue;
      return null;
    }
    picked.push(h);
  }
  const out: string[] = [];
  let pos = 0;
  for (const h of picked) {
    out.push(...B.slice(pos, h.start), ...h.with);
    pos = h.end;
  }
  out.push(...B.slice(pos));
  return out.join('');
}

/** base 줄 번호 → 그 자리를 대신하는 변형본 줄들(안 고친 줄은 자기 자신 하나, 지운 줄은 빈 배열). */
function mapBaseToRemake(B: readonly string[], C: readonly string[], unplaced: string[]): string[][] {
  const M: string[][] = B.map((l) => [l]);
  const ops = diffOps(B, C);
  let lastEq = -1;
  for (let k = 0; k < ops.length;) {
    if (ops[k]!.t === 'eq') { lastEq = ops[k]!.a!; k++; continue; }
    const dels: number[] = [], ins: number[] = [];
    while (k < ops.length && ops[k]!.t !== 'eq') {
      const o = ops[k++]!;
      if (o.t === 'del') dels.push(o.a!); else ins.push(o.b!);
    }
    // 고친 줄끼리 짝짓기: 같은 굵은 이름표가 하나뿐이면 그것, 아니면 가장 닮은 줄(0.35 넘게)
    let from = 0, last = -1;
    const pending: string[] = [];
    for (const bi of dels) {
      let best = -1;
      const label = labelOf(B[bi]!);
      const same = label ? ins.map((c, x) => (x >= from && labelOf(C[c]!) === label ? x : -1)).filter((x) => x >= 0) : [];
      if (same.length === 1) best = same[0]!;
      else {
        let score = 0.35;
        for (let x = from; x < ins.length; x++) {
          const s = similarity(B[bi]!, C[ins[x]!]!);
          if (s > score) { score = s; best = x; }
        }
      }
      if (best < 0) { M[bi] = []; continue; }
      const between = ins.slice(from, best).map((x) => C[x]!);
      if (last >= 0) M[last]!.push(...between); else pending.push(...between);
      M[bi] = [C[ins[best]!]!];
      last = bi;
      from = best + 1;
    }
    const rest = ins.slice(from).map((x) => C[x]!);
    if (last >= 0) M[last]!.push(...rest); else pending.push(...rest);
    if (pending.length) {
      if (lastEq >= 0) M[lastEq]!.push(...pending);
      else unplaced.push(...pending);
    }
  }
  return M;
}

function blankDefaults(t: string): Map<string, { mark: string; def: string }> {
  const m = new Map<string, { mark: string; def: string }>();
  for (const x of t.matchAll(BLANK)) m.set(x[2]!.trim(), { mark: x[1]!, def: x[3]! });
  return m;
}

/** 한 편·한 언어의 변형본 틀을 next 의 구성으로 올린다. */
export function upgradeRemakeTemplate(base: string, remake: string, next: string): RemakeUpgradeResult {
  const unplaced: string[] = [];
  const B = base.split('\n'), C = remake.split('\n'), V = next.split('\n');
  const M = mapBaseToRemake(B, C, unplaced).map((cs) => cs.filter((c) => !TABLE_NOTE.test(c)));
  const changed = (i: number) => !(M[i]!.length === 1 && M[i]![0] === B[i]);

  // 칸 기본값: base 기본값 → 변형본 { 표시, 기본값 } (같은 이름의 칸)
  const bd = blankDefaults(base), cd = blankDefaults(remake);
  const subst = new Map<string, { mark: string; def: string }>();
  for (const [name, d] of bd) {
    const c = cd.get(name);
    if (c && d.def.trim() && (c.def !== d.def || c.mark !== d.mark)) subst.set(d.def, c);
  }
  const byName = new Map([...bd].flatMap(([name, d]) => {
    const c = cd.get(name);
    return c && (c.def !== d.def || c.mark !== d.mark) ? [[name, c] as const] : [];
  }));
  const fixBlanks = (line: string) => line.replace(BLANK, (all, mark: string, name: string, def: string) => {
    // 기본값으로 찾고, next 가 기본값 글을 바꿨으면(예: 영문 틀의 주제를 한국어로) 같은 이름의 칸으로 찾는다
    const c = subst.get(def) ?? byName.get(name.trim());
    if (!c) return all;
    const baseMark = bd.get(name.trim())?.mark ?? mark;
    return `{{${c.mark !== baseMark ? c.mark : mark}${name}=${c.def}}}`;
  });

  const index = new Map<string, number[]>();
  B.forEach((l, i) => { if (!index.has(l)) index.set(l, []); index.get(l)!.push(i); });
  const used = new Set<number>();
  const out: string[] = [];
  const remakeLabels = new Set<string>();
  let cursor = 0;
  const emitA = (prefix: string, text: string) => {
    out.push(prefix + text);
    const l = labelOf(text);
    if (l) remakeLabels.add(l);
  };
  /** 변형본 글은 「예시 그대로」에만, next 글은 「내 주제에 맞게」에 둔다. */
  const split = (P: string, remakeLines: readonly string[], nextText: string) => {
    if (P.includes('{{#a}}')) { for (const c of remakeLines) emitA(P, c); return; }
    for (const c of remakeLines) emitA(P + '{{#a}}', c);
    out.push(P + '{{#b}}' + fixBlanks(nextText));
  };

  for (const line of V) {
    const [, P = '', S = ''] = PREFIX.exec(line)!;
    if (HAS_BLANK.test(S)) {
      const k = index.get(S)?.[0];
      if (k != null) used.add(k);
      out.push(fixBlanks(line));
      continue;
    }
    const label = labelOf(S);
    // 변형본 줄이 이미 이 이름표를 「예시 그대로」에 채웠다 → next 의 예시 줄은 빼고, 공통 줄은 「내 주제에 맞게」만 남긴다
    if (label && remakeLabels.has(label) && !index.has(S)) {
      if (P.includes('{{#a}}')) continue;
      if (!P.includes('{{#b}}')) { out.push(P + '{{#b}}' + S); continue; }
    }
    const hits = S.trim() ? index.get(S) : undefined;
    if (hits) {
      const k = hits.find((i) => i >= cursor && !used.has(i)) ?? hits.find((i) => !used.has(i)) ?? hits[0]!;
      used.add(k);
      cursor = k;
      const cs = M[k]!;
      if (!changed(k) || P.includes('{{#b}}')) { out.push(fixBlanks(line)); continue; }
      if (cs[0] === S) { out.push(fixBlanks(line)); for (const c of cs.slice(1)) emitA(P.includes('{{#a}}') ? P : P + '{{#a}}', c); continue; }
      split(P, cs, S);
      continue;
    }
    // next 가 base 줄을 고쳐 쓴 자리 — 같은 이름표의, 변형본이 고친 base 줄과 병합한다
    let best = -1;
    // {{@…}} 옵션 글이 든 줄(첫 문장·「첫 1초」 등)은 next 가 길이·옵션에 맞춰 다시 쓴 줄이라 병합하지 않는다
    if (S.trim() && !P.includes('{{#b}}') && !S.includes('{{')) {
      let score = 0.55;
      B.forEach((bl, i) => {
        if (HAS_BLANK.test(bl) || used.has(i) || !changed(i)) return;
        const bl0 = labelOf(bl);
        if (label && bl0 && bl0 !== label) return;
        const s = similarity(bl, S);
        if (s > score) { score = s; best = i; }
      });
    }
    if (best < 0) { out.push(fixBlanks(line)); continue; }
    const cs = M[best]!;
    const merged = cs.length ? mergeWords(B[best]!, cs[0]!, S) : null;
    if (merged !== null) {
      used.add(best);
      split(P, [merged, ...cs.slice(1)], S);
      continue;
    }
    if (INTRO.test(S) || !cs.length) { out.push(fixBlanks(line)); continue; }
    used.add(best);
    split(P, cs, S);
  }

  const text = out.join('\n');
  for (let i = 0; i < B.length; i++) {
    if (used.has(i) || !changed(i)) continue;
    const cs = M[i]!.filter((c) => {
      // 칸 줄은 기본값이 결과에 옮겨졌으면 옮긴 것으로 본다(채널 이름·한 줄 소개·주제)
      const defs = [...c.matchAll(BLANK)].map((x) => x[3]!);
      return !(defs.length && defs.every((d) => text.includes(`=${d}}}`)));
    });
    if (cs.length) unplaced.push(cs.join('\n'));
  }
  return { text, unplaced };
}
