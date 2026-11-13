// 오빠두 공개 자료로 브랜드 룩북 사본 폴더(`ai:brand:import` 의 BRAND_SRC 모양)를 만든다. 옛 motion/brand 의 build.cjs 를 대신한다.
//   outDir/index.html                 목록 페이지(허브 틀 div.aih 만, keep list 자산만)
//   outDir/brand/<slug>.html          브랜드 상세 틀(slug 마다)
//   outDir/assets/…                   BRAND_ASSETS 의 assets/*(css 는 글꼴 주소를 사본으로)
//   outDir/data/brands-index.json · data/hero/<slug>.json · data/detail/<slug>.json
// 받기(재시도·캐시·.part)는 호출 쪽 fetchText/fetchFile 몫이다. 결과가 서버 허용 경로(BRAND_FILE)를 벗어나거나
// brands-index 의 브랜드 수와 맞지 않으면 던진다 — 그 폴더로 import 하지 않는다.
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  BRAND_ASSETS, BRAND_BASE_URL, BRAND_PAGE_URL, brandAssetUrls, isAiHubFile, isBrandSiteFile, localizeBrandCss, localizeBrandHtml,
  type BrandIndexLike,
} from '@mathchois/shared';
import { mapLimit } from '../http.js';

const CONCURRENCY = 4; // 오빠두 요청은 동시 4개까지
const SLUG = /^[a-z0-9-]+$/;
const INDEX_JSON = 'data/brands-index.json';

/** outDir 안의 파일(상대 경로, `/` 구분). */
function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => path.relative(dir, path.join(e.parentPath, e.name)).split(path.sep).join('/'));
}

/** 사본 폴더로만 쓰인 곳이면 비우고, 다른 파일이 섞여 있으면 지우지 않고 멈춘다(잘못 넘긴 경로 보호). */
function resetOutDir(outDir: string) {
  const foreign = listFiles(outDir).filter((rel) => !isBrandSiteFile(rel) && !rel.endsWith('.part'));
  if (foreign.length) throw new Error(`${outDir} has files that are not part of a brand copy — not touching it:\n  ${foreign.slice(0, 10).join('\n  ')}`);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
}

function parseIndex(text: string): BrandIndexLike {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(`${INDEX_JSON}: not JSON (${(err as Error).message})`);
  }
  const brands = (data as { brands?: unknown }).brands;
  if (!Array.isArray(brands) || !brands.length) throw new Error(`${INDEX_JSON}: no brands[]`);
  const bad = brands.filter((b) => !b || typeof (b as { slug?: unknown }).slug !== 'string' || !SLUG.test((b as { slug: string }).slug) || (b as { slug: string }).slug === 'index');
  if (bad.length) throw new Error(`${INDEX_JSON}: ${bad.length} brand(s) with a slug outside [a-z0-9-]: ${bad.slice(0, 5).map((b) => JSON.stringify((b as { slug?: unknown })?.slug)).join(', ')}`);
  return data as BrandIndexLike;
}

export async function buildBrandSite(
  outDir: string,
  fetchText: (url: string) => Promise<string>,
  fetchFile: (url: string, to: string) => Promise<void>,
): Promise<{ index: BrandIndexLike }> {
  const write = (rel: string, text: string) => {
    const to = path.join(outDir, rel);
    mkdirSync(path.dirname(to), { recursive: true });
    writeFileSync(to, text);
  };
  const file = (rel: string) => {
    const to = path.join(outDir, rel);
    mkdirSync(path.dirname(to), { recursive: true });
    return to;
  };

  // 목록 페이지와 자산 주소 — 먼저 고쳐 보아 페이지 구조가 바뀌었으면 아무것도 받기 전에 멈춘다.
  const page = await fetchText(BRAND_PAGE_URL);
  const assets = brandAssetUrls(page);
  const indexHtml = localizeBrandHtml(page, 'index');
  resetOutDir(outDir);

  await mapLimit(Object.entries(assets), CONCURRENCY, async ([rel, url]) => {
    if (rel.endsWith('.css')) write(rel, localizeBrandCss(await fetchText(url)));
    else await fetchFile(url, file(rel));
  });

  const indexText = await fetchText(BRAND_BASE_URL + INDEX_JSON);
  const index = parseIndex(indexText);
  write(INDEX_JSON, indexText);
  const slugs = index.brands.map((b) => b.slug);

  await mapLimit(slugs, CONCURRENCY, async (slug) => {
    await fetchFile(`${BRAND_BASE_URL}data/hero/${slug}.json`, file(`data/hero/${slug}.json`));
    await fetchFile(`${BRAND_BASE_URL}data/detail/${slug}.json`, file(`data/detail/${slug}.json`));
    write(`brand/${slug}.html`, localizeBrandHtml(await fetchText(`${BRAND_BASE_URL}brand/${slug}.html`), 'detail'));
  });
  write('index.html', indexHtml);

  // 구조 검증: 모든 파일이 서버 허용 경로, 자산·목록이 모두 있고, 상세 페이지 수 = 브랜드 수.
  const files = listFiles(outDir);
  const outside = files.filter((rel) => !isAiHubFile('brand/' + rel));
  if (outside.length) throw new Error(`brand copy has files outside BRAND_FILE:\n  ${outside.join('\n  ')}`);
  const missing = ['index.html', ...BRAND_ASSETS].filter((rel) => !files.includes(rel));
  if (missing.length) throw new Error(`brand copy is missing: ${missing.join(', ')}`);
  const pages = new Set(files.filter((rel) => rel.startsWith('brand/')).map((rel) => rel.slice('brand/'.length, -'.html'.length)));
  if (pages.size !== slugs.length) {
    throw new Error(`brand copy has ${pages.size} detail pages for ${slugs.length} brands in ${INDEX_JSON} (duplicate slug?)`);
  }
  for (const dir of ['data/hero', 'data/detail']) {
    const n = files.filter((rel) => rel.startsWith(dir + '/')).length;
    if (n !== slugs.length) throw new Error(`brand copy has ${n} files in ${dir}/ for ${slugs.length} brands`);
  }
  return { index };
}
