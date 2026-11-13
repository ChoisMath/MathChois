// 새 슬라이드 추가용: 학교 덱 원천(SLIDE_SRC: manifest.json + <id>/deck.pdf·prompt.txt)과 오빠두 원본 스크랩
// (OPPADU_SLIDE_SRC: data/styles.json + img/)을 읽어 공개 카탈로그(packages/shared/src/ai-hub/slide.data.ts, git),
// 그림(.media-out/ai-hub/slide/<id>/…), 프롬프트(.media-out/prompts/slide.json), manifest 로 나눈다.
// PDF 해시·표지/본문 번호가 그대로인 덱은 다시 래스터화하지 않는다(SD 카드에서 118덱이 40분). 바뀐 그림만 ai:push 가 올린다.
// 카탈로그 파일을 통째로 다시 쓰므로 styles.json 이 없으면 기존 oppadu 항목이 사라진다 — 그때는 --school-only 를 명시해야 한다.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SLIDE_CATALOG, buildSlideData, formatCatalogSource, parseOriginalStyles, parseSchoolManifest,
  type DeckInfo, type OriginalStyle,
} from '@mathchois/shared';
import { sha256File, writeManifest } from './manifest.js';
import { AI_DIR, OUT_DIR, hasFlag, promptsFile } from './volumeLayout.js';

const CATALOG_FILE = fileURLToPath(new URL('../../packages/shared/src/ai-hub/slide.data.ts', import.meta.url));
const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { stdio: ['ignore', 'ignore', 'inherit'] });

// SD 카드(exFAT)에서는 macOS 가 남기는 ._ 파일 때문에 재귀 삭제가 ENOTEMPTY 로 한 번씩 실패한다.
const rmTree = (dir: string) => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });

async function renderDeck(pdf: string, dir: string, tmp: string, cards: number[]): Promise<number> {
  const stamp = path.join(dir, '.source');
  const key = `${await sha256File(pdf)} ${cards.join(',')}`;
  if (existsSync(stamp)) {
    const [prevKey, pages] = readFileSync(stamp, 'utf8').split('\n');
    if (prevKey === key && Number(pages) > 0) return Number(pages);
  }
  rmTree(dir);
  rmTree(tmp);
  for (const d of [dir, path.join(dir, 's'), path.join(dir, 't'), tmp]) mkdirSync(d, { recursive: true });
  run('pdftoppm', ['-png', '-scale-to-x', '1376', '-scale-to-y', '-1', pdf, path.join(tmp, 'p')]);
  const pngs = readdirSync(tmp)
    .filter((f) => /^p-\d+\.png$/.test(f))
    .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));
  pngs.forEach((png, i) => {
    const k = i + 1;
    const src = path.join(tmp, png);
    run('cwebp', ['-quiet', '-q', '82', '-resize', '1376', '768', src, '-o', path.join(dir, `${k}.webp`)]);
    run('cwebp', ['-quiet', '-q', '70', '-resize', '172', '96', src, '-o', path.join(dir, 's', `${k}.webp`)]);
    if (cards.includes(k)) run('cwebp', ['-quiet', '-q', '78', '-resize', '760', '424', src, '-o', path.join(dir, 't', `${k}.webp`)]);
  });
  rmTree(tmp);
  writeFileSync(stamp, `${key}\n${pngs.length}`);
  return pngs.length;
}

// 원본 스크랩의 그림 이름 규칙: img/{id}-{k}.webp(1376×768) · img/s/… · img/t/…(표지·본문만). 하나라도 없으면 그 스타일은 싣지 않는다.
function copyOriginal(imgDir: string, s: OriginalStyle, dir: string): boolean {
  const pairs: [string, string][] = [];
  for (let k = 1; k <= s.slides; k++) {
    pairs.push([path.join(imgDir, `${s.id}-${k}.webp`), path.join(dir, `${k}.webp`)]);
    pairs.push([path.join(imgDir, 's', `${s.id}-${k}.webp`), path.join(dir, 's', `${k}.webp`)]);
  }
  for (const k of new Set([s.cover, s.body])) pairs.push([path.join(imgDir, 't', `${s.id}-${k}.webp`), path.join(dir, 't', `${k}.webp`)]);
  const missing = pairs.filter(([src]) => !existsSync(src));
  if (missing.length) {
    console.warn(`skip original ${s.id}: ${missing.length} image(s) missing`);
    return false;
  }
  rmTree(dir);
  for (const d of [dir, path.join(dir, 's'), path.join(dir, 't')]) mkdirSync(d, { recursive: true });
  // copyFileSync(APFS 복제)가 이 SD 카드에서 EILSEQ 로 실패한 적이 있어 읽어서 쓴다.
  for (const [src, dest] of pairs) writeFileSync(dest, readFileSync(src));
  return true;
}

async function main() {
  const src = process.env.SLIDE_SRC ?? '/Volumes/Chois_SD2/dev/motion/slide/school';
  const schoolOnly = hasFlag(process.argv, '--school-only');
  const originalSrc = process.env.OPPADU_SLIDE_SRC ?? path.resolve(src, '..');
  const stylesFile = path.join(originalSrc, 'data/styles.json');
  if (!schoolOnly && !existsSync(stylesFile)) {
    throw new Error(`${stylesFile} not found — without it the oppadu originals would drop out of the catalog (use --school-only to do that on purpose)`);
  }
  const entries = parseSchoolManifest(JSON.parse(readFileSync(path.join(src, 'manifest.json'), 'utf8')));
  const slideDir = (id: string) => path.join(AI_DIR, 'slide', id);

  const decks = new Map<string, DeckInfo>();
  for (const e of entries) {
    const pdf = path.join(src, e.id, 'deck.pdf');
    if (!existsSync(pdf)) {
      console.warn(`skip ${e.id}: deck.pdf missing`);
      continue;
    }
    const pages = await renderDeck(pdf, slideDir(e.id), path.join(OUT_DIR, '.tmp-slide'), [e.cover, e.body]);
    decks.set(e.id, { pages, prompt: readFileSync(path.join(src, e.id, 'prompt.txt'), 'utf8') });
    console.info(`rendered ${e.id}: ${pages} pages`);
  }

  const originals = schoolOnly ? [] : parseOriginalStyles(JSON.parse(readFileSync(stylesFile, 'utf8')).styles)
    .filter((o) => decks.has(o.id) || copyOriginal(path.join(originalSrc, 'img'), o, slideDir(o.id)));
  console.info(`originals ${originals.length} (school decks replace ${originals.filter((o) => decks.has(o.id)).length})`);

  const { publicList, adminList } = buildSlideData(entries, decks, originals);
  writeFileSync(CATALOG_FILE, formatCatalogSource('slide', publicList));
  mkdirSync(path.dirname(promptsFile('slide')), { recursive: true });
  writeFileSync(promptsFile('slide'), JSON.stringify(adminList, null, 1) + '\n');
  const manifest = await writeManifest('slide');
  console.info(`slide:import catalog=${publicList.length} (was ${SLIDE_CATALOG.length}) · manifest ${Object.keys(manifest).length} files`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
