// npm run ai:oppadu — 오빠두(oppadu.com/ai)의 새·바뀐 모션·슬라이드·브랜드 자료를 모아 git 카탈로그와 .media-out/ 에 증분 반영한다.
//   [-- --set motion|slide|brand]   하나만(생략하면 셋 다. 모션·슬라이드 수집본이 없으면 그 set 만 건너뜀)
//   [--motion <파일>] [--slide <파일>] 북마클릿 수집본(생략하면 ~/Downloads 의 가장 최근 oppadu-{motion,slide}-YYYY-MM-DD.json)
//   [--dry-run]                       보고서만 찍고 아무것도 쓰지 않음
//   [--refresh-media]                 버전 쿼리 없는 슬라이드 그림도 다시 받음(기본은 캐시 재사용)
//   [--bookmarklets]                  .oppadu/bookmarklets.html 만 만들고 끝
// 순서: manifest 확인 → 수집본 점검 → 병합(순수 함수) → 내려받기(.oppadu/cache) → 엔진 해시 → 브랜드 사본 → 보고서
//       → (--dry-run 이 아니면) 쓰기: 미디어 → manifest → 브랜드 바꿔 넣기 → 동기화 프롬프트 → *.data.ts → .oppadu/<날짜>/ 보관.
// 쓰기는 모든 내려받기·병합·검증이 끝난 뒤에만 한다. 그 전에 실패하면 종료 코드 1, .media-out/·카탈로그는 그대로.
import { copyFile, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MOTION_CATALOG, SLIDE_CATALOG, checkMotionBundle, checkSlideBundle, diffBrandIndex, formatCatalogSource, formatReport, mergeMotion, mergeSlide,
  type BrandIndexLike, type MediaFile, type RunReport,
} from '@mathchois/shared';
import { importBrand } from '../brand-import.js';
import { mapLimit } from '../http.js';
import { sha256File, writeManifest } from '../manifest.js';
import { AI_DIR, SETS, hasFlag, manifestFile, parseSetArg, syncPromptsFile, type AiSet } from '../volumeLayout.js';
import { writeBookmarkletsPage } from './bookmarklets.js';
import { buildBrandSite } from './brand-build.js';
import { ENGINE_SHA256 } from './engine.js';
import { cachePath, fetchToCache } from './fetchCache.js';

const OPPADU_DIR = path.resolve('.oppadu');
const CATALOG_FILE = {
  motion: fileURLToPath(new URL('../../../packages/shared/src/ai-hub/motion.data.ts', import.meta.url)),
  slide: fileURLToPath(new URL('../../../packages/shared/src/ai-hub/slide.data.ts', import.meta.url)),
} as const;
const BRAND_INDEX = 'data/brands-index.json';
const LABEL = { motion: '모션', slide: '슬라이드' } as const;

/** 사용자에게 보일 이유로 멈춘다(스택 없이 메시지만, 종료 코드 1). */
class Stop extends Error {}

const rel = (p: string) => path.relative(process.cwd(), p) || '.';
const pad = (n: number) => String(n).padStart(2, '0');
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

function argValue(argv: readonly string[], flag: string): string | null {
  const at = argv.indexOf(flag);
  if (at < 0) return null;
  const value = argv[at + 1];
  if (!value || value.startsWith('--')) throw new Stop(`${flag} 다음에 파일 경로가 필요합니다`);
  return path.resolve(value);
}

/** ~/Downloads 에서 가장 최근 수집본 — 이름의 날짜 내림차순, 같은 날이면 Chrome 이 붙인 ` (n)` 이 큰 것. */
async function latestDownload(kind: 'motion' | 'slide'): Promise<string | null> {
  const dir = path.join(os.homedir(), 'Downloads');
  if (!existsSync(dir)) return null;
  const pattern = new RegExp(`^oppadu-${kind}-(\\d{4}-\\d{2}-\\d{2})(?: \\((\\d+)\\))?\\.json$`);
  const found = (await readdir(dir))
    .map((name) => ({ name, m: pattern.exec(name) }))
    .filter((x): x is { name: string; m: RegExpExecArray } => x.m !== null)
    .map(({ name, m }) => ({ name, date: m[1] as string, n: Number(m[2] ?? 0) }))
    .sort((a, b) => (a.date === b.date ? b.n - a.n : a.date < b.date ? 1 : -1));
  return found.length ? path.join(dir, found[0]!.name) : null;
}

/** 수집본을 찾아 읽고 점검한다. 찾지 못하면 `required` 일 때 멈추고, 아니면 null(그 set 건너뜀). */
async function loadBundle<T>(
  kind: 'motion' | 'slide',
  explicit: string | null,
  required: boolean,
  check: (raw: unknown) => { ok: true; bundle: T } | { ok: false; error: string },
): Promise<{ file: string; bundle: T } | null> {
  const file = explicit ?? (await latestDownload(kind));
  if (explicit && !existsSync(explicit)) throw new Stop(`${rel(explicit)} 이 없습니다`);
  if (!file) {
    const why = `~/Downloads 에 oppadu-${kind}-*.json 이 없습니다 — 로그인 Chrome 에서 북마클릿으로 먼저 받으세요 (npm run ai:oppadu -- --bookmarklets)`;
    if (required) throw new Stop(why);
    console.warn(`${LABEL[kind]} 건너뜀: ${why}`);
    return null;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(file, 'utf8'));
  } catch (err) {
    throw new Stop(`${rel(file)}: JSON 이 아닙니다 (${(err as Error).message})`);
  }
  const checked = check(raw);
  if (!checked.ok) throw new Stop(`${rel(file)}: ${checked.error}`);
  console.info(`${LABEL[kind]} 수집본: ${rel(file)}`);
  return { file, bundle: checked.bundle };
}

function merged<T>(run: () => T): T {
  try {
    return run();
  } catch (err) {
    throw new Stop(err instanceof Error ? err.message : String(err));
  }
}

/** 캐시 파일과 .media-out 파일의 바이트가 다른가(없으면 다름). */
async function differs(from: string, to: string): Promise<boolean> {
  if (!existsSync(to)) return true;
  const [a, b] = await Promise.all([stat(from), stat(to)]);
  if (a.size !== b.size) return true;
  const [ha, hb] = await Promise.all([sha256File(from), sha256File(to)]);
  return ha !== hb;
}

async function changedMedia(media: readonly MediaFile[]): Promise<MediaFile[]> {
  const flags = await mapLimit(media, 8, (m) => differs(cachePath(m.url), path.join(AI_DIR, m.rel)));
  return media.filter((_, i) => flags[i]);
}

/** `.part` 로 쓴 뒤 이름을 바꿔, 중간에 끊겨도 반쯤 쓴 파일이 남지 않게 한다. */
async function copyAtomic(from: string, to: string) {
  await mkdir(path.dirname(to), { recursive: true });
  await copyFile(from, `${to}.part`);
  await rename(`${to}.part`, to);
}

async function writeIfChanged(file: string, text: string) {
  if (existsSync(file) && (await readFile(file, 'utf8')) === text) return;
  await writeFile(file, text);
}

async function readBrandIndex(file: string): Promise<BrandIndexLike | null> {
  if (!existsSync(file)) return null;
  return JSON.parse(await readFile(file, 'utf8')) as BrandIndexLike;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (hasFlag(argv, '--bookmarklets')) {
    const file = path.join(OPPADU_DIR, 'bookmarklets.html');
    await writeBookmarkletsPage(file);
    console.info(`${rel(file)} — 브라우저로 열어 두 링크를 즐겨찾기 막대로 끌어 놓으세요`);
    return;
  }
  const only = parseSetArg(argv, false);
  const sets: readonly AiSet[] = only ? [only] : SETS;
  const dryRun = hasFlag(argv, '--dry-run');
  const refreshMedia = hasFlag(argv, '--refresh-media');
  const date = today();
  const dayDir = path.join(OPPADU_DIR, date);

  // ① 1단계 첫 이전 결과(manifest)가 있어야 Chois·학교 파일까지 담은 manifest 를 다시 계산할 수 있다.
  for (const set of sets) {
    if (!existsSync(manifestFile(set))) throw new Stop(`먼저 npm run ai:pull 을 실행하세요 (.media-out/ai-hub/manifest/${set}.json 없음)`);
  }

  // ② 수집본
  const skipped: string[] = [];
  const motionIn = sets.includes('motion')
    ? await loadBundle('motion', argValue(argv, '--motion'), only === 'motion', checkMotionBundle)
    : null;
  const slideIn = sets.includes('slide')
    ? await loadBundle('slide', argValue(argv, '--slide'), only === 'slide', checkSlideBundle)
    : null;
  if (sets.includes('motion') && !motionIn) skipped.push('motion');
  if (sets.includes('slide') && !slideIn) skipped.push('slide');

  // ⑤ 병합 — 순수 함수라 내려받기 전에 해 두면 처음 보는 분류 같은 입력 문제로 큰 내려받기를 하지 않고 멈춘다.
  const motion = motionIn ? merged(() => mergeMotion(MOTION_CATALOG, motionIn.bundle)) : null;
  const slide = slideIn ? merged(() => mergeSlide(SLIDE_CATALOG, slideIn.bundle)) : null;

  // ③ 내려받기(모션·슬라이드)
  const galleryUrl = motionIn?.bundle.config.data;
  const enginePromptUrl = motionIn ? `${motionIn.bundle.config.a}js/ms-prompt.js` : null;
  const urls = [
    ...(galleryUrl && enginePromptUrl ? [galleryUrl, enginePromptUrl] : []),
    ...(motion?.media ?? []).map((m) => m.url),
    ...(slide?.media ?? []).map((m) => m.url),
  ];
  let fetched = 0;
  if (urls.length) {
    const got = await fetchToCache(urls, { refreshMedia });
    fetched += got.fetched;
    if (got.failed.length) throw new Stop(`${got.failed.length}개를 받지 못했습니다 — 아무것도 쓰지 않았습니다:\n  ${got.failed.join('\n  ')}`);
  }

  // ④ 엔진 변경 감지(경고만)
  const engineChanged = enginePromptUrl ? (await sha256File(cachePath(enginePromptUrl))) !== ENGINE_SHA256 : false;

  // 브랜드 사본 — 받기는 캐시를 거친다. --dry-run 은 임시 폴더에 만들어 검증만 하고 지운다.
  let brandDir: string | null = null;
  let brand: RunReport['brand'];
  const tmpBrand = dryRun && sets.includes('brand') ? await mkdtemp(path.join(os.tmpdir(), 'oppadu-brand-')) : null;
  try {
    if (sets.includes('brand')) {
      brandDir = tmpBrand ?? path.join(dayDir, 'brand-site');
      const ensure = async (url: string) => {
        const got = await fetchToCache([url], { refreshMedia });
        fetched += got.fetched;
        if (got.failed.length) throw new Stop(`브랜드 자료를 받지 못했습니다 — 아무것도 쓰지 않았습니다: ${url}`);
        return cachePath(url);
      };
      const { index } = await buildBrandSite(
        brandDir,
        async (url) => readFile(await ensure(url), 'utf8'),
        async (url, to) => copyFile(await ensure(url), to),
      ).catch((err: unknown) => {
        throw err instanceof Stop ? err : new Stop(`브랜드 사본을 만들지 못했습니다 — 아무것도 쓰지 않았습니다: ${err instanceof Error ? err.message : String(err)}`);
      });
      brand = diffBrandIndex(await readBrandIndex(path.join(AI_DIR, 'brand', BRAND_INDEX)), index);
    }

    // 보고서 — 미디어 수는 .media-out 과 바이트가 다른 파일(새로 생긴 것 포함)
    const motionChanged = motion ? await changedMedia(motion.media) : [];
    const slideChanged = slide ? await changedMedia(slide.media) : [];
    const report: RunReport = {
      date,
      ...(motion ? { motion: { ...motion.report, media: motionChanged.length } } : {}),
      ...(slide ? { slide: { ...slide.report, media: slideChanged.length } } : {}),
      ...(brand ? { brand } : {}),
      engineChanged,
      skipped,
    };
    const { markdown, summary } = formatReport(report);
    console.info(`새로 받은 파일 ${fetched}개`);

    // ⑥
    if (dryRun) {
      console.info(['', '── --dry-run: 아무것도 쓰지 않았습니다 ──', ...summary].join('\n'));
      return;
    }

    // ⑦ 쓰기 — 다시 실행해도 같은 결과로 수렴한다(경로 기반 복사·manifest 재계산·파일 통째 쓰기).
    for (const m of [...motionChanged, ...slideChanged]) await copyAtomic(cachePath(m.url), path.join(AI_DIR, m.rel));
    if (motion) await writeManifest('motion');
    if (slide) await writeManifest('slide');
    if (brandDir) await importBrand(brandDir);
    for (const [set, out] of [['motion', motion], ['slide', slide]] as const) {
      if (!out) continue;
      await mkdir(path.dirname(syncPromptsFile(set)), { recursive: true });
      await writeFile(syncPromptsFile(set), JSON.stringify(out.prompts, null, 1) + '\n');
      await writeIfChanged(CATALOG_FILE[set], formatCatalogSource(set, out.list));
    }

    // 원본 보관 — 수집본 둘·gallery-data.js·ms-prompt.js·brands-index.json·보고서(미디어는 캐시에만)
    await mkdir(dayDir, { recursive: true });
    for (const input of [motionIn, slideIn]) {
      if (input && path.resolve(input.file) !== path.join(dayDir, path.basename(input.file))) {
        await copyFile(input.file, path.join(dayDir, path.basename(input.file)));
      }
    }
    if (galleryUrl && enginePromptUrl) {
      await copyFile(cachePath(galleryUrl), path.join(dayDir, 'gallery-data.js'));
      await copyFile(cachePath(enginePromptUrl), path.join(dayDir, 'ms-prompt.js'));
    }
    if (brandDir) await copyFile(path.join(brandDir, BRAND_INDEX), path.join(dayDir, 'brands-index.json'));
    await writeFile(path.join(dayDir, 'report.md'), markdown);

    // ⑧
    console.info(['', ...summary, `보고서: ${rel(path.join(dayDir, 'report.md'))}`].join('\n'));
  } finally {
    if (tmpBrand) await rm(tmpBrand, { recursive: true, force: true });
  }
}

try {
  await main();
} catch (err) {
  console.error(err instanceof Stop ? err.message : err);
  process.exitCode = 1;
}
