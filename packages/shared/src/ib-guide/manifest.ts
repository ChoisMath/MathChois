// IA 예시 manifest(manifest/ia.json) 모양·검증. 서버 업로드 라우트와 ia:push 스크립트가 같은 검증을 쓴다.
import { isIaDoc, isIaExampleId, isIaPageFile, iaPageRel, type IaDoc } from './paths.js';

export type IaExample = {
  id: string;
  no: number;
  title: string;
  note: string;
  docs: Partial<Record<IaDoc, { pages: number }>>;
};
export type IbFileEntry = { sha256: string; size: number };
export type IbManifest = { version: 1; examples: IaExample[]; files: Record<string, IbFileEntry> };

const TITLE_MAX = 200;
const NOTE_MAX = 500;
const SHA_RE = /^[0-9a-f]{64}$/;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function validateIbManifest(json: unknown): string[] {
  if (!isObj(json)) return ['manifest must be an object'];
  const errs: string[] = [];
  if (json.version !== 1) errs.push('version must be 1');
  for (const k of Object.keys(json)) {
    if (k !== 'version' && k !== 'examples' && k !== 'files') errs.push(`unknown key: ${k}`);
  }
  if (!Array.isArray(json.examples)) errs.push('examples must be an array');
  if (!isObj(json.files)) errs.push('files must be an object');
  if (!Array.isArray(json.examples) || !isObj(json.files)) return errs;

  const files = json.files;
  const claimed = new Set<string>();
  const seen = new Set<string>();

  for (const raw of json.examples) {
    if (!isObj(raw)) { errs.push('example must be an object'); continue; }
    const id = raw.id;
    const label = typeof id === 'string' ? id : String(id);
    if (!isIaExampleId(id)) { errs.push(`example id invalid: ${label}`); continue; }
    if (seen.has(id)) errs.push(`duplicate example id: ${id}`);
    seen.add(id);
    if (raw.no !== Number(id.slice(2))) errs.push(`${id}: no must match id`);
    if (typeof raw.title !== 'string' || raw.title.length > TITLE_MAX) errs.push(`${id}: title must be a string of at most ${TITLE_MAX} chars`);
    if (typeof raw.note !== 'string' || raw.note.length > NOTE_MAX) errs.push(`${id}: note must be a string of at most ${NOTE_MAX} chars`);
    if (!isObj(raw.docs) || Object.keys(raw.docs).length === 0) { errs.push(`${id}: docs must have at least one document`); continue; }
    for (const [doc, v] of Object.entries(raw.docs)) {
      if (!isIaDoc(doc)) { errs.push(`${id}: unknown doc ${doc}`); continue; }
      const pages = isObj(v) ? v.pages : undefined;
      if (typeof pages !== 'number' || !Number.isInteger(pages) || pages < 1 || pages > 999) {
        errs.push(`${id}/${doc}: pages must be an integer 1-999`);
        continue;
      }
      for (let n = 1; n <= pages; n++) {
        const rel = iaPageRel(id, doc, n);
        claimed.add(rel);
        if (!Object.hasOwn(files, rel)) errs.push(`missing file: ${rel}`);
      }
    }
  }

  for (const [rel, entry] of Object.entries(files)) {
    if (!isIaPageFile(rel)) { errs.push(`path not allowed: ${rel}`); continue; }
    const ok = isObj(entry) && typeof entry.sha256 === 'string' && SHA_RE.test(entry.sha256)
      && typeof entry.size === 'number' && Number.isInteger(entry.size) && entry.size >= 0;
    if (!ok) errs.push(`bad entry: ${rel}`);
    if (!claimed.has(rel)) errs.push(`file not claimed by any example: ${rel}`);
  }
  return errs;
}

export function iaPageCount(m: IbManifest | null, exId: string, doc: IaDoc): number {
  return m?.examples.find((e) => e.id === exId)?.docs[doc]?.pages ?? 0;
}

/** 로컬 files 중 서버에 없거나 sha 가 다른 경로(정렬). */
export function diffIbFiles(local: IbManifest['files'], remote: IbManifest['files'] | undefined): string[] {
  return Object.keys(local)
    .filter((rel) => remote?.[rel]?.sha256 !== local[rel].sha256)
    .sort();
}
