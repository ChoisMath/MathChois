// 열람 API 응답 조립 — Volume manifest(실제로 올라간 파일)와 카탈로그·프롬프트 행을 합쳐 화면용 항목을 만든다.
// 파일이 하나라도 빠진 항목은 목록에서 빼서, 클라이언트가 깨진 카드를 보지 않게 한다.
import type { MotionPublic } from './motion.js';
import type { SlidePublic } from './slide.js';
import { mediaUrl } from './paths.js';
import { isV2, type Row } from './promptEngine.js';

export type Manifest = Record<string, { size: number; sha256: string; updatedAt: string }>;

export type MotionPrompt = { en: string; ko: string; shots: Row[]; cues: Row[] };
export type MotionItem = MotionPublic & {
  video: string;
  poster: string;
  preview: string | null;
  prompt: (MotionPrompt & { v2: boolean }) | null;
};

export type SlideItem = SlidePublic & {
  images: string[];
  thumbs: string[];
  coverCard: string;
  bodyCard: string;
  prompt: string | null;
};

export function renderMotionItems(
  catalog: readonly MotionPublic[],
  manifest: Manifest | null,
  prompts: Map<string, MotionPrompt>,
): MotionItem[] {
  if (!manifest) return [];
  const url = (rel: string): string | null => (manifest[rel] ? mediaUrl(rel, manifest[rel].sha256) : null);
  const out: MotionItem[] = [];
  for (const m of catalog) {
    const video = url(`motion/${m.id}/video.mp4`);
    const poster = url(`motion/${m.id}/poster.webp`);
    if (!video || !poster) continue;
    const p = prompts.get(m.id);
    out.push({
      ...m,
      video,
      poster,
      preview: url(`motion/${m.id}/preview.mp4`),
      prompt: p ? { en: p.en, ko: p.ko, shots: p.shots, cues: p.cues, v2: isV2(p.en) || isV2(p.ko) } : null,
    });
  }
  return out;
}

export function renderSlideItems(
  catalog: readonly SlidePublic[],
  manifest: Manifest | null,
  prompts: Map<string, string>,
): SlideItem[] {
  if (!manifest) return [];
  const url = (rel: string): string | null => (manifest[rel] ? mediaUrl(rel, manifest[rel].sha256) : null);
  const out: SlideItem[] = [];
  for (const s of catalog) {
    const images: string[] = [];
    const thumbs: string[] = [];
    let complete = true;
    for (let k = 1; k <= s.slides; k++) {
      const img = url(`slide/${s.id}/${k}.webp`);
      const thumb = url(`slide/${s.id}/s/${k}.webp`);
      if (!img || !thumb) { complete = false; break; }
      images.push(img);
      thumbs.push(thumb);
    }
    if (!complete) continue;
    const coverCard = url(`slide/${s.id}/t/${s.cover}.webp`);
    const bodyCard = url(`slide/${s.id}/t/${s.body}.webp`);
    if (!coverCard || !bodyCard) continue;
    out.push({ ...s, images, thumbs, coverCard, bodyCard, prompt: prompts.get(s.id) ?? null });
  }
  return out;
}
