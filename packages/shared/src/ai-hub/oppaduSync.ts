// 오빠두(oppadu.com) 동기화가 쓰는 순수 로직 — 수집본(JSON 묶음) 점검과 카탈로그 증분 병합.
// 파일·네트워크는 scripts/ai-hub/oppadu/ 가 맡고, 여기에는 테스트할 수 있는 점검·병합만 둔다.
// 수집본은 브라우저·외부 사이트에서 온 신뢰할 수 없는 JSON 이므로 zod 대신 손으로 쓴 형태 검사를 쓴다(merge.ts 와 같은 방식).
import { MOTION_GROUPS, validateMotionCatalog, type MotionGroup, type MotionPublic } from './motion.js';
import { SLIDE_FAMILIES, validateSlideCatalog, type SlideFamily, type SlidePublic } from './slide.js';
import { MOTION_FILE, SLIDE_FILE } from './paths.js';
import { validateTemplate } from './promptEngine.js';
import type { MotionAdminRow, Triple } from './merge.js';

// ─── 타입 ───────────────────────────────────────────────────────────────

/** 오빠두 모션 목록의 한 항목(화면의 `GALLERY.items`·`add`). `no` 는 문자열로 온다. */
export type OppaduMotionItem = {
  id: string; no: string | number; g: string; name: string; use: string; en: string; concept: string;
  kind?: string; kind_label?: string; secs?: number;
};
/** 회원에게만 오는 한 편의 전문. 비회원 응답에는 `v2` 가 없고 옛 `prompt`/`ko` 만 있을 수 있다. */
export type OppaduMotionFull = { prompt?: string; ko?: string; v2?: { en: string; ko: string }; shots?: Triple[]; cues?: Triple[] };
export type OppaduMotionBundle = {
  kind: 'oppadu-motion'; fetchedAt: string; page: string;
  config: { a: string; mv: string | number; data: string; member: boolean; add: OppaduMotionItem[]; groups?: unknown };
  gallery: { items: OppaduMotionItem[]; v2opts?: unknown };
  full: { items: Record<string, OppaduMotionFull> };
};

/** 받을 미디어 한 개 — `rel` 은 ai-hub 버킷 상대 경로, `url` 은 오빠두 원본 주소. */
export type MediaFile = { rel: string; url: string };
/** 한 세트(모션·슬라이드)를 병합한 결과 보고. `updated` 는 id → 바뀐 필드 이름. */
export type SetReport = { added: string[]; updated: Record<string, string[]>; keptRemake: number; gone: string[] };
export type BundleCheck<T> = { ok: true; bundle: T } | { ok: false; error: string };

// ─── 형태 검사 ──────────────────────────────────────────────────────────

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isTable = (v: unknown): v is Triple[] => Array.isArray(v) && v.every((r) => Array.isArray(r) && r.length === 3 && r.every(isStr));

const MEMBER_ERROR = '로그인·멤버십 확인 — 회원 전문을 받지 못했습니다';
const nonEmpty = (v: unknown): v is string => isStr(v) && v.trim() !== '';

/** 오류 문장에 넣는 id 목록 — 수집본 전체가 비회원이면 수백 개라 앞 10개만 보이고 나머지는 개수로 줄인다. */
function idList(ids: readonly string[], max = 10): string {
  return ids.length > max ? `${ids.slice(0, max).join(', ')}, …외 ${ids.length - max}` : ids.join(', ');
}

/** 목록 항목에서 빠졌거나 잘못된 필드 이름. `no` 만 문자열·숫자 모두 허용, 선택 필드는 있으면 형태를 본다. */
function itemProblems(i: unknown): string[] {
  if (!isObj(i)) return ['entry'];
  const bad = ['id', 'g', 'name', 'use', 'en', 'concept'].filter((k) => !isStr(i[k]));
  if (!isStr(i.no) && typeof i.no !== 'number') bad.push('no');
  for (const k of ['kind', 'kind_label']) if (i[k] !== undefined && !isStr(i[k])) bad.push(k);
  if (i.secs !== undefined && typeof i.secs !== 'number') bad.push('secs');
  return bad;
}

/**
 * 오빠두 모션 수집본(북마클릿·확장이 만든 JSON)을 쓰기 전에 점검한다. 던지지 않고 사람이 읽을 오류 한 줄을 돌려준다.
 * 비회원으로 받으면 v2 틀(`full.items[id].v2`)이 비어 있는데, 이를 모르고 옛 틀로 저장하면 안 되므로
 * 목록의 모든 편에 v2 틀과 3열 표가 있는지 id 를 짚어 확인한다.
 */
export function checkMotionBundle(raw: unknown): BundleCheck<OppaduMotionBundle> {
  const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
  if (!isObj(raw)) return fail('수집본이 JSON 객체가 아닙니다');
  if (raw.kind !== 'oppadu-motion') return fail(`모션 수집본이 아닙니다 (kind: ${String(raw.kind)})`);
  const { config, gallery, full } = raw;
  if (!isObj(config) || !isObj(gallery) || !isObj(full) || !isObj(full.items)) return fail('수집본 형식이 맞지 않습니다 (config·gallery·full)');
  if (config.member === false) return fail(MEMBER_ERROR);
  if (!isStr(config.a) || !(isStr(config.mv) || typeof config.mv === 'number')) return fail('수집본 형식이 맞지 않습니다 (config.a·mv)');
  if (!Array.isArray(gallery.items)) return fail('수집본 형식이 맞지 않습니다 (gallery.items)');
  if (config.add !== undefined && !Array.isArray(config.add)) return fail('수집본 형식이 맞지 않습니다 (config.add)');

  const lists: [string, unknown[]][] = [['gallery.items', gallery.items], ['config.add', (config.add as unknown[] | undefined) ?? []]];
  for (const [label, list] of lists) {
    for (const [at, item] of list.entries()) {
      const bad = itemProblems(item);
      if (bad.length) return fail(`${label}[${at}] 형식이 맞지 않습니다 (${bad.join(', ')})`);
    }
  }

  const bundle = { ...raw, config: { ...config, add: config.add ?? [] } } as unknown as OppaduMotionBundle;
  const missing = motionUpstream(bundle).map((i) => i.id).filter((id) => {
    const f = (full.items as Record<string, unknown>)[id];
    return !(isObj(f) && isObj(f.v2) && nonEmpty(f.v2.en) && nonEmpty(f.v2.ko) && isTable(f.shots) && isTable(f.cues));
  });
  if (missing.length) return fail(`${missing.length}편의 전문이 없습니다 — 로그인·멤버십 확인 (${idList(missing)})`);
  return { ok: true, bundle };
}

// ─── 병합 ───────────────────────────────────────────────────────────────

/**
 * 오빠두 화면 순서의 목록 — `gallery.items` 다음 `add`. 화면 스크립트가 이미 `add` 를 이어 붙여 둔 수집본에서는
 * 같은 id 가 두 번 나오므로, 처음 나온 자리(와 그 내용)만 남긴다.
 */
export function motionUpstream(b: OppaduMotionBundle): OppaduMotionItem[] {
  const seen = new Set<string>();
  return [...b.gallery.items, ...(b.config.add ?? [])].filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)));
}

/** 갱신 필드 — 이 순서가 `report.updated` 의 순서다(upstream `g`→`group`, `kind_label`→`kindLabel`). */
const MOTION_FIELDS = ['no', 'group', 'name', 'en', 'use', 'concept', 'kind', 'kindLabel', 'secs'] as const;

function upstreamFields(i: OppaduMotionItem): Record<string, unknown> {
  return { no: Number(i.no), group: i.g as MotionGroup, name: i.name, en: i.en, use: i.use, concept: i.concept, kind: i.kind, kindLabel: i.kind_label, secs: i.secs };
}

function mediaOf(b: OppaduMotionBundle, id: string): MediaFile[] {
  const base = b.config.a, v = `?v=${b.config.mv}`;
  return [
    { rel: `motion/${id}/video.mp4`, url: `${base}v/${id}.mp4${v}` },
    { rel: `motion/${id}/preview.mp4`, url: `${base}c/${id}.mp4${v}` },
    { rel: `motion/${id}/poster.webp`, url: `${base}p/${id}.webp${v}` },
  ];
}

function throwSync(label: 'motion' | 'slide', errors: string[]): never {
  throw new Error(`${label} sync: ${errors.slice(0, 10).join('; ')}`);
}

/**
 * 현재 카탈로그에 오빠두 수집본을 증분 병합한다.
 * - 변형본(`oppadu` 가 아닌 출처 = 직접 다시 만든 판)은 목록·프롬프트·미디어 모두 건드리지 않고 `keptRemake` 로만 센다.
 * - 원본은 오빠두 값으로 갱신(바뀐 필드만 `report.updated`), 새 id 는 `oppadu`·`featured:false` 로 추가,
 *   오빠두에서 사라진 원본은 그대로 두고 `report.gone` 에만 적는다(이미 퍼진 링크·학생 기록을 깨지 않으려고).
 * - 프롬프트는 v2 틀 원문(`v2.en`/`v2.ko`)이며 완성본을 만들지 않는다. 입력은 바꾸지 않는다.
 * 처음 보는 분류·잘못된 id·틀 오류·카탈로그 검증 실패는 `motion sync: …` 로 던진다 — 호출자는 아무것도 쓰지 않고 멈춘다.
 */
export function mergeMotion(
  catalog: readonly MotionPublic[],
  b: OppaduMotionBundle,
): { list: MotionPublic[]; prompts: MotionAdminRow[]; media: MediaFile[]; report: SetReport } {
  const byId = new Map(catalog.map((m) => [m.id, m]));
  const isRemake = (m: MotionPublic | undefined): boolean => m !== undefined && m.source !== 'oppadu';
  const upstream = motionUpstream(b);
  const originals = upstream.filter((i) => !isRemake(byId.get(i.id)));

  const errors: string[] = [];
  const rows: MotionAdminRow[] = [];
  for (const i of originals) {
    if (!MOTION_FILE.test(`motion/${i.id}/video.mp4`)) errors.push(`bad id "${i.id}"`);
    if (!(MOTION_GROUPS as readonly string[]).includes(i.g)) errors.push(`unknown group "${i.g}" (${i.id})`);
    if (!Number.isInteger(Number(i.no)) || Number(i.no) < 1) errors.push(`bad no "${String(i.no)}" (${i.id})`);
  }
  for (const i of originals) {
    const f = b.full.items[i.id];
    if (!f?.v2 || !f.shots || !f.cues) { errors.push(`template ${i.id}: 전문이 없습니다`); continue; }
    rows.push({ id: i.id, prompt: f.v2.en, ko: f.v2.ko, shots: f.shots, cues: f.cues });
    for (const lang of ['en', 'ko'] as const) {
      const bad = validateTemplate(f.v2[lang]);
      if (bad.length) errors.push(`template ${i.id} (${lang}): ${bad.join(', ')}`);
    }
  }
  if (errors.length) throwSync('motion', errors);

  const report: SetReport = { added: [], updated: {}, keptRemake: 0, gone: [] };
  const merged = originals.map((i): MotionPublic => {
    const before = byId.get(i.id);
    const next = upstreamFields(i);
    if (!before) {
      report.added.push(i.id);
      return {
        id: i.id, no: next.no as number, group: next.group as MotionGroup, name: i.name, en: i.en, use: i.use, concept: i.concept,
        featured: false, source: 'oppadu',
        ...(i.kind !== undefined ? { kind: i.kind } : {}),
        ...(i.kind_label !== undefined ? { kindLabel: i.kind_label } : {}),
        ...(i.secs !== undefined ? { secs: i.secs } : {}),
      };
    }
    const out: Record<string, unknown> = { ...before };
    const changed: string[] = [];
    for (const k of MOTION_FIELDS) {
      if (out[k] === next[k]) continue;
      changed.push(k);
      if (next[k] === undefined) delete out[k]; else out[k] = next[k];
    }
    if (changed.length) report.updated[i.id] = changed;
    return out as MotionPublic;
  });

  const upIds = new Set(upstream.map((i) => i.id));
  report.keptRemake = upstream.filter((i) => isRemake(byId.get(i.id))).length;
  report.gone = catalog.filter((m) => m.source === 'oppadu' && !upIds.has(m.id)).map((m) => m.id);
  const list: MotionPublic[] = [
    ...catalog.filter((m) => isRemake(m)),
    ...merged,
    ...catalog.filter((m) => report.gone.includes(m.id)),
  ];
  const catalogErrors = validateMotionCatalog(list);
  if (catalogErrors.length) throwSync('motion', catalogErrors);

  return {
    list,
    prompts: rows,
    media: originals.flatMap((i) => mediaOf(b, i.id)),
    report,
  };
}

// ─── 슬라이드 ────────────────────────────────────────────────────────────

/** 오빠두 슬라이드 목록의 한 항목(`OPD_SLIDE_STYLES.styles[i]`). `prompt` 는 회원에게만 온다. */
export type OppaduSlideStyle = {
  id: string; no: number; family: string; name: string; look: string; use: string;
  slides: number; cover: number; body: number; added: string; prompt?: string; sub?: string;
};
/** `img` 는 그림 폴더 주소(끝에 `/`), `styles` 는 오빠두 인기순이다. `tags`(`OPD_SLS_TAGS`)는 원본 보관용이라 쓰지 않는다. */
export type OppaduSlideBundle = {
  kind: 'oppadu-slide'; fetchedAt: string; page: string; img: string; styles: OppaduSlideStyle[]; tags?: Record<string, string[]>;
};

function styleProblems(s: unknown): string[] {
  if (!isObj(s)) return ['entry'];
  const bad = ['id', 'family', 'name', 'look', 'use', 'added'].filter((k) => !isStr(s[k]));
  for (const k of ['no', 'slides', 'cover', 'body']) if (typeof s[k] !== 'number') bad.push(k);
  for (const k of ['prompt', 'sub']) if (s[k] !== undefined && !isStr(s[k])) bad.push(k);
  return bad;
}

/**
 * 오빠두 슬라이드 수집본을 쓰기 전에 점검한다(던지지 않음). 비회원으로 받으면 `prompt` 가 비므로,
 * 모든 스타일에 내용이 있는 프롬프트가 있는지 id 를 짚어 확인한다 — 빈 프롬프트가 동작하는 프롬프트를 덮어쓰면 안 된다.
 */
export function checkSlideBundle(raw: unknown): BundleCheck<OppaduSlideBundle> {
  const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
  if (!isObj(raw)) return fail('수집본이 JSON 객체가 아닙니다');
  if (raw.kind !== 'oppadu-slide') return fail(`슬라이드 수집본이 아닙니다 (kind: ${String(raw.kind)})`);
  if (!isStr(raw.img) || !Array.isArray(raw.styles)) return fail('수집본 형식이 맞지 않습니다 (img·styles)');
  if (raw.tags !== undefined && !isObj(raw.tags)) return fail('수집본 형식이 맞지 않습니다 (tags)');
  for (const [at, item] of raw.styles.entries()) {
    const bad = styleProblems(item);
    if (bad.length) return fail(`styles[${at}] 형식이 맞지 않습니다 (${bad.join(', ')})`);
  }
  const styles = raw.styles as OppaduSlideStyle[];
  const missing = styles.filter((s) => !nonEmpty(s.prompt)).map((s) => s.id);
  if (missing.length) return fail(`${missing.length}개 스타일의 프롬프트가 없습니다 — 로그인·멤버십 확인 (${idList(missing)})`);
  return { ok: true, bundle: raw as unknown as OppaduSlideBundle };
}

/** 갱신 필드 — 이 순서가 `report.updated` 의 순서다. */
const SLIDE_FIELDS = ['no', 'family', 'name', 'look', 'use', 'slides', 'cover', 'body', 'added'] as const;
const MAX_SLIDE_PAGES = 12;

/** 한 스타일의 받을 미디어 — 모든 장의 큰 그림·작은 그림, 그리고 표지·본문 카드(같은 장이면 한 번). */
function slideMedia(img: string, s: OppaduSlideStyle): MediaFile[] {
  const pages = Array.from({ length: s.slides }, (_, k) => k + 1);
  const cards = [...new Set([s.cover, s.body])];
  return [
    ...pages.map((k) => ({ rel: `slide/${s.id}/${k}.webp`, url: `${img}${s.id}-${k}.webp` })),
    ...pages.map((k) => ({ rel: `slide/${s.id}/s/${k}.webp`, url: `${img}s/${s.id}-${k}.webp` })),
    ...cards.map((k) => ({ rel: `slide/${s.id}/t/${k}.webp`, url: `${img}t/${s.id}-${k}.webp` })),
  ];
}

/**
 * 현재 카탈로그에 오빠두 슬라이드 수집본을 증분 병합한다(규칙은 mergeMotion 과 같다).
 * - 순서: 오빠두 인기순, 자리에 학교 덱이 있으면 그 덱 객체 그대로(1단계 `buildSlideData` 와 같음). 오빠두 목록 밖 학교 덱은
 *   지금 순서대로 그 뒤, 오빠두에서 사라진 원본은 맨 끝에 그대로 둔다(`report.gone`).
 * - 변형본(`oppadu` 가 아닌 출처)은 목록·프롬프트·미디어 모두 건드리지 않는다.
 * - 프롬프트는 `prompt.trim()` 원문. 입력은 바꾸지 않는다.
 * 처음 보는 분류·12장 초과·잘못된 id·범위 밖 cover/body·빈 프롬프트·카탈로그 검증 실패는 `slide sync: …` 로 던진다.
 */
export function mergeSlide(
  catalog: readonly SlidePublic[],
  b: OppaduSlideBundle,
): { list: SlidePublic[]; prompts: { id: string; prompt: string }[]; media: MediaFile[]; report: SetReport } {
  const byId = new Map(catalog.map((s) => [s.id, s]));
  const isRemake = (s: SlidePublic | undefined): boolean => s !== undefined && s.source !== 'oppadu';
  const originals = b.styles.filter((s) => !isRemake(byId.get(s.id)));

  const errors: string[] = [];
  for (const s of originals) {
    if (!SLIDE_FILE.test(`slide/${s.id}/1.webp`)) errors.push(`bad id "${s.id}"`);
    if (!SLIDE_FAMILIES.some((f) => f.key === s.family)) errors.push(`unknown family "${s.family}" (${s.id})`);
    if (!Number.isInteger(s.no) || s.no < 1) errors.push(`bad no "${String(s.no)}" (${s.id})`);
    if (!Number.isInteger(s.slides) || s.slides < 1) errors.push(`bad slides "${String(s.slides)}" (${s.id})`);
    else if (s.slides > MAX_SLIDE_PAGES) errors.push(`more than ${MAX_SLIDE_PAGES} slides (${s.id})`);
    else if (![s.cover, s.body].every((k) => Number.isInteger(k) && k >= 1 && k <= s.slides)) errors.push(`cover/body out of range (${s.id})`);
    if (!nonEmpty(s.prompt)) errors.push(`prompt ${s.id}: 프롬프트가 없습니다`);
  }
  if (errors.length) throwSync('slide', errors);

  const report: SetReport = { added: [], updated: {}, keptRemake: 0, gone: [] };
  const merged = new Map(originals.map((s): [string, SlidePublic] => {
    const before = byId.get(s.id);
    if (!before) {
      report.added.push(s.id);
      return [s.id, {
        id: s.id, no: s.no, family: s.family as SlideFamily, name: s.name, look: s.look, use: s.use,
        slides: s.slides, cover: s.cover, body: s.body, added: s.added, source: 'oppadu',
      }];
    }
    const out: Record<string, unknown> = { ...before };
    const changed = SLIDE_FIELDS.filter((k) => out[k] !== s[k]);
    for (const k of changed) out[k] = s[k];
    if (changed.length) report.updated[s.id] = [...changed];
    return [s.id, out as SlidePublic];
  }));

  const upIds = new Set(b.styles.map((s) => s.id));
  report.keptRemake = b.styles.filter((s) => isRemake(byId.get(s.id))).length;
  report.gone = catalog.filter((s) => s.source === 'oppadu' && !upIds.has(s.id)).map((s) => s.id);
  const list: SlidePublic[] = [
    ...b.styles.map((s) => merged.get(s.id) ?? (byId.get(s.id) as SlidePublic)),
    ...catalog.filter((s) => isRemake(s) && !upIds.has(s.id)),
    ...catalog.filter((s) => report.gone.includes(s.id)),
  ];
  const catalogErrors = validateSlideCatalog(list);
  if (catalogErrors.length) throwSync('slide', catalogErrors);

  return {
    list,
    prompts: originals.map((s) => ({ id: s.id, prompt: (s.prompt as string).trim() })),
    media: originals.flatMap((s) => slideMedia(b.img, s)),
    report,
  };
}

// ─── 브랜드 ─────────────────────────────────────────────────────────────

/** 브랜드 목록(`brands-index.json`) 중 비교에 쓰는 부분. */
export type BrandIndexLike = { generated_at?: string; brands: { slug: string }[] };

/** 브랜드는 변형본이 없어 오빠두 목록을 따르므로 이전 목록과 slug 만 견줘 보고한다. 이전 목록이 없으면 전부 추가로 센다. */
export function diffBrandIndex(
  prev: BrandIndexLike | null,
  next: BrandIndexLike,
): { added: string[]; removed: string[]; total: number; generatedAt: string } {
  const before = new Set((prev?.brands ?? []).map((x) => x.slug));
  const after = new Set(next.brands.map((x) => x.slug));
  return {
    added: [...after].filter((slug) => !before.has(slug)),
    removed: [...before].filter((slug) => !after.has(slug)),
    total: next.brands.length,
    generatedAt: next.generated_at ?? '',
  };
}
