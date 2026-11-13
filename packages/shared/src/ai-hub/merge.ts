// 이전·추가 스크립트(scripts/ai-hub/)가 쓰는 순수 로직. 스크립트 전용 Node API(fs·crypto·child_process)는
// scripts/ai-hub/ 에 두고, 여기에는 테스트할 수 있는 합치기·검증·경로 변환·카탈로그 파일 쓰기만 둔다.
// 외부 JSON(원천 폴더·me.chois.pro)을 읽으므로 zod 대신 validate*Catalog 와 손으로 쓴 형태 검사를 쓴다.
import { validateMotionCatalog, type MotionGroup, type MotionPublic } from './motion.js';
import { validateSlideCatalog, type SlidePublic } from './slide.js';
import { isAiHubFile } from './paths.js';
import type { Manifest } from './render.js';

export type Triple = [string, string, string];

// ─── 모션 ───────────────────────────────────────────────────────────────

/** Chois 판 원천(`data/chois-gallery.json` 의 items). */
export type SourceItem = {
  id: string; no: string; g: string; name: string; use: string; en: string; concept: string;
  prompt: string; ko: string; shots: Triple[]; cues: Triple[];
};

/** 오빠두 원본 원천(`data/oppadu-v2/gallery.json` 의 items). `final` 은 빌드가 미리 채운 완성본. */
export type OriginalItem = {
  id: string; no: string; g: string; name: string; use: string; en: string; concept: string;
  final: { en: string; ko: string }; shots: Triple[]; cues: Triple[];
  kind?: string; kindLabel?: string; secs?: number;
};

/** `PUT /api/ai/prompts/motion` 본문의 한 항목. */
export type MotionAdminRow = { id: string; prompt: string; ko: string; shots: Triple[]; cues: Triple[] };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isTable = (v: unknown): v is Triple[] => Array.isArray(v) && v.every((r) => Array.isArray(r) && r.length === 3 && r.every(isStr));

function motionMetaErrors(i: Record<string, unknown>, at: number): string[] {
  const bad = ['id', 'g', 'name', 'use', 'en', 'concept'].filter((k) => !isStr(i[k]));
  if (!isStr(i.no) && typeof i.no !== 'number') bad.push('no');
  if (!isTable(i.shots)) bad.push('shots');
  if (!isTable(i.cues)) bad.push('cues');
  return bad.map((k) => `bad field ${k} at ${at}`);
}

/**
 * Chois 판 + (Chois 판이 없는 편만) 오빠두 원본을 공개 목록과 프롬프트 목록으로 나눈다.
 * Chois 판이 있으면 `chois`, 없으면 원본을 `oppadu` 로 뒤에 붙이고, 원본의 `final.en/ko` 가 `prompt/ko` 가 된다.
 * 결과가 validateMotionCatalog 를 통과하지 못하면 던진다.
 */
export function splitGallery(
  items: SourceItem[],
  featured: readonly string[],
  originals: OriginalItem[] = [],
): { publicList: MotionPublic[]; adminList: MotionAdminRow[] } {
  const own = new Set(items.map((i) => i?.id));
  const rest = originals.filter((o) => !own.has(o?.id));
  const errors: string[] = [];
  items.forEach((i, at) => errors.push(...(isObj(i) ? [...motionMetaErrors(i, at), ...(isStr(i.prompt) ? [] : [`bad field prompt at ${at}`]), ...(isStr(i.ko) ? [] : [`bad field ko at ${at}`])] : [`bad entry at ${at}`])));
  rest.forEach((o, at) => errors.push(...(isObj(o) ? [...motionMetaErrors(o, at), ...(isObj(o.final) && isStr(o.final.en) && isStr(o.final.ko) ? [] : [`bad field final at ${at}`])] : [`bad entry at ${at}`])));
  if (errors.length) throw new Error(`motion source: ${errors.slice(0, 10).join('; ')}`);

  const meta = (i: SourceItem | OriginalItem): Omit<MotionPublic, 'source'> => ({
    id: i.id, no: Number(i.no), group: i.g as MotionGroup, name: i.name, en: i.en, use: i.use, concept: i.concept,
    featured: featured.includes(i.id),
  });
  const publicList: MotionPublic[] = [
    ...items.map((i): MotionPublic => ({ ...meta(i), source: 'chois' })),
    ...rest.map((o): MotionPublic => ({
      ...meta(o), source: 'oppadu',
      ...(isStr(o.kind) ? { kind: o.kind } : {}),
      ...(isStr(o.kindLabel) ? { kindLabel: o.kindLabel } : {}),
      ...(typeof o.secs === 'number' ? { secs: o.secs } : {}),
    })),
  ];
  const adminList: MotionAdminRow[] = [
    ...items.map((i) => ({ id: i.id, prompt: i.prompt, ko: i.ko, shots: i.shots, cues: i.cues })),
    ...rest.map((o) => ({ id: o.id, prompt: o.final.en, ko: o.final.ko, shots: o.shots, cues: o.cues })),
  ];
  const catalogErrors = [
    ...publicList.filter((m) => !Number.isInteger(m.no) || m.no < 1).map((m) => `bad no: ${m.id}`),
    ...validateMotionCatalog(publicList),
  ];
  if (catalogErrors.length) throw new Error(`motion catalog: ${catalogErrors.slice(0, 10).join('; ')}`);
  return { publicList, adminList };
}

// ─── 슬라이드 ────────────────────────────────────────────────────────────

/** 학교 덱 원천 manifest(`school/manifest.json`)의 한 항목 — 장 수와 출처는 덱·원본에서 정해진다. */
export type SchoolEntry = Omit<SlidePublic, 'slides' | 'source'>;
export type DeckInfo = { pages: number; prompt: string };
/** 오빠두 원본 스크랩(`data/styles.json` 의 styles) — 프롬프트 포함, 학교 덱 전용 `topic` 없음. */
export type OriginalStyle = Omit<SlidePublic, 'source' | 'topic'> & { prompt: string };

const SLIDE_STRINGS = ['id', 'family', 'name', 'look', 'use', 'added'] as const;
const SLIDE_NUMBERS = ['no', 'cover', 'body'] as const;

function slideShapeErrors(e: unknown, at: number, extraNumbers: readonly string[] = []): string[] {
  if (!isObj(e)) return [`bad entry at ${at}`];
  const bad: string[] = SLIDE_STRINGS.filter((k) => !isStr(e[k])).slice();
  for (const k of [...SLIDE_NUMBERS, ...extraNumbers]) if (typeof e[k] !== 'number') bad.push(k);
  if (e.topic !== undefined && !isStr(e.topic)) bad.push('topic');
  return bad.map((k) => `bad field ${k} at ${at}`);
}

function failOn(label: string, errors: string[]): void {
  if (errors.length) throw new Error(`${label}: ${errors.slice(0, 10).join('; ')}`);
}

// id 가 그대로 rmSync 경로가 되므로 파일을 건드리기 전에 형식을 확인한다(SLIDE_ID 는 validateSlideCatalog 가 본다).
export function parseSchoolManifest(raw: unknown): SchoolEntry[] {
  if (!Array.isArray(raw)) throw new Error('school manifest: not an array');
  failOn('school manifest', raw.flatMap((e, at) => slideShapeErrors(e, at)));
  const entries = (raw as Record<string, unknown>[]).map((e): SchoolEntry => ({
    id: e.id as string, no: e.no as number, family: e.family as SchoolEntry['family'], name: e.name as string,
    look: e.look as string, use: e.use as string, ...(isStr(e.topic) ? { topic: e.topic } : {}),
    cover: e.cover as number, body: e.body as number, added: e.added as string,
  }));
  failOn('school manifest', validateSlideCatalog(entries.map((e) => ({ ...e, slides: 12, source: 'school' }))));
  return entries;
}

// 원본 styles.json 에는 화면에 안 쓰는 필드(sub 등)도 있어 필요한 것만 골라 검사한다.
export function parseOriginalStyles(raw: unknown): OriginalStyle[] {
  if (!Array.isArray(raw)) throw new Error('original styles: not an array');
  failOn('original styles', raw.flatMap((e, at) => [
    ...slideShapeErrors(e, at, ['slides']),
    ...(isObj(e) && !(isStr(e.prompt) && e.prompt.length > 0) ? [`bad field prompt at ${at}`] : []),
  ]));
  const styles = (raw as Record<string, unknown>[]).map((e): OriginalStyle => ({
    id: e.id as string, no: e.no as number, family: e.family as OriginalStyle['family'], name: e.name as string,
    look: e.look as string, use: e.use as string, slides: e.slides as number, cover: e.cover as number,
    body: e.body as number, added: e.added as string, prompt: e.prompt as string,
  }));
  failOn('original styles', validateSlideCatalog(styles.map((s) => ({ ...s, source: 'oppadu' }))));
  return styles;
}

/**
 * 순서: 원본이 있으면 원본의 현재 인기순, 각 자리에 학교 덱이 있으면 학교 덱. 원본 목록에 없는 학교 덱은 뒤에 붙인다.
 * 확정 덱이 없는 학교 항목은 싣지 않는다. 결과가 validateSlideCatalog 를 통과하지 못하면 던진다.
 */
export function buildSlideData(
  entries: SchoolEntry[],
  decks: Map<string, DeckInfo>,
  originals: OriginalStyle[] = [],
): { publicList: SlidePublic[]; adminList: { id: string; prompt: string }[] } {
  const school = new Map(entries.flatMap((e) => {
    const deck = decks.get(e.id);
    return deck ? [[e.id, { public: { ...e, slides: deck.pages, source: 'school' as const }, prompt: deck.prompt.trim() }] as const] : [];
  }));
  const rows = originals.map((o) => school.get(o.id) ?? {
    public: { id: o.id, no: o.no, family: o.family, name: o.name, look: o.look, use: o.use, slides: o.slides, cover: o.cover, body: o.body, added: o.added, source: 'oppadu' as const },
    prompt: o.prompt.trim(),
  });
  const seen = new Set(originals.map((o) => o.id));
  for (const e of entries) {
    const hit = school.get(e.id);
    if (hit && !seen.has(e.id)) rows.push(hit);
  }
  const publicList: SlidePublic[] = rows.map((r) => r.public);
  failOn('slide catalog', validateSlideCatalog(publicList));
  return { publicList, adminList: rows.map((r) => ({ id: r.public.id, prompt: r.prompt })) };
}

// ─── manifest ───────────────────────────────────────────────────────────

/** 로컬에서 sha 가 원격과 다르거나 원격에 없는 키(정렬). */
export function diffManifest(local: Manifest, remote: Manifest): string[] {
  return Object.keys(local).filter((k) => remote[k]?.sha256 !== local[k]?.sha256).sort();
}

// ─── me.chois.pro Volume ↔ MathChois ai-hub 경로 ──────────────────────────

const ME_MANIFESTS: Record<string, string> = {
  'media/motion/manifest.json': 'manifest/motion.json',
  'media/slide/manifest.json': 'manifest/slide.json',
  'private/brand/manifest.json': 'manifest/brand.json',
};
const ME_BRAND = 'private/brand/';

/**
 * me.chois.pro Volume 경로(`media/motion/…`, `media/slide/…`, `private/brand/…`, manifest 키)를
 * MathChois 의 `isAiHubFile` 허용 경로로 바꾼다. 알 수 없는 접두사이거나 바꾼 결과가 허용 경로가 아니면 null.
 */
export function toAiHubRel(key: string): string | null {
  const rel = ME_MANIFESTS[key]
    ?? (key.startsWith('media/motion/') || key.startsWith('media/slide/') ? key.slice('media/'.length)
      : key.startsWith(ME_BRAND) ? `brand/${key.slice(ME_BRAND.length)}`
        : null);
  return rel !== null && isAiHubFile(rel) ? rel : null;
}

/**
 * me.chois.pro 에서 파일 원본을 받는 주소와 토큰 필요 여부. 모션·슬라이드는 공개 `/media/…`(토큰 없음).
 * 브랜드는 공개 `/ai/brand/site/…` 가 HTML 에 셸 숨김 스타일을 끼워 보내 sha256 이 어긋나므로, 원본 바이트를 그대로 주는
 * 토큰 경로 `/api/media/file?path=…` 를 쓴다. 대상이 아니면 null.
 */
export function meUrlPath(key: string): { path: string; token: boolean } | null {
  if (ME_MANIFESTS[key] || toAiHubRel(key) === null) return null;
  return key.startsWith(ME_BRAND)
    ? { path: `/api/media/file?path=${encodeURIComponent(key)}`, token: true }
    : { path: `/${key}`, token: false };
}

// ─── 업로드 재시도 ──────────────────────────────────────────────────────────

/**
 * HTTP 429 뒤 기다릴 시간(ms). `Retry-After` 가 초(또는 날짜)로 오면 그대로 따르고, 없거나 읽을 수 없으면
 * 5초에서 시작해 시도마다 두 배(최대 60초). `attempt` 는 0부터 — 방금 실패한 시도 번호.
 */
export function retryDelayMs(attempt: number, retryAfter?: string | null): number {
  const header = retryAfter?.trim();
  if (header) {
    const secs = Number(header);
    if (Number.isFinite(secs) && secs >= 0) return Math.round(secs * 1000);
    const at = Date.parse(header);
    if (!Number.isNaN(at)) return Math.max(0, at - Date.now());
  }
  return Math.min(5000 * 2 ** attempt, 60000);
}

// ─── 카탈로그 파일(motion.data.ts / slide.data.ts) 쓰기 ─────────────────────

const CATALOG_FILES = {
  motion: {
    script: 'motion-import.ts', type: 'MotionPublic', module: './motion.js', name: 'MOTION_CATALOG',
    keys: ['id', 'no', 'group', 'name', 'en', 'use', 'concept', 'featured', 'source', 'kind', 'kindLabel', 'secs'],
    validate: validateMotionCatalog,
  },
  slide: {
    script: 'slide-import.ts', type: 'SlidePublic', module: './slide.js', name: 'SLIDE_CATALOG',
    keys: ['id', 'no', 'family', 'name', 'look', 'use', 'topic', 'slides', 'cover', 'body', 'added', 'source'],
    validate: validateSlideCatalog,
  },
} as const;

/**
 * `packages/shared/src/ai-hub/{motion,slide}.data.ts` 의 전체 내용. 한 항목 한 줄, 키는 고정 순서(그 밖의 키는 뒤에 이름순),
 * 값은 JSON.stringify — 같은 목록이면 언제나 같은 글자가 나와 git diff 가 실제 변경만 보인다. 검증을 통과해야 한다.
 */
export function formatCatalogSource(kind: 'motion' | 'slide', list: readonly object[]): string {
  const f = CATALOG_FILES[kind];
  failOn(`${kind} catalog`, f.validate(list));
  const lines = list.map((item) => {
    const rec = item as Record<string, unknown>;
    const known: readonly string[] = f.keys;
    const ordered = [...known.filter((k) => k in rec), ...Object.keys(rec).filter((k) => !known.includes(k)).sort()];
    return `  { ${ordered.filter((k) => rec[k] !== undefined).map((k) => `${k}: ${JSON.stringify(rec[k])}`).join(', ')} },`;
  });
  return [
    `// 이 파일은 \`scripts/ai-hub/${f.script}\` 가 생성합니다. 손으로 고치지 마세요.`,
    '// 순서 = 화면의 기본 순서(인기순).',
    `import type { ${f.type} } from '${f.module}';`,
    '',
    `export const ${f.name}: readonly ${f.type}[] = [`,
    ...lines,
    '];',
    '',
  ].join('\n');
}
