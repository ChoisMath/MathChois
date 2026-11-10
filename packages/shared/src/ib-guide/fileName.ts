// PC 에 있는 PDF 파일 이름(예: COMMON_1-29__ex26_annotated (1).pdf)에서 예시 번호와 문서 종류를 읽는다.
import { IA_DOCS, type IaDoc } from './paths.js';

export type IaFile = { name: string; exId: string; no: number; doc: IaDoc };

// `comment`(단수)도 comments 로 받는다. 예시 번호는 1–2자리, 0 은 거부.
const NAME_RE = /ex(\d{1,2})_(student|annotated|comments?)(?:\s*\(\d+\))?\.pdf$/i;

export function parseIaFileName(name: string): Omit<IaFile, 'name'> | null {
  const m = NAME_RE.exec(name);
  if (!m) return null;
  // `index26_student.pdf` 처럼 ex 앞에 영문자가 더 붙은 이름은 예시 번호가 아니다.
  const before = name.charAt(m.index - 1);
  if (before && /[A-Za-z0-9]/.test(before)) return null;
  const no = Number(m[1]);
  if (no < 1) return null;
  const kind = m[2].toLowerCase();
  const doc: IaDoc = kind === 'student' ? 'student' : kind === 'annotated' ? 'annotated' : 'comments';
  return { exId: `ex${String(no).padStart(2, '0')}`, no, doc };
}

export function planIaFiles(names: readonly string[]): {
  items: IaFile[];
  skipped: string[];
  duplicates: { exId: string; doc: IaDoc; names: string[] }[];
} {
  const items: IaFile[] = [];
  const skipped: string[] = [];
  for (const name of names) {
    if (!/\.pdf$/i.test(name)) continue;
    const p = parseIaFileName(name);
    if (p) items.push({ name, ...p });
    else skipped.push(name);
  }
  const order = (d: IaDoc) => IA_DOCS.indexOf(d);
  items.sort((a, b) => a.no - b.no || order(a.doc) - order(b.doc) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const groups = new Map<string, { exId: string; doc: IaDoc; names: string[] }>();
  for (const it of items) {
    const key = `${it.exId}/${it.doc}`;
    const g = groups.get(key);
    if (g) g.names.push(it.name);
    else groups.set(key, { exId: it.exId, doc: it.doc, names: [it.name] });
  }
  const duplicates = [...groups.values()]
    .filter((g) => g.names.length > 1)
    .map((g) => ({ ...g, names: [...g.names].sort() }));
  return { items, skipped, duplicates };
}
