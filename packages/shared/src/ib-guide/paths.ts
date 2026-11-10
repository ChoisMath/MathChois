// 허용 경로(업로드·서빙 공통). `rel` 은 버킷 루트 기준 상대 경로이며 쿼리·`..`·앞 슬래시를 허용하지 않는다.
export const IA_DOCS = ['student', 'annotated', 'comments'] as const;
export type IaDoc = (typeof IA_DOCS)[number];

export const IB_MANIFEST_REL = 'manifest/ia.json';

const IA_PAGE_FILE = /^ia\/ex\d{2}\/(?:student|annotated|comments)\/(?!000\.)\d{3}\.webp$/;
const IA_EXAMPLE_ID = /^ex\d{2}$/;

export function isIaDoc(v: unknown): v is IaDoc {
  return typeof v === 'string' && (IA_DOCS as readonly string[]).includes(v);
}

export function isIaExampleId(v: unknown): v is string {
  return typeof v === 'string' && IA_EXAMPLE_ID.test(v);
}

/** ia/exNN/<doc>/NNN.webp (NNN 은 001–999). */
export function isIaPageFile(rel: string): boolean {
  return IA_PAGE_FILE.test(rel);
}

export function isIbGuideFile(rel: string): boolean {
  return isIaPageFile(rel) || rel === IB_MANIFEST_REL;
}

export function iaPageRel(exId: string, doc: IaDoc, n: number): string {
  return `ia/${exId}/${doc}/${String(n).padStart(3, '0')}.webp`;
}
