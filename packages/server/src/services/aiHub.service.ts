import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import {
  MOTION_CATALOG, SLIDE_CATALOG, renderMotionItems, renderSlideItems, validateManifest,
  type Manifest, type MotionPrompt, type MotionItem, type SlideItem, type Row,
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
  return new Map(rows.map((r) => [r.id, { en: r.promptEn, ko: r.promptKo, shots: r.shots, cues: r.cues }]));
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
    .values({ id, promptEn: p.en, promptKo: p.ko, shots: p.shots, cues: p.cues })
    .onConflictDoUpdate({
      target: aiMotionPrompts.id,
      set: { promptEn: p.en, promptKo: p.ko, shots: p.shots, cues: p.cues, updatedAt: new Date() },
    })
    .returning();
  return row;
}

/** 시드/가져오기용 일괄 저장 — 이미 있는 id 는 덮어쓴다. */
export async function upsertMotionPrompts(list: (MotionPromptInput & { id: string })[]) {
  if (!list.length) return;
  await db.insert(aiMotionPrompts)
    .values(list.map((p) => ({ id: p.id, promptEn: p.en, promptKo: p.ko, shots: p.shots, cues: p.cues })))
    .onConflictDoUpdate({
      target: aiMotionPrompts.id,
      set: {
        promptEn: sql`excluded.prompt_en`,
        promptKo: sql`excluded.prompt_ko`,
        shots: sql`excluded.shots`,
        cues: sql`excluded.cues`,
        updatedAt: new Date(),
      },
    });
}

export async function upsertSlidePrompts(list: { id: string; prompt: string }[]) {
  if (!list.length) return;
  await db.insert(aiSlidePrompts)
    .values(list)
    .onConflictDoUpdate({
      target: aiSlidePrompts.id,
      set: { prompt: sql`excluded.prompt`, updatedAt: new Date() },
    });
}

