import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { eq, inArray, sql } from 'drizzle-orm';
import {
  MOTION_CATALOG, SLIDE_CATALOG, renderMotionItems, renderSlideItems, validateManifest, decidePromptSync,
  type Manifest, type MotionPrompt, type MotionItem, type SlideItem, type Row, type PromptSyncResult,
} from '@mathchois/shared';
import { db } from '../config/database.js';
import { env } from '../config/env.js';
import { aiMotionPrompts, aiSlidePrompts } from '../db/schema.js';

export type ManifestSet = 'motion' | 'slide' | 'brand';

// ─── manifest (Volume ai-hub/manifest/<set>.json) ───────

const manifestCache = new Map<ManifestSet, { mtimeMs: number; value: Manifest | null }>();

/** manifest 를 읽는다. 파일 mtime 이 바뀔 때만 다시 읽고, 없거나 JSON 이 깨졌거나 validateManifest 를 통과하지 못하면 null. */
export async function readManifest(set: ManifestSet): Promise<Manifest | null> {
  const file = path.join(env.VOLUME_PATH, 'ai-hub', 'manifest', `${set}.json`);
  let mtimeMs: number;
  try {
    mtimeMs = (await stat(file)).mtimeMs;
  } catch {
    manifestCache.delete(set);
    return null; // 아직 올린 적 없음
  }
  const hit = manifestCache.get(set);
  if (hit && hit.mtimeMs === mtimeMs) return hit.value;
  let value: Manifest | null = null;
  try {
    const json: unknown = JSON.parse(await readFile(file, 'utf8'));
    const errors = validateManifest(json);
    // mtime 별로 캐시되므로 같은 파일에 대해 한 번만 기록된다.
    if (errors.length) console.error(`[ai-hub] manifest ${set}.json 모양이 잘못되었습니다`, errors.slice(0, 20));
    else value = json as Manifest;
  } catch (err) {
    console.error(`[ai-hub] manifest ${set}.json 을 읽지 못했습니다`, err);
  }
  manifestCache.set(set, { mtimeMs, value });
  return value;
}

// ─── 프롬프트 행 ───────────────────────────────────────

async function loadMotionPrompts(): Promise<Map<string, MotionPrompt>> {
  const rows = await db.select().from(aiMotionPrompts);
  return new Map(rows.map((r) => [r.id, { en: r.promptEn, ko: r.promptKo, shots: r.shots, cues: r.cues, editedAt: r.editedAt ? r.editedAt.toISOString() : null }]));
}

async function loadSlidePrompts(): Promise<Map<string, string>> {
  const rows = await db.select().from(aiSlidePrompts);
  return new Map(rows.map((r) => [r.id, r.prompt]));
}

export async function listMotion(): Promise<MotionItem[]> {
  return renderMotionItems(MOTION_CATALOG, await readManifest('motion'), await loadMotionPrompts());
}

export async function listSlide(): Promise<SlideItem[]> {
  return renderSlideItems(SLIDE_CATALOG, await readManifest('slide'), await loadSlidePrompts());
}

export type MotionPromptInput = { en: string; ko: string; shots: Row[]; cues: Row[] };

export async function upsertMotionPrompt(id: string, p: MotionPromptInput) {
  const [row] = await db.insert(aiMotionPrompts)
    .values({ id, promptEn: p.en, promptKo: p.ko, shots: p.shots, cues: p.cues, editedAt: new Date() })
    .onConflictDoUpdate({
      target: aiMotionPrompts.id,
      // 웹 편집기 저장 = 관리자가 직접 고친 원본 → editedAt 을 찍어 오빠두 동기화에서 제외한다.
      set: { promptEn: p.en, promptKo: p.ko, shots: p.shots, cues: p.cues, updatedAt: new Date(), editedAt: new Date() },
    })
    .returning();
  return row;
}

/** 일괄 가져오기 결과 — inserted(새 id), updated(덮어씀, overwrite 일 때만), skipped(이미 있어 건드리지 않음). */
export type PromptImportResult = { inserted: number; updated: number; skipped: number };

/**
 * 일괄 가져오기(ai:push) 결과를 센다. 기본은 없는 id 만 넣고(ON CONFLICT DO NOTHING) 이미 있는 행 — 관리자가 웹에서
 * 고친 원본 템플릿 — 은 그대로 둔다. overwrite 면 덮어쓰고, Postgres 의 `xmax = 0`(이번 문장에서 새로 넣은 행)으로
 * 새 행과 덮어쓴 행을 구분한다.
 */
function importResult(total: number, rows: { inserted: boolean }[], overwrite: boolean): PromptImportResult {
  const inserted = rows.filter((r) => r.inserted).length;
  return overwrite
    ? { inserted, updated: rows.length - inserted, skipped: 0 }
    : { inserted, updated: 0, skipped: total - inserted };
}

const insertedFlag = { inserted: sql<boolean>`(xmax = 0)` };

export async function importMotionPrompts(
  list: (MotionPromptInput & { id: string })[],
  { overwrite = false } = {},
): Promise<PromptImportResult> {
  if (!list.length) return { inserted: 0, updated: 0, skipped: 0 };
  const insert = db.insert(aiMotionPrompts)
    .values(list.map((p) => ({ id: p.id, promptEn: p.en, promptKo: p.ko, shots: p.shots, cues: p.cues })));
  const rows = overwrite
    ? await insert.onConflictDoUpdate({
      target: aiMotionPrompts.id,
      set: {
        promptEn: sql`excluded.prompt_en`,
        promptKo: sql`excluded.prompt_ko`,
        shots: sql`excluded.shots`,
        cues: sql`excluded.cues`,
        updatedAt: new Date(),
        editedAt: null, // 파일 내용으로 되돌렸으니 웹 편집 표시도 지운다
      },
    }).returning(insertedFlag)
    : await insert.onConflictDoNothing({ target: aiMotionPrompts.id }).returning(insertedFlag);
  return importResult(list.length, rows, overwrite);
}

export async function importSlidePrompts(
  list: { id: string; prompt: string }[],
  { overwrite = false } = {},
): Promise<PromptImportResult> {
  if (!list.length) return { inserted: 0, updated: 0, skipped: 0 };
  const insert = db.insert(aiSlidePrompts).values(list);
  const rows = overwrite
    ? await insert.onConflictDoUpdate({
      target: aiSlidePrompts.id,
      set: { prompt: sql`excluded.prompt`, updatedAt: new Date() },
    }).returning(insertedFlag)
    : await insert.onConflictDoNothing({ target: aiSlidePrompts.id }).returning(insertedFlag);
  return importResult(list.length, rows, overwrite);
}

// ─── 오빠두 동기화 (PUT /api/ai/prompts/:set?mode=sync) ───

const motionSame = (a: MotionPromptInput, b: MotionPromptInput) =>
  JSON.stringify([a.en, a.ko, a.shots, a.cues]) === JSON.stringify([b.en, b.ko, b.shots, b.cues]);

/**
 * 오빠두 원본 모션 프롬프트를 행 단위로 맞춘다. 한 트랜잭션 안에서 대상 행을 `FOR UPDATE` 로 잠가 읽고
 * (동시에 도는 관리자 웹 저장과 어긋나지 않게), 웹에서 고친 행(editedAt)은 건드리지 않고, 바뀐 행만 update 한다.
 * update 는 editedAt 을 건드리지 않는다(동기화는 "고친 것"이 아니다).
 */
export async function syncMotionPrompts(
  list: (MotionPromptInput & { id: string })[],
): Promise<PromptSyncResult<MotionPromptInput>> {
  const result: PromptSyncResult<MotionPromptInput> = { inserted: 0, updated: 0, unchanged: 0, skippedEdited: [], replaced: [] };
  if (!list.length) return result;
  await db.transaction(async (tx) => {
    const rows = await tx.select().from(aiMotionPrompts)
      .where(inArray(aiMotionPrompts.id, list.map((p) => p.id)))
      .for('update');
    const byId = new Map(rows.map((r) => [r.id, r]));
    const toInsert: (typeof aiMotionPrompts.$inferInsert)[] = [];
    for (const p of list) {
      const r = byId.get(p.id);
      const before: MotionPromptInput | null = r ? { en: r.promptEn, ko: r.promptKo, shots: r.shots, cues: r.cues } : null;
      const decision = decidePromptSync(r && before ? { value: before, editedAt: r.editedAt } : null, p, motionSame);
      if (decision === 'insert') {
        toInsert.push({ id: p.id, promptEn: p.en, promptKo: p.ko, shots: p.shots, cues: p.cues });
        result.inserted++;
      } else if (decision === 'skipEdited') {
        result.skippedEdited.push(p.id);
      } else if (decision === 'unchanged') {
        result.unchanged++;
      } else {
        await tx.update(aiMotionPrompts)
          .set({ promptEn: p.en, promptKo: p.ko, shots: p.shots, cues: p.cues, updatedAt: new Date() })
          .where(eq(aiMotionPrompts.id, p.id));
        result.updated++;
        result.replaced.push({ id: p.id, before: before! });
      }
    }
    if (toInsert.length) await tx.insert(aiMotionPrompts).values(toInsert);
  });
  return result;
}

/** 슬라이드 프롬프트 동기화 — 웹 편집 표시가 없으므로(편집기는 모션 전용) 값이 다르면 갱신한다. */
export async function syncSlidePrompts(
  list: { id: string; prompt: string }[],
): Promise<PromptSyncResult<string>> {
  const result: PromptSyncResult<string> = { inserted: 0, updated: 0, unchanged: 0, skippedEdited: [], replaced: [] };
  if (!list.length) return result;
  await db.transaction(async (tx) => {
    const rows = await tx.select().from(aiSlidePrompts)
      .where(inArray(aiSlidePrompts.id, list.map((p) => p.id)))
      .for('update');
    const byId = new Map(rows.map((r) => [r.id, r.prompt]));
    const toInsert: { id: string; prompt: string }[] = [];
    for (const p of list) {
      const before = byId.get(p.id);
      const decision = decidePromptSync(before === undefined ? null : { value: before, editedAt: null }, p.prompt, (a, b) => a === b);
      if (decision === 'insert') {
        toInsert.push(p);
        result.inserted++;
      } else if (decision === 'unchanged') {
        result.unchanged++;
      } else if (decision === 'update') {
        await tx.update(aiSlidePrompts).set({ prompt: p.prompt, updatedAt: new Date() }).where(eq(aiSlidePrompts.id, p.id));
        result.updated++;
        result.replaced.push({ id: p.id, before: before! });
      }
    }
    if (toInsert.length) await tx.insert(aiSlidePrompts).values(toInsert);
  });
  return result;
}

/** 웹 편집 표시를 지운다 — 다음 동기화가 오빠두 원본으로 되돌린다. 행이 없으면 false. */
export async function clearMotionEdited(id: string): Promise<boolean> {
  const rows = await db.update(aiMotionPrompts).set({ editedAt: null }).where(eq(aiMotionPrompts.id, id)).returning({ id: aiMotionPrompts.id });
  return rows.length > 0;
}
