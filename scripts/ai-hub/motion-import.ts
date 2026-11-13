// 새 모션 추가용: 원천 JSON 을 읽어 공개 카탈로그(packages/shared/src/ai-hub/motion.data.ts, git)와
// 프롬프트 JSON(.media-out/prompts/motion.json, ai:push 가 DB 로 올림)으로 나눈다.
// 원천 = MOTION_SRC/data/chois-gallery.json(Chois 판) + MOTION_SRC/data/oppadu-v2/gallery.json(오빠두 원본, 있을 때).
// 카탈로그 파일을 통째로 다시 쓰므로 원본 gallery.json 이 없으면 기존 oppadu 항목이 사라진다 — 그때는 --chois-only 를 명시해야 한다.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MOTION_CATALOG, formatCatalogSource, splitGallery, type OriginalItem, type SourceItem } from '@mathchois/shared';
import { hasFlag, promptsFile } from './volumeLayout.js';

const FEATURED_IDS = ['01-pixel', '06-neon', '11-rpg', '13-manga', '17-embroidery', '19-chalkboard'] as const;
const CATALOG_FILE = fileURLToPath(new URL('../../packages/shared/src/ai-hub/motion.data.ts', import.meta.url));

function main() {
  const src = process.env.MOTION_SRC ?? '/Volumes/Chois_SD2/dev/motion';
  const choisOnly = hasFlag(process.argv, '--chois-only');
  const gallery = JSON.parse(readFileSync(path.join(src, 'data/chois-gallery.json'), 'utf8')) as { items: SourceItem[] };
  const originalsFile = path.join(src, 'data/oppadu-v2/gallery.json');
  if (!choisOnly && !existsSync(originalsFile)) {
    throw new Error(`${originalsFile} not found — without it the oppadu originals would drop out of the catalog (use --chois-only to do that on purpose)`);
  }
  const originals = choisOnly ? [] : (JSON.parse(readFileSync(originalsFile, 'utf8')) as { items: OriginalItem[] }).items;

  const { publicList, adminList } = splitGallery(gallery.items, FEATURED_IDS, originals);
  writeFileSync(CATALOG_FILE, formatCatalogSource('motion', publicList));
  mkdirSync(path.dirname(promptsFile('motion')), { recursive: true });
  writeFileSync(promptsFile('motion'), JSON.stringify(adminList));
  console.info(`motion:import catalog=${publicList.length} (was ${MOTION_CATALOG.length}) prompts=${adminList.length} → ${path.relative(process.cwd(), promptsFile('motion'))}`);
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
