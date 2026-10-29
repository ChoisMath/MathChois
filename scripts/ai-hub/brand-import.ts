// 브랜드 룩북 사본(BRAND_SRC = motion/brand 의 build.cjs 산출물, 2단계부터는 `ai:oppadu` 의 brand-build 산출물)을 .media-out/ai-hub/brand/ 에 서버와 같은 구조로 옮기고 manifest 를 만든다.
// 내용은 고치지 않는다. iframe 안에서 깨지는 두 가지만 손본다: 사본 밖을 가리키는 상대 링크, 외부 사이트로 가는 링크(새 창).
//
// .media-out/ 은 me.chois.pro 폐쇄 뒤 유일한 원천 백업이다. 그래서 기존 brand/ 를 먼저 지우지 않는다:
// ① 복사할 원천을 모두 확인하고(없으면 아무것도 건드리지 않고 멈춤) ② 옆 임시 폴더에 새 사본을 다 만든 뒤
// ③ 기존 brand/ 를 잠시 옆으로 옮기고 새 사본을 그 자리에 넣고 manifest 를 만든다. ③ 이 실패하면 기존 것을 되돌려 놓는다.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { BRAND_ASSETS } from '@mathchois/shared';
import { writeManifest } from './manifest.js';
import { AI_DIR, OUT_DIR } from './volumeLayout.js';

const DEST = path.join(AI_DIR, 'brand');
// 같은 파일시스템(.media-out/) 안의 임시 폴더 — rename 으로 바꿔 넣는다. ai-hub/ 밖이라 manifest·push 에 섞이지 않는다.
const STAGE = path.join(OUT_DIR, '.brand-import-new');
const PREVIOUS = path.join(OUT_DIR, '.brand-import-old');
const SLUG_FILE = /^[a-z0-9-]+\.(?:json|html)$/;
const DIRS = ['data/hero', 'data/detail', 'brand'];

// 원본 사이트(X-Frame-Options)는 iframe 안에서 열리지 않으므로 다른 출처로 가는 링크는 새 창으로 연다.
const EXTERNAL_LINKS_IN_NEW_TAB = `<script>document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href]');if(a&&a.origin!==location.origin&&!a.target){a.target='_blank';a.rel='noopener'}},true)</script>`;
// motion/brand 의 build.cjs 가 형제 사본(모션·슬라이드)으로 돌려 둔 주소를 원본 사이트로 되돌린다.
const SIBLING_LINKS: [string, string][] = [
  ['"../index.html"', '"https://www.oppadu.com/ai/motion-styles/"'],
  ['"../slide/index.html"', '"https://www.oppadu.com/ai/slide-styles/"'],
];

type Entry = { rel: string; kind: 'html' | 'copy' };

/** ① 원천 확인 — 복사할 파일 목록을 만들며 빠진 것을 모두 모은다. 하나라도 빠지면 아무것도 쓰지 않는다. */
function planImport(src: string): Entry[] {
  if (!existsSync(path.join(src, 'index.html'))) throw new Error(`${src}/index.html not found — set BRAND_SRC to the motion/brand folder`);
  const missing: string[] = [];
  const entries: Entry[] = [{ rel: 'index.html', kind: 'html' }];
  for (const rel of BRAND_ASSETS) {
    if (existsSync(path.join(src, rel))) entries.push({ rel, kind: 'copy' });
    else missing.push(rel);
  }
  for (const dir of DIRS) {
    const abs = path.join(src, dir);
    if (!existsSync(abs) || !statSync(abs).isDirectory()) {
      missing.push(`${dir}/`);
      continue;
    }
    // brand/index.html 은 서버 허용 경로가 아니다(상세 페이지 슬러그는 index 를 쓰지 않는다) — 복사하지 않는다.
    const names = readdirSync(abs).filter((n) => SLUG_FILE.test(n) && !(dir === 'brand' && n === 'index.html'));
    if (!names.length) missing.push(`${dir}/ (empty)`);
    for (const name of names) entries.push({ rel: `${dir}/${name}`, kind: dir === 'brand' ? 'html' : 'copy' });
  }
  if (missing.length) {
    throw new Error(`${src}: ${missing.length} source(s) missing — run node brand/scripts/build.cjs in motion/ first. Nothing was changed.\n  ${missing.join('\n  ')}`);
  }
  for (const e of entries) {
    if (e.kind === 'html' && !readFileSync(path.join(src, e.rel), 'utf8').includes('</body>')) {
      throw new Error(`${e.rel}: </body> not found — nothing was changed`);
    }
  }
  return entries;
}

/** ② 임시 폴더에 새 사본을 만든다. */
function buildStage(src: string, entries: Entry[]) {
  rmSync(STAGE, { recursive: true, force: true });
  for (const { rel, kind } of entries) {
    const to = path.join(STAGE, rel);
    mkdirSync(path.dirname(to), { recursive: true });
    if (kind === 'copy') {
      copyFileSync(path.join(src, rel), to);
      continue;
    }
    let html = readFileSync(path.join(src, rel), 'utf8');
    if (rel === 'index.html') for (const [from, toLink] of SIBLING_LINKS) html = html.split(from).join(toLink);
    writeFileSync(to, html.replace('</body>', `${EXTERNAL_LINKS_IN_NEW_TAB}\n</body>`));
  }
}

/**
 * `src`(BRAND_SRC 모양 폴더: index.html · brand/<slug>.html · assets/… · data/…)를 .media-out/ai-hub/brand/ 로 바꿔 넣고 manifest 를 만든다.
 * 원천이 빠졌으면 아무것도 건드리지 않고 던진다. `ai:brand:import`(직접 실행)와 `ai:oppadu`(brand-build 다음)가 같이 쓴다.
 */
export async function importBrand(src: string): Promise<{ files: number }> {
  if (existsSync(PREVIOUS)) {
    // 지난 실행이 ③ 도중에 끊겼다 — 이 폴더가 기존 사본의 유일한 사본일 수 있으므로 지우지 않고 멈춘다.
    throw new Error(`${path.relative(process.cwd(), PREVIOUS)} exists (an earlier import was interrupted). Check it, move it back to ${path.relative(process.cwd(), DEST)} if that is missing, then delete it and rerun.`);
  }
  const entries = planImport(src);
  buildStage(src, entries);

  // ③ 바꿔 넣기
  const hadPrevious = existsSync(DEST);
  mkdirSync(path.dirname(DEST), { recursive: true });
  if (hadPrevious) renameSync(DEST, PREVIOUS);
  try {
    renameSync(STAGE, DEST);
    const manifest = await writeManifest('brand');
    if (hadPrevious) rmSync(PREVIOUS, { recursive: true, force: true });
    const files = Object.keys(manifest).length;
    console.info(`brand: ${files} files → ${path.relative(process.cwd(), DEST)}`);
    return { files };
  } catch (err) {
    if (hadPrevious) {
      rmSync(DEST, { recursive: true, force: true });
      renameSync(PREVIOUS, DEST);
      console.error('brand import failed — the previous copy was put back');
    }
    throw err;
  }
}

// npm run ai:brand:import — 직접 실행했을 때만(다른 스크립트가 import 하면 돌지 않는다).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await importBrand(process.env.BRAND_SRC ?? '/Volumes/Chois_SD2/dev/motion/brand');
}
